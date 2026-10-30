import { useCallback, useEffect, useMemo, useState } from 'react';
import { HandCoins, Loader2, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import { Modal } from './Modal';
import { RateioCarretasModal } from './RateioCarretasModal';
import { corPlaca } from '../lib/corPlaca';

// =============================================================================
// Antecipação de recebíveis: alguém adianta X dos fretes e recebe X + taxa
// num vencimento. Cada caminhão marcado ganha sua parte como receita na data
// do dinheiro; os próximos CT-es recebidos dele, até completar essa parte, não
// contam de novo. A devolução vira uma Conta a Pagar (sem caminhão) e nos
// caminhões entra só a taxa.
// =============================================================================

type Antecipacao = {
    id: string; credor: string; valor: number; taxa: number; taxaPercentual: number | null;
    dataRecebimento: string; vencimento: string; observacao: string | null;
    abatido: number; aAbater: number;
    contaPagar: { id: string; status: string; pagoEm: string | null; valor: number } | null;
    partes: { id: string; caminhaoId: string; placa: string; valor: number; taxa: number; abatido: number }[];
};

const moeda = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (t: string) => { const s = String(t ?? '').trim(); if (!s) return 0; const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : 0; };
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dataBR = (s: string) => new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const campo = 'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white';
const rotulo = 'block text-xs font-medium text-gray-500 mb-1';

function partesIguais(total: number, n: number) {
    const c = Math.round(total * 100), b = Math.floor(c / n);
    return Array.from({ length: n }, (_, i) => (i === n - 1 ? c - b * (n - 1) : b) / 100);
}

export function AntecipacoesModal({ caminhoes, onFechar }: { caminhoes: { id: string; placa: string }[]; onFechar: () => void }) {
    const [lista, setLista] = useState<Antecipacao[] | null>(null);
    const [credor, setCredor] = useState('');
    const [valor, setValor] = useState('');
    const [dataRecebimento, setDataRecebimento] = useState(hojeISO());
    const [vencimento, setVencimento] = useState('');
    const [tipoTaxa, setTipoTaxa] = useState<'pct' | 'rs'>('pct');
    const [taxaTxt, setTaxaTxt] = useState('');
    const [selecionados, setSelecionados] = useState<string[]>(() => caminhoes.map((c) => c.id));
    const [valores, setValores] = useState<number[] | undefined>(undefined);
    const [modalDividir, setModalDividir] = useState(false);
    const [obs, setObs] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const carregar = useCallback(() => {
        api.get('/financeiro-nf/antecipacoes').then((r) => setLista(r.data ?? [])).catch(() => setLista([]));
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const v = num(valor);
    const taxa = tipoTaxa === 'rs' ? num(taxaTxt) : Math.round(v * num(taxaTxt)) / 100;
    const partes = useMemo(() => {
        if (!selecionados.length || !(v > 0)) return [];
        const vals = valores && valores.length === selecionados.length ? valores : partesIguais(v, selecionados.length);
        const tot = vals.reduce((s, x) => s + x, 0) || 1;
        return selecionados.map((id, i) => ({ id, placa: caminhoes.find((c) => c.id === id)?.placa ?? '?', valor: vals[i], taxa: Math.round(taxa * (vals[i] / tot) * 100) / 100 }));
    }, [selecionados, valores, v, taxa, caminhoes]);

    function alternar(id: string) {
        setValores(undefined);
        setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    }

    async function salvar() {
        setErro(null);
        if (valores && Math.abs(valores.reduce((s, x) => s + x, 0) - v) > 0.011) { setErro('A divisão não bate com o valor. Ajuste em "Valores diferentes".'); return; }
        setSalvando(true);
        try {
            await api.post('/financeiro-nf/antecipacoes', {
                credor, valor: v, dataRecebimento, vencimento, observacao: obs,
                ...(tipoTaxa === 'rs' ? { taxa: num(taxaTxt) } : { taxaPercentual: num(taxaTxt) }),
                caminhaoIds: selecionados, ...(valores ? { valores } : {}),
            });
            setCredor(''); setValor(''); setTaxaTxt(''); setVencimento(''); setObs(''); setValores(undefined);
            carregar();
        } catch (e: any) {
            setErro(e?.response?.data?.message ?? 'Não foi possível salvar.');
        } finally {
            setSalvando(false);
        }
    }

    async function excluir(a: Antecipacao) {
        if (!confirm(`Excluir a antecipação de ${moeda(a.valor)} (${a.credor})? A Conta a Pagar da devolução também é apagada.`)) return;
        try { await api.delete(`/financeiro-nf/antecipacoes/${a.id}`); carregar(); }
        catch (e: any) { alert(e?.response?.data?.message ?? 'Não foi possível excluir.'); }
    }

    const pode = credor.trim() && v > 0 && dataRecebimento && vencimento && selecionados.length > 0 && !salvando;

    return (
        <Modal onFechar={onFechar}>
            <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><HandCoins size={18} /> Antecipação de recebíveis</p>
                        <p className="text-xs text-gray-500 mt-1">
                            Cada caminhão marcado ganha a sua parte como <b>receita</b> na data em que o dinheiro entrou. Os próximos CT-es recebidos dele, até completar essa parte,
                            <b> não contam de novo</b> (já foram antecipados). A devolução (valor + taxa) vira uma <b>Conta a Pagar</b> ao credor, e nos caminhões entra como despesa <b>só a taxa</b>.
                        </p>
                    </div>
                    <button onClick={onFechar} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div><label className={rotulo}>Quem antecipou (credor) *</label><input className={campo} value={credor} onChange={(e) => setCredor(e.target.value)} placeholder="Nome" /></div>
                        <div><label className={rotulo}>Valor antecipado *</label><input className={campo} inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setValores(undefined); }} placeholder="80.000,00" /></div>
                        <div><label className={rotulo}>Data em que o dinheiro entrou *</label><input type="date" className={campo} value={dataRecebimento} onChange={(e) => setDataRecebimento(e.target.value)} /></div>
                        <div><label className={rotulo}>Vencimento da devolução *</label><input type="date" className={campo} value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></div>
                        <div>
                            <label className={rotulo}>Taxa</label>
                            <div className="flex gap-2">
                                <div className="flex rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden text-sm shrink-0">
                                    {(['pct', 'rs'] as const).map((t) => (
                                        <button key={t} type="button" onClick={() => setTipoTaxa(t)} className={`px-3 ${tipoTaxa === t ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300'}`}>{t === 'pct' ? '%' : 'R$'}</button>
                                    ))}
                                </div>
                                <input className={campo} inputMode="decimal" value={taxaTxt} onChange={(e) => setTaxaTxt(e.target.value)} placeholder={tipoTaxa === 'pct' ? 'ex.: 3' : 'ex.: 2.400,00'} />
                            </div>
                        </div>
                        <div><label className={rotulo}>Observação</label><input className={campo} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <label className={rotulo}>Caminhões ({selecionados.length})</label>
                            <div className="flex gap-2 text-xs">
                                <button type="button" className="text-blue-600 hover:underline" onClick={() => { setSelecionados(caminhoes.map((c) => c.id)); setValores(undefined); }}>Todos</button>
                                <button type="button" className="text-blue-600 hover:underline" onClick={() => { setSelecionados([]); setValores(undefined); }}>Nenhum</button>
                                <button type="button" className="text-blue-600 hover:underline disabled:opacity-40" disabled={selecionados.length < 2 || !(v > 0)} onClick={() => setModalDividir(true)}>Valores diferentes</button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {caminhoes.map((c) => (
                                <button key={c.id} type="button" onClick={() => alternar(c.id)}
                                    className={`px-2.5 py-1 rounded-md border text-xs font-bold ${selecionados.includes(c.id) ? `${corPlaca(c.placa)} ring-2 ring-blue-500` : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>{c.placa}</button>
                            ))}
                        </div>
                    </div>

                    {partes.length > 0 && (
                        <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-3 text-sm">
                            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 tabular-nums">
                                <span className="text-xs text-gray-500">Caminhão</span><span className="text-xs text-gray-500 text-right">Receita antecipada</span><span className="text-xs text-gray-500 text-right">Taxa (despesa)</span>
                                {partes.map((p) => (
                                    <div key={p.id} className="contents">
                                        <span><span className={`px-1.5 rounded border text-[11px] font-bold ${corPlaca(p.placa)}`}>{p.placa}</span></span>
                                        <span className="text-right">{moeda(p.valor)}</span>
                                        <span className="text-right text-red-600">{moeda(p.taxa)}</span>
                                    </div>
                                ))}
                                <span className="font-semibold pt-1 border-t border-gray-200 dark:border-gray-700">Total</span>
                                <span className="font-semibold text-right pt-1 border-t border-gray-200 dark:border-gray-700">{moeda(v)}</span>
                                <span className="font-semibold text-right pt-1 border-t border-gray-200 dark:border-gray-700 text-red-600">{moeda(taxa)}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">Conta a Pagar ao credor: <b>{moeda(v + taxa)}</b>{vencimento ? ` com vencimento em ${vencimento.split('-').reverse().join('/')}` : ''}.</p>
                        </div>
                    )}
                    {erro && <p className="text-sm text-red-600">{erro}</p>}
                    <button onClick={salvar} disabled={!pode} className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                        {salvando && <Loader2 size={16} className="animate-spin" />} Lançar antecipação
                    </button>
                </div>

                <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Antecipações lançadas</p>
                    {lista === null && <p className="text-sm text-gray-500"><Loader2 size={14} className="inline animate-spin" /> Carregando…</p>}
                    {lista?.length === 0 && <p className="text-sm text-gray-500">Nenhuma ainda.</p>}
                    <div className="space-y-2">
                        {lista?.map((a) => {
                            const pct = a.valor ? Math.min(100, (a.abatido / a.valor) * 100) : 0;
                            const paga = a.contaPagar?.status === 'PAGA';
                            return (
                                <div key={a.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-sm space-y-2">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-white">{a.credor} · {moeda(a.valor)} <span className="font-normal text-gray-500">+ taxa {moeda(a.taxa)}{a.taxaPercentual != null ? ` (${String(a.taxaPercentual).replace('.', ',')}%)` : ''}</span></p>
                                            <p className="text-xs text-gray-500">Entrou em {dataBR(a.dataRecebimento)} · devolver {moeda(a.valor + a.taxa)} até {dataBR(a.vencimento)} ·{' '}
                                                <span className={paga ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>{paga ? 'devolução paga' : a.contaPagar ? 'devolução em aberto' : 'sem conta a pagar'}</span>
                                            </p>
                                        </div>
                                        <button onClick={() => excluir(a)} className="p-1 text-gray-400 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs text-gray-500"><span>Já abatido nos CT-es recebidos: {moeda(a.abatido)}</span><span>Falta abater: {moeda(a.aAbater)}</span></div>
                                        <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden mt-1"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {a.partes.map((p) => (
                                            <span key={p.id} className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${corPlaca(p.placa)}`} title={`Taxa ${moeda(p.taxa)}`}>
                                                {p.placa} {moeda(p.valor)} · abatido {moeda(p.abatido)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {modalDividir && (
                    <RateioCarretasModal
                        caminhoes={caminhoes.filter((c) => selecionados.includes(c.id))}
                        valorTotal={v}
                        inicial={selecionados}
                        inicialValores={valores}
                        titulo="Quanto da antecipação é de cada caminhão"
                        onConfirmar={(ids, vals) => {
                            if (ids.length) setSelecionados(ids);
                            setValores(vals && vals.length === ids.length ? vals : undefined);
                            setModalDividir(false);
                        }}
                        onFechar={() => setModalDividir(false)}
                    />
                )}
            </div>
        </Modal>
    );
}
