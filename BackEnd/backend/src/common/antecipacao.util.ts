import { PrismaService } from '../prisma/prisma.service';

// =============================================================================
// Receitas de um caminhão considerando as antecipações de recebíveis.
//
// Antecipação = alguém adiantou dinheiro que seria dos fretes. A parte do
// caminhão entra como receita na data do adiantamento; depois disso, os CT-es
// recebidos dele vão "abatendo" essa parte (em ordem de recebimento) e o que
// foi abatido NÃO conta de novo como receita. O que passar da parte conta
// normal. Nada é gravado: o cálculo é refeito sempre, então editar/receber
// um CT-e ou apagar uma antecipação já corrige tudo.
// =============================================================================

export type RecebimentoCaminhao = {
    chave: string; // receber-<id> | rateio-receber-<id>
    descricao: string;
    valorOriginal: number;
    valor: number; // o que conta como receita (original - abatido)
    abatido: number;
    dataRef: Date; // mês da receita (emissão do CT-e)
    rateio: boolean;
    totalRateios?: number;
};

export type ParteAntecipacao = {
    id: string;
    antecipacaoId: string;
    credor: string;
    valor: number;
    taxa: number;
    consumido: number; // quanto dos CT-es recebidos já abateu esta parte
    dataRecebimento: Date;
    vencimento: Date;
    valorTotal: number;
};

const cent = (v: number) => Math.round(v * 100);
const inicioDoDia = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export async function receitasDoCaminhao(prisma: PrismaService, empresaId: string, caminhaoId: string) {
    const [recebidas, rateios, partes] = await Promise.all([
        prisma.contaReceber.findMany({
            where: { caminhaoId, empresaId, status: 'RECEBIDA' },
            select: { id: true, descricao: true, cliente: true, valor: true, valorRecebido: true, recebidoEm: true, vencimento: true, dataEmissao: true },
        }),
        prisma.contaReceberRateio.findMany({
            where: { caminhaoId, contaReceber: { empresaId, status: 'RECEBIDA' } },
            select: { id: true, valor: true, contaReceber: { select: { descricao: true, recebidoEm: true, vencimento: true, dataEmissao: true, rateios: { select: { id: true } } } } },
        }),
        prisma.antecipacaoRecebivelParte.findMany({
            where: { caminhaoId, antecipacao: { empresaId } },
            select: { id: true, valor: true, taxa: true, antecipacao: { select: { id: true, credor: true, dataRecebimento: true, vencimento: true, valor: true } } },
        }),
    ]);

    type Interno = RecebimentoCaminhao & { ordem: Date; restante: number };
    const itens: Interno[] = [
        ...recebidas.map((c) => {
            const v = c.valorRecebido ?? c.valor;
            return {
                chave: `receber-${c.id}`,
                descricao: `${c.descricao}${c.cliente ? ` — ${c.cliente}` : ''} (Conta a Receber)`,
                valorOriginal: v, valor: v, abatido: 0, restante: cent(v),
                dataRef: c.dataEmissao ?? c.recebidoEm ?? c.vencimento,
                ordem: c.recebidoEm ?? c.vencimento,
                rateio: false,
            };
        }),
        ...rateios.map((r) => ({
            chave: `rateio-receber-${r.id}`,
            descricao: `${r.contaReceber.descricao} (Conta a Receber · dividida em ${r.contaReceber.rateios.length} carretas)`,
            valorOriginal: r.valor, valor: r.valor, abatido: 0, restante: cent(r.valor),
            dataRef: r.contaReceber.dataEmissao ?? r.contaReceber.recebidoEm ?? r.contaReceber.vencimento,
            ordem: r.contaReceber.recebidoEm ?? r.contaReceber.vencimento,
            rateio: true,
        })),
    ].sort((a, b) => a.ordem.getTime() - b.ordem.getTime());

    const out: ParteAntecipacao[] = [];
    for (const p of [...partes].sort((a, b) => a.antecipacao.dataRecebimento.getTime() - b.antecipacao.dataRecebimento.getTime())) {
        let saldo = cent(p.valor);
        const desde = inicioDoDia(p.antecipacao.dataRecebimento).getTime();
        for (const it of itens) {
            if (saldo <= 0) break;
            if (it.restante <= 0 || it.ordem.getTime() < desde) continue;
            const x = Math.min(saldo, it.restante);
            it.restante -= x;
            saldo -= x;
        }
        out.push({
            id: p.id, antecipacaoId: p.antecipacao.id, credor: p.antecipacao.credor,
            valor: p.valor, taxa: p.taxa, consumido: (cent(p.valor) - saldo) / 100,
            dataRecebimento: p.antecipacao.dataRecebimento, vencimento: p.antecipacao.vencimento,
            valorTotal: p.antecipacao.valor,
        });
    }

    const recebimentos: RecebimentoCaminhao[] = itens.map(({ ordem: _o, restante, ...it }) => ({
        ...it,
        valor: restante / 100,
        abatido: (cent(it.valorOriginal) - restante) / 100,
    }));
    return { recebimentos, partes: out };
}
