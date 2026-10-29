// Divide um total igualmente entre N partes, em centavos; os centavos que
// sobram vão para as primeiras partes (a soma sempre fecha no total).
export function dividirIgualmente(total: number, partes: number): number[] {
    const centavos = Math.round(total * 100);
    const base = Math.floor(centavos / partes);
    const resto = centavos - base * partes;
    return Array.from({ length: partes }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}

// Divide um total proporcionalmente aos pesos (ex.: valores ou % informados),
// em centavos; a diferença de arredondamento vai pra maior parte.
export function dividirPorPesos(total: number, pesos: number[]): number[] {
    const centavos = Math.round(total * 100);
    const soma = pesos.reduce((s, p) => s + p, 0);
    if (!(soma > 0)) return dividirIgualmente(total, pesos.length);
    const partes = pesos.map((p) => Math.floor((centavos * p) / soma));
    const resto = centavos - partes.reduce((s, p) => s + p, 0);
    const maior = pesos.indexOf(Math.max(...pesos));
    partes[maior] += resto;
    return partes.map((c) => c / 100);
}

// Monta a divisão de UMA conta entre caminhões.
//  - sem valores: divide igualmente;
//  - com valores: se a soma bate com o total da conta, usa exatamente os
//    valores informados; se não bate, usa como proporção (ex.: % ou lote de
//    várias contas). `exigirSomaExata` faz recusar quando não bate.
export function montarRateio(
    total: number,
    caminhaoIds: string[],
    valores?: (number | string | null | undefined)[],
    exigirSomaExata = false,
): { caminhaoId: string; valor: number }[] {
    const num = (v: unknown) => {
        const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    };
    if (!Array.isArray(valores) || valores.length !== caminhaoIds.length) {
        const unicos = Array.from(new Set(caminhaoIds));
        const partes = dividirIgualmente(total, unicos.length);
        return unicos.map((caminhaoId, i) => ({ caminhaoId, valor: partes[i] }));
    }
    const mapa = new Map<string, number>();
    caminhaoIds.forEach((id, i) => { const v = num(valores[i]); if (v > 0) mapa.set(id, (mapa.get(id) ?? 0) + v); });
    const ids = Array.from(mapa.keys());
    const pesos = ids.map((id) => mapa.get(id)!);
    const soma = pesos.reduce((s, p) => s + p, 0);
    if (!ids.length) return [];
    if (Math.abs(soma - total) <= 0.011) {
        const partes = pesos.map((p) => Math.round(p * 100) / 100);
        const dif = Math.round((total - partes.reduce((s, p) => s + p, 0)) * 100) / 100;
        partes[pesos.indexOf(Math.max(...pesos))] = Math.round((partes[pesos.indexOf(Math.max(...pesos))] + dif) * 100) / 100;
        return ids.map((caminhaoId, i) => ({ caminhaoId, valor: partes[i] }));
    }
    if (exigirSomaExata) {
        const f = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        throw new Error(`A soma dos caminhões (${f(soma)}) não bate com o valor da conta (${f(total)}).`);
    }
    const partes = dividirPorPesos(total, pesos);
    return ids.map((caminhaoId, i) => ({ caminhaoId, valor: partes[i] }));
}
