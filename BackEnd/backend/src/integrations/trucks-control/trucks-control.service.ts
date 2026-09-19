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
            // Campos opcionais — só vêm preenchidos se o equipamento do
            // veículo tiver o sensor correspondente (ex.: nem todo
            // rastreador manda nível de combustível).
            litrosTanque: this.parseNumber(m.lt),
            odometro: this.parseNumber(m.odm),
            rpm: this.parseNumber(m.rpm),
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
                        litrosTanque: ultima.litrosTanque,
                        odometro: ultima.odometro,
                        rpm: ultima.rpm,
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

            // Log só pra conferência manual — mostra quantas mensagens
            // desse lote vieram com combustível/odômetro/rpm preenchidos, e
            // de quais placas. Ajuda a confirmar se a Trucks Control está
            // mandando esses campos sem precisar chamar a API de novo (o
            // que roubaria mensagens da fila real).
            const comCombustivel = mensagensRelevantes.filter(
                (m) => m.litrosTanque !== null,
            );
            const comOdometro = mensagensRelevantes.filter(
                (m) => m.odometro !== null,
            );
            const comRpm = mensagensRelevantes.filter((m) => m.rpm !== null);

            console.log(
                `[TrucksControl] combustivel=${comCombustivel.length}/${mensagensRelevantes.length} ` +
                `odometro=${comOdometro.length}/${mensagensRelevantes.length} ` +
                `rpm=${comRpm.length}/${mensagensRelevantes.length}` +
                (comCombustivel.length > 0
                    ? ` | placas com combustível: ${comCombustivel
                        .map((m) => veiculosPorId.get(Number(m.veiID))?.placa ?? m.veiID)
                        .join(', ')}`
                    : ''),
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
                        litrosTanque: msg.litrosTanque,
                        odometro: msg.odometro,
                        rpm: msg.rpm !== null ? Math.round(msg.rpm) : null,
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

    /**
     * Consumo médio e autonomia de um caminhão, calculado a partir do
     * histórico real de litrosTanque + odometro salvos (não é estimativa
     * de tabela do fabricante).
     *
     * Lógica, comparando cada ping com o anterior (só entre pings que
     * tenham os dois campos preenchidos):
     *   - odômetro subiu E nível do tanque caiu -> isso é consumo: soma a
     *     distância e os litros gastos nesse trecho.
     *   - nível do tanque subiu -> isso é abastecimento, não consumo;
     *     entra numa lista separada, não conta no cálculo de km/L.
     *   - odômetro não mudou (ou caiu, sinal de leitura ruim) -> ignora
     *     esse trecho pro cálculo de km/L (não dá pra dividir por zero).
     *
     * Só é confiável se o equipamento do veículo realmente mandar o campo
     * de combustível — por isso devolve `dadosSuficientes` pra tela avisar
     * quando não tem base pra calcular ainda.
     */
    async calcularConsumo(params: {
        veiId: number;
        dataInicio?: string;
        dataFim?: string;
    }) {
        const where: any = { veiId: params.veiId };

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
            orderBy: { dataHora: 'asc' },
            select: {
                dataHora: true,
                litrosTanque: true,
                odometro: true,
                placa: true,
            },
        });

        const comDados = posicoes.filter(
            (p) => p.litrosTanque !== null && p.odometro !== null,
        ) as { dataHora: Date; litrosTanque: number; odometro: number; placa: string | null }[];

        let totalKm = 0;
        let totalLitrosConsumidos = 0;
        let amostras = 0;

        const abastecimentos: { dataHora: Date; litros: number; odometro: number }[] = [];

        for (let i = 1; i < comDados.length; i++) {
            const anterior = comDados[i - 1];
            const atual = comDados[i];

            const deltaOdometro = atual.odometro - anterior.odometro;
            const deltaLitros = anterior.litrosTanque - atual.litrosTanque;

            if (deltaLitros < -0.5) {
                // Nível subiu de verdade (não é só ruído de sensor) ->
                // abastecimento.
                abastecimentos.push({
                    dataHora: atual.dataHora,
                    litros: Math.round(Math.abs(deltaLitros) * 10) / 10,
                    odometro: atual.odometro,
                });
                continue;
            }

            if (deltaOdometro > 0 && deltaLitros > 0) {
                totalKm += deltaOdometro;
                totalLitrosConsumidos += deltaLitros;
                amostras++;
            }
        }

        const ultimaLeitura = comDados[comDados.length - 1] ?? null;

        const consumoMedioKmPorLitro =
            totalLitrosConsumidos > 0 ? totalKm / totalLitrosConsumidos : null;

        const consumoMedioLPor100km =
            totalKm > 0 ? (totalLitrosConsumidos / totalKm) * 100 : null;

        const autonomiaEstimadaKm =
            consumoMedioKmPorLitro !== null && ultimaLeitura
                ? Math.round(consumoMedioKmPorLitro * ultimaLeitura.litrosTanque)
                : null;

        return {
            veiId: params.veiId,
            placa: ultimaLeitura?.placa ?? null,
            periodo: { dataInicio: params.dataInicio ?? null, dataFim: params.dataFim ?? null },
            dadosSuficientes: amostras >= 2,
            amostras,
            totalKm: Math.round(totalKm),
            totalLitrosConsumidos: Math.round(totalLitrosConsumidos * 10) / 10,
            consumoMedioKmPorLitro:
                consumoMedioKmPorLitro !== null
                    ? Math.round(consumoMedioKmPorLitro * 100) / 100
                    : null,
            consumoMedioLPor100km:
                consumoMedioLPor100km !== null
                    ? Math.round(consumoMedioLPor100km * 100) / 100
                    : null,
            autonomiaEstimadaKm,
            ultimoLitrosTanque: ultimaLeitura?.litrosTanque ?? null,
            ultimoOdometro: ultimaLeitura?.odometro ?? null,
            abastecimentos: abastecimentos.reverse(),
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

                    // Chegou no destino com viagem aberta -> fecha. Viagem
                    // automática: destino é a lista fixa (Betim/Pouso
                    // Alegre). Viagem manual: destino é o município que a
                    // pessoa digitou na criação (já salvo em
                    // destinoMunicipio desde o início, não só na chegada).
                    const chegouNoDestino = viagemAberta?.criadaManualmente
                        ? this.normalizarCidade(municipioAtual) ===
                        this.normalizarCidade(viagemAberta.destinoMunicipio)
                        : this.estaNoDestinoViagem(municipioAtual);

                    if (viagemAberta && chegouNoDestino) {
                        await this.prisma.viagemGps.update({
                            where: { id: viagemAberta.id },
                            data: {
                                ...(viagemAberta.criadaManualmente
                                    ? {}
                                    : { destinoMunicipio: municipioAtual, destinoUf: msg.uf ?? null }),
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
     * mais recentes de qualquer status. Viagens manuais em andamento vêm
     * com "progresso" calculado (0-100) quando origem/destino foram
     * geocodificados com sucesso na criação — as demais vêm com
     * progresso: null (a tela mostra só um status sem barra nesse caso).
     */
    async listarViagensGps(params?: {
        status?: 'EM_ANDAMENTO' | 'CONCLUIDA';
        placa?: string;
        limit?: number;
    }) {
        const where: any = {};

        if (params?.status) where.status = params.status;
        if (params?.placa) where.placa = params.placa.toUpperCase();

        const viagens = await this.prisma.viagemGps.findMany({
            where,
            orderBy: { dataHoraInicio: 'desc' },
            take: params?.limit ?? 100,
        });

        return Promise.all(
            viagens.map(async (v) => {
                if (
                    !v.criadaManualmente ||
                    v.status !== 'EM_ANDAMENTO' ||
                    v.origemLatitude == null ||
                    v.origemLongitude == null ||
                    v.destinoLatitude == null ||
                    v.destinoLongitude == null
                ) {
                    return { ...v, progresso: null, distanciaRestanteKm: null };
                }

                const ultima = await this.prisma.posicaoCaminhao.findFirst({
                    where: { veiId: v.veiId },
                    orderBy: { dataHora: 'desc' },
                });

                if (!ultima) {
                    return { ...v, progresso: null, distanciaRestanteKm: null };
                }

                const distanciaTotal = this.distanciaKm(
                    v.origemLatitude,
                    v.origemLongitude,
                    v.destinoLatitude,
                    v.destinoLongitude,
                );

                const distanciaRestante = this.distanciaKm(
                    ultima.latitude,
                    ultima.longitude,
                    v.destinoLatitude,
                    v.destinoLongitude,
                );

                const progresso =
                    distanciaTotal > 0
                        ? Math.min(
                            100,
                            Math.max(
                                0,
                                Math.round(
                                    (1 - distanciaRestante / distanciaTotal) * 100,
                                ),
                            ),
                        )
                        : 100;

                return {
                    ...v,
                    progresso,
                    distanciaRestanteKm: Math.round(distanciaRestante),
                };
            }),
        );
    }

    /**
     * Cria uma viagem manualmente (botão "Nova Viagem" — alguém do
     * administrativo escolhe o caminhão e digita origem/destino), em vez
     * de esperar o GPS detectar sozinho a saída de Santos. A conclusão
     * continua automática: o cron de posições (persistirPosicoes ->
     * processarEventosViagem) fecha essa viagem sozinho assim que o
     * caminhão for visto no município de destino.
     */
    async criarViagemManual(params: {
        veiId: number;
        origemMunicipio: string;
        destinoMunicipio: string;
    }) {
        const origemMunicipio = params.origemMunicipio.trim();
        const destinoMunicipio = params.destinoMunicipio.trim();

        if (!params.veiId || !origemMunicipio || !destinoMunicipio) {
            throw new InternalServerErrorException(
                'Informe caminhão, origem e destino.',
            );
        }

        const veiculosResult = await this.listarVeiculosComCache(false);
        const veiculo = veiculosResult.veiculos.find(
            (v) => Number(v.veiID) === Number(params.veiId),
        );

        if (!veiculo) {
            throw new InternalServerErrorException('Caminhão não encontrado.');
        }

        const viagemAberta = await this.prisma.viagemGps.findFirst({
            where: { veiId: params.veiId, status: 'EM_ANDAMENTO' },
        });

        if (viagemAberta) {
            throw new InternalServerErrorException(
                'Esse caminhão já tem uma viagem em andamento.',
            );
        }

        // Geocodificação é best-effort — se falhar (sem internet, cidade não
        // encontrada etc.), a viagem é criada do mesmo jeito, só sem barra
        // de progresso (a conclusão automática por nome de município
        // continua funcionando normalmente).
        const [coordOrigem, coordDestino] = await Promise.all([
            this.geocodificarCidade(origemMunicipio),
            this.geocodificarCidade(destinoMunicipio),
        ]);

        return this.prisma.viagemGps.create({
            data: {
                veiId: params.veiId,
                placa: veiculo.placa,
                origemMunicipio,
                origemUf: null,
                dataHoraInicio: new Date(),
                destinoMunicipio,
                destinoUf: null,
                status: 'EM_ANDAMENTO',
                criadaManualmente: true,
                origemLatitude: coordOrigem?.lat ?? null,
                origemLongitude: coordOrigem?.lon ?? null,
                destinoLatitude: coordDestino?.lat ?? null,
                destinoLongitude: coordDestino?.lon ?? null,
            },
        });
    }

    // Nominatim (OpenStreetMap) — gratuito, sem chave de API. Exige um
    // User-Agent identificando a aplicação (política de uso deles) e não
    // deve ser chamado em loop apertado, mas aqui é só 2 chamadas por
    // criação manual de viagem, então tá bem dentro do limite.
    private async geocodificarCidade(
        nomeCidade: string,
    ): Promise<{ lat: number; lon: number } | null> {
        try {
            const resposta = await axios.get(
                'https://nominatim.openstreetmap.org/search',
                {
                    params: {
                        q: `${nomeCidade}, Brasil`,
                        format: 'json',
                        limit: 1,
                        countrycodes: 'br',
                    },
                    headers: {
                        'User-Agent': 'NuGalhoControleRota/1.0 (rota.nugalho)',
                    },
                    timeout: 8000,
                },
            );

            const resultado = Array.isArray(resposta.data) ? resposta.data[0] : null;

            if (!resultado) return null;

            const lat = this.parseNumber(resultado.lat);
            const lon = this.parseNumber(resultado.lon);

            if (lat === null || lon === null) return null;

            return { lat, lon };
        } catch (error: any) {
            console.warn(
                `Erro ao geocodificar "${nomeCidade}":`,
                error.message ?? error,
            );
            return null;
        }
    }

    // Distância em linha reta (haversine) entre dois pontos, em km — só
    // pra estimar o progresso da viagem manual, não é a distância real da
    // estrada.
    private distanciaKm(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number,
    ): number {
        const R = 6371;
        const toRad = (graus: number) => (graus * Math.PI) / 180;

        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * Resumo de viagens concluídas pro Dashboard: total geral + contagem
     * por placa (ex: "QPM - 4 viagens concluídas"). `desde` opcional filtra
     * por dataHoraFim (ex: só as concluídas hoje/no mês).
     */
    async resumoViagensConcluidas(params?: { desde?: Date }) {
        const where: any = { status: 'CONCLUIDA' };

        if (params?.desde) {
            where.dataHoraFim = { gte: params.desde };
        }

        const [total, porPlacaRaw] = await Promise.all([
            this.prisma.viagemGps.count({ where }),
            this.prisma.viagemGps.groupBy({
                by: ['placa'],
                where,
                _count: { _all: true },
            }),
        ]);

        // Ordena aqui em vez de no orderBy do groupBy — o Prisma só deixa
        // ordenar por campos de agregado que estejam selecionados em
        // _count, e aqui só selecionamos "_all" (contagem total da linha),
        // não um campo específico como "placa".
        const porPlaca = porPlacaRaw
            .map((item) => ({
                placa: item.placa || 'Sem placa',
                quantidade: item._count._all,
            }))
            .sort((a, b) => b.quantidade - a.quantidade);

        return { total, porPlaca };
    }

    // Igual a estaNaOrigemViagem/estaNoDestinoViagem, mas especificamente
    // pra detectar "está em Betim" (cidade-base de pagamento) — usado só
    // pelo cálculo de dias parados via GPS abaixo.
    private estaEmBetim(municipio: string | null | undefined): boolean {
        const normalizado = this.normalizarCidade(municipio);
        return !!normalizado && normalizado.includes('BETIM');
    }

    // "Parado em Betim" = está na cidade E velocidade zero — mesma regra
    // do upload manual (estaParadoEm em upload.service.ts, formato novo).
    // Só isso abre uma estadia nova ou atualiza o "último instante parado"
    // usado como hora de saída.
    private estaParadoEmBetim(pos: {
        municipio: string | null;
        velocidade: number | null;
    }): boolean {
        return this.estaEmBetim(pos.municipio) && pos.velocidade === 0;
    }

    /**
     * Varre o histórico de posições (ordenado por data) de UM caminhão e
     * devolve os períodos em que ele ficou parado em Betim — mesma máquina
     * de estados do upload manual (ver comentário grande em
     * upload.service.ts/processarUpload): a estadia abre no primeiro
     * instante visto parado (vel=0) em Betim, e só fecha quando aparece
     * uma posição em outra cidade (não importa a velocidade) — usando como
     * "fim" o último instante em que ele foi visto realmente parado ali,
     * não o instante da saída em si (pra não contar o início da próxima
     * viagem como se fosse parada). Uma estadia que segue aberta no fim do
     * histórico consultado (caminhão ainda em Betim) volta com fim=null.
     */
    private detectarEstadiasBetim(
        posicoes: { dataHora: Date; municipio: string | null; velocidade: number | null }[],
    ): { inicio: Date; fim: Date | null }[] {
        const segmentos: { inicio: Date; fim: Date | null }[] = [];

        let estadiaAberta: { inicio: Date } | null = null;
        let ultimaVezParado: Date | null = null;

        for (const pos of posicoes) {
            if (!estadiaAberta) {
                if (this.estaParadoEmBetim(pos)) {
                    estadiaAberta = { inicio: pos.dataHora };
                    ultimaVezParado = pos.dataHora;
                }
                continue;
            }

            if (this.estaEmBetim(pos.municipio)) {
                if (this.estaParadoEmBetim(pos)) {
                    ultimaVezParado = pos.dataHora;
                }
            } else {
                segmentos.push({
                    inicio: estadiaAberta.inicio,
                    fim: ultimaVezParado ?? estadiaAberta.inicio,
                });
                estadiaAberta = null;
                ultimaVezParado = null;
            }
        }

        if (estadiaAberta) {
            segmentos.push({ inicio: estadiaAberta.inicio, fim: null });
        }

        return segmentos;
    }

    // Mesma regra de calcularDiasParados do upload.service.ts: só contam
    // os dias INTEIROS estritamente entre a chegada e a saída — o dia da
    // chegada e o dia da saída nunca contam. Chegou dia 10 e saiu dia 12 =
    // 1 (dia 11).
    private calcularDiasParados(inicio: Date, fim: Date): number {
        const inicioDia = new Date(inicio);
        inicioDia.setHours(0, 0, 0, 0);

        const fimDia = new Date(fim);
        fimDia.setHours(0, 0, 0, 0);

        const diferencaDias = Math.floor(
            (fimDia.getTime() - inicioDia.getTime()) / (1000 * 60 * 60 * 24),
        );

        return Math.max(diferencaDias - 1, 0);
    }

    // Mesma regra de calcularDiasParadosContinuados do upload.service.ts:
    // pra estadias que já estavam abertas quando o mês pedido começou —
    // não existe "dia de chegada" dentro do mês pra descontar, então o
    // dia 1 já conta inteiro; só o dia da saída fica de fora.
    private calcularDiasParadosContinuados(fim: Date, inicioMes: Date): number {
        const inicioMesDia = new Date(inicioMes);
        inicioMesDia.setHours(0, 0, 0, 0);

        const fimDia = new Date(fim);
        fimDia.setHours(0, 0, 0, 0);

        const diferencaDias = Math.floor(
            (fimDia.getTime() - inicioMesDia.getTime()) / (1000 * 60 * 60 * 24),
        );

        return Math.max(diferencaDias, 0);
    }

    /**
     * Dias parados (mês) calculados automaticamente a partir do
     * rastreamento GPS ao vivo, em vez de depender do upload manual de
     * planilha — mesma regra de negócio de sempre (ver
     * calcularDiasParados acima): só contam os dias INTEIROS estritamente
     * entre a chegada e a saída de Betim; o dia da chegada e o dia da
     * saída nunca contam. Ex.: chegou em Betim dia 10 e só saiu dia 12 =
     * 1 dia parado (dia 11).
     *
     * `mes` no formato 'YYYY-MM' (padrão: mês atual). Estadias que já
     * estavam abertas quando o mês começou (o caminhão já estava parado
     * em Betim) contam a partir do dia 1 do mês, sem descontar dia de
     * chegada — igual à regra "continuada" do fluxo antigo. Estadias
     * ainda em aberto (caminhão parado em Betim até agora) só contam os
     * dias já fechados, até hoje ou até o fim do mês pedido (o que vier
     * primeiro) — por isso o total sobe sozinho dia a dia, sem precisar
     * de upload nenhum.
     */
    async resumoDiasParados(params?: { mes?: string }) {
        const agora = new Date();
        const mes =
            params?.mes ??
            `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

        const [ano, mesNum] = mes.split('-').map(Number);
        const inicioMes = new Date(ano, mesNum - 1, 1, 0, 0, 0, 0);
        const fimMes = new Date(ano, mesNum, 1, 0, 0, 0, 0);

        // Busca um pouco antes do início do mês, só o suficiente pra
        // detectar estadias já abertas quando o mês começou — sem
        // carregar o histórico inteiro do caminhão a cada consulta.
        const inicioBusca = new Date(inicioMes);
        inicioBusca.setDate(inicioBusca.getDate() - 45);

        const limiteAberto = fimMes < agora ? fimMes : agora;

        const veiculosResult = await this.listarVeiculosComCache(false);
        const veiculos = veiculosResult.veiculos;

        const porVeiculo: { placa: string; diasParados: number }[] = [];
        let totalGeral = 0;

        for (const veiculo of veiculos) {
            const veiId = Number(veiculo.veiID);
            if (!veiId) continue;

            const posicoes = await this.prisma.posicaoCaminhao.findMany({
                where: {
                    veiId,
                    dataHora: { gte: inicioBusca, lt: fimMes },
                },
                orderBy: { dataHora: 'asc' },
                select: { dataHora: true, municipio: true, velocidade: true },
            });

            if (posicoes.length === 0) continue;

            const segmentos = this.detectarEstadiasBetim(posicoes);

            let diasParadosVeiculo = 0;

            for (const seg of segmentos) {
                const fimEfetivo = seg.fim ?? limiteAberto;

                // Estadia que nem chegou a tocar o mês pedido (fechou
                // antes do dia 1) não entra na conta.
                if (fimEfetivo <= inicioMes) continue;

                const continuada = seg.inicio < inicioMes;

                const dias = continuada
                    ? this.calcularDiasParadosContinuados(fimEfetivo, inicioMes)
                    : this.calcularDiasParados(seg.inicio, fimEfetivo);

                diasParadosVeiculo += dias;
            }

            if (diasParadosVeiculo > 0) {
                porVeiculo.push({
                    placa: veiculo.placa ?? 'Sem placa',
                    diasParados: diasParadosVeiculo,
                });
                totalGeral += diasParadosVeiculo;
            }
        }

        porVeiculo.sort((a, b) => b.diasParados - a.diasParados);

        return { mes, totalDiasParados: totalGeral, porVeiculo };
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