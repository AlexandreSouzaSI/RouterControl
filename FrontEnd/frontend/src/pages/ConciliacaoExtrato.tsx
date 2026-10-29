import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Link2, Loader2, Pin, RefreshCw, Save, Trash2, Undo2, Upload, Wand2, X } from 'lucide-react';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { corPlaca } from '../lib/corPlaca';
import { nomeMes } from '../lib/mes';
import { ClassificadorExtrato } from '../components/ClassificadorExtrato';
import { FIXOS, moeda, totaisExtrato, type CaminhaoOpcao, type ItemExtrato, type Parte } from '../lib/extrato';

// =============================================================================
// Financeiro → Conciliação do Extrato. Sobe o extrato do mês, o sistema já
// separa o que é de cada placa; o resto se classifica aqui ou por um link.
// "Aplicar nos caminhões" lança as despesas na tela de Caminhões (no mês).
// =============================================================================

type Resumo = {
    id: string; mes: string; banco: string | null; arquivos: string[]; totalPagamentos: number; nPagamentos: number;
    status: 'ABERTA' | 'APLICADA'; pendenteReaplicar: boolean; aplicadoEm: string | null; linkEnviadoEm: string | null; linkEnviadoPor: string | null;
    createdAt: string; pendentes: number; valorPendente: number;
};
type Vinculo = { id: string; termo: string; tipo: 'PLACA' | 'NOME'; destino: string };
type Detalhe = Resumo & {
    totalRecebimentos: number; nRecebimentos: number; saldoAnterior: number | null; saldoFinal: number | null;
    token: string | null; aplicadoPor: string | null; itens: ItemExtrato[]; caminhoes: CaminhaoOpcao[]; vinculos: Vinculo[];
    lancados: { quantidade: number; total: number };
};

const cartao = 'bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-xl';
const botao = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50';
const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const erroMsg = (e: any, padrao: string) => e?.response?.data?.message ?? padrao;

// ------------------------------------------------------------------ lista
export function ConciliacaoExtrato() {
    const nav = useNavigate();
    const [lista, setLista] = useState<Resumo[] | null>(null);
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const carregar = useCallback(() => {
        api.get('/financeiro-nf/conciliacao-extrato').then((r) => setLista(r.data ?? [])).catch(() => setLista([]));
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    async function importar() {
        if (!arquivos.length) return;
        setErro(null); setEnviando(true);
        try {
            const fd = new FormData();
            arquivos.forEach((f) => fd.append('files', f));
            const r = await api.post('/financeiro-nf/conciliacao-extrato/importar', fd);
            if (r.data.avisos?.length) alert(r.data.avisos.join('\n\n'));
            nav(`/financeiro-nf/conciliacao-extrato/${r.data.id}`);
        } catch (e: any) {
            setErro(erroMsg(e, 'Não foi possível ler o extrato.'));
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Conciliação do Extrato</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Envie o extrato do mês. O sistema separa o que é de cada placa; o resto você classifica aqui ou manda por link.
                    No fim, &quot;Aplicar nos caminhões&quot; lança as despesas na tela de <Link to="/caminhoes" className="text-blue-600 hover:underline">Caminhões</Link>.
                </p>
            </div>

            <div className={`${cartao} p-4 space-y-3`}>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Importar extrato do mês</p>
                <p className="text-xs text-gray-500">
                    Mande os <b>dois</b> arquivos do Sicredi juntos: o <b>Extrato</b> completo (.xls — fecha o total do mês, com boletos e tarifas)
                    e o relatório de <b>Movimentações PIX</b> (.xlsx — traz a descrição de cada Pix, onde ficam as placas).
                </p>
                <label className="flex items-center gap-2 px-3 py-4 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 cursor-pointer hover:border-blue-400">
                    <Upload size={16} />
                    {arquivos.length ? arquivos.map((f) => f.name).join(' + ') : 'Escolher arquivo(s) .xls / .xlsx'}
                    <input type="file" multiple accept=".xls,.xlsx" className="hidden" onChange={(e) => setArquivos(Array.from(e.target.files ?? []).slice(0, 2))} />
                </label>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
                <button onClick={importar} disabled={!arquivos.length || enviando} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
                    {enviando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Importar e classificar
                </button>
            </div>

            <div className={`${cartao} overflow-x-auto`}>
                <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-gray-800">
                        <tr><th className="px-4 py-2">Mês</th><th className="px-4 py-2">Arquivos</th><th className="px-4 py-2 text-right">Saídas</th><th className="px-4 py-2 text-right">Pendente</th><th className="px-4 py-2">Situação</th><th /></tr>
                    </thead>
                    <tbody>
                        {lista === null && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500"><Loader2 className="inline animate-spin" size={16} /></td></tr>}
                        {lista?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Nenhum extrato importado ainda.</td></tr>}
                        {lista?.map((c) => (
                            <tr key={c.id} onClick={() => nav(`/financeiro-nf/conciliacao-extrato/${c.id}`)} className="border-b last:border-0 border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                                <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{nomeMes(c.mes)}</td>
                                <td className="px-4 py-3 text-xs text-gray-500">{c.arquivos.join(' + ')}<div>importado {dataHora(c.createdAt)}</div></td>
                                <td className="px-4 py-3 text-right tabular-nums">{moeda(c.totalPagamentos)}<div className="text-xs text-gray-500">{c.nPagamentos} pagamentos</div></td>
                                <td className="px-4 py-3 text-right tabular-nums">{c.pendentes ? <span className="text-amber-600">{moeda(c.valorPendente)}<div className="text-xs">{c.pendentes} itens</div></span> : <span className="text-emerald-600">—</span>}</td>
                                <td className="px-4 py-3"><Situacao c={c} /></td>
                                <td className="px-4 py-3 text-right text-blue-600 text-xs">Abrir →</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Situacao({ c }: { c: Pick<Resumo, 'status' | 'pendenteReaplicar' | 'aplicadoEm' | 'linkEnviadoEm'> }) {
    if (c.status === 'APLICADA' && c.pendenteReaplicar) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Alterada — aplicar de novo</span>;
    if (c.status === 'APLICADA') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Aplicada{c.aplicadoEm ? ` ${dataHora(c.aplicadoEm)}` : ''}</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Em conciliação{c.linkEnviadoEm ? ' · link respondido' : ''}</span>;
}

// ---------------------------------------------------------------- detalhe
export function ConciliacaoExtratoDetalhe() {
    const { id } = useParams();
    const nav = useNavigate();
    const [d, setD] = useState<Detalhe | null>(null);
    const [itens, setItens] = useState<ItemExtrato[]>([]);
    const [alterados, setAlterados] = useState<Set<string>>(new Set());
    const [pendentesBase, setPendentesBase] = useState<Set<string>>(new Set());
    const [desvinc, setDesvinc] = useState<Set<string>>(new Set());
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);
    const [modalAplicar, setModalAplicar] = useState(false);
    const [vinculoDe, setVinculoDe] = useState<ItemExtrato | null | 'lista'>(null);

    const carregar = useCallback(async () => {
        const r = await api.get(`/financeiro-nf/conciliacao-extrato/${id}`);
        const det = r.data as Detalhe;
        setD(det);
        const lista = det.itens.map((i) => ({ ...i, partes: (i.partes as Parte[]) ?? [] }));
        setItens(lista);
        // "Pendentes" = o que estava pendente quando salvou/carregou.
        setPendentesBase(new Set(lista.filter((i) => !i.partes.length).map((i) => i.id)));
        setAlterados(new Set());
        setDesvinc(new Set());
    }, [id]);
    useEffect(() => { carregar().catch(() => setD(null)); }, [carregar]);

    // Atualiza sozinho quando volta pra aba (ex.: o link acabou de ser respondido), se não houver nada por salvar.
    useEffect(() => {
        const f = () => { if (!alterados.size && document.visibilityState === 'visible') carregar().catch(() => { }); };
        document.addEventListener('visibilitychange', f);
        return () => document.removeEventListener('visibilitychange', f);
    }, [alterados, carregar]);

    useEffect(() => {
        const f = (e: BeforeUnloadEvent) => { if (alterados.size) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', f);
        return () => window.removeEventListener('beforeunload', f);
    }, [alterados]);

    const onChange = useCallback((itemId: string, mud: { partes?: Parte[]; nota?: string }) => {
        setItens((l) => l.map((i) => (i.id === itemId ? { ...i, ...(mud.partes !== undefined ? { partes: mud.partes, origem: mud.partes.length ? 'MANUAL' : null, motivo: null } : {}), ...(mud.nota !== undefined ? { nota: mud.nota } : {}) } : i)));
        setAlterados((s) => new Set(s).add(itemId));
    }, []);

    const onDesvincular = useCallback((itemId: string) => {
        setItens((l) => l.map((i) => (i.id === itemId ? { ...i, contaPagar: null } : i)));
        setDesvinc((s) => new Set(s).add(itemId));
        setAlterados((s) => new Set(s).add(itemId));
    }, []);

    async function salvar(silencioso = false) {
        if (!alterados.size) return true;
        setOcupado('salvar');
        try {
            const payload = itens.filter((i) => alterados.has(i.id)).map((i) => ({ id: i.id, partes: i.partes, nota: i.nota ?? '', ...(desvinc.has(i.id) ? { desvincular: true } : {}) }));
            await api.patch(`/financeiro-nf/conciliacao-extrato/${id}/itens`, { itens: payload });
            await carregar();
            return true;
        } catch (e: any) {
            alert(erroMsg(e, 'Não foi possível salvar.'));
            return false;
        } finally {
            setOcupado(null);
            if (!silencioso) setCopiado(false);
        }
    }

    async function acao(nome: string, fn: () => Promise<unknown>) {
        setOcupado(nome);
        try { await fn(); } catch (e: any) { alert(erroMsg(e, 'Não foi possível concluir.')); } finally { setOcupado(null); }
    }

    const urlLink = d?.token ? `${window.location.origin}/conciliar-extrato/${d.token}` : '';
    const t = useMemo(() => totaisExtrato(itens), [itens]);

    if (!d) return <div className="py-16 text-center text-gray-500"><Loader2 className="inline animate-spin" /> Carregando…</div>;

    // No Aplicar só entra o que ainda não está em Contas a Pagar.
    const tNovos = totaisExtrato(itens.filter((i) => !i.contaPagar));
    const jaEmContas = Math.round(itens.filter((i) => i.contaPagar).reduce((s, i) => s + i.valor, 0) * 100) / 100;
    const resumoCaminhoes = d.caminhoes.map((c) => ({ ...c, v: tNovos.por[c.id]?.tot ?? 0, n: tNovos.por[c.id]?.n ?? 0 })).filter((c) => c.v > 0);
    const totalCaminhoes = Math.round(resumoCaminhoes.reduce((s, c) => s + c.v, 0) * 100) / 100;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link to="/financeiro-nf/conciliacao-extrato" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"><ArrowLeft size={14} /> Conciliações</Link>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Extrato {nomeMes(d.mes)}</h1>
                    <p className="text-xs text-gray-500">{d.banco ?? ''} · {d.arquivos.join(' + ')} · <Situacao c={d} /></p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => salvar()} disabled={!alterados.size || !!ocupado} className={`${botao} ${alterados.size ? '!bg-blue-600 !text-white !border-blue-600' : ''}`}>
                        {ocupado === 'salvar' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar{alterados.size ? ` (${alterados.size})` : ''}
                    </button>
                    <button onClick={() => setModalAplicar(true)} disabled={!!ocupado} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                        <CheckCircle2 size={15} /> {d.status === 'APLICADA' ? 'Aplicar de novo' : 'Aplicar nos caminhões'}
                    </button>
                </div>
            </div>

            {d.linkEnviadoEm && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-500/10 dark:border-violet-500/30 px-4 py-2 text-sm text-violet-800 dark:text-violet-200">
                    Classificação recebida pelo link{d.linkEnviadoPor ? ` (${d.linkEnviadoPor})` : ''} em {dataHora(d.linkEnviadoEm)}. Os itens marcados &quot;pelo link&quot; já estão nos cards — confira e dê OK em &quot;Aplicar nos caminhões&quot;.
                </div>
            )}
            {d.status === 'APLICADA' && d.pendenteReaplicar && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <AlertTriangle size={16} /> A classificação mudou depois de aplicada. Clique em &quot;Aplicar de novo&quot; para atualizar as despesas dos caminhões.
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className={`${cartao} p-3 space-y-2 lg:col-span-2 min-w-0`}>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Link2 size={15} /> Link para classificar (sem login)</p>
                    <p className="text-xs text-gray-500">Quem abrir vê só os pagamentos deste extrato e pode classificar e enviar. O que for enviado aparece aqui na hora.</p>
                    {d.token ? (
                        <div className="flex gap-2">
                            <input readOnly value={urlLink} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200" />
                            <button onClick={() => { navigator.clipboard?.writeText(urlLink); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }} className="px-3 rounded-lg bg-blue-600 text-white text-sm whitespace-nowrap">{copiado ? 'Copiado!' : 'Copiar'}</button>
                            <button onClick={() => acao('link', async () => { if (confirm('Desativar o link? Quem estiver com ele não consegue mais enviar.')) { await api.delete(`/financeiro-nf/conciliacao-extrato/${id}/link`); await carregar(); } })} className="px-2 text-xs text-red-500">Desativar</button>
                        </div>
                    ) : (
                        <button onClick={() => acao('link', async () => { if (!(await salvar(true))) return; await api.post(`/financeiro-nf/conciliacao-extrato/${id}/link`); await carregar(); })} disabled={!!ocupado} className={botao}>
                            <Link2 size={15} /> Gerar link
                        </button>
                    )}
                </div>
                <div className={`${cartao} p-3 space-y-2 min-w-0`}>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Ferramentas</p>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setVinculoDe('lista')} className={botao}><Pin size={15} /> Vínculos ({d.vinculos.length})</button>
                        <button onClick={() => acao('auto', async () => { if (!(await salvar(true))) return; const r = await api.post(`/financeiro-nf/conciliacao-extrato/${id}/reclassificar`); await carregar(); alert(`${r.data.classificados} pagamento(s) classificados automaticamente.`); })} disabled={!!ocupado} className={botao} title="Refaz os automáticos e os pendentes com as placas e vínculos de agora. Não mexe no que você ou o link classificaram.">
                            <Wand2 size={15} /> Reclassificar automático
                        </button>
                        <button onClick={() => { if (alterados.size && !confirm('Descartar as alterações não salvas?')) return; carregar(); }} className={botao}><RefreshCw size={15} /> Atualizar</button>
                        {d.status === 'APLICADA' && (
                            <button onClick={() => acao('desfazer', async () => { if (confirm('Tirar as despesas deste extrato da tela de Caminhões?')) { await api.post(`/financeiro-nf/conciliacao-extrato/${id}/desfazer`); await carregar(); } })} className={botao}><Undo2 size={15} /> Desfazer aplicação</button>
                        )}
                        <button onClick={() => acao('excluir', async () => { if (confirm(`Excluir esta conciliação?${d.lancados.quantidade ? ` As ${d.lancados.quantidade} despesas lançadas nos caminhões também saem.` : ''}`)) { await api.delete(`/financeiro-nf/conciliacao-extrato/${id}`); nav('/financeiro-nf/conciliacao-extrato'); } })} className={`${botao} !text-red-600`}><Trash2 size={15} /> Excluir</button>
                    </div>
                    {d.status === 'APLICADA' && <p className="text-xs text-gray-500">Nos caminhões: {d.lancados.quantidade} despesas · {moeda(d.lancados.total)}</p>}
                </div>
            </div>

            <ClassificadorExtrato
                itens={itens}
                caminhoes={d.caminhoes}
                totalPagamentos={d.totalPagamentos}
                nPagamentos={d.nPagamentos}
                totalRecebimentos={d.totalRecebimentos}
                saldoAnterior={d.saldoAnterior}
                saldoFinal={d.saldoFinal}
                alterados={alterados}
                onChange={onChange}
                onDesvincular={onDesvincular}
                pendentesBase={pendentesBase}
                onVincular={(it) => setVinculoDe(it)}
            />

            {modalAplicar && (
                <Modal onFechar={() => setModalAplicar(false)}>
                    <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="font-semibold text-gray-900 dark:text-white">Aplicar nos caminhões — {nomeMes(d.mes)}</p>
                            <button onClick={() => setModalAplicar(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
                        </div>
                        <p className="text-sm text-gray-500">Estas despesas vão entrar na tela de cada caminhão, no mês do pagamento.{d.status === 'APLICADA' ? ' As que já tinham sido lançadas por esta conciliação são substituídas.' : ''}</p>
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {resumoCaminhoes.map((c) => (
                                <div key={c.id} className="flex items-center justify-between py-1.5 text-sm">
                                    <span className={`px-2 py-0.5 rounded border text-xs font-bold ${corPlaca(c.placa)}`}>{c.placa}</span>
                                    <span className="tabular-nums text-gray-900 dark:text-white">{moeda(c.v)} <span className="text-xs text-gray-500">({c.n})</span></span>
                                </div>
                            ))}
                            <div className="flex items-center justify-between py-2 text-sm font-bold text-gray-900 dark:text-white"><span>Total nos caminhões</span><span className="tabular-nums">{moeda(totalCaminhoes)}</span></div>
                        </div>
                        <p className="text-xs text-gray-500">
                            Não entram: {Object.entries(FIXOS).map(([k, f]) => `${f.curto} ${moeda(t.por[k]?.tot ?? 0)}`).join(' · ')}{jaEmContas > 0 ? ` · já em Contas a Pagar (já contam no caminhão) ${moeda(jaEmContas)}` : ''}.
                        </p>
                        {t.nPend > 0 && (
                            <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> Ainda há {t.nPend} pagamentos pendentes ({moeda(t.pendente)}). Eles ficam de fora até serem classificados — dá pra aplicar de novo depois.</p>
                        )}
                        <button disabled={!!ocupado} onClick={() => acao('aplicar', async () => {
                            if (!(await salvar(true))) return;
                            const r = await api.post(`/financeiro-nf/conciliacao-extrato/${id}/aplicar`);
                            setModalAplicar(false);
                            await carregar();
                            alert(`Pronto: ${r.data.lancamentos} despesas (${moeda(r.data.total)}) lançadas nos caminhões.`);
                        })} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                            {ocupado === 'aplicar' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} OK, lançar nos caminhões
                        </button>
                    </div>
                </Modal>
            )}

            {vinculoDe && (
                <VinculosModal
                    caminhoes={d.caminhoes}
                    vinculos={d.vinculos}
                    item={vinculoDe === 'lista' ? null : vinculoDe}
                    onFechar={() => setVinculoDe(null)}
                    onMudou={async () => {
                        const r = await api.get('/financeiro-nf/conciliacao-extrato/vinculos/lista');
                        setD((x) => (x ? { ...x, vinculos: r.data } : x));
                    }}
                />
            )}
        </div>
    );
}

// --------------------------------------------------------------- vínculos
function VinculosModal({ caminhoes, vinculos, item, onFechar, onMudou }: {
    caminhoes: CaminhaoOpcao[]; vinculos: Vinculo[]; item: ItemExtrato | null; onFechar: () => void; onMudou: () => Promise<void>;
}) {
    const sugestaoTermo = item ? item.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/\s+/).slice(0, 3).join(' ') : '';
    const [termo, setTermo] = useState(sugestaoTermo);
    const [tipo, setTipo] = useState<'NOME' | 'PLACA'>('NOME');
    const [destino, setDestino] = useState(item?.partes.length === 1 && item.partes[0].k !== 'JA_LANCADO' ? item.partes[0].k : '');
    const [erro, setErro] = useState<string | null>(null);
    const [lote, setLote] = useState('');
    const [resLote, setResLote] = useState<{ salvos: number; erros: string[] } | null>(null);

    async function salvarLote() {
        setResLote(null);
        try {
            const r = await api.post('/financeiro-nf/conciliacao-extrato/vinculos/lote', { texto: lote });
            setResLote(r.data);
            if (!r.data.erros.length) setLote('');
            await onMudou();
        } catch (e: any) { setResLote({ salvos: 0, erros: [erroMsg(e, 'Não foi possível salvar.')] }); }
    }
    const rotulo = (k: string) => caminhoes.find((c) => c.id === k)?.placa ?? FIXOS[k]?.curto ?? '(caminhão removido)';
    const campo = 'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white';

    async function salvar() {
        setErro(null);
        try {
            await api.post('/financeiro-nf/conciliacao-extrato/vinculos', { termo, tipo, destino });
            setTermo(''); await onMudou();
        } catch (e: any) { setErro(erroMsg(e, 'Não foi possível salvar.')); }
    }

    return (
        <Modal onFechar={onFechar}>
            <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900 dark:text-white">Vínculos automáticos</p>
                    <button onClick={onFechar} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
                </div>
                <p className="text-xs text-gray-500">
                    Ensine o sistema uma vez e ele usa todo mês. <b>Placa</b>: carreta ou apelido citado na descrição (ex.: <i>FQA → POZ</i>).
                    <b> Nome</b>: nome no extrato ou na descrição (ex.: <i>GIOVANNI → POZ</i>, <i>NU GALHO → Sócios</i>). Vale para os próximos extratos e para o botão &quot;Reclassificar automático&quot;.
                </p>
                {item && <p className="text-xs rounded-lg bg-gray-50 dark:bg-gray-900 px-3 py-2 text-gray-600 dark:text-gray-300">Pagamento: <b>{item.nome}</b> {item.descricao && `— ${item.descricao}`}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr_150px_auto] gap-2">
                    <select value={tipo} onChange={(e) => setTipo(e.target.value as 'NOME' | 'PLACA')} className={campo}>
                        <option value="NOME">Nome</option>
                        <option value="PLACA">Placa</option>
                    </select>
                    <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder={tipo === 'PLACA' ? 'Ex: FQA ou FQA4231' : 'Ex: GIOVANNI'} className={campo} />
                    <select value={destino} onChange={(e) => setDestino(e.target.value)} className={campo}>
                        <option value="">Vai para…</option>
                        {caminhoes.map((c) => <option key={c.id} value={c.id}>{c.placa}</option>)}
                        <option value="GERAL">Geral / empresa</option>
                        <option value="SOCIO">Sócios / proprietários</option>
                        <option value="NAO">Não é despesa</option>
                    </select>
                    <button onClick={salvar} disabled={termo.trim().length < 3 || !destino} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Salvar</button>
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
                {!item && (
                    <details className="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2">
                        <summary className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer">Colar vários de uma vez</summary>
                        <p className="text-xs text-gray-500 mt-2">Um por linha: <code>TERMO → DESTINO</code> (também vale <code>=</code> ou <code>;</code>). Destino = placa do caminhão, <code>GERAL</code>, <code>SOCIOS</code> ou <code>NAO</code>. Linha começando com # é ignorada.</p>
                        <textarea value={lote} onChange={(e) => setLote(e.target.value)} rows={8} placeholder={'FQA → POZ\nGJP → POZ\nGIOVANNI → POZ\nNU GALHO → SOCIOS'}
                            className="mt-2 w-full px-3 py-2 rounded-lg text-sm font-mono bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" />
                        <button onClick={salvarLote} disabled={!lote.trim()} className="mt-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Salvar todos</button>
                        {resLote && (
                            <div className="mt-2 text-xs space-y-0.5">
                                <p className="text-emerald-600 font-semibold">{resLote.salvos} vínculo(s) salvos.</p>
                                {resLote.erros.map((er) => <p key={er} className="text-red-600">{er}</p>)}
                            </div>
                        )}
                    </details>
                )}
                <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-72 overflow-y-auto">
                    {vinculos.length === 0 && <p className="text-sm text-gray-500 py-3">Nenhum vínculo ainda.</p>}
                    {vinculos.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 py-1.5 text-sm">
                            <span className="w-14 text-[10px] uppercase text-gray-400">{v.tipo === 'PLACA' ? 'Placa' : 'Nome'}</span>
                            <span className="flex-1 font-semibold text-gray-900 dark:text-white">{v.termo}</span>
                            <span className="text-gray-400">→</span>
                            <span className={`px-2 py-0.5 rounded border text-xs font-bold ${FIXOS[v.destino]?.cor ?? corPlaca(rotulo(v.destino))}`}>{rotulo(v.destino)}</span>
                            <button onClick={async () => { await api.delete(`/financeiro-nf/conciliacao-extrato/vinculos/${v.id}`); await onMudou(); }} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}
