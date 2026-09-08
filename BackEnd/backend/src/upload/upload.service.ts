import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

type Evento = {
    data: Date;
    cidade: string;
    latitude: string;
    velocidade: number;
};

@Injectable()
export class UploadService {
    constructor(private prisma: PrismaService) { }

    async processarUpload(file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('Arquivo inválido');
        }

        /**
         * CSV é lido na mão, célula por célula como texto puro. A
         * biblioteca xlsx, ao ler CSV, tenta "adivinhar" datas e acaba
         * interpretando "01/08/2026" como mês/dia (padrão americano) em
         * vez de dia/mês — bagunçando o mês inteiro. Lendo tudo como
         * string, quem decide o formato da data é o nosso parseData()
         * (que já trata DD/MM/AAAA corretamente).
         */
        const nomeArquivo = (file.originalname || '').toLowerCase();
        const ehZip = file.buffer.slice(0, 2).toString('hex') === '504b'; // "PK"
        const ehCsv = nomeArquivo.endsWith('.csv') || !ehZip;

        let json: any[][];

        if (ehCsv) {
            json = this.parseCsvBuffer(file.buffer);
        } else {
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        }

        /**
         * Formato novo: export direto do rastreador (Trucks Control /
         * newrastreamentoonline), separado por ; com um bloco de metadados
         * no topo ("Cliente:", "Placa:", "Período:" etc.) antes da linha de
         * cabeçalho "Data e Hora". A placa fica na mesma linha do rótulo
         * "Placa:", não em posição fixa.
         */
        const placaCompleta = this.encontrarValorAposRotulo(json, 'Placa:');
        const placaExtraida = String(placaCompleta || '').trim().toUpperCase();
        const placaNormalizada = placaExtraida.replace(/[^A-Z0-9]/g, '');

        if (!placaNormalizada) {
            throw new BadRequestException('Placa inválida');
        }

        // Compara a placa inteira (não só os 3 primeiros caracteres) — com
        // prefixo de 3 letras dois caminhões diferentes da frota podem
        // colidir (ex: QPM7278 e QPM1234) e o upload de um acaba caindo
        // em cima dos dados do outro.
        const todosCaminhoes = await this.prisma.caminhao.findMany();

        let caminhao = todosCaminhoes.find(
            (c) =>
                c.placa.toUpperCase().replace(/[^A-Z0-9]/g, '') ===
                placaNormalizada,
        );

        // Caminhão não cadastrado ainda? Cadastra sozinho com a placa lida
        // do arquivo — não precisa mais criar manualmente antes de subir.
        if (!caminhao) {
            caminhao = await this.prisma.caminhao.create({
                data: { placa: placaExtraida },
            });
        }

        const placa = caminhao.placa;

        // Regra não é mais obrigatória por caminhão — existe uma regra
        // única padrão (Betim e Pouso Alegre como base, Santos como
        // destino, parada só conta em Betim) que vale pra todos. Se
        // existir uma TruckRule cadastrada pra esse caminhão, ela só
        // sobrescreve o que tiver preenchido; o resto usa o padrão.
        const regra = await this.prisma.truckRule.findFirst({
            where: {
                caminhaoId: caminhao.id,
            },
        });

        // Cidades onde o caminhão pode estar "de base" antes de sair pro
        // destino. Chegar em qualquer uma delas não fecha viagem nem
        // duplica contagem — só a chegada no destino conta 1 viagem.
        const origem1 = this.normalizar(regra?.origemViagem || 'BETIM');
        const origem2 = this.normalizar(
            regra?.origemViagem2 || 'POUSO ALEGRE',
        );
        const origensBase = [origem1, origem2].filter(
            (c): c is string => Boolean(c),
        );

        const destino = this.normalizar(regra?.destinoViagem || 'SANTOS');

        // Dias parados (pra desconto de diária) só contam quando o
        // caminhão está parado na cidade-base "de casa" — hoje só Betim.
        // Tempo em Pouso Alegre ou no destino é considerado a serviço.
        const cidadeParadoPagamento = this.normalizar(
            regra?.cidadeParado || regra?.origemViagem || 'BETIM',
        );

        const linhaCabecalho = this.encontrarLinhaCabecalho(json);
        const formatoNovo = linhaCabecalho >= 0;

        const colunaData = 0;
        const colunaLocalizacao = formatoNovo ? 7 : 10;
        const colunaLatitude = formatoNovo
            ? this.encontrarColuna(json, 'Latitude', 11)
            : this.encontrarColuna(json, 'Latitude', 19);
        const colunaVelocidade = formatoNovo
            ? this.encontrarColuna(json, 'Vel. (Km/h)', 16)
            : -1;
        const linhaInicio = formatoNovo ? linhaCabecalho + 1 : 15;

        const eventos: Evento[] = [];

        for (let i = linhaInicio; i < json.length; i++) {
            const linha = json[i];

            if (!Array.isArray(linha)) continue;

            const dataRaw = linha[colunaData];
            const cidadeRaw = linha[colunaLocalizacao];

            if (!dataRaw || !cidadeRaw) continue;

            const data = this.parseData(dataRaw);

            // Linhas de rodapé do relatório ("Velocidade Excedida:",
            // "Distância total percorrida:" etc.) não têm data válida —
            // isso encerra a leitura naturalmente.
            if (!data) continue;

            const latitudeRaw = linha[colunaLatitude];
            const velocidadeRaw =
                colunaVelocidade >= 0 ? linha[colunaVelocidade] : null;

            eventos.push({
                data,
                cidade: this.normalizar(this.extrairCidade(cidadeRaw)),
                latitude: String(latitudeRaw || '').trim(),
                velocidade:
                    velocidadeRaw !== null
                        ? Number(String(velocidadeRaw).replace(',', '.')) || 0
                        : 0,
            });
        }

        if (eventos.length === 0) {
            throw new BadRequestException('Nenhum evento válido encontrado');
        }

        eventos.sort((a, b) => a.data.getTime() - b.data.getTime());

        const primeiroEvento = eventos[0];
        const ultimoEvento = eventos[eventos.length - 1];

        const mes = `${primeiroEvento.data.getFullYear()}-${String(
            primeiroEvento.data.getMonth() + 1,
        ).padStart(2, '0')}`;

        const dataInicio = primeiroEvento.data;
        const dataFim = ultimoEvento.data;

        return this.prisma.$transaction(async (tx) => {
            const periodoExistente = await tx.uploadPeriod.findFirst({
                where: {
                    caminhaoId: caminhao.id,
                    periodo: mes,
                },
            });

            if (periodoExistente) {
                await tx.tripRecord.deleteMany({
                    where: { uploadPeriodId: periodoExistente.id },
                });

                await tx.stopRecord.deleteMany({
                    where: { uploadPeriodId: periodoExistente.id },
                });

                await tx.resumoOperacao.deleteMany({
                    where: {
                        caminhaoId: caminhao.id,
                        mes,
                    },
                });

                await tx.uploadPeriod.delete({
                    where: { id: periodoExistente.id },
                });
            }

            const uploadPeriod = await tx.uploadPeriod.create({
                data: {
                    periodo: mes,
                    dataInicio,
                    dataFim,
                    caminhaoId: caminhao.id,
                },
            });

            /**
             * MÁQUINA DE ESTADOS ÚNICA (viagem + estadia):
             *
             * "Local reconhecido" (Betim, Pouso Alegre ou Santos) só serve
             * pra duas coisas: fechar uma viagem (chegada no destino vindo
             * de uma origem confirmada) e abrir uma estadia nova (chegada
             * numa cidade-base). Isso tolera qualquer parada rápida fora
             * dessas três cidades sem contar como "saiu da origem" —
             * um desvio até Pouso Alegre ou Santos no meio do caminho
             * não invalida a origem que já foi confirmada antes.
             *
             * Já uma ESTADIA (usada pro dia parado e pra timeline) é bem
             * mais estrita: fecha assim que aparece QUALQUER cidade
             * diferente da estadia aberta — mesmo uma saidinha rápida pra
             * Contagem ou Belo Horizonte e volta no mesmo dia. Cada volta
             * pra base abre uma estadia nova. Isso é de propósito: um
             * caminhão que sai e volta não ficou "parado o tempo todo",
             * ficou parado em pedaços — e cada pedaço só conta os dias
             * cheios estritamente entre a chegada e a saída dele.
             *
             * A estadia fecha usando o último instante em que o caminhão
             * foi visto REALMENTE parado (vel=0) naquela cidade — não o
             * instante do evento que detectou a mudança de cidade — pra
             * não incluir o tempo de viagem seguinte como se fosse parada.
             *
             * Uma estadia herdada do mês anterior (o caminhão já estava
             * parado na cidade de pagamento quando o mês começou) não tem
             * "dia de chegada" dentro deste mês — esse dia já foi contado
             * (ou não) no mês passado. Por isso ela usa uma contagem
             * diferente: todos os dias entre o dia 1 e o dia da saída
             * contam (sem descontar o primeiro), só o dia da saída fica de
             * fora.
             */
            const locaisReconhecidos = Array.from(
                new Set([origem1, origem2, destino].filter(Boolean)),
            );

            const detectarLocal = (evento: Evento): string | null => {
                for (const local of locaisReconhecidos) {
                    if (this.estaParadoEm(evento, [local], formatoNovo)) {
                        return local;
                    }
                }
                return null;
            };

            const [anoMes, mesNumMes] = mes.split('-').map(Number);
            const primeiroDiaDoMes = new Date(anoMes, mesNumMes - 1, 1);

            const statusAnterior = await tx.truckStatus.findUnique({
                where: { caminhaoId: caminhao.id },
            });

            let localAtual: string | null = null;
            let estadiaAberta: {
                inicio: Date;
                local: string;
                cidade: string;
                latitude: string | null;
                continuada: boolean;
            } | null = null;
            let ultimaVezNoLocalAberto: Date | null = null;

            // Só herda o estado do upload anterior se ele for realmente
            // anterior a esse período (evita puxar estado de um mês mais
            // recente ao reprocessar um mês antigo).
            if (
                statusAnterior?.localConfirmado &&
                statusAnterior.ultimaData < dataInicio
            ) {
                localAtual = statusAnterior.localConfirmado;

                if (statusAnterior.paradaAbertaDesde) {
                    estadiaAberta = {
                        inicio: statusAnterior.paradaAbertaDesde,
                        local: statusAnterior.localConfirmado,
                        cidade: statusAnterior.localConfirmado,
                        latitude: null,
                        continuada: true,
                    };
                    ultimaVezNoLocalAberto = statusAnterior.paradaAbertaDesde;
                }
            }

            let numeroViagens = 0;
            let totalDiasParados = 0;
            const viagensSalvas: any[] = [];
            const paradasSalvas: any[] = [];

            for (const evento of eventos) {
                // Fecha a estadia aberta assim que a cidade do evento for
                // diferente da estadia — não importa se é reconhecida ou
                // não, nem a velocidade (só não fecha se for a mesma
                // cidade com um blip de movimento local).
                if (estadiaAberta) {
                    const aindaNaCidade = evento.cidade.includes(
                        estadiaAberta.local,
                    );

                    if (aindaNaCidade) {
                        if (
                            this.estaParadoEm(
                                evento,
                                [estadiaAberta.local],
                                formatoNovo,
                            )
                        ) {
                            ultimaVezNoLocalAberto = evento.data;
                        }
                    } else {
                        const fim =
                            ultimaVezNoLocalAberto ?? estadiaAberta.inicio;
                        const ehCidadePagamento =
                            estadiaAberta.local === cidadeParadoPagamento;

                        const dias = ehCidadePagamento
                            ? estadiaAberta.continuada
                                ? this.calcularDiasParadosContinuados(
                                    fim,
                                    primeiroDiaDoMes,
                                )
                                : this.calcularDiasParados(
                                    estadiaAberta.inicio,
                                    fim,
                                )
                            : 0;

                        if (ehCidadePagamento) {
                            totalDiasParados += dias;
                        }

                        const parada = await tx.stopRecord.create({
                            data: {
                                caminhaoId: caminhao.id,
                                uploadPeriodId: uploadPeriod.id,
                                dataHoraEntrada: estadiaAberta.inicio,
                                dataHoraSaida: fim,
                                diasParados: dias,
                                cidadeEntrada: estadiaAberta.cidade,
                                latitudeEntrada: estadiaAberta.latitude,
                                cidadeSaida: evento.cidade,
                                latitudeSaida: evento.latitude,
                            },
                        });

                        paradasSalvas.push(parada);
                        estadiaAberta = null;
                        ultimaVezNoLocalAberto = null;
                    }
                }

                const local = detectarLocal(evento);

                if (!local) continue;

                // Chegada no destino só fecha viagem se o local anterior
                // era uma origem confirmada (Betim ou Pouso Alegre).
                if (
                    local === destino &&
                    localAtual &&
                    origensBase.includes(localAtual)
                ) {
                    numeroViagens++;

                    const viagem = await tx.tripRecord.create({
                        data: {
                            caminhaoId: caminhao.id,
                            uploadPeriodId: uploadPeriod.id,
                            dataHoraChegada: evento.data,
                            cidade: evento.cidade,
                            latitude: evento.latitude,
                        },
                    });

                    viagensSalvas.push(viagem);
                }

                // Chegada em qualquer cidade-base abre uma nova estadia,
                // se não tiver nenhuma aberta ainda (aparece na timeline
                // mesmo quando não é a cidade de pagamento — só não conta
                // como dia parado).
                if (origensBase.includes(local) && !estadiaAberta) {
                    estadiaAberta = {
                        inicio: evento.data,
                        local,
                        cidade: evento.cidade,
                        latitude: evento.latitude,
                        continuada: false,
                    };
                    ultimaVezNoLocalAberto = evento.data;
                }

                localAtual = local;
            }

            // Estadia que ainda está em aberto no fim do mês não é
            // fechada aqui (não sabemos quando ele realmente sai) — se for
            // na cidade de pagamento, fica salva no TruckStatus pra
            // continuar certa no upload do mês seguinte.

            let estado = 'EM_ROTA';

            if (localAtual === cidadeParadoPagamento) {
                estado = `PARADO_EM_${localAtual}`;
            } else if (localAtual === destino) {
                estado = `CHEGOU_EM_${destino}`;
            } else if (localAtual) {
                estado = `EM_${localAtual}`;
            }

            const paradaAbertaParaSalvar =
                estadiaAberta && estadiaAberta.local === cidadeParadoPagamento
                    ? estadiaAberta.inicio
                    : null;

            await tx.truckStatus.upsert({
                where: {
                    caminhaoId: caminhao.id,
                },
                update: {
                    ultimaCidade: ultimoEvento.cidade,
                    ultimaData: ultimoEvento.data,
                    estado,
                    localConfirmado: localAtual,
                    paradaAbertaDesde: paradaAbertaParaSalvar,
                },
                create: {
                    caminhaoId: caminhao.id,
                    ultimaCidade: ultimoEvento.cidade,
                    ultimaData: ultimoEvento.data,
                    estado,
                    localConfirmado: localAtual,
                    paradaAbertaDesde: paradaAbertaParaSalvar,
                },
            });

            const diasRodando = Math.max(
                this.diasNoMes(mes) - totalDiasParados,
                0,
            );

            const resumo = await tx.resumoOperacao.create({
                data: {
                    caminhaoId: caminhao.id,
                    mes,
                    numeroViagens,
                    diasParados: totalDiasParados,
                    diasRodando,
                    uploadId: null,
                },
            });

            return {
                placa,
                mes,
                regraUsada: {
                    origensBase,
                    destino,
                    cidadeParadoPagamento,
                },
                periodoId: uploadPeriod.id,
                dataInicio,
                dataFim,
                numeroViagens,
                diasParados: totalDiasParados,
                diasRodando,
                statusFinal: estado,
                totalEventosLidos: eventos.length,
                totalViagensSalvas: viagensSalvas.length,
                totalParadasSalvas: paradasSalvas.length,
                resumo,
                viagens: viagensSalvas,
                paradas: paradasSalvas,
            };
        });
    }

    /**
     * Um evento é "parado numa cidade de referência" quando a localização
     * bate com alguma das cidades passadas E o caminhão não está em
     * movimento. No formato novo (export do rastreador) isso vem direto
     * da coluna de velocidade; no formato antigo (planilha manual, sem
     * essa coluna) cai pro fallback por latitude da região de Betim.
     */
    estaParadoEm(
        evento: Evento,
        cidadesReferencia: string[],
        formatoNovo: boolean,
    ) {
        const cidadeOk = cidadesReferencia.some((ref) =>
            evento.cidade.includes(ref),
        );

        if (!cidadeOk) return false;

        if (formatoNovo) {
            return evento.velocidade === 0;
        }

        return String(evento.latitude || '').trim().startsWith('-19');
    }

    /**
     * Dias parados = dias inteiros ESTRITAMENTE entre a chegada e a saída.
     * O dia da chegada e o dia da saída nunca contam (mesmo que o
     * caminhão tenha ficado o dia todo parado nesse dia) — só os dias
     * completos no meio, sem nenhum movimento, é que contam.
     * Chegou dia 10 e saiu dia 13 = 2 (dias 11 e 12).
     * Chegou e saiu no mesmo dia = 0, mesmo que tenha ficado horas.
     */
    calcularDiasParados(inicio: Date, fim: Date) {
        const inicioDia = new Date(inicio);
        inicioDia.setHours(0, 0, 0, 0);

        const fimDia = new Date(fim);
        fimDia.setHours(0, 0, 0, 0);

        const diferencaDias = Math.floor(
            (fimDia.getTime() - inicioDia.getTime()) /
            (1000 * 60 * 60 * 24),
        );

        return Math.max(diferencaDias - 1, 0);
    }

    /**
     * Igual a calcularDiasParados, mas pra estadias que já vieram
     * abertas do mês anterior (o caminhão já estava parado na cidade de
     * pagamento quando o mês começou). Nesse caso não existe um "dia de
     * chegada" dentro do mês atual pra descontar — o primeiro dia do mês
     * já conta inteiro. Só o dia da saída fica de fora.
     * Mês começa dia 1 e ele sai dia 7 = 6 (dias 1 a 6).
     */
    calcularDiasParadosContinuados(fim: Date, inicioMes: Date) {
        const inicioMesDia = new Date(inicioMes);
        inicioMesDia.setHours(0, 0, 0, 0);

        const fimDia = new Date(fim);
        fimDia.setHours(0, 0, 0, 0);

        const diferencaDias = Math.floor(
            (fimDia.getTime() - inicioMesDia.getTime()) /
            (1000 * 60 * 60 * 24),
        );

        return Math.max(diferencaDias, 0);
    }

    /**
     * Lê o buffer do CSV como texto puro e separa em linhas/células, sem
     * nenhuma tentativa de conversão de tipo (data, número). Cada célula
     * fica exatamente como veio no arquivo.
     */
    parseCsvBuffer(buffer: Buffer): any[][] {
        const texto = buffer.toString('utf8');
        const linhas = texto.split(/\r?\n/);

        return linhas.map((linha) =>
            linha.split(';').map((celula) => celula.trim()),
        );
    }

    /**
     * Procura um rótulo (ex: "Placa:") nas primeiras linhas do relatório
     * e retorna o primeiro valor não vazio depois dele na mesma linha.
     * Usado no cabeçalho de metadados do export do rastreador, onde a
     * posição da coluna não é fixa.
     */
    encontrarValorAposRotulo(
        json: any[],
        rotulo: string,
        maxLinhas = 10,
    ): string | null {
        for (let i = 0; i < Math.min(json.length, maxLinhas); i++) {
            const row = json[i];

            if (!Array.isArray(row)) continue;

            const idx = row.findIndex(
                (cell) =>
                    String(cell || '')
                        .trim()
                        .toUpperCase() === rotulo.toUpperCase(),
            );

            if (idx < 0) continue;

            for (let j = idx + 1; j < row.length; j++) {
                const valor = String(row[j] || '').trim();

                if (valor) return valor;
            }
        }

        return null;
    }

    /**
     * Localiza a linha de cabeçalho ("Data e Hora;;;;Motorista;...") do
     * export do rastreador. "DATA E HORA" não tem acento, então essa
     * busca funciona mesmo se o arquivo vier com encoding bagunçado nos
     * outros rótulos (Localização, Duração etc.).
     */
    encontrarLinhaCabecalho(json: any[], maxLinhas = 15): number {
        for (let i = 0; i < Math.min(json.length, maxLinhas); i++) {
            const row = json[i];

            if (!Array.isArray(row)) continue;

            if (String(row[0] || '').trim().toUpperCase() === 'DATA E HORA') {
                return i;
            }
        }

        return -1;
    }

    parseData(valor: any): Date | null {
        if (!valor) return null;

        if (typeof valor === 'number') {
            const d = XLSX.SSF.parse_date_code(valor);

            if (!d) return null;

            return new Date(
                d.y,
                d.m - 1,
                d.d,
                d.H || 0,
                d.M || 0,
                d.S || 0,
            );
        }

        if (typeof valor === 'string') {
            const partesData = valor.split(' ')[0].split('/');
            const partesHora = valor.split(' ')[1]?.split(':');

            if (partesData.length === 3) {
                const [dia, mes, ano] = partesData;

                const hora = Number(partesHora?.[0] || 0);
                const minuto = Number(partesHora?.[1] || 0);
                const segundo = Number(partesHora?.[2] || 0);

                return new Date(
                    Number(ano),
                    Number(mes) - 1,
                    Number(dia),
                    hora,
                    minuto,
                    segundo,
                );
            }
        }

        return null;
    }

    extrairCidade(local: string): string {
        const partes = String(local).split(' - ');
        return partes[1] || local;
    }

    normalizar(texto: string) {
        return String(texto || '')
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace('/MG', '')
            .replace('- MG', '')
            .replace('-', '')
            .trim();
    }

    diasNoMes(mes: string) {
        const [ano, mesNum] = mes.split('-').map(Number);
        return new Date(ano, mesNum, 0).getDate();
    }

    encontrarColuna(json: any[], nomeColuna: string, fallback: number) {
        for (let i = 0; i < Math.min(json.length, 20); i++) {
            const row = json[i];

            if (!Array.isArray(row)) continue;

            const index = row.findIndex(
                (cell) =>
                    String(cell || '')
                        .toUpperCase()
                        .trim() === nomeColuna.toUpperCase(),
            );

            if (index >= 0) {
                return index;
            }
        }

        return fallback;
    }
}