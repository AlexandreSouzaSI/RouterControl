// Gera uma página imprimível (Salvar como PDF) das contas a pagar em aberto,
// agrupadas e coloridas como os cards: Vencidas, Hoje, Semana, Mês e Depois.

export type ContaImpressao = {
    descricao: string;
    valor: number;
    saldoDevedor?: number;
    vencimento: string;
    grupo?: string;
    fornecedor?: { nome: string } | null;
    categoria?: { nome: string } | null;
    queuedForPaymentAt?: string | null;
};

const SECOES = [
    { chave: 'vencidas', titulo: 'Vencidas', cor: '#dc2626', fundo: '#fef2f2' },
    { chave: 'hoje', titulo: 'Hoje', cor: '#d97706', fundo: '#fffbeb' },
    { chave: 'semana', titulo: 'Esta semana', cor: '#2563eb', fundo: '#eff6ff' },
    { chave: 'mes', titulo: 'Este mês', cor: '#4b5563', fundo: '#f3f4f6' },
    { chave: 'depois', titulo: 'Próximos meses', cor: '#7c3aed', fundo: '#f5f3ff' },
] as const;

const NOME_GRUPO: Record<string, string> = { FORNECEDORES: 'Fornecedor', IMPOSTOS: 'Imposto', SOCIOS: 'Sócio' };

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inicioDia(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

export function imprimirContas(contas: ContaImpressao[], rotuloGrupo: string) {
    const hoje = inicioDia(new Date());
    const amanha = new Date(hoje); amanha.setDate(hoje.getDate() + 1);
    const diaSemana = (hoje.getDay() + 6) % 7;
    const fimSemana = new Date(hoje); fimSemana.setDate(hoje.getDate() - diaSemana + 7);
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);

    const secoes: Record<string, ContaImpressao[]> = { vencidas: [], hoje: [], semana: [], mes: [], depois: [] };
    for (const c of contas) {
        const v = inicioDia(new Date(c.vencimento));
        if (c.queuedForPaymentAt || (v >= hoje && v < amanha)) secoes.hoje.push(c);
        else if (v < hoje) secoes.vencidas.push(c);
        else if (v < fimSemana) secoes.semana.push(c);
        else if (v < fimMes) secoes.mes.push(c);
        else secoes.depois.push(c);
    }

    const saldo = (c: ContaImpressao) => c.saldoDevedor ?? c.valor;
    const mostrarGrupo = rotuloGrupo === 'Todas';
    let totalGeral = 0;
    let qtdGeral = 0;

    const blocos = SECOES.map((s) => {
        const itens = secoes[s.chave];
        if (itens.length === 0) return '';
        const subtotal = itens.reduce((t, c) => t + saldo(c), 0);
        totalGeral += subtotal;
        qtdGeral += itens.length;
        const linhas = itens
            .map((c) => `<tr style="background:${s.fundo}">
                <td>${new Date(c.vencimento).toLocaleDateString('pt-BR')}</td>
                <td>${esc(c.descricao)}${mostrarGrupo ? ` <span class="tag">${NOME_GRUPO[c.grupo ?? 'FORNECEDORES'] ?? ''}</span>` : ''}</td>
                <td>${esc(c.fornecedor?.nome ?? c.categoria?.nome ?? '')}</td>
                <td class="v">${moeda(saldo(c))}</td></tr>`)
            .join('');
        return `<h2 style="background:${s.cor}">${s.titulo} <span>${itens.length} conta${itens.length > 1 ? 's' : ''}</span></h2>
            <table style="border-left:4px solid ${s.cor}"><tbody>${linhas}</tbody>
            <tfoot><tr><td colspan="3" style="color:${s.cor}">Total ${s.titulo.toLowerCase()}</td><td class="v" style="color:${s.cor}">${moeda(subtotal)}</td></tr></tfoot></table>`;
    }).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Contas a pagar - ${rotuloGrupo}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111827; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #6b7280; margin-bottom: 14px; }
  h2 { color: #fff; font-size: 13px; padding: 6px 10px; margin: 16px 0 0; display: flex; justify-content: space-between; border-radius: 4px 4px 0 0; }
  h2 span { font-weight: normal; opacity: .9; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  td.v { text-align: right; white-space: nowrap; font-weight: bold; }
  tfoot td { font-weight: bold; background: #fff; border-top: 2px solid #9ca3af; }
  .tag { font-size: 9px; text-transform: uppercase; background: #fff; border: 1px solid #9ca3af; border-radius: 3px; padding: 0 4px; color: #4b5563; }
  .total { margin-top: 18px; padding: 12px 14px; border: 2px solid #111827; display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; }
  tr { page-break-inside: avoid; }
  @media print { body { margin: 8mm; } }
</style></head><body>
<h1>Contas a pagar — ${rotuloGrupo}</h1>
<div class="sub">Em aberto · emitido em ${new Date().toLocaleString('pt-BR')}</div>
${blocos || '<p>Nenhuma conta em aberto.</p>'}
<div class="total"><span>TOTAL A PAGAR (${qtdGeral} conta${qtdGeral === 1 ? '' : 's'})</span><span>${moeda(totalGeral)}</span></div>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
        alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
        return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
}
