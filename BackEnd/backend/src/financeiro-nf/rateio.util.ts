// Divide um total igualmente entre N partes, em centavos; os centavos que
// sobram vão para as primeiras partes (a soma sempre fecha no total).
export function dividirIgualmente(total: number, partes: number): number[] {
    const centavos = Math.round(total * 100);
    const base = Math.floor(centavos / partes);
    const resto = centavos - base * partes;
    return Array.from({ length: partes }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}
