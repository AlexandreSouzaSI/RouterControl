import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { corPlaca } from '../lib/corPlaca';
import { Modal } from './Modal';

// Escolha de 1 ou mais caminhões para uma conta. Com 2 ou mais, o valor pode
// ser dividido IGUAL ou informando QUANTO é de cada um (ex.: 13.000 = RFX
// 3.000 + QPM 10.000). Sem o valor da conta (várias contas de uma vez), a
// divisão personalizada é em %.

type Props = {
    caminhoes: { id: string; placa: string }[];
    valorTotal?: number; // com valor: divisão em R$; sem valor: em %
    inicial?: string[];
    inicialValores?: number[]; // valores já gravados (mesma ordem de `inicial`)
    titulo?: string;
    onConfirmar: (caminhaoIds: string[], valores?: number[]) => void;
    onFechar: () => void;
};

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (t: string) => {
    const s = String(t ?? '').trim();
    if (!s) return 0;
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? n : 0;
};
const fmt = (v: number) => v.toFixed(2).replace('.', ',');

export function RateioCarretasModal({ caminhoes, valorTotal, inicial = [], inicialValores, titulo, onConfirmar, onFechar }: Props) {
    const emReais = !!valorTotal && valorTotal > 0;
    const [ordem, setOrdem] = useState<string[]>(inicial);
    const temValoresIniciais = !!inicialValores && inicialValores.length === inicial.length && inicial.length >= 2;
    const iguais = temValoresIniciais && inicialValores!.every((v) => Math.abs(v - inicialValores![0]) <= 0.02);
    const [modo, setModo] = useState<'igual' | 'valores'>(temValoresIniciais && !iguais ? 'valores' : 'igual');
    const [valores, setValores] = useState<Record<string, string>>(() => {
        const m: Record<string, string> = {};
        if (temValoresIniciais) inicial.forEach((id, i) => { m[id] = emReais ? fmt(inicialValores![i]) : fmt((inicialValores![i] / inicialValores!.reduce((s, v) => s + v, 0)) * 100); });
        return m;
    });

    function alternar(id: string) {
        setOrdem((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
    }

    const qtd = ordem.length;
    const alvo = emReais ? valorTotal! : 100;
    const soma = useMemo(() => ordem.reduce((s, id) => s + num(valores[id] ?? ''), 0), [ordem, valores]);
    const falta = Math.round((alvo - soma) * 100) / 100;
    const personalizadoOk = qtd >= 2 && ordem.every((id) => num(valores[id] ?? '') > 0) && Math.abs(falta) <= 0.01;
    const podeConfirmar = qtd < 2 || modo === 'igual' || personalizadoOk;

    function preencherRestante(id: string) {
        const outros = ordem.filter((x) => x !== id).reduce((s, x) => s + num(valores[x] ?? ''), 0);
        const r = Math.round((alvo - outros) * 100) / 100;
        if (r > 0) setValores((v) => ({ ...v, [id]: fmt(r) }));
    }

    function confirmar() {
        if (qtd >= 2 && modo === 'valores') onConfirmar(ordem, ordem.map((id) => num(valores[id] ?? '')));
        else onConfirmar(ordem);
    }

    return (
        <Modal onFechar={onFechar} className="z-[60] bg-black/50">
            <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{titulo ?? 'Para quais caminhões?'}</p>
                        {emReais && <p className="text-xs text-gray-500">Valor da conta: <strong>{moeda(valorTotal!)}</strong></p>}
                    </div>
                    <button type="button" onClick={onFechar} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
                </div>

                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {caminhoes.map((c) => (
                        <label key={c.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm font-semibold ${ordem.includes(c.id) ? `${corPlaca(c.placa)} ring-2 ring-blue-500` : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'}`}>
                            <input type="checkbox" checked={ordem.includes(c.id)} onChange={() => alternar(c.id)} />
                            {c.placa}
                        </label>
                    ))}
                </div>

                {qtd >= 2 && (
                    <div className="space-y-3">
                        <div className="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-900">
                            {([['igual', 'Dividir igual'], ['valores', emReais ? 'Informar valor de cada um' : 'Informar % de cada um']] as const).map(([m, l]) => (
                                <button key={m} type="button" onClick={() => setModo(m)}
                                    className={`flex-1 py-1.5 rounded-md text-sm font-medium ${modo === m ? 'bg-white dark:bg-[#111827] shadow text-gray-900 dark:text-white' : 'text-gray-500'}`}>{l}</button>
                            ))}
                        </div>

                        {modo === 'igual' ? (
                            <p className="text-sm text-amber-700 dark:text-amber-400">
                                {qtd} caminhões · {emReais ? `${moeda(valorTotal! / qtd)} para cada` : `${fmt(100 / qtd)}% para cada`}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {ordem.map((id) => {
                                    const c = caminhoes.find((x) => x.id === id);
                                    return (
                                        <div key={id} className="flex items-center gap-2">
                                            <span className={`w-24 shrink-0 px-2 py-1 rounded-md border text-xs font-bold text-center ${corPlaca(c?.placa)}`}>{c?.placa ?? '?'}</span>
                                            <div className="relative flex-1">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{emReais ? 'R$' : '%'}</span>
                                                <input autoFocus={id === ordem[0]} inputMode="decimal" value={valores[id] ?? ''}
                                                    onChange={(e) => setValores((v) => ({ ...v, [id]: e.target.value }))}
                                                    placeholder={emReais ? '0,00' : '0'}
                                                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm text-right tabular-nums bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" />
                                            </div>
                                            <button type="button" onClick={() => preencherRestante(id)} title="Completar com o que falta"
                                                className="text-xs px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 whitespace-nowrap">o resto</button>
                                        </div>
                                    );
                                })}
                                <div className={`flex justify-between text-sm font-semibold px-1 ${Math.abs(falta) <= 0.01 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    <span>Soma: {emReais ? moeda(soma) : `${fmt(soma)}%`}</span>
                                    <span>{Math.abs(falta) <= 0.01 ? 'Fechou ✓' : falta > 0 ? `Falta ${emReais ? moeda(falta) : `${fmt(falta)}%`}` : `Passou ${emReais ? moeda(-falta) : `${fmt(-falta)}%`}`}</span>
                                </div>
                                {!emReais && <p className="text-xs text-gray-500">Várias contas selecionadas: cada uma será dividida nessa proporção.</p>}
                            </div>
                        )}
                    </div>
                )}
                {qtd === 1 && <p className="text-xs text-gray-500">Conta de um caminhão só.</p>}
                {qtd === 0 && <p className="text-xs text-gray-500">Nenhum marcado = conta geral (sem caminhão).</p>}

                <button type="button" onClick={confirmar} disabled={!podeConfirmar}
                    className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
                    {qtd >= 2 ? `Dividir entre ${qtd} caminhões` : 'Confirmar'}
                </button>
            </div>
        </Modal>
    );
}

// Etiquetas "dividida entre ..." usadas nas tabelas.
export function EtiquetaRateio({ rateios }: { rateios?: { caminhaoId: string; valor: number; caminhao?: { placa: string } }[] }) {
    if (!rateios || rateios.length < 2) return null;
    return (
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 text-[10px] font-bold uppercase">
                Dividida · {rateios.length} caminhões
            </span>
            {rateios.map((r) => (
                <span key={r.caminhaoId} title={moeda(r.valor)}
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${corPlaca(r.caminhao?.placa)}`}>
                    {r.caminhao?.placa ?? '?'} {moeda(r.valor)}
                </span>
            ))}
        </div>
    );
}
