import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { dividirPorPesos, montarRateio } from './rateio.util';
import { receitasDoCaminhao } from '../common/antecipacao.util';

// =============================================================================
// Antecipação de recebíveis (Contas a Receber → "Antecipação").
// Cria: a antecipação com a parte de cada caminhão (receita na data do
// dinheiro; os próximos CT-es dele até essa parte não contam de novo) e a
// Conta a Pagar da devolução (valor + taxa) ao credor, SEM caminhão — nos
// caminhões entra só a taxa, pela própria antecipação.
// =============================================================================

const num = (v: unknown) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v ?? '').trim();
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? n : 0;
};
const data = (v: unknown) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
    return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T15:00:00.000Z`) : null; // meio-dia em Brasília
};
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

@Injectable()
export class AntecipacoesService {
    constructor(private readonly prisma: PrismaService) { }

    async listar(empresaId: string) {
        const lista = await this.prisma.antecipacaoRecebivel.findMany({
            where: { empresaId },
            orderBy: { dataRecebimento: 'desc' },
            include: { partes: { include: { caminhao: { select: { id: true, placa: true } } } } },
        });
        const contas = await this.prisma.contaPagar.findMany({
            where: { id: { in: lista.map((a) => a.contaPagarId).filter(Boolean) as string[] } },
            select: { id: true, status: true, pagoEm: true, valor: true },
        });
        // Quanto de cada parte já foi abatido pelos CT-es recebidos (mesmo cálculo da tela do caminhão).
        const consumo = new Map<string, number>();
        const caminhoes = [...new Set(lista.flatMap((a) => a.partes.map((p) => p.caminhaoId)))];
        for (const cid of caminhoes) {
            const { partes } = await receitasDoCaminhao(this.prisma, empresaId, cid);
            for (const p of partes) consumo.set(p.id, p.consumido);
        }
        return lista.map((a) => {
            const conta = contas.find((c) => c.id === a.contaPagarId) ?? null;
            const partes = a.partes.map((p) => ({ id: p.id, caminhaoId: p.caminhaoId, placa: p.caminhao.placa, valor: p.valor, taxa: p.taxa, abatido: consumo.get(p.id) ?? 0 }));
            const abatido = Math.round(partes.reduce((s, p) => s + p.abatido, 0) * 100) / 100;
            return { ...a, partes, abatido, aAbater: Math.round((a.valor - abatido) * 100) / 100, contaPagar: conta };
        });
    }

    async criar(empresaId: string, usuario: string | null, body: any) {
        const credor = String(body?.credor ?? '').trim();
        const valor = Math.round(num(body?.valor) * 100) / 100;
        const dataRecebimento = data(body?.dataRecebimento);
        const vencimento = data(body?.vencimento);
        const pct = body?.taxaPercentual === '' || body?.taxaPercentual == null ? null : num(body.taxaPercentual);
        const taxa = Math.round((body?.taxa !== '' && body?.taxa != null ? num(body.taxa) : pct != null ? (valor * pct) / 100 : 0) * 100) / 100;
        if (!credor) throw new BadRequestException('Informe quem antecipou (credor).');
        if (!(valor > 0)) throw new BadRequestException('Informe o valor antecipado.');
        if (!dataRecebimento) throw new BadRequestException('Informe a data em que o dinheiro entrou.');
        if (!vencimento) throw new BadRequestException('Informe o vencimento da devolução.');
        if (taxa < 0) throw new BadRequestException('Taxa inválida.');

        const ids: string[] = Array.isArray(body?.caminhaoIds) ? body.caminhaoIds.map(String) : [];
        const validos = await this.prisma.caminhao.findMany({
            where: { id: { in: ids }, OR: [{ empresaId }, { empresaId: null }] },
            select: { id: true },
        });
        if (!ids.length || validos.length !== new Set(ids).size) throw new BadRequestException('Escolha os caminhões.');
        let partesValor: { caminhaoId: string; valor: number }[];
        try {
            partesValor = montarRateio(valor, ids, Array.isArray(body?.valores) ? body.valores : undefined, true);
        } catch (e: any) {
            throw new BadRequestException(e?.message ?? 'Divisão inválida.');
        }
        const partesTaxa = dividirPorPesos(taxa, partesValor.map((p) => p.valor));

        return this.prisma.$transaction(async (tx) => {
            const conta = await tx.contaPagar.create({
                data: {
                    empresaId,
                    descricao: `Devolução de antecipação de recebíveis — ${credor} (${brl(valor)} + taxa ${brl(taxa)})`,
                    valor: Math.round((valor + taxa) * 100) / 100,
                    vencimento,
                    tipo: 'SEM_BOLETO',
                    formaPagamento: 'PIX',
                    observacao: 'Gerada pela antecipação de recebíveis. Nos caminhões entra só a taxa (pela antecipação) — esta conta não tem caminhão de propósito.',
                },
            });
            return tx.antecipacaoRecebivel.create({
                data: {
                    empresaId, credor, valor, taxa, taxaPercentual: pct, dataRecebimento, vencimento,
                    observacao: String(body?.observacao ?? '').trim() || null,
                    contaPagarId: conta.id,
                    criadoPor: usuario,
                    partes: { create: partesValor.map((p, i) => ({ caminhaoId: p.caminhaoId, valor: p.valor, taxa: partesTaxa[i] })) },
                },
                include: { partes: true },
            });
        });
    }

    async excluir(id: string, empresaId: string) {
        const a = await this.prisma.antecipacaoRecebivel.findFirst({ where: { id, empresaId } });
        if (!a) throw new NotFoundException('Antecipação não encontrada.');
        if (a.contaPagarId) {
            const conta = await this.prisma.contaPagar.findUnique({ where: { id: a.contaPagarId }, select: { status: true } });
            if (conta?.status === 'PAGA') throw new BadRequestException('A devolução desta antecipação já foi paga. Desfaça o pagamento em Contas a Pagar antes de excluir.');
        }
        await this.prisma.$transaction([
            ...(a.contaPagarId ? [this.prisma.contaPagar.deleteMany({ where: { id: a.contaPagarId, empresaId } })] : []),
            this.prisma.antecipacaoRecebivel.delete({ where: { id } }),
        ]);
        return { ok: true };
    }
}
