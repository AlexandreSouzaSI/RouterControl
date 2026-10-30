import { Fragment, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Landmark, Loader2, CheckCircle2, Trash2, Pencil, Undo2, X, FileUp, HandCoins } from 'lucide-react';
import { FiltroMes } from '../components/FiltroMes';
import { ImportarCteModal } from '../components/ImportarCteModal';
import { AntecipacoesModal } from '../components/AntecipacoesModal';
import { nomeMes } from '../lib/mes';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import { corPlaca, COR_GERAL } from '../lib/corPlaca';
import { RateioCarretasModal, EtiquetaRateio } from '../components/RateioCarretasModal';

// =============================================================================
// Contas a Receber — mesmo estilo de Contas a Pagar: cards por período, cards
// por carreta, filtros, seleção em massa (carreta) e baixa de recebimento.
// =============================================================================

const campo =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const rotulo = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';
const CARRETAS = ['POZ', 'QPM', 'RFX', 'RME', 'SEV', 'SEZ', 'SYR', 'TCF'];

const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeISO = () => new Date().toISOString().slice(0, 10);
const dataBR = (v: string) => new Date(v).toLocaleDateString('pt-BR');

type Conta = {
    id: string;
    descricao: string;
    cliente: string | null;
    valor: number;
    vencimento: string;
    status: 'ABERTA' | 'RECEBIDA' | 'CANCELADA';
    recebidoEm: string | null;
    valorRecebido: number | null;
    observacao: string | null;
    motorista: string | null;
    cte: string | null;
    banco: string | null;
    dataEmissao: string | null;
    referencia: string | null;
    comercial: string | null;
    caminhao: { id: string; placa: string } | null;
    rateios?: { caminhaoId: string; valor: number; caminhao?: { placa: string } }[];
};
type Bloco = { quantidade: number; valor: number };
type Dash = { hoje: Bloco; semana: Bloco; mes: Bloco; vencidas: Bloco };
type Gasto = { caminhaoId: string; placa: string; recebido: number; aberto: number; quantidade: number };

function prazo(c: Conta) {
    if (c.status === 'RECEBIDA') return { texto: 'Recebida', tom: 'text-green-600 dark:text-green-400' };
    const h = new Date(); h.setHours(0, 0, 0, 0);
    const v = new Date(c.vencimento); v.setHours(0, 0, 0, 0);
    const dias = Math.round((v.getTime() - h.getTime()) / 86400000);
    if (dias < 0) return { texto: `Atrasada há ${-dias} dia${dias === -1 ? '' : 's'}`, tom: 'text-red-600 dark:text-red-400 font-semibold' };
    if (dias === 0) return { texto: 'Vence hoje', tom: 'text-amber-600 dark:text-amber-400 font-semibold' };
    return { texto: `Em ${dias} dia${dias === 1 ? '' : 's'}`, tom: 'text-gray-400' };
}

export function ContasReceber() {
    const navigate = useNavigate();
    const [contas, setContas] = useState<Conta[]>([]);
    const [total, setTotal] = useState(0);
    const [somaFiltro, setSomaFiltro] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [loading, setLoading] = useState(false);
    const [dash, setDash] = useState<Dash | null>(null);
    const [gastos, setGastos] = useState<Gasto[]>([]);
    const [caminhoes, setCaminhoes] = useState<{ id: string; placa: string }[]>([]);

    const [periodo, setPeriodo] = useState('');
    const [situacao, setSituacao] = useState<'abertas' | 'recebidas' | 'todas'>('abertas');
    const [busca, setBusca] = useState('');
    const [de, setDe] = useState('');
    const [ate, setAte] = useState('');
    const [valorMin, setValorMin] = useState('');
    const [valorMax, setValorMax] = useState('');
    const [filtroCaminhao, setFiltroCaminhao] = useState('');
    // '' = todos os meses; AAAA-MM = só aquele mês (recebidas pela data do recebimento, abertas pelo vencimento)
    const [mes, setMes] = useState('');
    const [importarAberto, setImportarAberto] = useState(false);
    const [antecipacoesAberto, setAntecipacoesAberto] = useState(false);

    const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
    const [massaCaminhao, setMassaCaminhao] = useState('');
    const [aplicando, setAplicando] = useState(false);
    const [modalRateio, setModalRateio] = useState(false);

    async function ratear(caminhaoIds: string[], valores?: number[]) {
        try {
            await api.patch('/financeiro-nf/contas-receber/ratear', { ids: Array.from(selecionadas), caminhaoIds, valores });
            setModalRateio(false);
            setSelecionadas(new Set());
            await carregar();
        } catch (err: any) {
            alert(err?.response?.data?.message ?? 'Não foi possível dividir.');
        }
    }

    // formulário
    const [formAberto, setFormAberto] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [fDescricao, setFDescricao] = useState('');
    const [fCliente, setFCliente] = useState('');
    const [fValor, setFValor] = useState('');
    const [fVenc, setFVenc] = useState(hojeISO());
    const [fCaminhao, setFCaminhao] = useState('');
    const [fObs, setFObs] = useState('');
    const [fMotorista, setFMotorista] = useState('');
    const [fCte, setFCte] = useState('');
    const [fBanco, setFBanco] = useState('');
    const [fEmissao, setFEmissao] = useState('');
    const [fReferencia, setFReferencia] = useState('');
    const [fComercial, setFComercial] = useState('');
    const [salvando, setSalvando] = useState(false);

    // receber
    const [recebendo, setRecebendo] = useState<Conta | null>(null);
    const [rValor, setRValor] = useState('');
    const [rData, setRData] = useState(hojeISO());

    async function carregar(pg = page, ps = pageSize) {
        setLoading(true);
        try {
            const [rc, rd] = await Promise.all([
                api.get('/financeiro-nf/contas-receber', {
                    params: {
                        situacao, periodo: periodo || undefined, busca: busca.trim() || undefined,
                        de: de || undefined, ate: ate || undefined, valorMin: valorMin || undefined, valorMax: valorMax || undefined,
                        caminhaoId: filtroCaminhao || undefined, mes: mes || undefined, page: pg, pageSize: ps,
                    },
                }),
                api.get('/financeiro-nf/contas-receber/dashboard', { params: { mes: mes || undefined } }),
            ]);
            setContas(rc.data?.items ?? []);
            setTotal(rc.data?.total ?? 0);
            setSomaFiltro(rc.data?.somaFiltro ?? 0);
            setPage(rc.data?.page ?? pg);
            setPageSize(rc.data?.pageSize ?? ps);
            setDash(rd.data ?? null);
            api.get('/financeiro-nf/contas-receber/por-caminhao', { params: { mes: mes || undefined } }).then((r) => setGastos(r.data ?? [])).catch(() => setGastos([]));
        } catch {
            // lista vazia
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        api.get('/caminhoes')
            .then((r) => setCaminhoes((Array.isArray(r.data) ? r.data : r.data?.data ?? []).filter((c: any) => c.placa)))
            .catch(() => { });
    }, []);

    useEffect(() => {
        const t = setTimeout(() => carregar(1, pageSize), busca ? 350 : 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodo, situacao, busca, de, ate, valorMin, valorMax, filtroCaminhao, mes]);

    function abrirNova() {
        setEditId(null); setFDescricao(''); setFCliente(''); setFValor(''); setFVenc(hojeISO()); setFCaminhao(''); setFObs('');
        setFMotorista(''); setFCte(''); setFBanco(''); setFEmissao(''); setFReferencia(''); setFComercial('');
        setFormAberto(true);
    }
    function abrirEditar(c: Conta) {
        setEditId(c.id); setFDescricao(c.descricao); setFCliente(c.cliente ?? ''); setFValor(String(c.valor).replace('.', ','));
        setFVenc(c.vencimento.slice(0, 10)); setFCaminhao(c.caminhao?.id ?? ''); setFObs(c.observacao ?? '');
        setFMotorista(c.motorista ?? ''); setFCte(c.cte ?? ''); setFBanco(c.banco ?? ''); setFEmissao(c.dataEmissao?.slice(0, 10) ?? '');
        setFReferencia(c.referencia ?? ''); setFComercial(c.comercial ?? '');
        setFormAberto(true);
    }

    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        setSalvando(true);
        try {
            const corpo = {
                descricao: fDescricao, cliente: fCliente, valor: fValor, vencimento: fVenc,
                caminhaoId: fCaminhao || (editId ? 'GERAL' : undefined), observacao: fObs,
                motorista: fMotorista, cte: fCte, banco: fBanco, dataEmissao: fEmissao, referencia: fReferencia, comercial: fComercial,
            };
            if (editId) await api.patch(`/financeiro-nf/contas-receber/${editId}`, corpo);
            else await api.post('/financeiro-nf/contas-receber', corpo);
            setFormAberto(false);
            await carregar();
        } catch (err: any) {
            alert(err?.response?.data?.message ?? 'Não foi possível salvar.');
        } finally {
            setSalvando(false);
        }
    }

    async function confirmarRecebimento() {
        if (!recebendo) return;
        try {
            await api.post(`/financeiro-nf/contas-receber/${recebendo.id}/receber`, { valor: rValor, data: rData });
            setRecebendo(null);
            await carregar();
        } catch (err: any) {
            alert(err?.response?.data?.message ?? 'Não foi possível registrar.');
        }
    }

    async function desfazer(id: string) {
        if (!confirm('Voltar esta conta para "a receber"?')) return;
        await api.post(`/financeiro-nf/contas-receber/${id}/desfazer`);
        carregar();
    }

    async function excluir(id: string) {
        if (!confirm('Excluir esta conta a receber?')) return;
        await api.delete(`/financeiro-nf/contas-receber/${id}`);
        carregar();
    }

    async function aplicarMassa() {
        if (!massaCaminhao || selecionadas.size === 0) return;
        setAplicando(true);
        try {
            await api.patch('/financeiro-nf/contas-receber/editar-em-massa', { ids: Array.from(selecionadas), caminhaoId: massaCaminhao });
            setSelecionadas(new Set());
            setMassaCaminhao('');
            await carregar();
        } catch (err: any) {
            alert(err?.response?.data?.message ?? 'Não foi possível editar.');
        } finally {
            setAplicando(false);
        }
    }

    function alternar(id: string) {
        setSelecionadas((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    }

    const cards = [
        { chave: 'hoje', titulo: 'Hoje', tom: 'text-amber-600 dark:text-amber-400', borda: 'border-amber-400' },
        { chave: 'semana', titulo: 'Esta semana', tom: 'text-blue-600 dark:text-blue-400', borda: 'border-blue-500' },
        { chave: 'mes', titulo: 'Este mês', tom: 'text-gray-900 dark:text-white', borda: 'border-gray-500' },
        { chave: 'vencidas', titulo: 'Atrasadas', tom: 'text-red-600 dark:text-red-400', borda: 'border-red-500' },
    ] as const;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contas a Receber</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Valores que clientes devem pagar. Clique em um card para filtrar e marque as caixinhas para atribuir a carreta em massa.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                <button onClick={() => navigate('/financeiro-nf/contas-receber/conciliar')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium">
                    <Landmark size={16} /> Conciliar com banco
                </button>
                <button onClick={() => setImportarAberto(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium">
                    <FileUp size={16} /> Importar XML de CT-e
                </button>
                <button onClick={() => setAntecipacoesAberto(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium">
                    <HandCoins size={16} /> Antecipação de recebíveis
                </button>
                {antecipacoesAberto && <AntecipacoesModal caminhoes={caminhoes} onFechar={() => setAntecipacoesAberto(false)} />}
                <button onClick={abrirNova} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
                    <Plus size={16} /> Nova Conta a Receber
                </button>
                </div>
            </div>

            <ImportarCteModal aberto={importarAberto} onFechar={() => setImportarAberto(false)} onImportado={() => carregar(1, pageSize)} />

            <FiltroMes
                mes={mes}
                onChange={(m) => { setPeriodo(''); if (m) setSituacao('todas'); setMes(m); }}
                dica={mes ? 'Toda a página mostra só os CT-e/contas emitidos neste mês (sem data de emissão, vale o vencimento).' : undefined}
            />

            {dash && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {cards.map((b) => {
                        const bloco = dash[b.chave];
                        const ativo = periodo === b.chave;
                        return (
                            <button key={b.chave} type="button" onClick={() => setPeriodo(ativo ? '' : b.chave)}
                                className={`p-4 rounded-xl bg-white dark:bg-[#111827] border text-left transition ${ativo ? `${b.borda} ring-2 ring-offset-0` : 'border-gray-200 dark:border-gray-800'}`}>
                                <p className="text-xs text-gray-400">{b.titulo}</p>
                                <p className={`text-lg font-bold ${b.tom}`}>{moeda(bloco.valor)}</p>
                                <p className="text-xs text-gray-400">{bloco.quantidade} conta{bloco.quantidade === 1 ? '' : 's'}</p>
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="space-y-2">
                <p className="text-xs text-gray-400">
                    Por carreta {mes ? <>— <strong className="text-gray-700 dark:text-gray-200">{nomeMes(mes)}</strong></> : '— todos os meses'} (clique para filtrar; "Gerais" mostra todas)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {CARRETAS.map((cod) => {
                        const cam = caminhoes.find((c) => c.placa.toUpperCase().includes(cod));
                        const g = cam ? gastos.find((x) => x.caminhaoId === cam.id) : undefined;
                        const ativo = !!cam && filtroCaminhao === cam.id;
                        return (
                            <button key={cod} type="button" disabled={!cam}
                                onClick={() => { if (cam) { setPeriodo(''); setFiltroCaminhao(ativo ? '' : cam.id); } }}
                                className={`p-3 rounded-xl border text-left transition disabled:opacity-50 ${corPlaca(cod)} ${ativo ? 'ring-2 ring-blue-500' : ''}`}>
                                <p className="text-xs font-bold">🚚 {cod}</p>
                                <p className="text-sm font-bold">{moeda((g?.recebido ?? 0) + (g?.aberto ?? 0))}</p>
                                <p className="text-[10px] opacity-80">recebido {moeda(g?.recebido ?? 0)} · a receber {moeda(g?.aberto ?? 0)}</p>
                            </button>
                        );
                    })}
                    {(() => {
                        const todos = gastos.reduce((t, g) => ({ rec: t.rec + g.recebido, ab: t.ab + g.aberto }), { rec: 0, ab: 0 });
                        const ativo = filtroCaminhao === '';
                        return (
                            <button type="button" onClick={() => { setPeriodo(''); setFiltroCaminhao(''); }}
                                className={`p-3 rounded-xl border text-left ${COR_GERAL} ${ativo ? 'ring-2 ring-blue-500' : ''}`}>
                                <p className="text-xs font-bold">Gerais (todas)</p>
                                <p className="text-sm font-bold">{moeda(todos.rec + todos.ab)}</p>
                                <p className="text-[10px] opacity-80">recebido {moeda(todos.rec)} · a receber {moeda(todos.ab)}</p>
                            </button>
                        );
                    })()}
                    {(() => {
                        const g = gastos.find((x) => x.caminhaoId === 'GERAL');
                        const ativo = filtroCaminhao === 'GERAL';
                        return (
                            <button type="button" onClick={() => { setPeriodo(''); setFiltroCaminhao(ativo ? '' : 'GERAL'); }}
                                className={`p-3 rounded-xl border text-left ${COR_GERAL} ${ativo ? 'ring-2 ring-blue-500' : ''}`}>
                                <p className="text-xs font-bold">Sem carreta</p>
                                <p className="text-sm font-bold">{moeda((g?.recebido ?? 0) + (g?.aberto ?? 0))}</p>
                                <p className="text-[10px] opacity-80">recebido {moeda(g?.recebido ?? 0)} · a receber {moeda(g?.aberto ?? 0)}</p>
                            </button>
                        );
                    })()}
                </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-3">
                <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="lg:col-span-2">
                        <label className={rotulo}>Buscar (descrição, cliente, CTE, referência, placa)</label>
                        <input value={busca} onChange={(e) => { setPeriodo(''); setBusca(e.target.value); }} className={campo} placeholder="Ex: cliente, CTE, referência, placa..." />
                    </div>
                    <div><label className={rotulo}>Vencimento de</label><input type="date" value={de} onChange={(e) => { setPeriodo(''); setDe(e.target.value); }} className={campo} /></div>
                    <div><label className={rotulo}>até</label><input type="date" value={ate} onChange={(e) => { setPeriodo(''); setAte(e.target.value); }} className={campo} /></div>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className={rotulo}>Valor mín.</label><input type="number" min="0" value={valorMin} onChange={(e) => setValorMin(e.target.value)} className={campo} /></div>
                        <div><label className={rotulo}>Valor máx.</label><input type="number" min="0" value={valorMax} onChange={(e) => setValorMax(e.target.value)} className={campo} /></div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {(['abertas', 'recebidas', 'todas'] as const).map((s) => (
                        <button key={s} type="button" onClick={() => { setPeriodo(''); setSituacao(s); }}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${!periodo && situacao === s ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                            {s === 'abertas' ? 'A receber' : s === 'recebidas' ? 'Recebidas' : 'Todas'}
                        </button>
                    ))}
                    <span className="ml-auto text-sm text-gray-500">
                        {total} conta{total === 1 ? '' : 's'} · <strong className="text-gray-900 dark:text-white">{moeda(somaFiltro)}</strong>
                    </span>
                </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 overflow-hidden">
                {selecionadas.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/30">
                        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">{selecionadas.size} selecionada{selecionadas.size > 1 ? 's' : ''} — carreta:</span>
                        <select value={massaCaminhao} onChange={(e) => setMassaCaminhao(e.target.value)}
                            className="px-2 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0B1120] text-gray-900 dark:text-white">
                            <option value="">Escolha...</option>
                            <option value="GERAL">Geral (todas)</option>
                            {caminhoes.map((c) => <option key={c.id} value={c.id}>{c.placa}</option>)}
                        </select>
                        <button type="button" onClick={() => setModalRateio(true)} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-white">Dividir entre carretas</button>
                        <button disabled={!massaCaminhao || aplicando} onClick={aplicarMassa} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white disabled:opacity-50">Aplicar</button>
                        <button onClick={() => setSelecionadas(new Set())} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300">Limpar</button>
                    </div>
                )}

                {loading ? (
                    <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
                ) : contas.length === 0 ? (
                    <p className="p-10 text-center text-sm text-gray-400">Nenhuma conta encontrada.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2.5 pl-4 pr-1 w-8">
                                        <input type="checkbox" checked={contas.length > 0 && selecionadas.size === contas.length}
                                            onChange={() => setSelecionadas(selecionadas.size === contas.length ? new Set() : new Set(contas.map((c) => c.id)))} />
                                    </th>
                                    <th className="py-2.5 px-4 font-medium">Descrição</th>
                                    <th className="py-2.5 px-4 font-medium">Cliente</th>
                                    <th className="py-2.5 px-4 font-medium">Motorista</th>
                                    <th className="py-2.5 px-4 font-medium">CTE</th>
                                    <th className="py-2.5 px-4 font-medium">Banco</th>
                                    <th className="py-2.5 px-4 font-medium">Referência</th>
                                    <th className="py-2.5 px-4 font-medium">Vencimento</th>
                                    <th className="py-2.5 px-4 font-medium">Valor</th>
                                    <th className="py-2.5 px-4 font-medium">Status</th>
                                    <th className="py-2.5 px-4 font-medium" />
                                </tr>
                            </thead>
                            <tbody>
                                {contas.map((c) => (
                                    <Fragment key={c.id}>
                                        <tr className="border-b border-gray-50 dark:border-gray-800/60">
                                            <td className="py-2.5 pl-4 pr-1"><input type="checkbox" checked={selecionadas.has(c.id)} onChange={() => alternar(c.id)} /></td>
                                            <td className="py-2.5 px-4">
                                                <p className="font-semibold text-gray-900 dark:text-white">{c.descricao}</p>
                                                {(c.rateios?.length ?? 0) >= 2 ? (
                                                    <EtiquetaRateio rateios={c.rateios} />
                                                ) : c.caminhao ? (
                                                    <Link to={`/caminhoes/${encodeURIComponent(c.caminhao.placa)}`}
                                                        className={`inline-block mt-0.5 px-2 py-0.5 rounded border text-xs font-bold hover:opacity-80 ${corPlaca(c.caminhao.placa)}`}>
                                                        🚚 {c.caminhao.placa}
                                                    </Link>
                                                ) : (
                                                    <span className={`inline-block mt-0.5 px-2 py-0.5 rounded border text-xs ${COR_GERAL}`}>Geral</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-4">
                                                {c.cliente ?? '-'}
                                                {c.comercial && <p className="text-[10px] uppercase text-gray-400">{c.comercial}</p>}
                                            </td>
                                            <td className="py-2.5 px-4 whitespace-nowrap">{c.motorista ?? '-'}</td>
                                            <td className="py-2.5 px-4">{c.cte ?? '-'}</td>
                                            <td className="py-2.5 px-4">{c.banco ?? '-'}</td>
                                            <td className="py-2.5 px-4 text-xs">{c.referencia ?? '-'}</td>
                                            <td className="py-2.5 px-4 whitespace-nowrap">
                                                <p>{dataBR(c.vencimento)}</p>
                                                <p className={`text-xs ${prazo(c).tom}`}>{prazo(c).texto}</p>
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <p className="font-semibold text-gray-900 dark:text-white">{moeda(c.valor)}</p>
                                                {c.status === 'RECEBIDA' && c.valorRecebido != null && Math.abs(c.valorRecebido - c.valor) > 0.01 && (
                                                    <p className="text-xs text-amber-600">Recebido {moeda(c.valorRecebido)}</p>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'RECEBIDA' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'}`}>
                                                    {c.status === 'RECEBIDA' ? 'Recebida' : 'A receber'}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <div className="flex items-center gap-2 justify-end">
                                                    {c.status === 'ABERTA' ? (
                                                        <button title="Registrar recebimento" onClick={() => { setRecebendo(c); setRValor(String(c.valor).replace('.', ',')); setRData(hojeISO()); }}
                                                            className="text-green-600 hover:text-green-700"><CheckCircle2 size={18} /></button>
                                                    ) : (
                                                        <button title="Desfazer recebimento" onClick={() => desfazer(c.id)} className="text-amber-600"><Undo2 size={18} /></button>
                                                    )}
                                                    <button title="Editar" onClick={() => abrirEditar(c)} className="text-gray-500 hover:text-blue-600"><Pencil size={16} /></button>
                                                    <button title="Excluir" onClick={() => excluir(c.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                        <Pagination page={page} pageSize={pageSize} total={total}
                            onPageChange={(p) => carregar(p, pageSize)} onPageSizeChange={(s) => carregar(1, s)} />
                    </div>
                )}
            </div>

            {modalRateio && (
                <RateioCarretasModal
                    caminhoes={caminhoes}
                    valorTotal={selecionadas.size === 1 ? contas.find((c) => selecionadas.has(c.id))?.valor : undefined}
                    inicial={(() => { const u = selecionadas.size === 1 ? contas.find((c) => selecionadas.has(c.id)) : undefined; return (u?.rateios?.length ?? 0) >= 2 ? u!.rateios!.map((r) => r.caminhaoId) : u?.caminhao?.id ? [u.caminhao.id] : []; })()}
                    inicialValores={(() => { const u = selecionadas.size === 1 ? contas.find((c) => selecionadas.has(c.id)) : undefined; return (u?.rateios?.length ?? 0) >= 2 ? u!.rateios!.map((r) => r.valor) : undefined; })()}
                    titulo={`Dividir ${selecionadas.size} conta${selecionadas.size > 1 ? 's' : ''} entre carretas`}
                    onConfirmar={ratear}
                    onFechar={() => setModalRateio(false)}
                />
            )}

            {formAberto && (
                <Modal onFechar={() => setFormAberto(false)} className="z-50 bg-black/50">
                    <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="font-semibold text-gray-900 dark:text-white">{editId ? 'Editar conta a receber' : 'Nova conta a receber'}</p>
                            <button type="button" onClick={() => setFormAberto(false)}><X size={18} /></button>
                        </div>
                        <div><label className={rotulo}>Descrição *</label><input required className={campo} value={fDescricao} onChange={(e) => setFDescricao(e.target.value)} placeholder="Ex: Frete Contagem → SP" /></div>
                        <div><label className={rotulo}>Cliente</label><input className={campo} value={fCliente} onChange={(e) => setFCliente(e.target.value)} /></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className={rotulo}>Valor (R$) *</label><input required className={campo} inputMode="decimal" value={fValor} onChange={(e) => setFValor(e.target.value)} /></div>
                            <div><label className={rotulo}>Vencimento *</label><input required type="date" className={campo} value={fVenc} onChange={(e) => setFVenc(e.target.value)} /></div>
                        </div>
                        <div>
                            <label className={rotulo}>Carreta (opcional — vazio = geral)</label>
                            <select className={campo} value={fCaminhao} onChange={(e) => setFCaminhao(e.target.value)}>
                                <option value="">Geral (todas)</option>
                                {caminhoes.map((c) => <option key={c.id} value={c.id}>{c.placa}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className={rotulo}>Motorista / placa do cavalo</label><input className={campo} value={fMotorista} onChange={(e) => setFMotorista(e.target.value)} placeholder="QNQ-0F40, FROTA, TERCEIRO" /></div>
                            <div><label className={rotulo}>CTE</label><input className={campo} value={fCte} onChange={(e) => setFCte(e.target.value)} /></div>
                            <div><label className={rotulo}>Banco</label><input className={campo} value={fBanco} onChange={(e) => setFBanco(e.target.value)} placeholder="SICREDI" /></div>
                            <div><label className={rotulo}>Data de emissão</label><input type="date" className={campo} value={fEmissao} onChange={(e) => setFEmissao(e.target.value)} /></div>
                            <div><label className={rotulo}>Referência</label><input className={campo} value={fReferencia} onChange={(e) => setFReferencia(e.target.value)} /></div>
                            <div><label className={rotulo}>Comercial</label><input className={campo} value={fComercial} onChange={(e) => setFComercial(e.target.value)} /></div>
                        </div>
                        <div><label className={rotulo}>Observação</label><input className={campo} value={fObs} onChange={(e) => setFObs(e.target.value)} /></div>
                        <button disabled={salvando} className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60">
                            {salvando ? 'Salvando...' : 'Salvar'}
                        </button>
                    </form>
                </Modal>
            )}

            {recebendo && (
                <Modal onFechar={() => setRecebendo(null)} className="z-50 bg-black/50">
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-3">
                        <p className="font-semibold text-gray-900 dark:text-white">Registrar recebimento</p>
                        <p className="text-xs text-gray-500">{recebendo.descricao} · {moeda(recebendo.valor)}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className={rotulo}>Valor recebido</label><input className={campo} inputMode="decimal" value={rValor} onChange={(e) => setRValor(e.target.value)} /></div>
                            <div><label className={rotulo}>Data</label><input type="date" className={campo} value={rData} onChange={(e) => setRData(e.target.value)} /></div>
                        </div>
                        <button onClick={confirmarRecebimento} className="w-full py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold">Confirmar</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
