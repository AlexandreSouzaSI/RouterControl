import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Coluna, TipoColuna, exportarPlanilha, importarPlanilha, slug } from './planilha-import';

const TIPOS: TipoColuna[] = ['texto', 'data', 'hora', 'numero', 'moeda', 'duracao'];

// Modelos prontos pra criar uma aba nova (mesmas colunas das abas da planilha).
const BASE: Coluna[] = [
    { key: 'data', label: 'Data', tipo: 'data' },
    { key: 'motorista', label: 'Motorista', tipo: 'texto' },
    { key: 'transportadora', label: 'Transportadora', tipo: 'texto' },
    { key: 'cavalo', label: 'Cavalo', tipo: 'texto' },
    { key: 'carreta_1', label: 'Carreta 1', tipo: 'texto' },
    { key: 'carreta_2', label: 'Carreta 2', tipo: 'texto' },
];
export const MODELOS: Record<string, { nome: string; colunas: Coluna[] }> = {
    operacao: {
        nome: 'Operação (terminal / cliente com diárias)',
        colunas: [
            ...BASE,
            { key: 'terminal', label: 'Terminal', tipo: 'texto' },
            { key: 'agendamento', label: 'Agendamento', tipo: 'texto' },
            { key: 'entrada', label: 'Entrada', tipo: 'hora' },
            { key: 'saida', label: 'Saida', tipo: 'hora' },
            { key: 'rpa', label: 'RPA', tipo: 'texto' },
            { key: 'cte', label: 'Cte', tipo: 'texto' },
            { key: 'containers', label: 'Containers', tipo: 'texto' },
            { key: 'chegada_cliente', label: 'Chegada Cliente', tipo: 'data' },
            { key: 'hora_chegada_cliente', label: 'Hora Chegada Cliente', tipo: 'hora' },
            { key: 'saida_cliente', label: 'Saida Cliente', tipo: 'data' },
            { key: 'hora_saida_cliente', label: 'Hora Saida Cliente', tipo: 'hora' },
            { key: 'diarias', label: 'Diarias', tipo: 'duracao', calculo: { inicioData: 'chegada_cliente', inicioHora: 'hora_chegada_cliente', fimData: 'saida_cliente', fimHora: 'hora_saida_cliente' } },
            { key: 'quantidade', label: 'Quantidade', tipo: 'numero' },
            { key: 'c_entrega', label: 'C. Entrega', tipo: 'texto' },
            { key: 'c_vazio', label: 'C. Vazio', tipo: 'texto' },
        ],
    },
    diversos: {
        nome: 'Diversos (origem / destino / frete)',
        colunas: [
            ...BASE,
            { key: 'origem', label: 'Origem', tipo: 'texto' },
            { key: 'destino', label: 'Destino', tipo: 'texto' },
            { key: 'cte_nf', label: 'Cte / NF', tipo: 'texto' },
            { key: 'cliente', label: 'Cliente', tipo: 'texto' },
            { key: 'frete', label: 'Frete', tipo: 'moeda' },
            { key: 'comercial', label: 'Comercial', tipo: 'texto' },
        ],
    },
    vazio: { nome: 'Em branco (só Data e Motorista)', colunas: [BASE[0], BASE[1]] },
};

// Limpa e valida as colunas que vêm da tela.
function normalizarColunas(entrada: unknown): Coluna[] {
    if (!Array.isArray(entrada) || entrada.length === 0) throw new BadRequestException('A aba precisa de ao menos uma coluna.');
    const usados = new Set<string>();
    const colunas: Coluna[] = entrada.map((c: any) => {
        const label = String(c?.label ?? '').trim();
        if (!label) throw new BadRequestException('Toda coluna precisa de um nome.');
        let key = String(c?.key ?? '').trim() || slug(label);
        key = key.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60);
        while (usados.has(key)) key = `${key}_2`;
        usados.add(key);
        const tipo: TipoColuna = TIPOS.includes(c?.tipo) ? c.tipo : 'texto';
        const col: Coluna = { key, label: label.slice(0, 60), tipo };
        if (c?.largura) col.largura = Math.min(80, Math.max(4, Number(c.largura) || 0)) || undefined;
        if (tipo === 'duracao') {
            const k = c?.calculo ?? {};
            if (!k.inicioData || !k.fimData) throw new BadRequestException(`A coluna "${label}" (duração) precisa das colunas de início e fim.`);
            col.calculo = { inicioData: String(k.inicioData), inicioHora: k.inicioHora || undefined, fimData: String(k.fimData), fimHora: k.fimHora || undefined };
        }
        return col;
    });
    return colunas;
}

function limparDados(colunas: Coluna[], dados: unknown): Record<string, unknown> {
    const d = (dados && typeof dados === 'object' ? dados : {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const c of colunas) {
        if (c.tipo === 'duracao') continue;
        const v = d[c.key];
        if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) continue;
        if (c.tipo === 'numero' || c.tipo === 'moeda') {
            const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
            if (Number.isFinite(n)) out[c.key] = n;
        } else {
            out[c.key] = String(v).trim().slice(0, 500);
        }
    }
    return out;
}

@Injectable()
export class ControleViagensService {
    constructor(private readonly prisma: PrismaService) { }

    modelos() {
        return Object.entries(MODELOS).map(([id, m]) => ({ id, nome: m.nome, colunas: m.colunas }));
    }

    async listarAbas(empresaId: string) {
        const abas = await this.prisma.viagemPlanilhaAba.findMany({
            where: { empresaId },
            orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
            include: { _count: { select: { linhas: true } } },
        });
        return abas.map(({ _count, ...a }) => ({ ...a, totalLinhas: _count.linhas }));
    }

    private async aba(id: string, empresaId: string) {
        const a = await this.prisma.viagemPlanilhaAba.findFirst({ where: { id, empresaId } });
        if (!a) throw new NotFoundException('Aba não encontrada.');
        return a;
    }

    private async nomeLivre(empresaId: string, nome: string) {
        const existentes = new Set((await this.prisma.viagemPlanilhaAba.findMany({ where: { empresaId }, select: { nome: true } })).map((a) => a.nome.toLowerCase()));
        let n = nome; let i = 2;
        while (existentes.has(n.toLowerCase())) n = `${nome} (${i++})`;
        return n;
    }

    async criarAba(empresaId: string, body: { nome?: string; titulo?: string; modelo?: string; copiarDeId?: string; colunas?: unknown }) {
        const nome = body.nome?.trim();
        if (!nome) throw new BadRequestException('Informe o nome da aba.');
        let colunas: Coluna[];
        if (body.colunas) colunas = normalizarColunas(body.colunas);
        else if (body.copiarDeId) colunas = (await this.aba(body.copiarDeId, empresaId)).colunas as unknown as Coluna[];
        else colunas = (MODELOS[body.modelo ?? ''] ?? MODELOS.diversos).colunas;
        const ultima = await this.prisma.viagemPlanilhaAba.aggregate({ where: { empresaId }, _max: { ordem: true } });
        return this.prisma.viagemPlanilhaAba.create({
            data: { empresaId, nome: await this.nomeLivre(empresaId, nome.slice(0, 40)), titulo: body.titulo?.trim() || null, colunas: colunas as any, ordem: (ultima._max.ordem ?? -1) + 1 },
        });
    }

    async atualizarAba(id: string, empresaId: string, body: { nome?: string; titulo?: string | null; colunas?: unknown; ordem?: number }) {
        await this.aba(id, empresaId);
        const data: any = {};
        if (body.nome !== undefined) {
            const n = body.nome.trim();
            if (!n) throw new BadRequestException('Informe o nome da aba.');
            data.nome = n.slice(0, 40);
        }
        if (body.titulo !== undefined) data.titulo = body.titulo?.trim() || null;
        if (body.colunas !== undefined) data.colunas = normalizarColunas(body.colunas);
        if (body.ordem !== undefined) data.ordem = Number(body.ordem) || 0;
        return this.prisma.viagemPlanilhaAba.update({ where: { id }, data });
    }

    async excluirAba(id: string, empresaId: string) {
        await this.aba(id, empresaId);
        await this.prisma.viagemPlanilhaAba.delete({ where: { id } });
        return { ok: true };
    }

    async listarLinhas(abaId: string, empresaId: string) {
        await this.aba(abaId, empresaId);
        return this.prisma.viagemPlanilhaLinha.findMany({ where: { abaId }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }] });
    }

    async criarLinha(abaId: string, empresaId: string, body: { dados?: unknown }) {
        const a = await this.aba(abaId, empresaId);
        const dados = limparDados(a.colunas as unknown as Coluna[], body.dados);
        if (!Object.keys(dados).length) throw new BadRequestException('Preencha ao menos um campo.');
        const ultima = await this.prisma.viagemPlanilhaLinha.aggregate({ where: { abaId }, _max: { ordem: true } });
        return this.prisma.viagemPlanilhaLinha.create({ data: { abaId, dados: dados as any, ordem: (ultima._max.ordem ?? -1) + 1 } });
    }

    private async linha(id: string, empresaId: string) {
        const l = await this.prisma.viagemPlanilhaLinha.findFirst({ where: { id, aba: { empresaId } }, include: { aba: true } });
        if (!l) throw new NotFoundException('Viagem não encontrada.');
        return l;
    }

    async atualizarLinha(id: string, empresaId: string, body: { dados?: unknown }) {
        const l = await this.linha(id, empresaId);
        const dados = limparDados(l.aba.colunas as unknown as Coluna[], body.dados);
        return this.prisma.viagemPlanilhaLinha.update({ where: { id }, data: { dados: dados as any } });
    }

    async excluirLinha(id: string, empresaId: string) {
        await this.linha(id, empresaId);
        await this.prisma.viagemPlanilhaLinha.delete({ where: { id } });
        return { ok: true };
    }

    // Importa um .xlsx: cada aba da planilha vira uma aba nova aqui.
    async importar(empresaId: string, file?: Express.Multer.File) {
        if (!file) throw new BadRequestException('Envie a planilha (.xlsx).');
        let abas;
        try {
            abas = importarPlanilha(file.buffer);
        } catch {
            throw new BadRequestException('Não consegui ler a planilha. Envie um arquivo .xlsx.');
        }
        if (!abas.length) throw new BadRequestException('Nenhuma aba com cabeçalho encontrada na planilha.');
        const criadas: { id: string; nome: string; linhas: number }[] = [];
        for (const a of abas) {
            const aba = await this.criarAba(empresaId, { nome: a.nome, titulo: a.titulo ?? undefined, colunas: a.colunas });
            if (a.linhas.length) {
                await this.prisma.viagemPlanilhaLinha.createMany({
                    data: a.linhas.map((dados, i) => ({ abaId: aba.id, dados: dados as any, ordem: i })),
                });
            }
            criadas.push({ id: aba.id, nome: aba.nome, linhas: a.linhas.length });
        }
        return { abas: criadas };
    }

    async exportar(abaId: string, empresaId: string) {
        const a = await this.aba(abaId, empresaId);
        const linhas = await this.prisma.viagemPlanilhaLinha.findMany({ where: { abaId }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }] });
        return {
            nome: a.nome,
            buffer: exportarPlanilha(a.nome, a.titulo, a.colunas as unknown as Coluna[], linhas.map((l) => l.dados as Record<string, any>)),
        };
    }
}
