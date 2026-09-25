import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import AdmZip from 'adm-zip';
import * as zlib from 'zlib';
import { PrismaService } from '../../prisma/prisma.service';
import { cifrar, decifrar } from '../../common/crypto.util';

// Estado em memória (cache de veículos/mensagens, cursores de mId) — um
// registro por empresa, porque cada empresa tem seu próprio login na
// Trucks Control e sua própria fila de mensagens. Antes do retrofit
// multi-empresa isso era um punhado de campos escalares na classe
// (fazia sentido quando só existia um login pro sistema inteiro).
interface EstadoEmpresaTrucks {
    veiculosCache: any[];
    ultimaBuscaVeiculosEm: number;

    mensagensCache: any[];
    ultimaBuscaMensagensEm: number;

    lastMid: number;

    // Cursor separado do cron de persistência — não pode ser o mesmo
    // `lastMid` usado pela tela ao vivo (ver comentário em
    // requisitarMensagens).
    lastMidPersistido: number;
}

@Injectable()
export class TrucksControlService implements OnModuleInit {
    constructor(private readonly prisma: PrismaService) { }

    // Grandfathering igual ao CaminhaoService/FiscalService: mostra os
    // registros da empresa logada e, transitoriamente, os que ainda não
    // têm empresa definida (veículos/posições/viagens capturados antes
    // do retrofit multi-empresa desse módulo, quando ainda não existia
    // a coluna empresaId). Sem isso, todo o histórico anterior ao
    // retrofit fica invisível mesmo intacto no banco.
    private filtroEmpresa(empresaId: string) {
        return { OR: [{ empresaId }, { empresaId: null }] };
    }

    private readonly url = process.env.TRUCKS_URL!;

    private parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
    });

    private readonly estados = new Map<string, EstadoEmpresaTrucks>();

    // ---- Rodízio entre ambientes (produção Hostinger x dev local) ----
    //
    // A Trucks Control limita o intervalo mínimo de chamada POR LOGIN, do
    // lado do servidor deles — sem noção nenhuma de "isso aqui é o
    // ambiente de produção" ou "isso aqui é o dev local". Se produção e
    // local rodam ao mesmo tempo com a mesma credencial, cada um controla
    // seu próprio cooldown (bancos separados) sem saber da existência do
    // outro: um chama achando que está liberado, e minutos depois o outro
    // chama também achando a mesma coisa — daí "código 7" o tempo todo,
    // porque na prática a cadência combinada dos dois é o dobro do que
    // cada lado imagina que está respeitando.
    //
    // Sem infraestrutura compartilhada entre os dois backends (bancos
    // diferentes, hosts diferentes), a saída é dividir o tempo em blocos
    // fixos e cada ambiente só chamar a API no bloco que é "a vez dele" —
    // baseado só no relógio (que os dois têm sincronizado via NTP), sem
    // precisar se falar. Configurado via env:
    //   TRUCKS_SLOT_INDEX   = 0, 1, 2... (qual é esse ambiente; padrão 0)
    //   TRUCKS_SLOT_TOTAL   = quantos ambientes estão se revezando agora
    //                         (padrão 1 = sozinho, sempre pode chamar)
    //   TRUCKS_SLOT_MINUTOS = duração de cada bloco em minutos (padrão 15)
    // Ex.: produção com INDEX=0/TOTAL=2 e local com INDEX=1/TOTAL=2 faz os
    // dois se revezarem automaticamente, nunca chamando no mesmo bloco.
    // Quando só um dos dois estiver ativo, volte TOTAL=1 nele pra
    // recuperar a frequência cheia.
    private readonly meuSlotIndex = Math.max(0, Number(process.env.TRUCKS_SLOT_INDEX ?? 0));
    private readonly totalSlots = Math.max(1, Number(process.env.TRUCKS_SLOT_TOTAL ?? 1));
    private readonly duracaoSlotMs =
        Math.max(1, Number(process.env.TRUCKS_SLOT_MINUTOS ?? 15)) * 60 * 1000;

    private estaNoMeuSlot(): boolean {
        if (this.totalSlots <= 1) return true;
        const bloco = Math.floor(Date.now() / this.duracaoSlotMs);
        return bloco % this.totalSlots === this.meuSlotIndex;
    }

    private estado(empresaId: string): EstadoEmpresaTrucks {
        let e = this.estados.get(empresaId);

        if (!e) {
            e = {
                veiculosCache: [],
                ultimaBuscaVeiculosEm: 0,
                mensagensCache: [],
                ultimaBuscaMensagensEm: 0,
                lastMid: 0,
                lastMidPersistido: 0,
            };
            this.estados.set(empresaId, e);
        }

        return e;
    }

    // Só recarrega do banco o que já tinha sido salvo (cache em memória
    // não começa vazio) — NÃO dispara nenhuma chamada de verdade pra
    // Trucks Control aqui. Isso é de propósito: em desenvolvimento o
    // `start:dev` reinicia o processo a cada arquivo salvo, e se cada
    // reinício tentasse uma chamada real na hora, uma sessão de edição
    // de algumas horas dispararia dezenas de tentativas — e se cada
    // "não atingiu o tempo mínimo" (código 7) empurra o cooldown do lado
    // da Trucks Control pra frente, isso pode manter a conta bloqueada
    // indefinidamente, mesmo respeitando o intervalo mínimo daqui. As
    // chamadas de verdade ficam só por conta dos crons abaixo, que
    // disparam em horário fixo (não a cada restart).
    async onModuleInit() {
        try {
            const credenciais = await this.prisma.trucksControlCredencial.findMany({
                where: { ativo: true },
            });

            for (const credencial of credenciais) {
                await this.carregarVeiculosDoBanco(credencial.empresaId);
            }
        } catch (error: any) {
            console.error(
                'Erro ao carregar credenciais da Trucks Control no boot:',
                error.message ?? error,
            );
        }
    }

    // -----------------------------------------------------------------
    // Credencial por empresa (login/senha cifrados)
    // -----------------------------------------------------------------

    // Devolve login + senha em texto puro (só pra montar o XML da
    // requisição na hora) — nunca expor isso em resposta HTTP.
    private async obterCredencialAtiva(
        empresaId: string,
    ): Promise<{ login: string; senha: string } | null> {
        try {
            const registro = await this.prisma.trucksControlCredencial.findUnique({
                where: { empresaId },
            });

            if (!registro || !registro.ativo) return null;

            const senha = decifrar({
                cifrado: registro.senhaCifrada,
                iv: registro.senhaIv,
                authTag: registro.senhaAuthTag,
            });

            return { login: registro.login, senha };
        } catch (error: any) {
            console.error(
                `Erro ao decifrar credencial da Trucks Control (empresa=${empresaId}):`,
                error.message ?? error,
            );
            return null;
        }
    }

    // Pra tela de Cadastros — nunca devolve a senha, só se já tem uma
    // credencial configurada e o login (pra reconhecer visualmente qual
    // conta está em uso).
    async obterCredencial(empresaId: string) {
        const registro = await this.prisma.trucksControlCredencial.findUnique({
            where: { empresaId },
        });

        if (!registro) {
            return { configurado: false, login: null, ativo: false };
        }

        return { configurado: true, login: registro.login, ativo: registro.ativo };
    }

    async salvarCredencial(empresaId: string, body: { login: string; senha: string }) {
        const login = body.login?.trim();
        const senha = body.senha?.trim();

        if (!login || !senha) {
            throw new BadRequestException('Informe o login e a senha da conta na Trucks Control.');
        }

        const { cifrado, iv, authTag } = cifrar(senha);

        await this.prisma.trucksControlCredencial.upsert({
            where: { empresaId },
            update: {
                login,
                senhaCifrada: cifrado,
                senhaIv: iv,
                senhaAuthTag: authTag,
                ativo: true,
            },
            create: {
                empresaId,
                login,
                senhaCifrada: cifrado,
                senhaIv: iv,
                senhaAuthTag: authTag,
            },
        });

        // Limpa o cache em memória dessa empresa pra próxima chamada já
        // usar a credencial nova (evita ficar batendo com a senha antiga
        // até o cache expirar sozinho).
        this.estados.delete(empresaId);

        return { ok: true };
    }

    async alternarCredencialAtiva(empresaId: string, ativo: boolean) {
        const registro = await this.prisma.trucksControlCredencial.findUnique({
            where: { empresaId },
        });

        if (!registro) {
            throw new NotFoundException('Nenhuma credencial da Trucks Control cadastrada pra essa empresa.');
        }

        await this.prisma.trucksControlCredencial.update({
            where: { empresaId },
            data: { ativo },
        });

        this.estados.delete(empresaId);

        return { ok: true };
    }

    async removerCredencial(empresaId: string) {
        await this.prisma.trucksControlCredencial.deleteMany({ where: { empresaId } });
        this.estados.delete(empresaId);
        return { ok: true };
    }

    // -----------------------------------------------------------------
    // Lista de veículos (RequestVeiculo)
    // -----------------------------------------------------------------

    private async carregarVeiculosDoBanco(empresaId: string) {
        try {
            const salvos = await this.prisma.veiculoTrucksControl.findMany({
                where: this.filtroEmpresa(empresaId),
            });

            if (salvos.length > 0) {
                this.estado(empresaId).veiculosCache = salvos.map((v) => ({
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
                `Erro ao carregar veículos salvos do banco (empresa=${empresaId}):`,
                error.message ?? error,
            );
        }
    }

    private async salvarVeiculosNoBanco(empresaId: string, veiculos: any[]) {
        try {
            for (const v of veiculos) {
                if (!v.veiID) continue;

                await this.prisma.veiculoTrucksControl.upsert({
                    where: { empresaId_veiId: { empresaId, veiId: v.veiID } },
                    update: {
                        placa: v.placa,
                        equipamento: v.equipamento,
                        motorista: v.motorista,
                        proprietario: v.proprietario,
                        identificacao: v.identificacao,
                        chassi: v.chassi,
                    },
                    create: {
                        empresaId,
                        veiId: v.veiID,
                        placa: v.placa,
                        equipamento: v.equipamento,
                        motorista: v.motorista,
                        proprietario: v.proprietario,
                        identificacao: v.identificacao,
                        chassi: v.chassi,
                    },
                });

                await this.garantirCaminhao(empresaId, v.placa);
            }
        } catch (error: any) {
            console.error(
                `Erro ao salvar veículos no banco (empresa=${empresaId}):`,
                error.message ?? error,
            );
        }
    }

    // Auto-provisiona o Caminhao (cadastro usado pelo resto do sistema —
    // Financeiro, Fiscal, Relatórios) a partir de toda placa que aparecer
    // na conta da Trucks Control da empresa. Não precisa mais passar pelo
    // cadastro manual: a placa nova já chega pronta, vinculada à empresa
    // certa. Se a placa já pertencer a outra empresa (não deveria
    // acontecer numa placa real, mas por segurança), não reatribui —
    // só avisa no log.
    private async garantirCaminhao(empresaId: string, placaBruta: string | null | undefined) {
        const placa = placaBruta?.trim().toUpperCase();
        if (!placa) return;

        try {
            const existente = await this.prisma.caminhao.findUnique({ where: { placa } });

            if (!existente) {
                await this.prisma.caminhao.create({ data: { placa, empresaId } });
                return;
            }

            if (!existente.empresaId) {
                await this.prisma.caminhao.update({
                    where: { id: existente.id },
                    data: { empresaId },
                });
                return;
            }

            if (existente.empresaId !== empresaId) {
                console.warn(
                    `[TrucksControl] Placa ${placa} já pertence à empresa ${existente.empresaId} — ignorando vínculo com ${empresaId}.`,
                );
            }
        } catch (error: any) {
            console.error(
                `Erro ao provisionar caminhão automaticamente (placa=${placa}, empresa=${empresaId}):`,
                error.message ?? error,
            );
        }
    }

    async listarVeiculosComCache(empresaId: string, forcarApi = true) {
        const estado = this.estado(empresaId);
        const agora = Date.now();
        const passou5Minutos = agora - estado.ultimaBuscaVeiculosEm >= 5 * 60 * 1000;

        if (estado.veiculosCache.length > 0 && !passou5Minutos) {
            return {
                origem: 'cache',
                veiculos: estado.veiculosCache,
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
                    estado.veiculosCache.length > 0 ? 'cache-desatualizado' : 'sem-cache',
                veiculos: estado.veiculosCache,
            };
        }

        // Guarda persistida no banco (sobrevive a reinício do backend) —
        // ver comentário grande em podeChamarApi(). 30 minutos é bem mais
        // do que o mínimo que a Trucks Control diz exigir, de propósito:
        // depois de um episódio de bloqueio ("código 7" repetido), é
        // melhor pecar por cautela — a lista de placas muda raramente,
        // não há necessidade nenhuma de tentar de novo cedo. O segundo
        // check (tipo 'Veiculo_erro') é um cooldown mais longo ainda,
        // que só é armado quando a própria Trucks Control já rejeitou
        // por "muito cedo" — evita bater de novo enquanto o bloqueio do
        // lado deles ainda não zerou.
        const dentroDoMeuSlot = this.estaNoMeuSlot();
        const podeChamar =
            dentroDoMeuSlot && (await this.podeChamarApi(empresaId, 'Veiculo', 30 * 60 * 1000));
        const podeChamarAposErro = await this.podeChamarApi(empresaId, 'Veiculo_erro', 60 * 60 * 1000);

        if (!podeChamar || !podeChamarAposErro) {
            const motivo = !dentroDoMeuSlot
                ? ` (fora do rodízio deste ambiente — slot ${this.meuSlotIndex + 1}/${this.totalSlots})`
                : !podeChamarAposErro
                    ? ' (em cooldown estendido por erro anterior)'
                    : '';

            console.log(
                `[TrucksControl] ${new Date().toISOString()} empresa=${empresaId} — Pulando RequestVeiculo, ainda dentro do intervalo mínimo${motivo}.`,
            );

            if (estado.veiculosCache.length === 0) {
                await this.carregarVeiculosDoBanco(empresaId);
            }

            return {
                origem:
                    estado.veiculosCache.length > 0
                        ? 'cache-aguardando-intervalo-minimo'
                        : 'sem-cache',
                veiculos: estado.veiculosCache,
            };
        }

        const veiculos = await this.listarVeiculos(empresaId);

        estado.veiculosCache = veiculos;
        estado.ultimaBuscaVeiculosEm = agora;

        return {
            origem: 'api',
            veiculos,
        };
    }

    /**
     * Confere no banco (não só na memória) se já pode chamar de novo esse
     * tipo de requisição da Trucks Control, PARA ESSA EMPRESA. A API
     * impõe um intervalo mínimo entre chamadas do mesmo login — e ela
     * conta esse tempo do lado dela, não do nosso processo. Guardar só em
     * memória funciona enquanto o backend fica no ar, mas em
     * desenvolvimento o `start:dev` reinicia a cada salvamento de
     * arquivo — cada reinício zerava o controle em memória e tentava
     * chamar de novo na hora, mesmo que a chamada anterior (de antes do
     * restart) tivesse sido há poucos segundos, e a API rejeitava com
     * "código 7". Persistindo no banco, o controle sobrevive ao restart.
     */
    private async podeChamarApi(
        empresaId: string,
        tipoRequisicao: string,
        intervaloMinimoMs: number,
    ): Promise<boolean> {
        try {
            const registro = await this.prisma.trucksControlRateLimit.findUnique({
                where: { empresaId_tipoRequisicao: { empresaId, tipoRequisicao } },
            });

            if (!registro) return true;

            const passou = Date.now() - registro.ultimaChamadaEm.getTime();

            return passou >= intervaloMinimoMs;
        } catch (error: any) {
            // Se o banco falhar por algum motivo, não trava a integração —
            // deixa tentar chamar a API normalmente (na pior hipótese ela
            // mesma rejeita com código 7, que já é tratado graciosamente).
            console.error(
                'Erro ao consultar rate limit da Trucks Control:',
                error.message ?? error,
            );
            return true;
        }
    }

    // Registra "chamei agora" pra esse tipo de requisição dessa empresa —
    // sempre, tenha a API aceitado ou rejeitado (o que importa é que uma
    // requisição saiu pro servidor deles, então o relógio deles começou a
    // contar).
    private async registrarChamadaApi(empresaId: string, tipoRequisicao: string): Promise<void> {
        try {
            await this.prisma.trucksControlRateLimit.upsert({
                where: { empresaId_tipoRequisicao: { empresaId, tipoRequisicao } },
                update: { ultimaChamadaEm: new Date() },
                create: { empresaId, tipoRequisicao, ultimaChamadaEm: new Date() },
            });
        } catch (error: any) {
            console.error(
                'Erro ao registrar rate limit da Trucks Control:',
                error.message ?? error,
            );
        }
    }

    /**
     * Atualização automática da lista de placas/veículos — roda a cada 10
     * minutos (o cooldown de verdade é imposto pelo gate persistido em
     * podeChamarApi, de 30 min normalmente e 1h depois de um "código 7"
     * — ver listarVeiculosComCache), uma vez pra cada empresa com
     * credencial ativa. Rodar o cron a cada 10 min só garante que, assim
     * que o cooldown liberar, a próxima checagem não demora muito.
     */
    @Cron('*/10 * * * *')
    async atualizarListaVeiculos() {
        const credenciais = await this.prisma.trucksControlCredencial.findMany({
            where: { ativo: true },
        });

        for (const credencial of credenciais) {
            try {
                await this.listarVeiculosComCache(credencial.empresaId, true);
            } catch (error: any) {
                console.error(
                    `Erro ao atualizar lista de veículos (empresa=${credencial.empresaId}):`,
                    error.message ?? error,
                );
            }
        }
    }

    async listarVeiculos(empresaId: string) {
        const credencial = await this.obterCredencialAtiva(empresaId);

        if (!credencial) {
            console.warn(
                `[TrucksControl] empresa=${empresaId} sem credencial ativa — pulando RequestVeiculo.`,
            );
            return this.estado(empresaId).veiculosCache;
        }

        const xml = `
<RequestVeiculo>
  <login>${credencial.login}</login>
  <senha>${credencial.senha}</senha>
</RequestVeiculo>`;

        const data = await this.postXml(xml);

        await this.registrarChamadaApi(empresaId, 'Veiculo');

        // Log cru — pra conferir no terminal se a Trucks Control está
        // mandando motorista/identificação/chassi preenchidos pra essa
        // empresa, ou se só vem a placa mesmo (limitação de cadastro do
        // lado deles, como já aconteceu com litrosTanque).
        console.log(
            `[TrucksControl] empresa=${empresaId} RequestVeiculo resposta:`,
            JSON.stringify(data),
        );

        if (data?.ErrorRequest) {
            console.warn(
                `[TrucksControl] ${new Date().toISOString()} empresa=${empresaId} Erro RequestVeiculo:`,
                data.ErrorRequest,
            );

            // Código 7 = "não atingiu o tempo mínimo pra reenvio" — a
            // Trucks Control está dizendo que ainda estamos dentro do
            // cooldown DELA, que aparentemente é bem maior do que os 30
            // minutos que a gente assume acima. Arma o cooldown extra de
            // 1h pra não insistir e evitar empurrar esse bloqueio pra
            // frente de novo.
            if (Number(data.ErrorRequest?.codigo) === 7) {
                await this.registrarChamadaApi(empresaId, 'Veiculo_erro');
            }

            const estado = this.estado(empresaId);

            if (estado.veiculosCache.length > 0) {
                return estado.veiculosCache;
            }

            // Cache em memória vazio (ex: acabou de reiniciar e ainda não
            // deu tempo do onModuleInit carregar) — tenta o banco antes de
            // desistir e devolver lista vazia pra tela.
            await this.carregarVeiculosDoBanco(empresaId);

            return estado.veiculosCache;
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

        await this.salvarVeiculosNoBanco(empresaId, veiculos);

        return veiculos;
    }

    // -----------------------------------------------------------------
    // Mensagens / posições (RequestMensagemCB)
    // -----------------------------------------------------------------

    /**
     * Chamada crua da API (sem tocar em nenhum cursor de instância) —
     * usada tanto pelo fluxo ao vivo (buscarMensagens, que usa e avança
     * estado.lastMid) quanto pelo cron de persistência (que tem o próprio
     * cursor independente, estado.lastMidPersistido). Os dois NÃO podem
     * compartilhar o mesmo cursor: se compartilhassem, o cron "consumiria"
     * mensagens antes do cache ao vivo vê-las, e a tela ficaria sem
     * atualizar.
     */
    private async requisitarMensagens(empresaId: string, mid: number) {
        // Guarda persistida no banco (sobrevive a reinício do backend) —
        // ver comentário grande em podeChamarApi(). RequestMensagemCB tem
        // intervalo mínimo de 30s entre chamadas do mesmo login.
        const podeChamar = await this.podeChamarApi(empresaId, 'MensagemCB', 30 * 1000);

        if (!podeChamar) {
            console.log(
                `[TrucksControl] empresa=${empresaId} — Pulando RequestMensagemCB, ainda dentro do intervalo mínimo desde a última chamada.`,
            );

            return [];
        }

        const credencial = await this.obterCredencialAtiva(empresaId);

        if (!credencial) {
            return [];
        }

        const xml = `
<RequestMensagemCB>
  <login>${credencial.login}</login>
  <senha>${credencial.senha}</senha>
  <mId>${mid}</mId>
</RequestMensagemCB>`;

        const data = await this.postXml(xml);

        await this.registrarChamadaApi(empresaId, 'MensagemCB');

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
            municipio: this.parseString(m.mun),
            uf: this.parseString(m.uf),
            rodovia: this.parseString(m.rod),
            rua: this.parseString(m.rua),
            velocidade: this.parseNumber(m.vel),
            motorista: this.parseString(m.mot),
            placaCarreta: this.parseString(m.carreta),
            // Campos opcionais — só vêm preenchidos se o equipamento do
            // veículo tiver o sensor correspondente (ex.: nem todo
            // rastreador manda nível de combustível).
            litrosTanque: this.parseNumber(m.lt),
            odometro: this.parseNumber(m.odm),
            rpm: this.parseNumber(m.rpm),
        }));
    }

    async buscarMensagens(empresaId: string, lastMid?: number) {
        const estado = this.estado(empresaId);
        const mid = lastMid ?? estado.lastMid ?? 0;

        const normalizadas = await this.requisitarMensagens(empresaId, mid);

        const maiorMid = Math.max(0, ...normalizadas.map((m) => m.mId));

        if (maiorMid > estado.lastMid) {
            estado.lastMid = maiorMid;
        }

        return {
            lastMidAnterior: mid,
            lastMidAtual: estado.lastMid,
            total: normalizadas.length,
            mensagens: normalizadas,
        };
    }

    async buscarMensagensComCache(empresaId: string) {
        const estado = this.estado(empresaId);
        const agora = Date.now();
        const passou30Segundos = agora - estado.ultimaBuscaMensagensEm >= 30_000;

        if (!passou30Segundos && estado.mensagensCache.length > 0) {
            return {
                origem: 'cache',
                lastMidAtual: estado.lastMid,
                total: estado.mensagensCache.length,
                mensagens: estado.mensagensCache,
            };
        }

        const result = await this.buscarMensagens(empresaId);

        const mensagensMap = new Map<number, any>();

        for (const msg of estado.mensagensCache) {
            mensagensMap.set(Number(msg.mId), msg);
        }

        for (const msg of result.mensagens) {
            mensagensMap.set(Number(msg.mId), msg);
        }

        estado.mensagensCache = Array.from(mensagensMap.values())
            .sort((a, b) => b.mId - a.mId)
            .slice(0, 500);

        estado.ultimaBuscaMensagensEm = agora;

        return {
            origem: 'api',
            lastMidAnterior: result.lastMidAnterior,
            lastMidAtual: result.lastMidAtual,
            total: estado.mensagensCache.length,
            mensagens: estado.mensagensCache,
        };
    }

    async buscarUltimasPosicoes(empresaId: string) {
        const result = await this.buscarMensagensComCache(empresaId);

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
     * RequestMensagemCB (um pro cron, outro pra essa tela) com o MESMO
     * login, o primeiro que chamasse esvaziava a caixa e o outro não
     * recebia nada. Por isso só existe UM consumidor real da API por
     * empresa (persistirPosicoesEmpresa) — passe forcar:true pra rodar
     * ele antes de ler, quando quiser um refresh na hora (botão "Buscar
     * nova localização").
     */
    async buscarCaminhoesComLocalizacao(empresaId: string, opts?: { forcar?: boolean }) {
        if (opts?.forcar) {
            await this.persistirPosicoesEmpresa(empresaId);
        }

        const veiculosResult = await this.listarVeiculosComCache(empresaId, false);
        const veiculos = veiculosResult.veiculos;

        const veiIds = veiculos.map((v) => Number(v.veiID));

        const [ultimasPosicoes, ultimasTelemetrias] = await Promise.all([
            this.prisma.posicaoCaminhao.findMany({
                where: { ...this.filtroEmpresa(empresaId), veiId: { in: veiIds } },
                orderBy: { dataHora: 'desc' },
                distinct: ['veiId'],
            }),
            // Última ocorrência de Telemetria por veículo — é a fonte real
            // de combustível (percentual do tanque), diferente do
            // litrosTanque de PosicaoCaminhao (ver comentário grande na
            // seção "Telemetria" acima).
            this.prisma.telemetriaOcorrencia.findMany({
                where: { ...this.filtroEmpresa(empresaId), veiId: { in: veiIds } },
                orderBy: { dataHora: 'desc' },
                distinct: ['veiId'],
            }),
        ]);

        const posicaoPorVeiculo = new Map(
            ultimasPosicoes.map((p) => [p.veiId, p]),
        );

        const telemetriaPorVeiculo = new Map(
            ultimasTelemetrias.map((t) => [t.veiId, t]),
        );

        const caminhoes = veiculos.map((veiculo) => {
            const ultima = posicaoPorVeiculo.get(Number(veiculo.veiID));
            const ultimaTelemetria = telemetriaPorVeiculo.get(Number(veiculo.veiID));

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
                telemetria: ultimaTelemetria
                    ? {
                        dataHora: ultimaTelemetria.dataHora,
                        percentualTanque: ultimaTelemetria.percentualTanque,
                        percentualAcelerador: ultimaTelemetria.percentualAcelerador,
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
     * Roda em segundo plano a cada 5 minutos, uma vez pra cada empresa com
     * credencial ativa, independente de alguém estar com a tela de Rotas
     * aberta, e salva no banco os pings novos dos caminhões monitorados.
     * Isso é necessário porque a API externa só mantém as mensagens não
     * lidas por poucas horas — sem isso, o histórico se perde a cada
     * reinício do backend ou quando ninguém consulta por um tempo. Roda
     * bem acima do mínimo de 30 segundos que a API exige pra
     * RequestMensagemCB.
     */
    @Cron('*/5 * * * *')
    async persistirPosicoes() {
        const credenciais = await this.prisma.trucksControlCredencial.findMany({
            where: { ativo: true },
        });

        for (const credencial of credenciais) {
            await this.persistirPosicoesEmpresa(credencial.empresaId);
        }
    }

    private async persistirPosicoesEmpresa(empresaId: string) {
        try {
            const veiculosResult = await this.listarVeiculosComCache(empresaId, false);
            const veiculos = veiculosResult.veiculos;

            if (veiculos.length === 0) return;

            const veiculosPorId = new Map(
                veiculos.map((v) => [Number(v.veiID), v]),
            );

            const estado = this.estado(empresaId);

            const mensagens = await this.requisitarMensagens(
                empresaId,
                estado.lastMidPersistido,
            );

            console.log(
                `[TrucksControl] empresa=${empresaId} cursor=${estado.lastMidPersistido} veiculos=${veiculos.length} mensagensRecebidas=${mensagens.length}`,
            );

            const maiorMid = Math.max(
                estado.lastMidPersistido,
                ...mensagens.map((m) => m.mId),
            );

            const mensagensRelevantes = mensagens.filter(
                (msg) =>
                    veiculosPorId.has(Number(msg.veiID)) &&
                    msg.latitude !== null &&
                    msg.longitude !== null,
            );

            console.log(
                `[TrucksControl] empresa=${empresaId} mensagensRelevantes=${mensagensRelevantes.length}`,
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
                `[TrucksControl] empresa=${empresaId} combustivel=${comCombustivel.length}/${mensagensRelevantes.length} ` +
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
                        empresaId,
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
            await this.processarEventosViagem(empresaId, mensagensRelevantes, veiculosPorId);

            // Só avança o cursor depois que TODAS as mensagens desse lote
            // foram gravadas com sucesso — se algo falhar no meio do loop
            // (e cair no catch abaixo), o cursor fica onde estava e a
            // próxima tentativa reprocessa o lote inteiro. upsert é
            // idempotente (mId é @unique), então reprocessar mensagens já
            // salvas não causa duplicata.
            estado.lastMidPersistido = maiorMid;
        } catch (error: any) {
            console.error(
                `Erro ao persistir posições dos caminhões (empresa=${empresaId}):`,
                error.message ?? error,
            );
        }
    }

    /**
     * Histórico de posições salvo no banco (não depende do cache em
     * memória nem da retenção curta da API externa) — pode ser
     * consultado a qualquer momento, filtrando por placa e/ou período.
     */
    async buscarHistorico(empresaId: string, params: {
        placa?: string;
        veiId?: number;
        dataInicio?: string;
        dataFim?: string;
    }) {
        const where: any = { ...this.filtroEmpresa(empresaId) };

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

    // -----------------------------------------------------------------
    // Telemetria (RequestTelemetriaOcorrenciasHoje / RequestTelemetriaV25)
    // -----------------------------------------------------------------
    //
    // Duas rotas separadas de RequestMensagemCB — segundo o próprio
    // suporte da Trucks Control (conferido por WhatsApp), o "lt" de
    // RequestMensagemCB (litrosTanque acima) não vem preenchido de
    // verdade; combustível é dado de CAN do veículo, e só vem por
    // Telemetria, que precisa estar contratada/habilitada no plano da
    // empresa e embarcada no equipamento (RequestEmbarcarTelemetria no
    // manual). Estas duas rotas são a fonte real:
    //   - RequestTelemetriaOcorrenciasHoje: percentual do tanque
    //     (pTanque, 0-100, NÃO litros absolutos) por minuto/ocorrência —
    //     só devolve ocorrências do dia corrente, por isso persistimos
    //     pra manter histórico.
    //   - RequestTelemetriaV25: consumo em litros por bloco de tempo
    //     (ConsumoLitros), junto com hodômetro/horímetro do bloco — essa
    //     é "quantos litros o caminhão gastou", diferente de "quanto tem
    //     no tanque agora" (pTanque acima).
    // Ambas documentadas com intervalo mínimo de 10 minutos entre
    // chamadas do mesmo login.

    private parseDataHoraBr(value: any): Date | null {
        if (value === undefined || value === null || value === '') return null;

        const str = String(value).trim();

        // Formato dd/mm/yyyy HH:mm:ss, usado no exemplo de
        // RequestTelemetriaOcorrenciasHoje do manual. new Date() nativo
        // não entende esse formato (interpretaria errado como mm/dd),
        // então precisa parsear na mão.
        const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);

        if (match) {
            const [, dd, mm, yyyy, hh, mi, ss] = match;
            return new Date(
                Number(yyyy),
                Number(mm) - 1,
                Number(dd),
                Number(hh),
                Number(mi),
                Number(ss),
            );
        }

        // Fallback pra ISO ou outros formatos que o Date nativo entenda
        // (ex.: RequestTelemetriaV25 não trouxe exemplo no manual — se
        // vier em ISO, isso já resolve sozinho).
        const asDate = new Date(str);
        return Number.isNaN(asDate.getTime()) ? null : asDate;
    }

    private async requisitarTelemetriaOcorrenciasHoje(empresaId: string) {
        const podeChamar = await this.podeChamarApi(
            empresaId,
            'TelemetriaOcorrenciasHoje',
            10 * 60 * 1000,
        );

        if (!podeChamar) {
            console.log(
                `[TrucksControl] empresa=${empresaId} — Pulando RequestTelemetriaOcorrenciasHoje, ainda dentro do intervalo mínimo.`,
            );
            return [];
        }

        const credencial = await this.obterCredencialAtiva(empresaId);
        if (!credencial) return [];

        const xml = `
<RequestTelemetriaOcorrenciasHoje>
  <login>${credencial.login}</login>
  <senha>${credencial.senha}</senha>
</RequestTelemetriaOcorrenciasHoje>`;

        const data = await this.postXml(xml);

        await this.registrarChamadaApi(empresaId, 'TelemetriaOcorrenciasHoje');

        // Log cru da resposta — pra conferir no terminal se a Trucks
        // Control está realmente devolvendo ocorrências com pTanque
        // preenchido pra essa empresa, sem precisar abrir o banco.
        console.log(
            `[TrucksControl] empresa=${empresaId} RequestTelemetriaOcorrenciasHoje resposta:`,
            JSON.stringify(data),
        );

        if (data?.ErrorRequest) {
            console.warn(
                'Erro Trucks RequestTelemetriaOcorrenciasHoje:',
                data.ErrorRequest,
            );
            return [];
        }

        const ocorrencias = this.toArray(
            data?.ResponseTelemetriaOcorrenciasHoje?.Ocorrencia,
        );

        return ocorrencias.map((o: any) => ({
            veiID: Number(o.veiID),
            dataHora: this.parseDataHoraBr(o.dtHr),
            velocidade: this.parseNumber(o.vel),
            velocidadeMax: this.parseNumber(o.velMax),
            rpm: this.parseNumber(o.rpm),
            percentualTanque: this.parseNumber(o.pTanque),
            percentualAcelerador: this.parseNumber(o.pAcelerador),
        }));
    }

    private async requisitarTelemetriaV25(empresaId: string) {
        const podeChamar = await this.podeChamarApi(empresaId, 'TelemetriaV25', 10 * 60 * 1000);

        if (!podeChamar) {
            console.log(
                `[TrucksControl] empresa=${empresaId} — Pulando RequestTelemetriaV25, ainda dentro do intervalo mínimo.`,
            );
            return [];
        }

        const credencial = await this.obterCredencialAtiva(empresaId);
        if (!credencial) return [];

        const xml = `
<RequestTelemetriaV25>
  <login>${credencial.login}</login>
  <senha>${credencial.senha}</senha>
</RequestTelemetriaV25>`;

        const data = await this.postXml(xml);

        await this.registrarChamadaApi(empresaId, 'TelemetriaV25');

        // Idem — log cru pra ver no terminal se ConsumoLitros está vindo
        // preenchido de verdade.
        console.log(
            `[TrucksControl] empresa=${empresaId} RequestTelemetriaV25 resposta:`,
            JSON.stringify(data),
        );

        if (data?.ErrorRequest) {
            console.warn('Erro Trucks RequestTelemetriaV25:', data.ErrorRequest);
            return [];
        }

        const blocos = this.toArray(data?.ResponseTelemetriaV25?.TelemetriaV25);

        return blocos.map((b: any) => ({
            veiID: Number(b.veiID),
            dataHoraInicio: this.parseDataHoraBr(b.DataHoraInicio),
            dataHoraFim: this.parseDataHoraBr(b.DataHoraFim),
            hodometroInicial: this.parseNumber(b.HodometroInicial),
            hodometroTotal: this.parseNumber(b.HodometroTotal),
            qtdMinutosMotorInicio: this.parseNumber(b.QtdMinutosMotorInicio),
            qtdMinutosMotorFim: this.parseNumber(b.QtdMinutosMotorFim),
            consumoLitrosAnterior: this.parseNumber(b.ConsumoLitrosAnterior),
            consumoLitros: this.parseNumber(b.ConsumoLitros),
            tempMediaLiqArrefecimento: this.parseNumber(b.TempMediaLiqArrefecimento),
            tempMaximaLiqArrefecimento: this.parseNumber(b.TempMaximaLiqArrefecimento),
        }));
    }

    /**
     * Roda a cada 10 minutos (mesmo cooldown real das duas requisições,
     * imposto pelo gate persistido em podeChamarApi) — busca e persiste
     * telemetria de ocorrências + V25 pra cada empresa com credencial
     * ativa e telemetria embarcada. Empresas sem telemetria habilitada
     * simplesmente recebem resposta vazia da API (ou erro), sem quebrar
     * nada — os arrays ficam vazios e o loop só não grava nada.
     */
    @Cron('*/10 * * * *')
    async persistirTelemetria() {
        const credenciais = await this.prisma.trucksControlCredencial.findMany({
            where: { ativo: true },
        });

        for (const credencial of credenciais) {
            await this.persistirTelemetriaEmpresa(credencial.empresaId);
        }
    }

    private async persistirTelemetriaEmpresa(empresaId: string) {
        try {
            const veiculosResult = await this.listarVeiculosComCache(empresaId, false);
            const veiculosPorId = new Map(
                veiculosResult.veiculos.map((v) => [Number(v.veiID), v]),
            );

            const [ocorrencias, blocos] = await Promise.all([
                this.requisitarTelemetriaOcorrenciasHoje(empresaId),
                this.requisitarTelemetriaV25(empresaId),
            ]);

            for (const o of ocorrencias) {
                if (!o.veiID || !o.dataHora || Number.isNaN(o.dataHora.getTime())) continue;

                const veiculo = veiculosPorId.get(o.veiID);

                await this.prisma.telemetriaOcorrencia.upsert({
                    where: {
                        veiId_dataHora: { veiId: o.veiID, dataHora: o.dataHora },
                    },
                    update: {
                        velocidade: o.velocidade,
                        velocidadeMax: o.velocidadeMax,
                        rpm: o.rpm !== null ? Math.round(o.rpm) : null,
                        percentualTanque: o.percentualTanque,
                        percentualAcelerador: o.percentualAcelerador,
                    },
                    create: {
                        empresaId,
                        veiId: o.veiID,
                        placa: veiculo?.placa ?? null,
                        dataHora: o.dataHora,
                        velocidade: o.velocidade,
                        velocidadeMax: o.velocidadeMax,
                        rpm: o.rpm !== null ? Math.round(o.rpm) : null,
                        percentualTanque: o.percentualTanque,
                        percentualAcelerador: o.percentualAcelerador,
                    },
                });
            }

            for (const b of blocos) {
                if (
                    !b.veiID ||
                    !b.dataHoraInicio ||
                    !b.dataHoraFim ||
                    Number.isNaN(b.dataHoraInicio.getTime()) ||
                    Number.isNaN(b.dataHoraFim.getTime())
                ) {
                    continue;
                }

                const veiculo = veiculosPorId.get(b.veiID);

                await this.prisma.telemetriaBlocoV25.upsert({
                    where: {
                        veiId_dataHoraInicio_dataHoraFim: {
                            veiId: b.veiID,
                            dataHoraInicio: b.dataHoraInicio,
                            dataHoraFim: b.dataHoraFim,
                        },
                    },
                    update: {},
                    create: {
                        empresaId,
                        veiId: b.veiID,
                        placa: veiculo?.placa ?? null,
                        dataHoraInicio: b.dataHoraInicio,
                        dataHoraFim: b.dataHoraFim,
                        hodometroInicial: b.hodometroInicial,
                        hodometroTotal: b.hodometroTotal,
                        qtdMinutosMotorInicio:
                            b.qtdMinutosMotorInicio !== null
                                ? Math.round(b.qtdMinutosMotorInicio)
                                : null,
                        qtdMinutosMotorFim:
                            b.qtdMinutosMotorFim !== null
                                ? Math.round(b.qtdMinutosMotorFim)
                                : null,
                        consumoLitrosAnterior: b.consumoLitrosAnterior,
                        consumoLitros: b.consumoLitros,
                        tempMediaLiqArrefecimento: b.tempMediaLiqArrefecimento,
                        tempMaximaLiqArrefecimento: b.tempMaximaLiqArrefecimento,
                    },
                });
            }

            console.log(
                `[TrucksControl] empresa=${empresaId} telemetria: ocorrencias=${ocorrencias.length} blocosV25=${blocos.length}`,
            );
        } catch (error: any) {
            console.error(
                `Erro ao persistir telemetria (empresa=${empresaId}):`,
                error.message ?? error,
            );
        }
    }

    /**
     * Histórico de ocorrências de Telemetria (percentual do tanque) salvo
     * no banco — mesmo padrão de buscarHistorico, filtrando por
     * placa/veiId/período.
     */
    async buscarTelemetriaOcorrencias(empresaId: string, params: {
        placa?: string;
        veiId?: number;
        dataInicio?: string;
        dataFim?: string;
    }) {
        const where: any = { ...this.filtroEmpresa(empresaId) };

        if (params.placa) where.placa = params.placa.toUpperCase();
        if (params.veiId) where.veiId = params.veiId;

        if (params.dataInicio || params.dataFim) {
            where.dataHora = {};
            if (params.dataInicio) where.dataHora.gte = new Date(`${params.dataInicio}T00:00:00`);
            if (params.dataFim) where.dataHora.lte = new Date(`${params.dataFim}T23:59:59`);
        }

        const ocorrencias = await this.prisma.telemetriaOcorrencia.findMany({
            where,
            orderBy: { dataHora: 'desc' },
            take: 2000,
        });

        return { total: ocorrencias.length, ocorrencias };
    }

    /**
     * Histórico de blocos de Telemetria V2.5 (consumo em litros) salvo no
     * banco — mesmo padrão, filtrando pelo fechamento do bloco
     * (dataHoraFim).
     */
    async buscarTelemetriaV25(empresaId: string, params: {
        placa?: string;
        veiId?: number;
        dataInicio?: string;
        dataFim?: string;
    }) {
        const where: any = { ...this.filtroEmpresa(empresaId) };

        if (params.placa) where.placa = params.placa.toUpperCase();
        if (params.veiId) where.veiId = params.veiId;

        if (params.dataInicio || params.dataFim) {
            where.dataHoraFim = {};
            if (params.dataInicio) where.dataHoraFim.gte = new Date(`${params.dataInicio}T00:00:00`);
            if (params.dataFim) where.dataHoraFim.lte = new Date(`${params.dataFim}T23:59:59`);
        }

        const blocos = await this.prisma.telemetriaBlocoV25.findMany({
            where,
            orderBy: { dataHoraFim: 'desc' },
            take: 2000,
        });

        return { total: blocos.length, blocos };
    }

    /**
     * Resumo de consumo/autonomia via Telemetria real (CAN), pra um
     * veículo, num período.
     *
     * IMPORTANTE — ConsumoLitros/ConsumoLitrosAnterior de cada bloco da
     * V2.5 são leituras CUMULATIVAS do medidor do veículo (igual um
     * hodômetro de combustível), não o valor já gasto naquele bloco. O
     * consumo real do bloco é a diferença entre as duas:
     *   litrosDoBloco = ConsumoLitros - ConsumoLitrosAnterior
     * Tratar ConsumoLitros isolado como "litros gastos nesse bloco" é o
     * bug que gerava números absurdos tipo 83 mil litros em 30 minutos —
     * era o valor acumulado desde sempre, não o do bloco.
     * O km do bloco segue o mesmo princípio: HodometroTotal - HodometroInicial.
     *
     * Some os deltas válidos de todos os blocos do período pra chegar em
     * consumo médio (km/L e L/100km). Com a capacidade do tanque
     * cadastrada em Caminhao.capacidadeTanqueLitros, converte esse
     * consumo médio em autonomia: quantos km o caminhão rodaria com o
     * tanque cheio, e quantos km ainda tem pela frente com o % atual
     * (vindo da última ocorrência de RequestTelemetriaOcorrenciasHoje).
     *
     * Abastecimentos são detectados no histórico de % do tanque
     * (TelemetriaOcorrencia): salto pra cima de pelo menos 3 pontos
     * percentuais entre duas leituras seguidas = abasteceu (nível não
     * sobe sozinho rodando).
     */
    async resumoConsumoTelemetria(empresaId: string, params: {
        veiId: number;
        dataInicio?: string;
        dataFim?: string;
    }) {
        const whereBlocos: any = { ...this.filtroEmpresa(empresaId), veiId: params.veiId };
        const whereOcorrencias: any = { ...this.filtroEmpresa(empresaId), veiId: params.veiId };

        if (params.dataInicio || params.dataFim) {
            whereBlocos.dataHoraFim = {};
            whereOcorrencias.dataHora = {};

            if (params.dataInicio) {
                whereBlocos.dataHoraFim.gte = new Date(`${params.dataInicio}T00:00:00`);
                whereOcorrencias.dataHora.gte = new Date(`${params.dataInicio}T00:00:00`);
            }

            if (params.dataFim) {
                whereBlocos.dataHoraFim.lte = new Date(`${params.dataFim}T23:59:59`);
                whereOcorrencias.dataHora.lte = new Date(`${params.dataFim}T23:59:59`);
            }
        }

        const [blocos, ocorrencias] = await Promise.all([
            this.prisma.telemetriaBlocoV25.findMany({
                where: whereBlocos,
                orderBy: { dataHoraFim: 'asc' },
                take: 2000,
            }),
            this.prisma.telemetriaOcorrencia.findMany({
                where: whereOcorrencias,
                orderBy: { dataHora: 'asc' },
                take: 2000,
            }),
        ]);

        let totalKm = 0;
        let totalLitros = 0;
        let blocosValidos = 0;

        for (const b of blocos) {
            const km =
                b.hodometroTotal !== null && b.hodometroInicial !== null
                    ? b.hodometroTotal - b.hodometroInicial
                    : null;

            const litros =
                b.consumoLitros !== null && b.consumoLitrosAnterior !== null
                    ? b.consumoLitros - b.consumoLitrosAnterior
                    : null;

            // Só conta bloco onde os dois deltas são válidos (>= 0) — km
            // ou litros negativo é reset/erro de leitura do equipamento,
            // não dá pra usar.
            if (km !== null && litros !== null && km >= 0 && litros >= 0) {
                totalKm += km;
                totalLitros += litros;
                blocosValidos++;
            }
        }

        const consumoMedioKmPorLitro = totalLitros > 0 ? totalKm / totalLitros : null;
        const consumoMedioLPor100km = totalKm > 0 ? (totalLitros / totalKm) * 100 : null;

        const placa =
            blocos[blocos.length - 1]?.placa ??
            ocorrencias[ocorrencias.length - 1]?.placa ??
            null;

        let capacidadeTanqueLitros: number | null = null;
        if (placa) {
            const caminhao = await this.prisma.caminhao.findFirst({
                where: { placa: placa.toUpperCase(), ...this.filtroEmpresa(empresaId) },
                select: { capacidadeTanqueLitros: true },
            });
            capacidadeTanqueLitros = caminhao?.capacidadeTanqueLitros ?? null;
        }

        const ultimaOcorrencia = ocorrencias[ocorrencias.length - 1] ?? null;
        const percentualTanqueAtual = ultimaOcorrencia?.percentualTanque ?? null;

        const autonomiaTanqueCheioKm =
            capacidadeTanqueLitros !== null && consumoMedioKmPorLitro !== null
                ? Math.round(capacidadeTanqueLitros * consumoMedioKmPorLitro)
                : null;

        const autonomiaAtualKm =
            autonomiaTanqueCheioKm !== null && percentualTanqueAtual !== null
                ? Math.round((percentualTanqueAtual / 100) * autonomiaTanqueCheioKm)
                : null;

        // Detecção de abastecimento pelo % do tanque: salto >= 3 pontos
        // percentuais entre duas ocorrências seguidas.
        const LIMIAR_SALTO_PERCENTUAL = 3;
        const abastecimentos: {
            dataHora: Date;
            percentualAntes: number;
            percentualDepois: number;
            deltaPercent: number;
            litrosEstimados: number | null;
        }[] = [];

        const comPercentual = ocorrencias.filter((o) => o.percentualTanque !== null) as
            (typeof ocorrencias[number] & { percentualTanque: number })[];

        for (let i = 1; i < comPercentual.length; i++) {
            const anterior = comPercentual[i - 1];
            const atual = comPercentual[i];
            const delta = atual.percentualTanque - anterior.percentualTanque;

            if (delta >= LIMIAR_SALTO_PERCENTUAL) {
                abastecimentos.push({
                    dataHora: atual.dataHora,
                    percentualAntes: anterior.percentualTanque,
                    percentualDepois: atual.percentualTanque,
                    deltaPercent: Math.round(delta * 10) / 10,
                    litrosEstimados:
                        capacidadeTanqueLitros !== null
                            ? Math.round((delta / 100) * capacidadeTanqueLitros * 10) / 10
                            : null,
                });
            }
        }

        return {
            veiId: params.veiId,
            placa,
            periodo: { dataInicio: params.dataInicio ?? null, dataFim: params.dataFim ?? null },
            dadosSuficientes: blocosValidos > 0,
            blocosValidos,
            totalBlocos: blocos.length,
            totalKm: Math.round(totalKm * 10) / 10,
            totalLitros: Math.round(totalLitros * 10) / 10,
            consumoMedioKmPorLitro:
                consumoMedioKmPorLitro !== null
                    ? Math.round(consumoMedioKmPorLitro * 100) / 100
                    : null,
            consumoMedioLPor100km:
                consumoMedioLPor100km !== null
                    ? Math.round(consumoMedioLPor100km * 100) / 100
                    : null,
            capacidadeTanqueLitros,
            percentualTanqueAtual,
            autonomiaTanqueCheioKm,
            autonomiaAtualKm,
            qtdAbastecimentos: abastecimentos.length,
            abastecimentos: abastecimentos.reverse(),
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
    async calcularConsumo(empresaId: string, params: {
        veiId: number;
        dataInicio?: string;
        dataFim?: string;
    }) {
        const where: any = { ...this.filtroEmpresa(empresaId), veiId: params.veiId };

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
        empresaId: string,
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
                                empresaId,
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
    async listarViagensGps(empresaId: string, params?: {
        status?: 'EM_ANDAMENTO' | 'CONCLUIDA';
        placa?: string;
        limit?: number;
    }) {
        const where: any = { ...this.filtroEmpresa(empresaId) };

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
                    v.terceiro ||
                    v.veiId == null ||
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
     * continua automática: o cron de posições (persistirPosicoesEmpresa ->
     * processarEventosViagem) fecha essa viagem sozinho assim que o
     * caminhão for visto no município de destino.
     */
    async criarViagemManual(empresaId: string, params: {
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

        const veiculosResult = await this.listarVeiculosComCache(empresaId, false);
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
                empresaId,
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

    /**
     * Cria uma viagem de caminhão de terceiro/agregado (botão "Nova Viagem"
     * → aba "Terceiros") — não existe cadastro desse caminhão na Trucks
     * Control, então não tem veiId nem rastreamento GPS. A pessoa digita a
     * placa na hora; a conclusão dessa viagem precisa ser manual (editar o
     * status pra "Concluída"), já que não tem GPS pra detectar chegada.
     */
    async criarViagemTerceiro(empresaId: string, params: {
        placa: string;
        origemMunicipio: string;
        destinoMunicipio: string;
    }) {
        const placa = params.placa.trim().toUpperCase();
        const origemMunicipio = params.origemMunicipio.trim();
        const destinoMunicipio = params.destinoMunicipio.trim();

        if (!placa || !origemMunicipio || !destinoMunicipio) {
            throw new InternalServerErrorException(
                'Informe a placa, origem e destino do terceiro.',
            );
        }

        const [coordOrigem, coordDestino] = await Promise.all([
            this.geocodificarCidade(origemMunicipio),
            this.geocodificarCidade(destinoMunicipio),
        ]);

        return this.prisma.viagemGps.create({
            data: {
                empresaId,
                veiId: null,
                placa,
                terceiro: true,
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

    /**
     * Edita uma viagem manual (própria ou de terceiro) já criada — botão
     * "Editar" nas telas de Viagens. Também é usado pra "concluir na mão"
     * uma viagem de terceiro (status: CONCLUIDA), já que essas não têm GPS
     * pra fechar sozinhas.
     */
    async atualizarViagemGps(empresaId: string, id: string, params: {
        placa?: string;
        origemMunicipio?: string;
        destinoMunicipio?: string;
        status?: 'EM_ANDAMENTO' | 'CONCLUIDA';
    }) {
        const viagem = await this.prisma.viagemGps.findFirst({
            where: { id, ...this.filtroEmpresa(empresaId) },
        });

        if (!viagem) {
            throw new InternalServerErrorException('Viagem não encontrada.');
        }

        const data: any = {};

        if (params.placa !== undefined) {
            const placa = params.placa.trim().toUpperCase();
            if (!placa) {
                throw new InternalServerErrorException('Informe a placa.');
            }
            data.placa = placa;
        }

        if (params.origemMunicipio !== undefined) {
            const origem = params.origemMunicipio.trim();
            if (!origem) {
                throw new InternalServerErrorException('Informe a origem.');
            }
            data.origemMunicipio = origem;
        }

        if (params.destinoMunicipio !== undefined) {
            data.destinoMunicipio = params.destinoMunicipio.trim() || null;
        }

        if (params.status !== undefined) {
            data.status = params.status;

            if (params.status === 'CONCLUIDA' && !viagem.dataHoraFim) {
                data.dataHoraFim = new Date();
            }

            if (params.status === 'EM_ANDAMENTO') {
                data.dataHoraFim = null;
            }
        }

        return this.prisma.viagemGps.update({ where: { id }, data });
    }

    // Exclui uma viagem manual (própria ou de terceiro) — botão "Excluir"
    // nas telas de Viagens. Quem criou uma viagem manualmente pode apagar
    // ela se foi engano ou duplicada.
    async excluirViagemGps(empresaId: string, id: string) {
        const viagem = await this.prisma.viagemGps.findFirst({
            where: { id, ...this.filtroEmpresa(empresaId) },
        });

        if (!viagem) {
            throw new InternalServerErrorException('Viagem não encontrada.');
        }

        await this.prisma.viagemGps.delete({ where: { id } });

        return { ok: true };
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
     * por placa (ex: "QPM - 4 viagens concluídas"). `mes` (YYYY-MM) filtra
     * o mês inteiro (início ao fim, mesmo padrão de resumoDiasParados).
     * `desde`/`ate` continuam aceitos separadamente pra quem só quer um
     * dos dois limites (ex: "desde hoje", sem fim).
     */
    async resumoViagensConcluidas(
        empresaId: string,
        params?: { mes?: string; desde?: Date; ate?: Date },
    ) {
        const where: any = { ...this.filtroEmpresa(empresaId), status: 'CONCLUIDA' };

        let gte = params?.desde;
        let lte = params?.ate;

        if (params?.mes) {
            const [ano, mesNum] = params.mes.split('-').map(Number);
            gte = gte ?? new Date(ano, mesNum - 1, 1, 0, 0, 0, 0);
            lte = lte ?? new Date(ano, mesNum, 1, 0, 0, 0, 0);
        }

        if (gte || lte) {
            where.dataHoraFim = {};
            if (gte) where.dataHoraFim.gte = gte;
            if (lte) where.dataHoraFim.lt = lte;
        }

        const wherePropria = { ...where, terceiro: false };
        const whereTerceiro = { ...where, terceiro: true };

        const [total, porPlacaRaw, porPlacaTerceirosRaw] = await Promise.all([
            this.prisma.viagemGps.count({ where }),
            this.prisma.viagemGps.groupBy({
                by: ['placa'],
                where: wherePropria,
                _count: { _all: true },
            }),
            this.prisma.viagemGps.groupBy({
                by: ['placa'],
                where: whereTerceiro,
                _count: { _all: true },
            }),
        ]);

        // Ordena aqui em vez de no orderBy do groupBy — o Prisma só deixa
        // ordenar por campos de agregado que estejam selecionados em
        // _count, e aqui só selecionamos "_all" (contagem total da linha),
        // não um campo específico como "placa".
        const ordenar = (lista: { placa: string | null; _count: { _all: number } }[]) =>
            lista
                .map((item) => ({
                    placa: item.placa || 'Sem placa',
                    quantidade: item._count._all,
                }))
                .sort((a, b) => b.quantidade - a.quantidade);

        const porPlaca = ordenar(porPlacaRaw);
        const porPlacaTerceiros = ordenar(porPlacaTerceirosRaw);

        return {
            total,
            porPlaca,
            porPlacaTerceiros,
            totalProprio: porPlaca.reduce((soma, item) => soma + item.quantidade, 0),
            totalTerceiro: porPlacaTerceiros.reduce((soma, item) => soma + item.quantidade, 0),
        };
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
    async resumoDiasParados(empresaId: string, params?: { mes?: string }) {
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

        const veiculosResult = await this.listarVeiculosComCache(empresaId, false);
        const veiculos = veiculosResult.veiculos;

        const porVeiculo: { placa: string; diasParados: number }[] = [];
        let totalGeral = 0;

        for (const veiculo of veiculos) {
            const veiId = Number(veiculo.veiID);
            if (!veiId) continue;

            const posicoes = await this.prisma.posicaoCaminhao.findMany({
                where: {
                    ...this.filtroEmpresa(empresaId),
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

    // O parser de XML converte automaticamente qualquer texto com "cara de
    // número" pra number (ex.: nome de rua que é só um número da via, tipo
    // "40") — e os campos de texto no Prisma são String?, então precisa
    // forçar de volta pra string, senão o upsert quebra com "Argument
    // `rua`: Invalid value provided. Expected String or Null, provided Int."
    private parseString(value: any): string | null {
        if (value === undefined || value === null || value === '') return null;

        return String(value);
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
