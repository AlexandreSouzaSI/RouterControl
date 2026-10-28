import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { faixaDoMes } from '../common/mes.util';
import { CteLido, lerXmlCte, normalizarPlaca } from './cte-xml.util';

export type ArquivoXml = { nome: string; conteudo: string };
type ItemImportacao = { arquivo: string; cte?: string; motivo?: string; valor?: number; cliente?: string; placa?: string | null };
import { dividirIgualmente } from './rateio.util';

type Filtros = {
    situacao?: string; // abertas (padrão) | recebidas | todas
    periodo?: string; // hoje | semana | mes | vencidas
    busca?: string;
    de?: string;
    ate?: string;
    valorMin?: string;
    valorMax?: string;
    caminhaoId?: string; // id, ou GERAL = sem carreta
    mes?: string; // AAAA-MM: recebidas pela data de recebimento, abertas pelo vencimento
    page?: string;
    pageSize?: string;
};

@Injectable()
export class ContasReceberService {
    constructor(private readonly prisma: PrismaService) { }

    private janelas() {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);
        const diaSemana = (hoje.getDay() + 6) % 7;
        const fimSemana = new Date(hoje);
        fimSemana.setDate(hoje.getDate() - diaSemana + 7);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
        return { hoje, amanha, fimSemana, fimMes };
    }

    // Filtro de mês (AAAA-MM). Conta recebida entra no mês em que foi
    // recebida (sem data de recebimento, cai no vencimento); conta em aberto
    // entra no mês do vencimento.
    private filtroMes(mes?: string): Prisma.ContaReceberWhereInput | null {
        const faixa = faixaDoMes(mes);
        if (!faixa) return null;
        // Competência = mês de EMISSÃO (do CT-e). Conta lançada sem data de
        // emissão cai pelo vencimento.
        return {
            OR: [
                { dataEmissao: faixa },
                { dataEmissao: null, vencimento: faixa },
            ],
        };
    }

    private async validarCaminhao(empresaId: string, caminhaoId?: string | null) {
        if (!caminhaoId || caminhaoId === 'GERAL') return null;
        const c = await this.prisma.caminhao.findFirst({ where: { id: caminhaoId, empresaId }, select: { id: true } });
        if (!c) throw new NotFoundException('Caminhão não encontrado.');
        return c.id;
    }

    async listar(empresaId: string, f: Filtros = {}) {
        const where: any = { empresaId };
        const and: any[] = [];

        if (f.situacao === 'recebidas') where.status = 'RECEBIDA';
        else if (f.situacao !== 'todas') where.status = 'ABERTA';

        if (f.caminhaoId === 'GERAL') {
            where.caminhaoId = null;
            where.rateios = { none: {} };
        } else if (f.caminhaoId) {
            and.push({ OR: [{ caminhaoId: f.caminhaoId }, { rateios: { some: { caminhaoId: f.caminhaoId } } }] });
        }

        if (f.de || f.ate) {
            const faixa: any = {};
            if (f.de) faixa.gte = new Date(`${f.de}T00:00:00`);
            if (f.ate) {
                const fim = new Date(`${f.ate}T00:00:00`);
                fim.setDate(fim.getDate() + 1);
                faixa.lt = fim;
            }
            where.vencimento = faixa;
        }

        if (f.periodo) {
            const j = this.janelas();
            where.status = 'ABERTA';
            if (f.periodo === 'vencidas') where.vencimento = { lt: j.hoje };
            else if (f.periodo === 'hoje') where.vencimento = { gte: j.hoje, lt: j.amanha };
            else if (f.periodo === 'semana') where.vencimento = { gte: j.amanha, lt: j.fimSemana };
            else if (f.periodo === 'mes') where.vencimento = { gte: j.amanha, lt: j.fimMes };
        }

        const porMes = this.filtroMes(f.mes);
        if (porMes) and.push(porMes);

        if (f.busca?.trim()) {
            const t = f.busca.trim();
            and.push({
                OR: [
                    { descricao: { contains: t, mode: 'insensitive' } },
                    { cliente: { contains: t, mode: 'insensitive' } },
                    { observacao: { contains: t, mode: 'insensitive' } },
                    { cte: { contains: t, mode: 'insensitive' } },
                    { motorista: { contains: t, mode: 'insensitive' } },
                    { referencia: { contains: t, mode: 'insensitive' } },
                    { comercial: { contains: t, mode: 'insensitive' } },
                    { caminhao: { placa: { contains: t, mode: 'insensitive' } } },
                ],
            });
        }

        const min = f.valorMin ? Number(f.valorMin.replace(',', '.')) : NaN;
        const max = f.valorMax ? Number(f.valorMax.replace(',', '.')) : NaN;
        if (!Number.isNaN(min) || !Number.isNaN(max)) {
            where.valor = {};
            if (!Number.isNaN(min)) where.valor.gte = min;
            if (!Number.isNaN(max)) where.valor.lte = max;
        }
        if (and.length) where.AND = and;

        const pageSize = Number(f.pageSize) === 50 ? 50 : 20;
        const page = Math.max(1, Number(f.page) || 1);

        const [items, total, soma] = await Promise.all([
            this.prisma.contaReceber.findMany({
                where,
                include: { caminhao: { select: { id: true, placa: true } }, rateios: { include: { caminhao: { select: { placa: true } } } } },
                orderBy: [{ vencimento: 'asc' }, { valor: 'desc' }],
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.contaReceber.count({ where }),
            this.prisma.contaReceber.aggregate({ where, _sum: { valor: true } }),
        ]);

        return { items, total, page, pageSize, somaFiltro: soma._sum.valor ?? 0 };
    }

    async pendentes(empresaId: string) {
        return this.prisma.contaReceber.findMany({
            where: { empresaId, status: 'ABERTA' },
            include: { caminhao: { select: { id: true, placa: true } }, rateios: { include: { caminhao: { select: { placa: true } } } } },
            orderBy: { vencimento: 'asc' },
            take: 2000,
        });
    }

    async dashboard(empresaId: string, mes?: string) {
        const j = this.janelas();
        const faixa = faixaDoMes(mes);
        const contas = await this.prisma.contaReceber.findMany({
            where: {
                empresaId, status: 'ABERTA',
                ...(faixa ? { OR: [{ dataEmissao: faixa }, { dataEmissao: null, vencimento: faixa }] } : {}),
            },
            select: { valor: true, vencimento: true },
        });
        const vazio = () => ({ quantidade: 0, valor: 0 });
        const r = { hoje: vazio(), semana: vazio(), mes: vazio(), vencidas: vazio() };
        const somar = (a: { quantidade: number; valor: number }, v: number) => { a.quantidade++; a.valor += v; };
        for (const c of contas) {
            const v = new Date(c.vencimento);
            if (v < j.hoje) somar(r.vencidas, c.valor);
            else if (v < j.amanha) somar(r.hoje, c.valor);
            if (v >= j.amanha && v < j.fimSemana) somar(r.semana, c.valor);
            if (v >= j.amanha && v < j.fimMes) somar(r.mes, c.valor);
        }
        return r;
    }

    // A receber (aberto) e já recebido, por carreta e gerais (considera rateio).
    async porCaminhao(empresaId: string, mes?: string) {
        const porMes = this.filtroMes(mes);
        const contas = await this.prisma.contaReceber.findMany({
            where: { empresaId, status: { not: 'CANCELADA' }, ...(porMes ? { AND: [porMes] } : {}) },
            select: {
                caminhaoId: true, valor: true, valorRecebido: true, status: true,
                caminhao: { select: { placa: true } },
                rateios: { select: { caminhaoId: true, valor: true, caminhao: { select: { placa: true } } } },
            },
        });
        const mapa = new Map<string, { caminhaoId: string; placa: string; recebido: number; aberto: number; quantidade: number }>();
        const somar = (k: string, placa: string, v: number, recebida: boolean) => {
            const it = mapa.get(k) ?? { caminhaoId: k, placa, recebido: 0, aberto: 0, quantidade: 0 };
            if (recebida) it.recebido += v; else it.aberto += v;
            it.quantidade++;
            mapa.set(k, it);
        };
        for (const c of contas) {
            const recebida = c.status === 'RECEBIDA';
            if (c.rateios.length > 0) {
                for (const r of c.rateios) somar(r.caminhaoId, r.caminhao.placa, r.valor, recebida);
            } else {
                somar(c.caminhaoId ?? 'GERAL', c.caminhao?.placa ?? 'Gerais', recebida ? c.valorRecebido ?? c.valor : c.valor, recebida);
            }
        }
        return Array.from(mapa.values());
    }

    async ratear(empresaId: string, ids: string[], caminhaoIds: string[]) {
        if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException('Selecione ao menos uma conta.');
        const unicos = Array.from(new Set(caminhaoIds ?? []));
        if (unicos.length > 0) {
            const ok = await this.prisma.caminhao.count({ where: { id: { in: unicos }, empresaId } });
            if (ok !== unicos.length) throw new NotFoundException('Caminhão não encontrado.');
        }
        const contas = await this.prisma.contaReceber.findMany({ where: { empresaId, id: { in: ids } }, select: { id: true, valor: true } });
        for (const c of contas) {
            await this.prisma.contaReceberRateio.deleteMany({ where: { contaReceberId: c.id } });
            if (unicos.length >= 2) {
                const partes = dividirIgualmente(c.valor, unicos.length);
                await this.prisma.contaReceberRateio.createMany({
                    data: unicos.map((caminhaoId, i) => ({ contaReceberId: c.id, caminhaoId, valor: partes[i] })),
                });
                await this.prisma.contaReceber.update({ where: { id: c.id }, data: { caminhaoId: null } });
            } else {
                await this.prisma.contaReceber.update({ where: { id: c.id }, data: { caminhaoId: unicos[0] ?? null } });
            }
        }
        return { atualizadas: contas.length };
    }

    async criar(empresaId: string, b: { descricao: string; cliente?: string; valor: number | string; vencimento: string; caminhaoId?: string; observacao?: string; motorista?: string; cte?: string; banco?: string; dataEmissao?: string; referencia?: string; comercial?: string }) {
        const descricao = b.descricao?.trim();
        const valor = Number(String(b.valor).replace(',', '.'));
        if (!descricao) throw new BadRequestException('Informe a descrição.');
        if (!(valor > 0)) throw new BadRequestException('Informe um valor válido.');
        if (!b.vencimento) throw new BadRequestException('Informe o vencimento.');

        return this.prisma.contaReceber.create({
            data: {
                empresaId,
                descricao,
                cliente: b.cliente?.trim() || null,
                valor,
                vencimento: new Date(`${b.vencimento}T12:00:00`),
                caminhaoId: await this.validarCaminhao(empresaId, b.caminhaoId),
                observacao: b.observacao?.trim() || null,
                motorista: b.motorista?.trim() || null,
                cte: b.cte?.trim() || null,
                banco: b.banco?.trim() || null,
                dataEmissao: b.dataEmissao ? new Date(`${b.dataEmissao}T12:00:00`) : null,
                referencia: b.referencia?.trim() || null,
                comercial: b.comercial?.trim() || null,
            },
        });
    }

    // -------------------------------------------------------------------------
    // Importação em massa de XML de CT-e. Cria uma conta a receber por CT-e
    // autorizado. Fica de fora: CT-e cancelado (evento de cancelamento no
    // mesmo lote ou protocolo != 100), anulação, homologação, emitido por
    // outro CNPJ e o que já foi importado antes (a chave fica gravada na
    // observação — não precisa de coluna nova no banco). Se vier o evento de
    // cancelamento de um CT-e já importado e ainda em aberto, a conta vira
    // CANCELADA.
    // -------------------------------------------------------------------------
    async importarCte(empresaId: string, arquivos: ArquivoXml[], prazoDiasParam?: string | number) {
        if (!arquivos?.length) throw new BadRequestException('Envie ao menos um XML de CT-e.');
        const prazoDias = Math.min(365, Math.max(0, Math.round(Number(prazoDiasParam ?? 30)) || 0));

        const [empresa, caminhoes] = await Promise.all([
            this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { cnpj: true } }),
            this.prisma.caminhao.findMany({ where: { OR: [{ empresaId }, { empresaId: null }] }, select: { id: true, placa: true } }),
        ]);
        const cnpjEmpresa = (empresa?.cnpj ?? '').replace(/\D/g, '');
        const caminhaoPorPlaca = new Map(caminhoes.map((c) => [normalizarPlaca(c.placa), c.id]));

        // Contas lançadas à mão/planilha com o número do CT-e no campo "CTE":
        // não importa de novo pra não contar o mesmo frete duas vezes.
        const numeroCte = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').replace(/^0+/, '');
        const ctesManuais = new Set(
            (await this.prisma.contaReceber.findMany({
                where: { empresaId, cte: { not: null }, status: { not: 'CANCELADA' } },
                select: { cte: true },
            })).map((c) => numeroCte(c.cte)).filter(Boolean),
        );

        const importados: ItemImportacao[] = [];
        const duplicados: ItemImportacao[] = [];
        const ignorados: ItemImportacao[] = [];
        const cancelados: ItemImportacao[] = [];

        // 1ª passada: lê tudo e separa os cancelamentos.
        const lidos: { arquivo: string; cte: CteLido }[] = [];
        const chavesCanceladas = new Set<string>();
        for (const a of arquivos) {
            const r = lerXmlCte(a.conteudo);
            if (r.tipo === 'CANCELAMENTO') chavesCanceladas.add(r.chave);
            else if (r.tipo === 'INVALIDO') ignorados.push({ arquivo: a.nome, motivo: r.motivo });
            else lidos.push({ arquivo: a.nome, cte: r });
        }

        // Cancelamento de CT-e que já está no sistema: só mexe se ainda estiver em aberto.
        for (const chave of chavesCanceladas) {
            const existentes = await this.prisma.contaReceber.findMany({
                where: { empresaId, observacao: { contains: chave } },
                select: { id: true, status: true, cte: true },
            });
            for (const e of existentes) {
                if (e.status === 'ABERTA') {
                    await this.prisma.contaReceber.update({ where: { id: e.id }, data: { status: 'CANCELADA' } });
                    cancelados.push({ arquivo: chave, cte: e.cte ?? undefined, motivo: 'Conta que já estava no sistema foi marcada como CANCELADA.' });
                } else if (e.status === 'RECEBIDA') {
                    cancelados.push({ arquivo: chave, cte: e.cte ?? undefined, motivo: 'CT-e cancelado, mas a conta já consta como RECEBIDA — confira manualmente.' });
                }
            }
        }

        const vistasNoLote = new Set<string>();
        for (const { arquivo, cte } of lidos) {
            const base: ItemImportacao = { arquivo, cte: cte.numero, valor: cte.valor, cliente: cte.tomadorNome, placa: cte.placaCavalo };
            if (chavesCanceladas.has(cte.chave)) { cancelados.push({ ...base, motivo: 'CT-e cancelado (evento de cancelamento no lote) — não importado.' }); continue; }
            if (cte.cStat && cte.cStat !== '100') { ignorados.push({ ...base, motivo: `Não autorizado: ${cte.cStat} ${cte.xMotivo}`.trim() }); continue; }
            if (!cte.cStat) { ignorados.push({ ...base, motivo: 'XML sem protocolo de autorização (envie o XML autorizado, cteProc).' }); continue; }
            if (cte.tpAmb === '2') { ignorados.push({ ...base, motivo: 'CT-e de homologação (teste).' }); continue; }
            if (cte.tpCTe === '2') { ignorados.push({ ...base, motivo: 'CT-e de anulação — não gera recebimento.' }); continue; }
            if (cnpjEmpresa && cte.emitenteCnpj && cte.emitenteCnpj !== cnpjEmpresa) { ignorados.push({ ...base, motivo: `Emitido por outro CNPJ (${cte.emitenteNome}).` }); continue; }
            if (!(cte.valor > 0)) { ignorados.push({ ...base, motivo: 'CT-e sem valor a receber.' }); continue; }
            if (!cte.chave || vistasNoLote.has(cte.chave)) { duplicados.push({ ...base, motivo: 'Arquivo repetido no mesmo lote.' }); continue; }
            vistasNoLote.add(cte.chave);

            const jaExiste = await this.prisma.contaReceber.findFirst({ where: { empresaId, observacao: { contains: cte.chave } }, select: { id: true } });
            if (jaExiste) { duplicados.push({ ...base, motivo: 'Já importado antes.' }); continue; }
            if (ctesManuais.has(numeroCte(cte.numero))) { duplicados.push({ ...base, motivo: `Já existe conta a receber com o CT-e nº ${cte.numero} (lançada manualmente).` }); continue; }

            const caminhaoId = cte.placas.map((p) => caminhaoPorPlaca.get(normalizarPlaca(p))).find(Boolean) ?? null;
            const emissao = cte.dataEmissao ?? new Date();
            const parcelas = cte.vencimentos.length > 0
                ? cte.vencimentos
                : [{ data: new Date(emissao.getFullYear(), emissao.getMonth(), emissao.getDate() + prazoDias, 12), valor: cte.valor }];

            const observacao = [
                `Chave CT-e: ${cte.chave}`,
                cte.motoristaNome ? `Motorista: ${cte.motoristaNome}${cte.motoristaCpf ? ` (CPF ${cte.motoristaCpf})` : ''}` : null,
                cte.placas.length ? `Veículos: ${cte.placas.join(', ')}` : null,
                cte.container ? `Container: ${cte.container}` : null,
                cte.tomadorDoc ? `CNPJ tomador: ${cte.tomadorDoc}` : null,
                'Importado do XML do CT-e.',
            ].filter(Boolean).join('\n');

            for (let i = 0; i < parcelas.length; i++) {
                const p = parcelas[i];
                await this.prisma.contaReceber.create({
                    data: {
                        empresaId,
                        descricao: `CT-e ${cte.numero} — ${cte.origem} → ${cte.destino}${parcelas.length > 1 ? ` (parcela ${i + 1}/${parcelas.length})` : ''}`,
                        cliente: cte.tomadorNome || null,
                        valor: p.valor,
                        vencimento: p.data,
                        dataEmissao: cte.dataEmissao,
                        cte: cte.numero,
                        motorista: cte.placaCavalo,
                        referencia: cte.referencia,
                        caminhaoId,
                        observacao,
                    },
                });
            }
            importados.push(base);
        }

        return {
            importados,
            duplicados,
            ignorados,
            cancelados,
            totalImportado: importados.reduce((s, i) => s + (i.valor ?? 0), 0),
        };
    }

    private async obter(id: string, empresaId: string) {
        const c = await this.prisma.contaReceber.findFirst({ where: { id, empresaId } });
        if (!c) throw new NotFoundException('Conta a receber não encontrada.');
        return c;
    }

    async atualizar(id: string, empresaId: string, b: { descricao?: string; cliente?: string; valor?: number | string; vencimento?: string; caminhaoId?: string; observacao?: string; motorista?: string; cte?: string; banco?: string; dataEmissao?: string; referencia?: string; comercial?: string }) {
        await this.obter(id, empresaId);
        const data: any = {};
        if (b.descricao !== undefined) data.descricao = b.descricao.trim();
        if (b.cliente !== undefined) data.cliente = b.cliente.trim() || null;
        if (b.valor !== undefined) {
            const v = Number(String(b.valor).replace(',', '.'));
            if (!(v > 0)) throw new BadRequestException('Valor inválido.');
            data.valor = v;
        }
        if (b.vencimento) data.vencimento = new Date(`${b.vencimento}T12:00:00`);
        if (b.caminhaoId !== undefined) data.caminhaoId = await this.validarCaminhao(empresaId, b.caminhaoId);
        if (b.observacao !== undefined) data.observacao = b.observacao.trim() || null;
        for (const k of ['motorista', 'cte', 'banco', 'referencia', 'comercial'] as const) {
            if (b[k] !== undefined) data[k] = b[k]!.trim() || null;
        }
        if (b.dataEmissao !== undefined) data.dataEmissao = b.dataEmissao ? new Date(`${b.dataEmissao}T12:00:00`) : null;
        return this.prisma.contaReceber.update({ where: { id }, data });
    }

    async receber(id: string, empresaId: string, b: { valor?: number | string; data?: string }) {
        const c = await this.obter(id, empresaId);
        const valor = Number(String(b.valor ?? c.valor).replace(',', '.'));
        if (!(valor > 0)) throw new BadRequestException('Informe o valor recebido.');
        return this.prisma.contaReceber.update({
            where: { id },
            data: { status: 'RECEBIDA', valorRecebido: valor, recebidoEm: b.data ? new Date(`${b.data}T12:00:00`) : new Date() },
        });
    }

    async desfazerRecebimento(id: string, empresaId: string) {
        await this.obter(id, empresaId);
        return this.prisma.contaReceber.update({ where: { id }, data: { status: 'ABERTA', valorRecebido: null, recebidoEm: null } });
    }

    async excluir(id: string, empresaId: string) {
        await this.obter(id, empresaId);
        await this.prisma.contaReceber.delete({ where: { id } });
        return { ok: true };
    }

    // caminhaoId 'GERAL' tira a carreta; vazio não muda.
    async editarEmMassa(empresaId: string, b: { ids: string[]; caminhaoId?: string }) {
        if (!Array.isArray(b.ids) || b.ids.length === 0) throw new BadRequestException('Selecione ao menos uma conta.');
        if (!b.caminhaoId) throw new BadRequestException('Escolha o que alterar.');
        const caminhaoId = await this.validarCaminhao(empresaId, b.caminhaoId);
        const r = await this.prisma.contaReceber.updateMany({ where: { empresaId, id: { in: b.ids } }, data: { caminhaoId } });
        return { atualizadas: r.count };
    }
}
