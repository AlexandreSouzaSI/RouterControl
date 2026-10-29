// Helpers de mês (AAAA-MM) do filtro por mês.
export const mesAtualISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const deslocarMes = (mes: string, delta: number) => {
    const [a, m] = mes.split('-').map(Number);
    const d = new Date(a, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const nomeMes = (mes: string) => {
    const [a, m] = mes.split('-').map(Number);
    const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
};

// Mês escolhido na tela de Caminhões (lista e cada caminhão): fica guardado
// neste navegador até ser trocado de novo. '' = todos os meses.
const CHAVE_MES_CAMINHOES = 'rota.caminhoes.mes';
export function lerMesCaminhoes(): string {
    try {
        const v = localStorage.getItem(CHAVE_MES_CAMINHOES) ?? '';
        return /^\d{4}-\d{2}$/.test(v) ? v : '';
    } catch { return ''; }
}
export function salvarMesCaminhoes(mes: string) {
    try { localStorage.setItem(CHAVE_MES_CAMINHOES, mes); } catch { /* sem armazenamento: só vale nesta tela */ }
}
