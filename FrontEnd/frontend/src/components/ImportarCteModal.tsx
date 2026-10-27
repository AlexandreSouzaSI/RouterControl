import { useState } from 'react';
import { FileUp, Loader2, X, CheckCircle2, Copy, Ban, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

// Importação em massa de XML de CT-e pra Contas a Receber. Manda os arquivos
// em lotes (pra não estourar limite de upload) e junta o resultado.

type Item = { arquivo: string; cte?: string; motivo?: string; valor?: number; cliente?: string; placa?: string | null };
type Resultado = { importados: Item[]; duplicados: Item[]; ignorados: Item[]; cancelados: Item[]; totalImportado: number };

const LOTE = 40;
const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ImportarCteModal({ aberto, onFechar, onImportado }: { aberto: boolean; onFechar: () => void; onImportado: () => void }) {
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [prazoDias, setPrazoDias] = useState('30');
    const [enviando, setEnviando] = useState(false);
    const [progresso, setProgresso] = useState(0);
    const [resultado, setResultado] = useState<Resultado | null>(null);
    const [erro, setErro] = useState('');

    if (!aberto) return null;

    function fechar() {
        if (enviando) return;
        setArquivos([]); setResultado(null); setErro(''); setProgresso(0);
        onFechar();
    }

    async function importar() {
        if (arquivos.length === 0) return;
        setEnviando(true); setErro(''); setResultado(null); setProgresso(0);
        const total: Resultado = { importados: [], duplicados: [], ignorados: [], cancelados: [], totalImportado: 0 };
        try {
            // Cancelamentos primeiro: assim um CT-e cancelado nunca entra, mesmo que
            // o evento de cancelamento caia em outro lote.
            const ordenados = [...arquivos].sort((a, b) => Number(/canc|evento|110111/i.test(b.name)) - Number(/canc|evento|110111/i.test(a.name)));
            for (let i = 0; i < ordenados.length; i += LOTE) {
                const form = new FormData();
                ordenados.slice(i, i + LOTE).forEach((f) => form.append('arquivos', f));
                form.append('prazoDias', prazoDias || '0');
                const r = await api.post('/financeiro-nf/contas-receber/importar-cte', form, { headers: { 'Content-Type': 'multipart/form-data' } });
                const d: Resultado = r.data;
                total.importados.push(...d.importados); total.duplicados.push(...d.duplicados);
                total.ignorados.push(...d.ignorados); total.cancelados.push(...d.cancelados);
                total.totalImportado += d.totalImportado ?? 0;
                setProgresso(Math.min(ordenados.length, i + LOTE));
            }
            setResultado(total);
            if (total.importados.length || total.cancelados.length) onImportado();
        } catch (e: any) {
            setErro(e?.response?.data?.message || 'Não foi possível importar. Os lotes anteriores (se houver) já foram gravados.');
            if (total.importados.length) { setResultado(total); onImportado(); }
        } finally {
            setEnviando(false);
        }
    }

    const Lista = ({ titulo, itens, icone, tom }: { titulo: string; itens: Item[]; icone: React.ReactNode; tom: string }) =>
        itens.length === 0 ? null : (
            <details className="rounded-xl border border-gray-200 dark:border-gray-800" open={titulo.startsWith('Importados') ? itens.length <= 15 : false}>
                <summary className={`cursor-pointer px-3 py-2 text-sm font-medium flex items-center gap-2 ${tom}`}>{icone} {titulo} ({itens.length})</summary>
                <ul className="max-h-48 overflow-y-auto px-3 pb-2 text-xs space-y-1">
                    {itens.map((it, i) => (
                        <li key={i} className="text-gray-600 dark:text-gray-300">
                            {it.cte ? <strong>CT-e {it.cte}</strong> : <span className="font-mono">{it.arquivo}</span>}
                            {it.valor ? ` · ${moeda(it.valor)}` : ''}{it.placa ? ` · ${it.placa}` : ''}{it.cliente ? ` · ${it.cliente}` : ''}
                            {it.motivo && <span className="block text-gray-400">{it.motivo}</span>}
                        </li>
                    ))}
                </ul>
            </details>
        );

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={fechar}>
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">Importar XML de CT-e</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Cria uma conta a receber por CT-e autorizado (cliente = tomador, valor a receber, carreta pela placa).
                            CT-e cancelado, de anulação ou já importado fica de fora. Se tiver os XMLs de evento de cancelamento, mande junto.
                        </p>
                    </div>
                    <button onClick={fechar} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
                </div>

                {!resultado && (
                    <>
                        <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 text-center">
                            <FileUp size={24} className="text-blue-600" />
                            <span className="text-sm text-gray-700 dark:text-gray-200">
                                {arquivos.length ? `${arquivos.length} arquivo${arquivos.length === 1 ? '' : 's'} selecionado${arquivos.length === 1 ? '' : 's'}` : 'Clique para escolher os XMLs (pode selecionar vários)'}
                            </span>
                            <input type="file" accept=".xml,text/xml,application/xml" multiple className="hidden"
                                onChange={(e) => setArquivos(Array.from(e.target.files ?? []).filter((f) => /\.xml$/i.test(f.name)))} />
                        </label>
                        <div>
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Vencimento = emissão + quantos dias? (usado quando o CT-e não traz a data de vencimento)</label>
                            <input type="number" min="0" max="365" value={prazoDias} onChange={(e) => setPrazoDias(e.target.value)}
                                className="w-32 px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" />
                        </div>
                        {erro && <p className="text-sm text-red-600">{erro}</p>}
                        <div className="flex justify-end gap-2">
                            <button onClick={fechar} disabled={enviando} className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancelar</button>
                            <button onClick={importar} disabled={enviando || arquivos.length === 0}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
                                {enviando ? <><Loader2 size={16} className="animate-spin" /> {progresso}/{arquivos.length}</> : <><FileUp size={16} /> Importar</>}
                            </button>
                        </div>
                    </>
                )}

                {resultado && (
                    <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-sm text-green-800 dark:text-green-300">
                            <strong>{resultado.importados.length}</strong> CT-e importado{resultado.importados.length === 1 ? '' : 's'} · {moeda(resultado.totalImportado)}
                        </div>
                        {erro && <p className="text-sm text-red-600">{erro}</p>}
                        <Lista titulo="Importados" itens={resultado.importados} icone={<CheckCircle2 size={14} />} tom="text-green-700 dark:text-green-400" />
                        <Lista titulo="Já existiam (não duplicados)" itens={resultado.duplicados} icone={<Copy size={14} />} tom="text-gray-600 dark:text-gray-300" />
                        <Lista titulo="Cancelados" itens={resultado.cancelados} icone={<Ban size={14} />} tom="text-red-600 dark:text-red-400" />
                        <Lista titulo="Ignorados" itens={resultado.ignorados} icone={<AlertTriangle size={14} />} tom="text-amber-600 dark:text-amber-400" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setResultado(null); setArquivos([]); setErro(''); }} className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Importar mais</button>
                            <button onClick={fechar} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">Fechar</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
