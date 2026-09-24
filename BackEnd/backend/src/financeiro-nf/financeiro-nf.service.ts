import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    FormaPagamentoContaPagar,
    StatusContaPagar,
    TipoChavePix,
    TipoContaPagar,
} from '@prisma/client';

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
    constructor(private readonly prisma: PrismaService) { }

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
}
