import { useState } from 'react';
import { X } from 'lucide-react';
import { corPlaca } from '../lib/corPlaca';

// Escolha de 1 ou mais carretas para uma conta. Com 2 ou mais, o valor é
// dividido igualmente e a parcela de cada carreta vai para a aba Caminhões.

type Props = {
    caminhoes: { id: string; placa: string }[];
    valorTotal?: number; // mostra a prévia da divisão (opcional)
    inicial?: string[];
    titulo?: string;
    onConfirmar: (caminhaoIds: string[]) => void;
    onFechar: () => void;
};

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function RateioCarretasModal({ caminhoes, valorTotal, inicial = [], titulo, onConfirmar, onFechar }: Props) {
    const [marcadas, setMarcadas] = useState<Set<string>>(new Set(inicial));

    function alternar(id: string) {
        setMarcadas((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    }

    const qtd = marcadas.size;
    const parcela = valorTotal && qtd >= 2 ? valorTotal / qtd : null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onFechar}>
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900 dark:text-white">{titulo ?? 'Para quais carretas?'}</p>
                    <button type="button" onClick={onFechar}><X size={18} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                    {caminhoes.map((c) => (
                        <label key={c.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm font-semibold ${marcadas.has(c.id) ? `${corPlaca(c.placa)} ring-2 ring-blue-500` : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'}`}>
                            <input type="checkbox" checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} />
                            🚚 {c.placa}
                        </label>
                    ))}
                </div>
                {qtd >= 2 ? (
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Conta para {qtd} carretas — o valor será dividido igualmente
                        {parcela != null ? ` (${moeda(parcela)} para cada)` : ''}.
                    </p>
                ) : qtd === 1 ? (
                    <p className="text-xs text-gray-500">Conta de uma carreta só.</p>
                ) : (
                    <p className="text-xs text-gray-500">Nenhuma marcada = conta geral (sem carreta).</p>
                )}
                <button type="button" onClick={() => onConfirmar(Array.from(marcadas))}
                    className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold">
                    {qtd >= 2 ? `Dividir entre ${qtd} carretas` : 'Confirmar'}
                </button>
            </div>
        </div>
    );
}

// Etiquetas "dividida entre ..." usadas nas tabelas.
export function EtiquetaRateio({ rateios }: { rateios?: { caminhaoId: string; valor: number; caminhao?: { placa: string } }[] }) {
    if (!rateios || rateios.length < 2) return null;
    return (
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 text-[10px] font-bold uppercase">
                Dividida · {rateios.length} carretas
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
