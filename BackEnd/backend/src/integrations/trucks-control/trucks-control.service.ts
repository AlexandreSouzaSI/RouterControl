import { Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import AdmZip from 'adm-zip';
import * as zlib from 'zlib';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TrucksControlService implements OnModuleInit {
    constructor(private readonly prisma: PrismaService) { }

    // Roda uma vez assim que o backend sobe, em vez de esperar o próximo
    // horário "redondo" do cron — sem isso, depois de um restart a tela
    // podia ficar minutos sem nada. Primeiro recarrega a lista de
    // veículos salva no banco (pro cache em memória não começar vazio),
    // depois dispara os dois crons uma vez cada.
    async onModuleInit() {
        await this.carregarVeiculosDoBanco();
        this.atualizarListaVeiculos();
        this.persistirPosicoes();
    }

    private async carregarVeiculosDoBanco() {
        try {
            const salvos = await this.prisma.veiculoTrucksControl.findMany();

            if (salvos.length > 0) {
                this.veiculosCache = salvos.map((v) => ({
                    veiID: v.veiId,
                    placa: v.placa,
                    equipamento: v.equipamento,
                    motorista: v.motorista,
                    proprietario: v.proprietario,
                    identificacao: v.identificacao,
                    chassi: v.chassi,
                }));
            }
        } catch (error: any) {
            console.error(
                'Erro ao carregar veículos salvos do banco:',
                error.message ?? error,
            );
        }
    }

    private async salvarVeiculosNoBanco(veiculos: any[]) {
        try {
            for (const v of veiculos) {
                if (!v.veiID) continue;

                await this.prisma.veiculoTrucksControl.upsert({
                    where: { veiId: v.veiID },
                    update: {
                        placa: v.placa,
                        equipamento: v.equipamento,
                        motorista: v.motorista,
                        proprietario: v.proprietario,
                        identificacao: v.identificacao,
                        chassi: v.chassi,
                    },
                    create: {
                        veiId: v.veiID,
                        placa: v.placa,
                        equipamento: v.equipamento,
                        motorista: v.motorista,
                        proprietario: v.proprietario,
                        identificacao: v.identificacao,
                        chassi: v.chassi,
                    },
                });
            }
        } catch (error: any) {
            console.error(
                'Erro ao salvar veículos no banco:',
                error.message ?? error,
            );
        }
    }

    private readonly url = process.env.TRUCKS_URL!;
    private readonly login = process.env.TRUCKS_LOGIN!;
    private readonly senha = process.env.TRUCKS_SENHA!;

    private parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
    });

    private veiculosCache: any[] = [];
    private ultimaBuscaVeiculosEm = 0;

    private mensagensCache: any[] = [];
    private ultimaBuscaMensagensEm = 0;

    private lastMid = 0;

    // Cursor separado do cron de persistência — não pode ser o mesmo
    // `lastMid` usado pela tela ao vivo (ver comentário em
    // requisitarMensagens).
    private lastMidPersistido = 0;

    async listarVeiculosComCache(forcarApi = true) {
        const agora = Date.now();
        const passou5Minutos = agora - this.ultimaBuscaVeiculosEm >= 5 * 60 * 1000;

        if (this.veiculosCache.length > 0 && !passou5Minutos) {
            return {
                origem: 'cache',
                veiculos: this.veiculosCache,
            };
        }

        // forcarApi=false é usado pelas chamadas internas (cron de posição,
        // tela de localização) — essas NUNCA devem chamar a API de
        // veículos por conta própria, só usar o que já tem (mesmo
        // desatualizado). Quem controla a frequência real de
        // RequestVeiculo é o cron dedicado (atualizarListaVeiculos) e o
        // botão "Atualizar placas" (forcarApi=true).
        if (!forcarApi) {
            return {
                origem:
                    this.veiculosCache.length > 0 ? 'cache-desatualizado' : 'sem-cache',
                veiculos: this.veiculosCache,
            };
        }

        const veiculos = await this.listarVeiculos();

        this.veiculosCache = veiculos;
        this.ultimaBuscaVeiculosEm = agora;

        return {
            origem: 'api',
            veiculos,
        };
    }

    /**
     * Atualização automática da lista de placas/veículos — roda a cada 10
     * minutos (bem acima do mínimo de 5min que a API exige pra
     * RequestVeiculo).
     */
    @Cron('*/10 * * * *')
    async atualizarListaVeiculos() {
        try {
            await this.listarVeiculosComCache(true);
        } catch (error: any) {
            console.error(
                'Erro ao atualizar lista de veículos:',
                error.message ?? error,
            );
        }
    }

    async listarVeiculos() {
        const xml = `
<RequestVeiculo>
  <login>${this.login}</login>
  <senha>${this.senha}</senha>
</RequestVeiculo>`;

        const data = await this.postXml(xml);

        if (data?.ErrorRequest) {
            console.warn('Erro Trucks RequestVeiculo:', data.ErrorRequest);

            if (this.veiculosCache.length > 0) {
                return this.veiculosCache;
            }

            // Cache em memória vazio (ex: acabou de reiniciar e ainda não
            // deu tempo do onModuleInit carregar) — tenta o banco antes de
            // desistir e devolver lista vazia pra tela.
            await this.carregarVeiculosDoBanco();

            return this.veiculosCache;
        }

        const veiculos = this.toArray(data?.ResponseVeiculo?.Veiculo).map(
            (v: any) => ({
                veiID: Number(v.veiID),
                placa: v.placa != null ? String(v.placa) : null,
                equipamento:
                    v.eqp !== undefined && v.eqp !== null && v.eqp !== ''
                        ? Number(v.eqp)
                        : null,
                motorista: v.mot != null ? String(v.mot) : null,
                proprietario: this.paraBooleano(v.prop),
                identificacao: v.ident != null ? String(v.ident) : null,
                chassi: v.chassi != null ? String(v.chassi) : null,
            }),
        );

        await this.salvarVeiculosNoBanco(veiculos);

        return veiculos;
    }

    /**
     * Chamada crua da API (sem tocar em nenhum cursor de instância) —
     * usada tanto pelo fluxo ao vivo (buscarMensagens, que usa e avança
     * this.lastMid) quanto pelo cron de persistência (que tem o próprio
     * cursor independente, this.lastMidPersistido). Os dois NÃO podem
     * compartilhar o mesmo cursor: se compartilhassem, o cron "consumiria"
     * mensagens antes do cache ao vivo vê-las, e a tela ficaria sem
     * atualizar.
     */
    private async requisitarMensagens(mid: number) {
        const xml = `
<RequestMensagemCB>
  <login>${this.login}</login>
  <senha>${this.senha}</senha>
  <mId>${mid}</mId>
</RequestMensagemCB>`;

        const data = await this.postXml(xml);

        if (data?.ErrorRequest) {
            console.warn('Erro Trucks RequestMensagemCB:', data.ErrorRequest);

            return [];
        }

        const mensagens = this.toArray(data?.ResponseMensagemCB?.MensagemCB);

        return mensagens.map((m: any) => ({
            mId: Number(m.mId),
            veiID: Number(m.veiID),
            dataHora: m.dt,
            latitude: this.parseNumber(m.lat),
            longitude: this.parseNumber(m.lon),
            municipio: m.mun ?? null,
            uf: m.uf ?? null,
            rodovia: m.rod ?? null,
            rua: m.rua ?? null,
            velocidade: this.parseNumber(m.vel),
            motorista: m.mot ?? null,
            placaCarreta: m.carreta ?? null,
        }));
    }

    async buscarMensagens(lastMid?: number) {
        const mid = lastMid ?? this.lastMid ?? 0;

        const normalizadas = await this.requisitarMensagens(mid);

        const maiorMid = Math.max(0, ...normalizadas.map((m) => m.mId));

        if (maiorMid > this.lastMid) {
            this.lastMid = maiorMid;
        }

        return {
            lastMidAnterior: mid,
            lastMidAtual: this.lastMid,
            total: normalizadas.length,
            mensagens: normalizadas,
        };
    }

    async buscarMensagensComCache() {
        const agora = Date.now();
        const passou30Segundos = agora - this.ultimaBuscaMensagensEm >= 30_000;

        if (!passou30Segundos && this.mensagensCache.length > 0) {
            return {
                origem: 'cache',
                lastMidAtual: this.lastMid,
                total: this.mensagensCache.length,
                mensagens: this.mensagensCache,
            };
        }

        const result = await this.buscarMensagens();

        const mensagensMap = new Map<number, any>();

        for (const msg of this.mensagensCache) {
            mensagensMap.set(Number(msg.mId), msg);
        }

        for (const msg of result.mensagens) {
            mensagensMap.set(Number(msg.mId), msg);
        }

        this.mensagensCache = Array.from(mensagensMap.values())
            .sort((a, b) => b.mId - a.mId)
            .slice(0, 500);

        this.ultimaBuscaMensagensEm = agora;

        return {
            origem: 'api',
            lastMidAnterior: result.lastMidAnterior,
            lastMidAtual: result.lastMidAtual,
            total: this.mensagensCache.length,
            mensagens: this.mensagensCache,
        };
    }

    async buscarUltimasPosicoes() {
        const result = await this.buscarMensagensComCache();

        const porVeiculo = new Map<number, any>();

        for (const msg of result.mensagens) {
            if (!msg.latitude || !msg.longitude) continue;
            porVeiculo.set(Number(msg.veiID), msg);
        }

        return {
            lastMidAtual: result.lastMidAtual,
            veiculos: Array.from(porVeiculo.values()),
        };
    }

    /**
     * Posição "ao vivo" de cada caminhão. Lê do banco (que o cron de
     * persistência mantém atualizado) em vez de chamar a API de novo
     * aqui — essa API usa uma caixa de mensagens única por login, não um
     * cursor por chamador: se dois lugares do backend chamassem
     * RequestMensagemCB (um pro cron, outro pra essa tela), o primeiro
     * que chamasse esvaziava a caixa e o outro não recebia nada, mesmo
     * usando um mId diferente. Por isso só existe UM consumidor real da
     * API (persistirPosicoes) — passe forcar:true pra rodar ele antes de
     * ler, quando quiser um refresh na hora (botão "Buscar nova
     * localização").
     */
    async buscarCaminhoesComLocalizacao(opts?: { forcar?: boolean }) {
        if (opts?.forcar) {
            await this.persistirPosicoes();
        }

        const veiculosResult = await this.listarVeiculosComCache(false);
        const veiculos = veiculosResult.veiculos;

        const veiIds = veiculos.map((v) => Number(v.veiID));

        const ultimasPosicoes = await this.prisma.posicaoCaminhao.findMany({
            where: { veiId: { in: veiIds } },
            orderBy: { dataHora: 'desc' },
            distinct: ['veiId'],
        });

        const posicaoPorVeiculo = new Map(
            ultimasPosicoes.map((p) => [p.veiId, p]),
        );

        const caminhoes = veiculos.map((veiculo) => {
            const ultima = posicaoPorVeiculo.get(Number(veiculo.veiID));

            return {
                veiID: veiculo.veiID,
                placa: veiculo.placa,
                nome: veiculo.placa,
                motorista: veiculo.motorista ?? null,
                equipamento: veiculo.equipamento ?? null,
                localizacao: ultima
                    ? {
                        dataHora: ultima.dataHora,
                        latitude: ultima.latitude,
                        longitude: ultima.longitude,
                        municipio: ultima.municipio,
                        uf: ultima.uf,
                        rua: ultima.rua,
                        rodovia: ultima.rodovia,
                        velocidade: ultima.velocidade,
                    }
                    : null,
            };
        });

        return {
            origemVeiculos: veiculosResult.origem,
            origemMensagens: 'banco',
            total: caminhoes.length,
            caminhoes,
        };
    }

    /**
     * Roda em segundo plano a cada 30 minutos, independente de alguém
     * estar com a tela de Rotas aberta, e salva no banco os pings novos
     * dos caminhões monitorados. Isso é necessário porque a API externa
     * só mantém as mensagens não lidas por poucas horas — sem isso, o
     * histórico se perde a cada reinício do backend ou quando ninguém
     * consulta por um tempo. Roda a cada 5 minutos — bem acima do mínimo
     * de 30 segundos que a API exige pra RequestMensagemCB.
     */
    @Cron('*/5 * * * *')
    async persistirPosicoes() {
        try {
            const veiculosResult = await this.listarVeiculosComCache(false);
            const veiculos = veiculosResult.veiculos;

            if (veiculos.length === 0) return;

            const veiculosPorId = new Map(
                veiculos.map((v) => [Number(v.veiID), v]),
            );

            const mensagens = await this.requisitarMensagens(
                this.lastMidPersistido,
            );

            console.log(
                `[TrucksControl] cursor=${this.lastMidPersistido} veiculos=${veiculos.length} mensagensRecebidas=${mensagens.length}`,
            );

            const maiorMid = Math.max(
                this.lastMidPersistido,
                ...mensagens.map((m) => m.mId),
            );

            const mensagensRelevantes = mensagens.filter(
                (msg) =>
                    veiculosPorId.has(Number(msg.veiID)) &&
                    msg.latitude !== null &&
                    msg.longitude !== null,
            );

            console.log(
                `[TrucksControl] mensagensRelevantes=${mensagensRelevantes.length}`,
            );

            for (const msg of mensagensRelevantes) {
                const veiculo = veiculosPorId.get(Number(msg.veiID));
                const dataHora = new Date(msg.dataHora);

                if (Number.isNaN(dataHora.getTime())) continue;

                await this.prisma.posicaoCaminhao.upsert({
                    where: { mId: BigInt(msg.mId) },
                    update: {},
                    create: {
                        mId: BigInt(msg.mId),
                        veiId: msg.veiID,
                        placa: veiculo?.placa ?? null,
                        dataHora,
                        latitude: msg.latitude!,
                        longitude: msg.longitude!,
                        municipio: msg.municipio,
                        uf: msg.uf,
                        rua: msg.rua,
                        rodovia: msg.rodovia,
                        velocidade: msg.velocidade,
                        motorista: msg.motorista,
                    },
                });
            }

            // Detecta início/fim de viagem (saiu de Santos / chegou em
            // Betim ou Pouso Alegre) a partir das posições recém-salvas —
            // roda depois do upsert acima, pra já poder comparar com o que
            // ficou gravado.
            await this.processarEventosViagem(mensagensRelevantes, veiculosPorId);

            // Só avança o cursor depois que TODAS as mensagens desse lote
            // foram gravadas com sucesso — se algo falhar no meio do loop
            // (e cair no catch abaixo), o cursor fica onde estava e a
            // próxima tentativa reprocessa o lote inteiro. upsert é
            // idempotente (mId é @unique), então reprocessar mensagens já
            // salvas não causa duplicata.
            this.lastMidPersistido = maiorMid;
        } catch (error: any) {
            console.error(
                'Erro ao persistir posições dos caminhões:',
                error.message ?? error,
            );
        }
    }

    /**
     * Histórico de posições salvo no banco (não depende do cache em
     * memória nem da retenção curta da API externa) — pode ser
     * consultado a qualquer momento, filtrando por placa e/ou período.
     */
    async buscarHistorico(params: {
        placa?: string;
        veiId?: number;
        dataInicio?: string;
        dataFim?: string;
    }) {
        const where: any = {};

        if (params.placa) {
            where.placa = params.placa.toUpperCase();
        }

        if (params.veiId) {
            where.veiId = params.veiId;
        }

        if (params.dataInicio || params.dataFim) {
            where.dataHora = {};

            if (params.dataInicio) {
                where.dataHora.gte = new Date(`${params.dataInicio}T00:00:00`);
            }

            if (params.dataFim) {
                where.dataHora.lte = new Date(`${params.dataFim}T23:59:59`);
            }
        }

        const posicoes = await this.prisma.posicaoCaminhao.findMany({
            where,
            orderBy: { dataHora: 'desc' },
            take: 2000,
        });

        // mId vem como BigInt do banco — não dá pra devolver assim direto
        // (JSON.stringify não sabe serializar BigInt). Converte pra number,
        // que é seguro aqui (valor bem abaixo de Number.MAX_SAFE_INTEGER).
        return {
            total: posicoes.length,
            posicoes: posicoes.map((p) => ({ ...p, mId: Number(p.mId) })),
        };
    }

    // Cidade onde o caminhão "está no porto" — chegar aqui não faz nada
    // sozinho, mas SAIR daqui é o gatilho que abre uma viagem nova.
    private readonly ORIGEM_VIAGEM_CIDADES = ['SANTOS'];

    // Chegar em qualquer uma dessas cidades, com uma viagem em andamento
    // aberta, fecha a viagem.
    private readonly DESTINO_VIAGEM_CIDADES = ['BETIM', 'POUSO ALEGRE'];

    // Maiúsculas, sem acento, sem espaço duplicado — pra "São Vicente",
    // "SAO VICENTE" e "sao  vicente" caírem todos no mesmo valor.
    private normalizarCidade(nome: string | null | undefined): string | null {
        if (!nome) return null;

        // Troca cada vogal acentuada pela versão sem acento via
        // charCodeAt (em vez de escrever os acentos combinantes direto no
        // código-fonte) — mais verboso, mas imune a qualquer problema de
        // encoding do arquivo. Cobre as variações usadas nos nomes de
        // cidade que interessam aqui (São Paulo, Cubatão, Pouso Alegre
        // etc.); "ç" também é tratado por segurança.
        const mapaAcentos: Record<number, string> = {
            0xc0: 'A', 0xc1: 'A', 0xc2: 'A', 0xc3: 'A', 0xc4: 'A', 0xc5: 'A',
            0xe0: 'a', 0xe1: 'a', 0xe2: 'a', 0xe3: 'a', 0xe4: 'a', 0xe5: 'a',
            0xc8: 'E', 0xc9: 'E', 0xca: 'E', 0xcb: 'E',
            0xe8: 'e', 0xe9: 'e', 0xea: 'e', 0xeb: 'e',
            0xcc: 'I', 0xcd: 'I', 0xce: 'I', 0xcf: 'I',
            0xec: 'i', 0xed: 'i', 0xee: 'i', 0xef: 'i',
            0xd2: 'O', 0xd3: 'O', 0xd4: 'O', 0xd5: 'O', 0xd6: 'O',
            0xf2: 'o', 0xf3: 'o', 0xf4: 'o', 0xf5: 'o', 0xf6: 'o',
            0xd9: 'U', 0xda: 'U', 0xdb: 'U', 0xdc: 'U',
            0xf9: 'u', 0xfa: 'u', 0xfb: 'u', 0xfc: 'u',
            0xc7: 'C', 0xe7: 'c',
        };

        const semAcento = Array.from(nome)
            .map((ch) => mapaAcentos[ch.charCodeAt(0)] ?? ch)
            .join('');

        return semAcento
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    private estaNaOrigemViagem(municipio: string | null | undefined): boolean {
        const normalizado = this.normalizarCidade(municipio);
        return !!normalizado && this.ORIGEM_VIAGEM_CIDADES.includes(normalizado);
    }

    private estaNoDestinoViagem(municipio: string | null | undefined): boolean {
        const normalizado = this.normalizarCidade(municipio);
        return !!normalizado && this.DESTINO_VIAGEM_CIDADES.includes(normalizado);
    }

    /**
     * Lê a sequência de posições novas (já persistidas no banco pelo loop
     * acima) de cada caminhão, comparando com a posição anterior conhecida,
     * e detecta duas transições:
     *   - Estava numa cidade "de porto" (Santos/região) e saiu de lá ->
     *     abre uma viagem nova (status EM_ANDAMENTO), se ainda não houver
     *     uma aberta pra esse caminhão.
     *   - Tem uma viagem aberta e chegou em Betim ou Pouso Alegre -> fecha
     *     essa viagem (status CONCLUIDA).
     * Não depende de estado em memória (sobrevive a restart do backend)
     * porque sempre busca no banco a última posição anterior ao lote atual.
     */
    private async processarEventosViagem(
        mensagensRelevantes: any[],
        veiculosPorId: Map<number, any>,
    ) {
        if (mensagensRelevantes.length === 0) return;

        const porVeiculo = new Map<number, any[]>();

        for (const msg of mensagensRelevantes) {
            const veiId = Number(msg.veiID);

            if (!porVeiculo.has(veiId)) porVeiculo.set(veiId, []);
            porVeiculo.get(veiId)!.push(msg);
        }

        for (const [veiId, mensagens] of porVeiculo) {
            try {
                const ordenadas = [...mensagens].sort(
                    (a, b) =>
                        new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime(),
                );

                const primeiraDataHora = new Date(ordenadas[0].dataHora);

                const anterior = await this.prisma.posicaoCaminhao.findFirst({
                    where: { veiId, dataHora: { lt: primeiraDataHora } },
                    orderBy: { dataHora: 'desc' },
                });

                let municipioAnterior = anterior?.municipio ?? null;

                const placa = veiculosPorId.get(veiId)?.placa ?? null;

                let viagemAberta = await this.prisma.viagemGps.findFirst({
                    where: { veiId, status: 'EM_ANDAMENTO' },
                    orderBy: { dataHoraInicio: 'desc' },
                });

                for (const msg of ordenadas) {
                    const municipioAtual = msg.municipio ?? null;
                    const dataHoraAtual = new Date(msg.dataHora);

                    // Saiu da região do porto -> abre viagem, se não tiver
                    // uma aberta ainda.
                    if (
                        this.estaNaOrigemViagem(municipioAnterior) &&
                        !this.estaNaOrigemViagem(municipioAtual) &&
                        !viagemAberta
                    ) {
                        viagemAberta = await this.prisma.viagemGps.create({
                            data: {
                                veiId,
                                placa,
                                origemMunicipio: municipioAnterior!,
                                origemUf: anterior?.uf ?? null,
                                dataHoraInicio: dataHoraAtual,
                                status: 'EM_ANDAMENTO',
                            },
                        });

                        console.log(
                            `[TrucksControl] Viagem iniciada: veiId=${veiId} placa=${placa} saiu de ${municipioAnterior}`,
                        );
                    }

                    // Chegou em Betim/Pouso Alegre com viagem aberta -> fecha.
                    if (viagemAberta && this.estaNoDestinoViagem(municipioAtual)) {
                        await this.prisma.viagemGps.update({
                            where: { id: viagemAberta.id },
                            data: {
                                destinoMunicipio: municipioAtual,
                                destinoUf: msg.uf ?? null,
                                dataHoraFim: dataHoraAtual,
                                status: 'CONCLUIDA',
                            },
                        });

                        console.log(
                            `[TrucksControl] Viagem concluída: veiId=${veiId} placa=${placa} chegou em ${municipioAtual}`,
                        );

                        viagemAberta = null;
                    }

                    municipioAnterior = municipioAtual;
                }
            } catch (error: any) {
                console.error(
                    `Erro ao processar eventos de viagem do veiId=${veiId}:`,
                    error.message ?? error,
                );
            }
        }
    }

    /**
     * Lista de viagens detectadas por GPS — pra tela de Viagens/Dashboard.
     * status opcional filtra EM_ANDAMENTO ou CONCLUIDA; sem filtro, traz as
     * mais recentes de qualquer status.
     */
    async listarViagensGps(params?: {
        status?: 'EM_ANDAMENTO' | 'CONCLUIDA';
        placa?: string;
        limit?: number;
    }) {
        const where: any = {};

        if (params?.status) where.status = params.status;
        if (params?.placa) where.placa = params.placa.toUpperCase();

        return this.prisma.viagemGps.findMany({
            where,
            orderBy: { dataHoraInicio: 'desc' },
            take: params?.limit ?? 100,
        });
    }

    private async postXml(xml: string) {
        try {
            const response = await axios.post(this.url, xml.trim(), {
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                },
                responseType: 'arraybuffer',
                timeout: 30000,
            });

            const buffer = Buffer.from(response.data);
            const text = this.extractXml(buffer);
            const parsed = this.parser.parse(text);

            if (parsed?.ErrorRequest) {
                return parsed;
            }

            return parsed;
        } catch (error: any) {
            if (error instanceof InternalServerErrorException) {
                throw error;
            }

            console.error('ERRO TRUCKS CONTROL:', error.message);

            throw new InternalServerErrorException(
                'Erro ao comunicar com Trucks Control',
            );
        }
    }

    private extractXml(buffer: Buffer): string {
        const raw = buffer.toString('utf8');

        if (raw.trim().startsWith('<')) {
            return raw;
        }

        try {
            const zip = new AdmZip(buffer);
            const entries = zip.getEntries();

            if (entries.length > 0) {
                return entries[0].getData().toString('utf8');
            }
        } catch { }

        try {
            return zlib.gunzipSync(buffer).toString('utf8');
        } catch { }

        return raw;
    }

    private toArray<T>(value: T | T[] | undefined): T[] {
        if (!value) return [];
        return Array.isArray(value) ? value : [value];
    }

    private parseNumber(value: any): number | null {
        if (value === undefined || value === null || value === '') return null;

        const parsed = Number(String(value).replace(',', '.'));

        return Number.isNaN(parsed) ? null : parsed;
    }

    // O campo "prop" (proprietário) da API vem inconsistente — já vimos
    // vir como boolean puro (true/false) direto do parser de XML, mas
    // pode vir como texto ("true"/"S"/"1") dependendo do registro. Isso
    // normaliza pra um Boolean real antes de gravar no banco.
    private paraBooleano(value: any): boolean | null {
        if (value === undefined || value === null || value === '') return null;
        if (typeof value === 'boolean') return value;

        const texto = String(value).trim().toLowerCase();

        if (['true', '1', 's', 'sim'].includes(texto)) return true;
        if (['false', '0', 'n', 'nao', 'não'].includes(texto)) return false;

        return null;
    }
}