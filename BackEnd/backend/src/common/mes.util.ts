// Filtro de mês (AAAA-MM) usado em Contas a Pagar, Contas a Receber e na
// tela de cada caminhão. Devolve o intervalo [1º dia do mês, 1º dia do mês
// seguinte) ou null quando não há mês válido (= todos os meses).
export type FaixaMes = { gte: Date; lt: Date };

export function faixaDoMes(mes?: string | null): FaixaMes | null {
    const m = /^(\d{4})-(\d{2})$/.exec((mes ?? '').trim());
    if (!m) return null;
    const ano = Number(m[1]);
    const idx = Number(m[2]) - 1;
    if (idx < 0 || idx > 11) return null;
    return { gte: new Date(ano, idx, 1), lt: new Date(ano, idx + 1, 1) };
}

// Sem faixa = tudo passa. Sem data = fica de fora quando há faixa.
export function dentroDaFaixa(data: Date | string | null | undefined, faixa: FaixaMes | null): boolean {
    if (!faixa) return true;
    if (!data) return false;
    const t = new Date(data).getTime();
    return t >= faixa.gte.getTime() && t < faixa.lt.getTime();
}
