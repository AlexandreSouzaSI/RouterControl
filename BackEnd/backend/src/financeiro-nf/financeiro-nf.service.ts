import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CertificadoDigitalService } from './certificado-digital.service';
import { parseOfx } from './ofx-parser';
import {
    fetchGoodsDistribution,
    parseFullNfeXml,
    parseResNFe,
} from './sefaz-nfe-client';
import {
    decodeArquivoXml,
    fetchDistribution,
    parseNfseXml,
} from './sefaz-nfse-client';
import {
    FormaPagamentoContaPagar,
    StatusContaPagar,
    TipoChavePix,
    TipoContaPagar,
} from '@prisma/client';

// Pausa entre consultas à Sefaz/ADN — as duas exigem espaçamento entre
// chamadas pra não estourar o limite de consultas/hora por certificado
// (mesmo critério do Controle NF, ver purchases.service.ts/services.service.ts).
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Pasta própria do Controle Rota pros XMLs baixados da Sefaz/ADN — fora de
// qualquer pasta servida como estática, igual ao certificado digital.
const nfEntradaStoragePath = join(process.cwd(), 'storage', 'nf-entrada');
const nfServicoStoragePath = join(process.cwd(), 'storage', 'nf-servico');

// Limite de "lotes" (páginas) consultados numa única chamada de sync —
// evita que uma empresa com histórico grande prenda a requisição; o NSU
// salvo garante que a próxima tentativa continua de onde parou.
const MAX_SYNC_BATCHES = 25;

// Recomendado pela doc oficial do webservice: pelo menos ~2s entre
// consultas dentro do mesmo loop, pra não estourar o limite de consultas
// por hora que a Sefaz/ADN aplica por certificado.
const SYNC_DELAY_MS = 2000;

// Depois de "nada de novo" ou de um bloqueio por consumo indevido, a
// Sefaz/ADN só libera consulta de novo depois de 1h — e reinicia essa
// contagem se a gente insistir antes da hora passar.
const SEFAZ_COOLDOWN_MS = 60 * 60 * 1000;

function parseDataEmissaoServico(value?: string): Date | undefined {
    if (!value) return undefined;
    const data = new Date(value);
    return Number.isNaN(data.getTime()) ? undefined : data;
}

// Remove acento, espaços duplicados e caixa alta pra comparar nomes de
// forma tolerante (ex.: "Distribuidora Souza" === "distribuidora   souza")
// — mesmo critério usado no Controle NF pra Fornecedor/Categoria.
export function normalizarNome(nome: string): string {
    return nome
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

@Injectable()
export class FinanceiroNfService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly certificadoService: CertificadoDigitalService,
    ) { }

    // -----------------------------------------------------------------
    // Empresa (dados fiscais próprios — self-service, sempre filtrado
    // pelo empresaId do JWT, nunca por id vindo do body/params)
    // -----------------------------------------------------------------

    async obterDadosFiscaisEmpresa(empresaId: string) {
        const empresa = await this.prisma.empresa.findUnique({
            where: { id: empresaId },
            select: {
                id: true,
                nome: true,
                email: true,
                cnpj: true,
                telefone: true,
                uf: true,
                logradouro: true,
                numero: true,
                complemento: true,
                bairro: true,
                municipio: true,
                codigoMunicipioIbge: true,
                cep: true,
                inscricaoEstadual: true,
            },
        });

        if (!empresa) throw new NotFoundException('Empresa não encontrada.');
        return empresa;
    }

    async atualizarDadosFiscaisEmpresa(
        empresaId: string,
        body: Partial<{
            nome: string;
            cnpj: string;
            telefone: string;
            uf: string;
            logradouro: string;
            numero: string;
            complemento: string;
            bairro: string;
            municipio: string;
            codigoMunicipioIbge: string;
            cep: string;
            inscricaoEstadual: string;
        }>,
    ) {
        const data: Record<string, unknown> = {};

        if (body.nome !== undefined) {
            const nome = body.nome.trim();
            if (!nome) throw new BadRequestException('Informe o nome da empresa.');
            data.nome = nome;
        }

        const camposTexto: (keyof typeof body)[] = [
            'cnpj',
            'telefone',
            'logradouro',
            'numero',
            'complemento',
            'bairro',
            'municipio',
            'codigoMunicipioIbge',
            'cep',
            'inscricaoEstadual',
        ];

        for (const campo of camposTexto) {
            if (body[campo] !== undefined) {
                data[campo] = (body[campo] as string)?.trim() || null;
            }
        }

        if (body.uf !== undefined) {
            const uf = body.uf?.trim().toUpperCase() || null;
            if (uf && uf.length !== 2) {
                throw new BadRequestException('UF deve ter 2 letras.');
            }
            data.uf = uf;
        }

        return this.prisma.empresa.update({
            where: { id: empresaId },
            data,
            select: {
                id: true,
                nome: true,
                email: true,
                cnpj: true,
                telefone: true,
                uf: true,
                logradouro: true,
                numero: true,
                complemento: true,
                bairro: true,
                municipio: true,
                codigoMunicipioIbge: true,
                cep: true,
                inscricaoEstadual: true,
            },
        });
    }

    // -----------------------------------------------------------------
    // Fornecedor
    // -----------------------------------------------------------------

    async listarFornecedores(empresaId: string, busca?: string) {
        const buscaLimpa = busca?.trim();

        return this.prisma.fornecedor.findMany({
            where: {
                empresaId,
                ativo: true,
                nomeNormalizado: buscaLimpa
                    ? { contains: normalizarNome(buscaLimpa) }
                    : undefined,
            },
            orderBy: { nome: 'asc' },
            take: buscaLimpa ? 10 : undefined,
        });
    }

    async criarFornecedor(
        empresaId: string,
        body: { nome: string; cnpj?: string; telefone?: string },
    ) {
        const nome = body.nome?.trim();
        if (!nome) throw new BadRequestException('Informe o nome do fornecedor.');

        const nomeNormalizado = normalizarNome(nome);

        const existente = await this.prisma.fornecedor.findUnique({
            where: { empresaId_nomeNormalizado: { empresaId, nomeNormalizado } },
        });

        if (existente) {
            throw new BadRequestException('Já existe um fornecedor cadastrado com esse nome.');
        }

        return this.prisma.fornecedor.create({
            data: {
                empresaId,
                nome,
                nomeNormalizado,
                cnpj: body.cnpj?.trim() || null,
                telefone: body.telefone?.trim() || null,
            },
        });
    }

    // Digitou o nome na hora de aceitar uma NF ou lançar uma conta: usa o
    // fornecedor que já existe (reativando se tinha sido desativado) ou
    // cadastra um novo, sem precisar passar pela tela de Cadastros antes.
    async encontrarOuCriarFornecedor(empresaId: string, nome: string) {
        const trimmed = (nome || '').trim();
        if (!trimmed) throw new BadRequestException('Informe o nome do fornecedor.');

        const nomeNormalizado = normalizarNome(trimmed);

        const existente = await this.prisma.fornecedor.findUnique({
            where: { empresaId_nomeNormalizado: { empresaId, nomeNormalizado } },
        });

        if (existente) {
            if (!existente.ativo) {
                return this.prisma.fornecedor.update({
                    where: { id: existente.id },
                    data: { ativo: true },
                });
            }
            return existente;
        }

        return this.prisma.fornecedor.create({
            data: { empresaId, nome: trimmed, nomeNormalizado },
        });
    }

    async atualizarFornecedor(
        id: string,
        empresaId: string,
        body: Partial<{ nome: string; cnpj: string; telefone: string; ativo: boolean }>,
    ) {
        const existente = await this.prisma.fornecedor.findFirst({ where: { id, empresaId } });
        if (!existente) throw new NotFoundException('Fornecedor não encontrado.');

        const data: Record<string, unknown> = {
            cnpj: body.cnpj !== undefined ? body.cnpj?.trim() || null : undefined,
            telefone: body.telefone !== undefined ? body.telefone?.trim() || null : undefined,
            ativo: body.ativo,
        };

        if (body.nome !== undefined) {
            const nome = body.nome.trim();
            if (!nome) throw new BadRequestException('Informe o nome do fornecedor.');
            data.nome = nome;
            data.nomeNormalizado = normalizarNome(nome);
        }

        return this.prisma.fornecedor.update({ where: { id }, data });
    }

    async removerFornecedor(id: string, empresaId: string) {
        const existente = await this.prisma.fornecedor.findFirst({ where: { id, empresaId } });
        if (!existente) throw new NotFoundException('Fornecedor não encontrado.');
        // Soft delete — igual ao padrão do Controle NF (não apaga histórico
        // de NFs/contas já lançadas com esse fornecedor).
        await this.prisma.fornecedor.update({ where: { id }, data: { ativo: false } });
        return { ok: true };
    }

    // -----------------------------------------------------------------
    // Categoria de Conta a Pagar
    // -----------------------------------------------------------------

    async listarCategorias(empresaId: string, busca?: string) {
        const buscaLimpa = busca?.trim();

        return this.prisma.categoriaContaPagar.findMany({
            where: {
                empresaId,
                ativo: true,
                nomeNormalizado: buscaLimpa
                    ? { contains: normalizarNome(buscaLimpa) }
                    : undefined,
            },
            orderBy: { nome: 'asc' },
            take: buscaLimpa ? 10 : undefined,
        });
    }

    async criarCategoria(empresaId: string, body: { nome: string }) {
        const nome = body.nome?.trim();
        if (!nome) throw new BadRequestException('Informe o nome da categoria.');

        const nomeNormalizado = normalizarNome(nome);

        const existente = await this.prisma.categoriaContaPagar.findUnique({
            where: { empresaId_nomeNormalizado: { empresaId, nomeNormalizado } },
        });

        if (existente) {
            throw new BadRequestException('Já existe uma categoria cadastrada com esse nome.');
        }

        return this.prisma.categoriaContaPagar.create({
            data: { empresaId, nome, nomeNormalizado },
        });
    }

    async encontrarOuCriarCategoria(empresaId: string, nome: string) {
        const trimmed = (nome || '').trim();
        if (!trimmed) throw new BadRequestException('Informe o nome da categoria.');

        const nomeNormalizado = normalizarNome(trimmed);

        const existente = await this.prisma.categoriaContaPagar.findUnique({
            where: { empresaId_nomeNormalizado: { empresaId, nomeNormalizado } },
        });

        if (existente) {
            if (!existente.ativo) {
                return this.prisma.categoriaContaPagar.update({
                    where: { id: existente.id },
                    data: { ativo: true },
                });
            }
            return existente;
        }

        return this.prisma.categoriaContaPagar.create({
            data: { empresaId, nome: trimmed, nomeNormalizado },
        });
    }

    async atualizarCategoria(
        id: string,
        empresaId: string,
        body: Partial<{ nome: string; ativo: boolean }>,
    ) {
        const existente = await this.prisma.categoriaContaPagar.findFirst({ where: { id, empresaId } });
        if (!existente) throw new NotFoundException('Categoria não encontrada.');

        const data: Record<string, unknown> = { ativo: body.ativo };

        if (body.nome !== undefined) {
            const nome = body.nome.trim();
            if (!nome) throw new BadRequestException('Informe o nome da categoria.');
            data.nome = nome;
            data.nomeNormalizado = normalizarNome(nome);
        }

        return this.prisma.categoriaContaPagar.update({ where: { id }, data });
    }

    async removerCategoria(id: string, empresaId: string) {
        const existente = await this.prisma.categoriaContaPagar.findFirst({ where: { id, empresaId } });
        if (!existente) throw new NotFoundException('Categoria não encontrada.');
        await this.prisma.categoriaContaPagar.update({ where: { id }, data: { ativo: false } });
        return { ok: true };
    }

    // -----------------------------------------------------------------
    // Conta a Pagar
    // -----------------------------------------------------------------
    //
    // Lançamento manual (independente de NF) — a mesma tabela também vai
    // ser usada nas Fases 4-6 pro fluxo de "aceitar NF gerando conta",
    // mas isso ainda não existe (depende do cliente Sefaz/ADN, que ainda
    // não foi implementado). Por enquanto o único jeito de entrar uma
    // conta aqui é lançar manualmente.

    async listarContasPagar(
        empresaId: string,
        filtros?: { status?: StatusContaPagar; mes?: string },
    ) {
        const where: any = { empresaId };

        if (filtros?.status) where.status = filtros.status;

        if (filtros?.mes) {
            const [ano, mesNum] = filtros.mes.split('-').map(Number);
            where.vencimento = {
                gte: new Date(ano, mesNum - 1, 1),
                lt: new Date(ano, mesNum, 1),
            };
        }

        return this.prisma.contaPagar.findMany({
            where,
            include: { fornecedor: true, categoria: true, caminhao: true },
            orderBy: { vencimento: 'asc' },
        });
    }

    async resumoContasPagar(empresaId: string, mes?: string) {
        const where: any = { empresaId };

        if (mes) {
            const [ano, mesNum] = mes.split('-').map(Number);
            where.vencimento = {
                gte: new Date(ano, mesNum - 1, 1),
                lt: new Date(ano, mesNum, 1),
            };
        }

        const contas = await this.prisma.contaPagar.findMany({ where });

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        let totalAberto = 0;
        let totalPago = 0;
        let totalVencido = 0;
        let quantidadeAberta = 0;
        let quantidadeVencida = 0;

        for (const conta of contas) {
            if (conta.status === 'PAGA') {
                totalPago += conta.valor;
                continue;
            }

            if (conta.status === 'CANCELADA') continue;

            const venceu = new Date(conta.vencimento) < hoje;

            if (venceu) {
                totalVencido += conta.valor;
                quantidadeVencida++;
            } else {
                totalAberto += conta.valor;
                quantidadeAberta++;
            }
        }

        return {
            totalAberto,
            totalPago,
            totalVencido,
            quantidadeAberta,
            quantidadeVencida,
            quantidadeTotal: contas.length,
        };
    }

    async criarContaPagar(
        empresaId: string,
        body: {
            descricao: string;
            valor: number;
            vencimento: string;
            tipo?: TipoContaPagar;
            formaPagamento?: FormaPagamentoContaPagar;
            fornecedorId?: string;
            categoriaId?: string;
            caminhaoId?: string;
            codigoBarras?: string;
            pixChave?: string;
            pixTipoChave?: TipoChavePix;
            observacao?: string;
        },
    ) {
        if (!body.descricao?.trim()) {
            throw new BadRequestException('Informe a descrição da conta.');
        }

        if (!body.valor || body.valor <= 0) {
            throw new BadRequestException('Informe um valor válido.');
        }

        if (!body.vencimento) {
            throw new BadRequestException('Informe o vencimento.');
        }

        // Data de <input type="date"> — meio-dia UTC evita recuar um dia
        // por fuso horário (mesma regra do Controle NF).
        const vencimento = new Date(`${body.vencimento}T12:00:00`);

        return this.prisma.contaPagar.create({
            data: {
                empresaId,
                descricao: body.descricao.trim(),
                valor: body.valor,
                vencimento,
                tipo: body.tipo,
                formaPagamento: body.formaPagamento,
                fornecedorId: body.fornecedorId || null,
                categoriaId: body.categoriaId || null,
                caminhaoId: body.caminhaoId || null,
                codigoBarras: body.codigoBarras?.trim() || null,
                pixChave: body.pixChave?.trim() || null,
                pixTipoChave: body.pixTipoChave,
                observacao: body.observacao?.trim() || null,
            },
            include: { fornecedor: true, categoria: true, caminhao: true },
        });
    }

    async atualizarContaPagar(id: string, empresaId: string, body: Record<string, any>) {
        const existente = await this.prisma.contaPagar.findFirst({ where: { id, empresaId } });
        if (!existente) throw new NotFoundException('Conta a pagar não encontrada.');

        const data: Record<string, unknown> = {};

        if (body.descricao !== undefined) data.descricao = String(body.descricao).trim();
        if (body.valor !== undefined) data.valor = Number(body.valor);
        if (body.vencimento !== undefined) data.vencimento = new Date(`${body.vencimento}T12:00:00`);
        if (body.tipo !== undefined) data.tipo = body.tipo;
        if (body.formaPagamento !== undefined) data.formaPagamento = body.formaPagamento;
        if (body.fornecedorId !== undefined) data.fornecedorId = body.fornecedorId || null;
        if (body.categoriaId !== undefined) data.categoriaId = body.categoriaId || null;
        if (body.caminhaoId !== undefined) data.caminhaoId = body.caminhaoId || null;
        if (body.codigoBarras !== undefined) data.codigoBarras = body.codigoBarras?.trim() || null;
        if (body.pixChave !== undefined) data.pixChave = body.pixChave?.trim() || null;
        if (body.pixTipoChave !== undefined) data.pixTipoChave = body.pixTipoChave;
        if (body.observacao !== undefined) data.observacao = body.observacao?.trim() || null;
        if (body.status !== undefined) data.status = body.status;

        return this.prisma.contaPagar.update({
            where: { id },
            data,
            include: { fornecedor: true, categoria: true, caminhao: true },
        });
    }

    async marcarContaPagarPaga(
        id: string,
        empresaId: string,
        body: { pagoEm?: string; formaPagamento?: FormaPagamentoContaPagar },
    ) {
        const existente = await this.prisma.contaPagar.findFirst({ where: { id, empresaId } });
        if (!existente) throw new NotFoundException('Conta a pagar não encontrada.');

        const pagoEm = body.pagoEm ? new Date(`${body.pagoEm}T12:00:00`) : new Date();

        return this.prisma.contaPagar.update({
            where: { id },
            data: {
                status: 'PAGA',
                pagoEm,
                formaPagamento: body.formaPagamento ?? existente.formaPagamento,
            },
            include: { fornecedor: true, categoria: true, caminhao: true },
        });
    }

    async removerContaPagar(id: string, empresaId: string) {
        const existente = await this.prisma.contaPagar.findFirst({ where: { id, empresaId } });
        if (!existente) throw new NotFoundException('Conta a pagar não encontrada.');
        await this.prisma.contaPagar.delete({ where: { id } });
        return { ok: true };
    }

    // Lê o extrato OFX só pra devolver as movimentações — não salva o
    // arquivo nem grava nada no banco. A conciliação de fato acontece
    // quando o usuário confirma cada conta pelo endpoint de pagar (mesmo
    // padrão do Controle NF em bills.service.ts).
    parseOfxStatement(content: string) {
        const transactions = parseOfx(content);

        if (transactions.length === 0) {
            throw new BadRequestException(
                'Não encontramos movimentações nesse arquivo. Confira se é um extrato OFX válido.',
            );
        }

        return { transactions };
    }

    // -----------------------------------------------------------------
    // NF de Entrada / NF de Serviço — listagem e download por período
    // -----------------------------------------------------------------
    //
    // As Fases 4/5 (cliente Sefaz NF-e e ADN NFS-e) ainda não populam
    // essas tabelas automaticamente, então por enquanto a lista/ZIP fica
    // vazia — mas a infraestrutura já fica pronta: quando o sync entrar,
    // filtro por período e download em massa (aceitas ou não) já
    // funcionam sem precisar mexer aqui de novo.

    private buildDateFilterNf(filtros?: { de?: string; ate?: string }) {
        if (!filtros?.de && !filtros?.ate) return undefined;

        // Meio-dia/fim-do-dia no início/fim do intervalo — mesma regra de
        // fuso usada no resto do sistema pra <input type="date">.
        return {
            gte: filtros.de ? new Date(`${filtros.de}T00:00:00`) : undefined,
            lte: filtros.ate ? new Date(`${filtros.ate}T23:59:59`) : undefined,
        };
    }

    async listarNfEntrada(empresaId: string, filtros?: { de?: string; ate?: string }) {
        const items = await this.prisma.nfEntrada.findMany({
            where: {
                empresaId,
                ignorado: false,
                dataEmissao: this.buildDateFilterNf(filtros),
            },
            include: { caminhao: true },
            orderBy: { dataEmissao: { sort: 'desc', nulls: 'last' } },
        });

        return items.map((item) => ({ ...item, nsu: item.nsu.toString() }));
    }

    async listarNfServico(empresaId: string, filtros?: { de?: string; ate?: string }) {
        const items = await this.prisma.nfServico.findMany({
            where: {
                empresaId,
                ignorado: false,
                dataEmissao: this.buildDateFilterNf(filtros),
            },
            include: { caminhao: true },
            orderBy: { dataEmissao: { sort: 'desc', nulls: 'last' } },
        });

        return items.map((item) => ({ ...item, nsu: item.nsu.toString() }));
    }

    // Traz TODAS as NFs com arquivo no período — aceitas, pendentes ou só
    // vinculadas a caminhão, não só as já resolvidas. O usuário quer
    // acesso ao XML de qualquer NF baixada, tenha sido aceita ou não.
    async buscarNfEntradaParaZip(empresaId: string, filtros?: { de?: string; ate?: string }) {
        const items = await this.prisma.nfEntrada.findMany({
            where: {
                empresaId,
                arquivoUrl: { not: null },
                dataEmissao: this.buildDateFilterNf(filtros),
            },
            orderBy: { dataEmissao: { sort: 'desc', nulls: 'last' } },
        });

        if (items.length === 0) {
            throw new BadRequestException('Nenhuma NF de entrada encontrada nesse período.');
        }

        return items;
    }

    async buscarNfServicoParaZip(empresaId: string, filtros?: { de?: string; ate?: string }) {
        const items = await this.prisma.nfServico.findMany({
            where: {
                empresaId,
                arquivoUrl: { not: null },
                dataEmissao: this.buildDateFilterNf(filtros),
            },
            orderBy: { dataEmissao: { sort: 'desc', nulls: 'last' } },
        });

        if (items.length === 0) {
            throw new BadRequestException('Nenhuma NF de serviço encontrada nesse período.');
        }

        return items;
    }

    // -----------------------------------------------------------------
    // Dashboard Financeiro
    // -----------------------------------------------------------------
    //
    // KPIs + gráficos do mês selecionado (padrão: mês atual). "Entradas"
    // e "Serviços Pagos" dependem de NfEntrada/NfServico (Fases 4/5,
    // ainda pendentes) e Conta a Pagar (já funcional). Não existe ainda
    // um cadastro de Receita no sistema — o card fica marcado como
    // indisponível até essa fonte ser definida.

    private mesParaIntervalo(mes: string) {
        const [ano, mesNum] = mes.split('-').map(Number);
        return {
            inicio: new Date(ano, mesNum - 1, 1),
            fim: new Date(ano, mesNum, 1),
        };
    }

    private nomeMesCurto(mes: string) {
        const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const [ano, mesNum] = mes.split('-').map(Number);
        return `${nomes[mesNum - 1]}/${String(ano).slice(2)}`;
    }

    // Status "efetivo" calculado na hora — o campo status no banco não é
    // atualizado sozinho pra VENCIDA quando o dia passa, então recalcula
    // aqui pra não mostrar um número desatualizado no gráfico.
    private statusEfetivo(conta: { status: string; vencimento: Date }, hoje: Date): 'ABERTA' | 'PAGA' | 'VENCIDA' | 'CANCELADA' {
        if (conta.status === 'PAGA' || conta.status === 'CANCELADA') return conta.status;
        return new Date(conta.vencimento) < hoje ? 'VENCIDA' : 'ABERTA';
    }

    async dashboardFinanceiro(empresaId: string, mesFiltro?: string) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const fimSemana = new Date(hoje);
        fimSemana.setDate(fimSemana.getDate() + 7);

        const mesRef = mesFiltro || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        const { inicio: inicioMes, fim: fimMes } = this.mesParaIntervalo(mesRef);

        // ---- Entradas (NF de Entrada) do mês de referência ----
        const entradasNoMes = await this.prisma.nfEntrada.findMany({
            where: { empresaId, ignorado: false, dataEmissao: { gte: inicioMes, lt: fimMes } },
        });

        const entradas = {
            total: entradasNoMes.reduce((soma, item) => soma + (item.valor || 0), 0),
            quantidade: entradasNoMes.length,
            aceitas: entradasNoMes.filter((i) => i.aceita).length,
            pendentes: entradasNoMes.filter((i) => !i.aceita).length,
        };

        // ---- Serviços Pagos: Conta a Pagar PAGA no mês, vinda de NF de
        // Serviço (aceite automático) ou categorizada manualmente como
        // "Serviço" ----
        const servicosPagosRaw = await this.prisma.contaPagar.findMany({
            where: {
                empresaId,
                status: 'PAGA',
                pagoEm: { gte: inicioMes, lt: fimMes },
                OR: [
                    { nfServicos: { some: {} } },
                    { categoria: { nomeNormalizado: { contains: 'servico' } } },
                ],
            },
        });

        const servicosPagos = {
            total: servicosPagosRaw.reduce((soma, item) => soma + item.valor, 0),
            quantidade: servicosPagosRaw.length,
        };

        // ---- Contas a Pagar em aberto — buckets Hoje / Semana / Mês / Atrasadas ----
        const abertas = await this.prisma.contaPagar.findMany({
            where: { empresaId, status: { notIn: ['PAGA', 'CANCELADA'] } },
            include: { categoria: true },
        });

        const somar = (lista: typeof abertas) => ({
            total: lista.reduce((soma, c) => soma + c.valor, 0),
            quantidade: lista.length,
        });

        const vencimentoNoDia = (data: Date, referencia: Date) => {
            const v = new Date(data);
            v.setHours(0, 0, 0, 0);
            return v.getTime() === referencia.getTime();
        };

        const contasPagar = {
            hoje: somar(abertas.filter((c) => vencimentoNoDia(c.vencimento, hoje))),
            semana: somar(
                abertas.filter((c) => {
                    const v = new Date(c.vencimento);
                    v.setHours(0, 0, 0, 0);
                    return v >= hoje && v <= fimSemana;
                }),
            ),
            mes: somar(abertas.filter((c) => c.vencimento >= inicioMes && c.vencimento < fimMes)),
            atrasadas: somar(
                abertas.filter((c) => {
                    const v = new Date(c.vencimento);
                    v.setHours(0, 0, 0, 0);
                    return v < hoje;
                }),
            ),
            totalAberto: somar(abertas),
        };

        // ---- Gráfico mensal — últimos 6 meses (Entradas x Contas Pagas x Contas em aberto) ----
        const inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
        const fimJanela = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

        const [entradasJanela, contasJanela] = await Promise.all([
            this.prisma.nfEntrada.findMany({
                where: { empresaId, ignorado: false, dataEmissao: { gte: inicioJanela, lt: fimJanela } },
            }),
            this.prisma.contaPagar.findMany({
                where: { empresaId, vencimento: { gte: inicioJanela, lt: fimJanela } },
            }),
        ]);

        const graficoMensal = Array.from({ length: 6 }, (_, i) => {
            const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
            const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const { inicio, fim } = this.mesParaIntervalo(chave);

            const entradasMes = entradasJanela.filter(
                (e) => e.dataEmissao && e.dataEmissao >= inicio && e.dataEmissao < fim,
            );
            const contasMes = contasJanela.filter((c) => c.vencimento >= inicio && c.vencimento < fim);

            return {
                mes: chave,
                label: this.nomeMesCurto(chave),
                entradas: entradasMes.reduce((soma, e) => soma + (e.valor || 0), 0),
                contasPagas: contasMes
                    .filter((c) => c.status === 'PAGA')
                    .reduce((soma, c) => soma + c.valor, 0),
                contasAbertas: contasMes
                    .filter((c) => c.status !== 'PAGA' && c.status !== 'CANCELADA')
                    .reduce((soma, c) => soma + c.valor, 0),
            };
        });

        // ---- Gráfico por categoria — top 8 categorias de gasto em aberto ----
        const porCategoriaMap = new Map<string, number>();
        for (const conta of abertas) {
            const nome = conta.categoria?.nome || 'Sem categoria';
            porCategoriaMap.set(nome, (porCategoriaMap.get(nome) || 0) + conta.valor);
        }

        const graficoPorCategoria = Array.from(porCategoriaMap.entries())
            .map(([categoria, valor]) => ({ categoria, valor }))
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 8);

        // ---- Gráfico de status — todas as contas com vencimento no mês de referência ----
        const contasDoMes = await this.prisma.contaPagar.findMany({
            where: { empresaId, vencimento: { gte: inicioMes, lt: fimMes } },
        });

        const statusContadores: Record<'ABERTA' | 'PAGA' | 'VENCIDA' | 'CANCELADA', { valor: number; quantidade: number }> = {
            ABERTA: { valor: 0, quantidade: 0 },
            PAGA: { valor: 0, quantidade: 0 },
            VENCIDA: { valor: 0, quantidade: 0 },
            CANCELADA: { valor: 0, quantidade: 0 },
        };

        for (const conta of contasDoMes) {
            const chave = this.statusEfetivo(conta, hoje);
            statusContadores[chave].valor += conta.valor;
            statusContadores[chave].quantidade += 1;
        }

        const graficoStatus = (
            [
                { status: 'Aberta', chave: 'ABERTA' },
                { status: 'Paga', chave: 'PAGA' },
                { status: 'Vencida', chave: 'VENCIDA' },
                { status: 'Cancelada', chave: 'CANCELADA' },
            ] as const
        )
            .map(({ status, chave }) => ({ status, ...statusContadores[chave] }))
            .filter((item) => item.quantidade > 0);

        return {
            mesReferencia: mesRef,
            entradas,
            servicosPagos,
            receitas: { disponivel: false },
            contasPagar,
            graficoMensal,
            graficoPorCategoria,
            graficoStatus,
        };
    }

    // -----------------------------------------------------------------
    // Sincronização com a Sefaz (NF-e de compra) / ADN (NFS-e de serviço)
    // -----------------------------------------------------------------
    //
    // Fase 4/5 portada do Controle NF: busca automaticamente, a partir do
    // certificado digital já cadastrado da empresa, os documentos fiscais
    // novos desde o último NSU salvo. Não cria conta a pagar nem vincula
    // nada sozinho — só deixa os documentos em NfEntrada/NfServico
    // disponíveis pra conciliação manual (botão "Aceitar" na tela).
    //
    // Limitação assumida nesta portagem: a manifestação do destinatário
    // (Ciência da Operação) do Controle NF não foi portada — ela exige
    // assinatura de XML (node-forge + xml-crypto), pacotes que não estão
    // instalados neste projeto e este ambiente não tem acesso à rede pra
    // instalar. Sem a manifestação automática, a Sefaz pode continuar
    // devolvendo só o resumo (resNFe) de algumas notas em vez do XML
    // completo (procNFe) — o resumo já basta pra listar/conciliar a nota,
    // só não traz os itens detalhados.

    // Busca (clique manual) as NF-e de mercadoria novas emitidas pro CNPJ
    // da empresa desde o último NSU salvo.
    async buscarNfEntradaManual(empresaId: string) {
        try {
            const resultado = await this.runSyncNfEntrada(empresaId);

            await this.registrarLogSefaz(
                empresaId,
                'NFE_ENTRADA',
                true,
                resultado.totalNovas > 0
                    ? `${resultado.totalNovas} NF-e nova(s) encontrada(s).`
                    : 'Busca concluída, nenhuma NF-e nova.',
                resultado.totalNovas,
            );

            return resultado;
        } catch (error: any) {
            await this.registrarLogSefaz(
                empresaId,
                'NFE_ENTRADA',
                false,
                String(error?.message || error),
                0,
            );
            throw error;
        }
    }

    // Busca (clique manual) as NFS-e de serviço novas emitidas pro CNPJ da
    // empresa desde o último NSU salvo.
    async buscarNfServicoManual(empresaId: string) {
        try {
            const resultado = await this.runSyncNfServico(empresaId);

            await this.registrarLogSefaz(
                empresaId,
                'NFSE_SERVICO',
                true,
                resultado.totalNovas > 0
                    ? `${resultado.totalNovas} documento(s) novo(s) encontrado(s).`
                    : 'Busca concluída, nenhum documento novo.',
                resultado.totalNovas,
            );

            return resultado;
        } catch (error: any) {
            await this.registrarLogSefaz(
                empresaId,
                'NFSE_SERVICO',
                false,
                String(error?.message || error),
                0,
            );
            throw error;
        }
    }

    // Últimas tentativas de sincronização (manuais e automáticas) dessa
    // empresa — histórico pra dar visibilidade a erros que aconteceram sem
    // ninguém olhando (ex: a busca automática de madrugada).
    async listarLogsSefaz(empresaId: string) {
        return this.prisma.sefazSincronizacaoLog.findMany({
            where: { empresaId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
    }

    private async registrarLogSefaz(
        empresaId: string,
        origem: 'NFE_ENTRADA' | 'NFSE_SERVICO',
        sucesso: boolean,
        mensagem: string,
        totalBuscado: number,
    ) {
        try {
            await this.prisma.sefazSincronizacaoLog.create({
                data: { empresaId, origem, sucesso, mensagem, totalBuscado },
            });
        } catch {
            // O log é só auxiliar — nunca deve derrubar a sincronização.
        }
    }

    // Núcleo da busca de NF-e de mercadoria, sem checagem de módulo/perfil
    // (quem chama — buscarNfEntradaManual ou o cron abaixo — já garantiu o
    // acesso). Persiste o NSU incrementalmente a cada lote (não só no
    // final) pra não perder progresso se a Sefaz bloquear no meio de uma
    // rodada grande.
    private async runSyncNfEntrada(empresaId: string) {
        const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId } });

        if (!empresa) {
            throw new NotFoundException('Empresa não encontrada.');
        }

        if (!empresa.cnpj) {
            throw new BadRequestException(
                'Cadastre o CNPJ da empresa antes de buscar notas.',
            );
        }

        const certificadoRegistro = await this.prisma.certificadoDigitalEmpresa.findUnique({
            where: { empresaId },
        });

        if (!certificadoRegistro) {
            throw new BadRequestException(
                'Essa empresa não tem certificado digital cadastrado. Cadastre em Financeiro → Certificado Digital antes de buscar notas.',
            );
        }

        // A Sefaz pune insistência: se a última rodada terminou em "nada de
        // novo" (137) ou em bloqueio por consumo indevido (656), só vale a
        // pena tentar de novo depois de 1h.
        if (certificadoRegistro.nfeBloqueadoAte && certificadoRegistro.nfeBloqueadoAte > new Date()) {
            throw new BadRequestException(
                `A Sefaz pediu espera depois da última consulta. Tente de novo às ${certificadoRegistro.nfeBloqueadoAte.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
            );
        }

        const cert = await this.certificadoService.carregar(empresaId);

        if (!cert) {
            throw new BadRequestException(
                'Cadastre o certificado digital da empresa antes de buscar notas.',
            );
        }

        let cursor = certificadoRegistro.ultimoNsuNfe;
        let totalNovas = 0;

        for (let lote = 0; lote < MAX_SYNC_BATCHES; lote++) {
            const resultado = await fetchGoodsDistribution(cert, {
                cnpj: empresa.cnpj,
                ultNsu: cursor,
                tpAmb: 1,
            });

            if (resultado.cStat !== '137' && resultado.cStat !== '138') {
                // Qualquer status fora desses dois é rejeição/bloqueio (ex:
                // 656 = consumo indevido) — guarda o cooldown antes de
                // avisar, pra não deixar a próxima tentativa reiniciar o
                // bloqueio.
                await this.prisma.certificadoDigitalEmpresa.update({
                    where: { empresaId },
                    data: {
                        ultimoNsuNfe: cursor,
                        nfeBloqueadoAte: new Date(Date.now() + SEFAZ_COOLDOWN_MS),
                    },
                });

                throw new BadRequestException(
                    resultado.cStat === '656'
                        ? 'A Sefaz bloqueou temporariamente por excesso de consultas (consumo indevido). Só dá pra tentar de novo daqui a 1h.'
                        : `A Sefaz recusou a consulta: ${resultado.xMotivo || resultado.cStat}`,
                );
            }

            for (const doc of resultado.docs) {
                if (!doc.schema.startsWith('resNFe') && !doc.schema.startsWith('procNFe')) {
                    // Eventos (cancelamento, ciência de terceiros etc.) não
                    // interessam ainda — só as NF-e propriamente ditas.
                    continue;
                }

                const parsedNf = doc.schema.startsWith('procNFe')
                    ? parseFullNfeXml(doc.xml)
                    : parseResNFe(doc.xml);

                if (!parsedNf?.chaveAcesso) {
                    continue;
                }

                const pastaEmpresa = join(nfEntradaStoragePath, empresaId);

                if (!existsSync(pastaEmpresa)) {
                    mkdirSync(pastaEmpresa, { recursive: true });
                }

                const nomeArquivo = `sefaz-${parsedNf.chaveAcesso}.xml`;
                writeFileSync(join(pastaEmpresa, nomeArquivo), doc.xml, 'utf-8');

                const arquivoUrl = `/storage/nf-entrada/${empresaId}/${nomeArquivo}`;
                const dataEmissao = parsedNf.issueDate ? new Date(parsedNf.issueDate) : undefined;

                await this.prisma.nfEntrada.upsert({
                    where: {
                        empresaId_chaveAcesso: { empresaId, chaveAcesso: parsedNf.chaveAcesso },
                    },
                    update: {
                        nsu: BigInt(doc.nsu || '0'),
                        tipoDocumento: doc.schema,
                        emitenteCnpj: parsedNf.issuerCnpj,
                        emitenteNome: parsedNf.issuerName,
                        valor: parsedNf.value,
                        dataEmissao,
                        situacao: parsedNf.situacao,
                        arquivoUrl,
                    },
                    create: {
                        empresaId,
                        chaveAcesso: parsedNf.chaveAcesso,
                        nsu: BigInt(doc.nsu || '0'),
                        tipoDocumento: doc.schema,
                        emitenteCnpj: parsedNf.issuerCnpj,
                        emitenteNome: parsedNf.issuerName,
                        valor: parsedNf.value,
                        dataEmissao,
                        situacao: parsedNf.situacao,
                        arquivoUrl,
                    },
                });

                totalNovas += 1;
            }

            const maxNsu = BigInt(resultado.maxNSU || '0');
            const respUltNsu = BigInt(resultado.ultNSU || '0');

            cursor = respUltNsu;

            // Salva o progresso a cada lote (não só no final) — se a Sefaz
            // bloquear no meio de uma rodada grande, o que já avançou não
            // se perde.
            await this.prisma.certificadoDigitalEmpresa.update({
                where: { empresaId },
                data: { ultimoNsuNfe: cursor },
            });

            if (resultado.cStat === '137' || respUltNsu >= maxNsu) {
                // Chegou ao fim do que existe pra consultar agora — só
                // libera consulta de novo depois de 1h.
                await this.prisma.certificadoDigitalEmpresa.update({
                    where: { empresaId },
                    data: { nfeBloqueadoAte: new Date(Date.now() + SEFAZ_COOLDOWN_MS) },
                });
                break;
            }

            // Ainda tem mais lote pela frente — espera antes da próxima
            // consulta pra não martelar o webservice da Sefaz.
            await sleep(SYNC_DELAY_MS);
        }

        return { totalNovas };
    }

    // Núcleo da busca de NFS-e de serviço (ADN), mesmo espírito do
    // runSyncNfEntrada acima — cursor próprio (ultimoNsu, não ultimoNsuNfe)
    // e bloqueio próprio (nfseBloqueadoAte).
    private async runSyncNfServico(empresaId: string) {
        const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId } });

        if (!empresa) {
            throw new NotFoundException('Empresa não encontrada.');
        }

        if (!empresa.cnpj) {
            throw new BadRequestException(
                'Cadastre o CNPJ da empresa antes de buscar notas.',
            );
        }

        const certificadoRegistro = await this.prisma.certificadoDigitalEmpresa.findUnique({
            where: { empresaId },
        });

        if (!certificadoRegistro) {
            throw new BadRequestException(
                'Essa empresa não tem certificado digital cadastrado. Cadastre em Financeiro → Certificado Digital antes de buscar notas.',
            );
        }

        if (certificadoRegistro.nfseBloqueadoAte && certificadoRegistro.nfseBloqueadoAte > new Date()) {
            throw new BadRequestException(
                `A Sefaz/ADN pediu espera depois da última consulta. Tente de novo às ${certificadoRegistro.nfseBloqueadoAte.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
            );
        }

        const cert = await this.certificadoService.carregar(empresaId);

        if (!cert) {
            throw new BadRequestException(
                'Cadastre o certificado digital da empresa antes de buscar notas.',
            );
        }

        let cursor = certificadoRegistro.ultimoNsu;
        let totalNovas = 0;

        for (let lote = 0; lote < MAX_SYNC_BATCHES; lote++) {
            let resposta: Awaited<ReturnType<typeof fetchDistribution>>;

            try {
                resposta = await fetchDistribution(cert, cursor);
            } catch (error: any) {
                // Rejeição do ADN (inclui possível bloqueio por excesso de
                // consultas) — guarda o cursor já avançado e o cooldown
                // antes de propagar o erro.
                await this.prisma.certificadoDigitalEmpresa.update({
                    where: { empresaId },
                    data: {
                        ultimoNsu: cursor,
                        nfseBloqueadoAte: new Date(Date.now() + SEFAZ_COOLDOWN_MS),
                    },
                });

                throw new BadRequestException(String(error?.message || error));
            }

            if (resposta.StatusProcessamento === 'NENHUM_DOCUMENTO_LOCALIZADO') {
                await this.prisma.certificadoDigitalEmpresa.update({
                    where: { empresaId },
                    data: {
                        ultimoNsu: cursor,
                        nfseBloqueadoAte: new Date(Date.now() + SEFAZ_COOLDOWN_MS),
                    },
                });
                break;
            }

            const loteDfe = resposta.LoteDFe || [];

            if (loteDfe.length === 0) {
                await this.prisma.certificadoDigitalEmpresa.update({
                    where: { empresaId },
                    data: {
                        ultimoNsu: cursor,
                        nfseBloqueadoAte: new Date(Date.now() + SEFAZ_COOLDOWN_MS),
                    },
                });
                break;
            }

            let maxNsuNoLote = cursor;

            for (const item of loteDfe) {
                const itemNsu = BigInt(item.NSU);

                if (itemNsu > maxNsuNoLote) {
                    maxNsuNoLote = itemNsu;
                }

                if (!item.ChaveAcesso) {
                    continue;
                }

                let arquivoUrl: string | undefined;
                let parsedNfse: ReturnType<typeof parseNfseXml> = null;

                if (item.ArquivoXml) {
                    const xml = decodeArquivoXml(item.ArquivoXml);
                    const pastaEmpresa = join(nfServicoStoragePath, empresaId);

                    if (!existsSync(pastaEmpresa)) {
                        mkdirSync(pastaEmpresa, { recursive: true });
                    }

                    const nomeArquivo = `sefaz-${item.ChaveAcesso}.xml`;
                    writeFileSync(join(pastaEmpresa, nomeArquivo), xml, 'utf-8');

                    arquivoUrl = `/storage/nf-servico/${empresaId}/${nomeArquivo}`;

                    // Só documentos de verdade (NFSE) trazem prestador/valor
                    // — eventos (cancelamento etc.) não.
                    if (item.TipoDocumento === 'NFSE') {
                        parsedNfse = parseNfseXml(xml);
                    }
                }

                const dataEmissao = parseDataEmissaoServico(parsedNfse?.issueDate);

                await this.prisma.nfServico.upsert({
                    where: {
                        empresaId_chaveAcesso: { empresaId, chaveAcesso: item.ChaveAcesso },
                    },
                    update: {
                        nsu: itemNsu,
                        tipoDocumento: item.TipoDocumento,
                        tipoEvento: item.TipoEvento || undefined,
                        arquivoUrl,
                        geradoEm: item.DataHoraGeracao ? new Date(item.DataHoraGeracao) : undefined,
                        numeroNf: parsedNfse?.numeroNf,
                        prestadorNome: parsedNfse?.issuerName,
                        prestadorDoc: parsedNfse?.issuerDoc,
                        valor: parsedNfse?.value,
                        dataEmissao,
                    },
                    create: {
                        empresaId,
                        chaveAcesso: item.ChaveAcesso,
                        nsu: itemNsu,
                        tipoDocumento: item.TipoDocumento,
                        tipoEvento: item.TipoEvento || undefined,
                        arquivoUrl,
                        geradoEm: item.DataHoraGeracao ? new Date(item.DataHoraGeracao) : undefined,
                        numeroNf: parsedNfse?.numeroNf,
                        prestadorNome: parsedNfse?.issuerName,
                        prestadorDoc: parsedNfse?.issuerDoc,
                        valor: parsedNfse?.value,
                        dataEmissao,
                    },
                });

                totalNovas += 1;
            }

            cursor = maxNsuNoLote + 1n;

            // Salva o progresso a cada lote — se a próxima consulta for
            // rejeitada, o que já avançou aqui não se perde.
            await this.prisma.certificadoDigitalEmpresa.update({
                where: { empresaId },
                data: { ultimoNsu: cursor },
            });

            // Ainda tem lote pela frente — espera antes de consultar de
            // novo, pra não martelar o webservice nacional.
            await sleep(SYNC_DELAY_MS);
        }

        return { totalNovas };
    }

    // Roda sozinho a cada 10 minutos e tenta buscar NF-e/NFS-e pra toda
    // empresa com o módulo Financeiro/NF habilitado e certificado
    // cadastrado, desde que não esteja em cooldown no momento (ver
    // nfeBloqueadoAte/nfseBloqueadoAte). Todo resultado (sucesso ou erro)
    // fica registrado em SefazSincronizacaoLog.
    @Cron(CronExpression.EVERY_10_MINUTES)
    async autoSincronizarNfs() {
        const agora = new Date();

        const empresas = await this.prisma.empresa.findMany({
            where: {
                ativo: true,
                modulosHabilitados: { has: 'FINANCEIRO_NF' },
                certificadoDigital: { isNot: null },
            },
            include: { certificadoDigital: true },
        });

        for (const empresa of empresas) {
            const certificado = empresa.certificadoDigital;

            if (!certificado) continue;

            if (!certificado.nfeBloqueadoAte || certificado.nfeBloqueadoAte <= agora) {
                try {
                    const resultado = await this.runSyncNfEntrada(empresa.id);

                    await this.registrarLogSefaz(
                        empresa.id,
                        'NFE_ENTRADA',
                        true,
                        resultado.totalNovas > 0
                            ? `${resultado.totalNovas} NF-e nova(s) encontrada(s).`
                            : 'Busca automática rodou, nenhuma NF-e nova.',
                        resultado.totalNovas,
                    );
                } catch (error: any) {
                    await this.registrarLogSefaz(
                        empresa.id,
                        'NFE_ENTRADA',
                        false,
                        String(error?.message || error),
                        0,
                    );
                }
            }

            if (!certificado.nfseBloqueadoAte || certificado.nfseBloqueadoAte <= agora) {
                try {
                    const resultado = await this.runSyncNfServico(empresa.id);

                    await this.registrarLogSefaz(
                        empresa.id,
                        'NFSE_SERVICO',
                        true,
                        resultado.totalNovas > 0
                            ? `${resultado.totalNovas} documento(s) novo(s) encontrado(s).`
                            : 'Busca automática rodou, nenhum documento novo.',
                        resultado.totalNovas,
                    );
                } catch (error: any) {
                    await this.registrarLogSefaz(
                        empresa.id,
                        'NFSE_SERVICO',
                        false,
                        String(error?.message || error),
                        0,
                    );
                }
            }
        }
    }
}
