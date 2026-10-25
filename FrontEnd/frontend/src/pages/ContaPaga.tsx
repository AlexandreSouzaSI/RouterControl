import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText, Link2, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { api } from '../services/api';
import { AbasContas } from '../components/AbasContas';
import { useAuth } from '../context/AuthContext';

// =============================================================================
// Registrar Pagamentos — quem pagou (ex: proprietário) avisa o pagamento com valor +
// fornecedor e/ou comprovante. O financeiro concilia na aba "A conciliar":
// vincula a uma conta a pagar (dá baixa) ou só marca como lançado na planilha.
// =============================================================================

const campo =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';

const moeda = (v: number | null | undefined) =>
    (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (v: string) => new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
const hojeISO = () => new Date().toISOString().slice(0, 10);

type Aviso = {
    id: string;
    fornecedor: string;
    valor: number;
    dataPagamento: string;
    descricao: string | null;
    avisadoPorNome: string | null;
    status: 'PENDENTE' | 'CONCILIADO' | 'DESCARTADO';
    conciliadoPor: string | null;
    temComprovante: boolean;
    observacaoFinanceiro: string | null;
    createdAt: string;
};

type Sugestao = {
    pontos: number;
    conta: { id: string; descricao: string; vencimento: string; saldoDevedor: number; fornecedor: { nome: string } | null };
};

export function ContaPaga() {
    const { usuario } = useAuth();
    const podeLink = !!usuario?.isAdminMaster || usuario?.perfil === 'ADMIN';
    const [token, setToken] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);
    const urlLink = token ? `${window.location.origin}/avisar/${token}` : '';

    useEffect(() => {
        if (podeLink) api.get('/financeiro-nf/pagamentos-avisados/link').then((r) => setToken(r.data.token)).catch(() => { });
    }, [podeLink]);

    async function gerarLink() {
        if (token && !confirm('Gerar um novo link vai desativar o anterior. Continuar?')) return;
        const r = await api.post('/financeiro-nf/pagamentos-avisados/link');
        setToken(r.data.token);
    }

    async function desativarLink() {
        if (!confirm('Desativar o link? Quem tem o link deixa de conseguir enviar.')) return;
        await api.delete('/financeiro-nf/pagamentos-avisados/link');
        setToken(null);
    }

    async function copiar() {
        await navigator.clipboard.writeText(urlLink);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
    }

    const [aba, setAba] = useState<'avisar' | 'conciliar'>('avisar');
    const [itens, setItens] = useState<Aviso[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [filtro, setFiltro] = useState<'PENDENTE' | 'CONCILIADO'>('PENDENTE');

    const [fornecedor, setFornecedor] = useState('');
    const [valor, setValor] = useState('');
    const [data, setData] = useState(hojeISO());
    const [descricao, setDescricao] = useState('');
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [abertoId, setAbertoId] = useState<string | null>(null);
    const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
    const [obs, setObs] = useState('');

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await api.get('/financeiro-nf/pagamentos-avisados', { params: { status: filtro } });
            setItens(r.data);
        } finally {
            setCarregando(false);
        }
    }, [filtro]);

    useEffect(() => { carregar(); }, [carregar]);

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        setMsg(null);
        setEnviando(true);
        try {
            const fd = new FormData();
            fd.append('fornecedor', fornecedor);
            fd.append('valor', valor);
            fd.append('data', data);
            fd.append('descricao', descricao);
            if (arquivo) fd.append('file', arquivo);
            await api.post('/financeiro-nf/pagamentos-avisados', fd);
            setFornecedor(''); setValor(''); setDescricao(''); setArquivo(null); setData(hojeISO());
            setMsg('Pagamento enviado ao financeiro.');
            carregar();
        } catch (err: any) {
            setMsg(err?.response?.data?.message ?? 'Não foi possível enviar.');
        } finally {
            setEnviando(false);
        }
    }

    async function verComprovante(id: string) {
        const r = await api.get(`/financeiro-nf/pagamentos-avisados/${id}/comprovante`, { responseType: 'blob' });
        window.open(URL.createObjectURL(r.data), '_blank');
    }

    async function abrir(id: string) {
        if (abertoId === id) { setAbertoId(null); return; }
        setAbertoId(id); setObs(''); setSugestoes([]);
        const r = await api.get(`/financeiro-nf/pagamentos-avisados/${id}/sugestoes`);
        setSugestoes(r.data);
    }

    async function conciliar(id: string, contaPagarId?: string) {
        try {
            await api.patch(`/financeiro-nf/pagamentos-avisados/${id}/conciliar`, { contaPagarId, observacao: obs });
            setAbertoId(null);
            carregar();
        } catch (err: any) {
            alert(err?.response?.data?.message ?? 'Não foi possível conciliar.');
        }
    }

    async function descartar(id: string) {
        if (!confirm('Descartar este aviso?')) return;
        await api.patch(`/financeiro-nf/pagamentos-avisados/${id}/descartar`);
        carregar();
    }

    return (
        <div className="space-y-5 max-w-3xl">
            <AbasContas ativa="paga" />
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Registrar Pagamentos</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Avise um pagamento já feito (valor ou comprovante). O financeiro concilia depois.{' '}
                    <Link to="/financeiro-nf/contas-pagar" className="text-blue-600 hover:underline">Ir para Contas a Pagar</Link>
                </p>
            </div>

            <div className="flex gap-2">
                {([['avisar', 'Avisar pagamento'], ['conciliar', 'A conciliar']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setAba(v)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${aba === v ? 'bg-blue-600 text-white' : 'bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300'}`}>
                        {l}
                    </button>
                ))}
            </div>

            {podeLink && (
                <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Link para o proprietário (sem login)</p>
                    <p className="text-xs text-gray-500">Mande por WhatsApp. Quem abrir só consegue enviar comprovantes — não vê mais nada do sistema.</p>
                    {token && (
                        <div className="flex gap-2">
                            <input readOnly value={urlLink} className={campo} onFocus={(e) => e.target.select()} />
                            <button onClick={copiar} className="px-3 rounded-lg bg-blue-600 text-white text-sm whitespace-nowrap">{copiado ? 'Copiado!' : 'Copiar'}</button>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button onClick={gerarLink} className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200">
                            {token ? 'Gerar novo link' : 'Gerar link'}
                        </button>
                        {token && <button onClick={desativarLink} className="text-xs px-3 py-2 rounded-lg text-red-500">Desativar</button>}
                    </div>
                </div>
            )}

            {aba === 'avisar' && (
                <form onSubmit={enviar} className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
                    <input className={campo} placeholder="Fornecedor / quem recebeu" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
                    <div className="grid grid-cols-2 gap-3">
                        <input className={campo} placeholder="Valor pago (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                        <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
                    </div>
                    <input className={campo} placeholder="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                    <label className="flex items-center gap-2 px-3 py-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                        <Paperclip size={16} />
                        {arquivo ? arquivo.name : 'Anexar comprovante (foto ou PDF)'}
                        <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                    </label>
                    <p className="text-xs text-gray-400">Com o comprovante anexado, fornecedor e valor são opcionais.</p>
                    {msg && <p className="text-sm text-blue-600">{msg}</p>}
                    <button disabled={enviando} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60">
                        {enviando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Enviar ao financeiro
                    </button>
                </form>
            )}

            {aba === 'conciliar' && (
                <div className="space-y-3">
                    <div className="flex gap-2 text-xs">
                        {([['PENDENTE', 'Pendentes'], ['CONCILIADO', 'Conciliados']] as const).map(([v, l]) => (
                            <button key={v} onClick={() => setFiltro(v)}
                                className={`px-3 py-1.5 rounded-full ${filtro === v ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{l}</button>
                        ))}
                    </div>

                    {carregando && <p className="text-sm text-gray-400">Carregando...</p>}
                    {!carregando && itens.length === 0 && (
                        <p className="text-sm text-gray-400 bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center">Nenhum aviso aqui.</p>
                    )}

                    {itens.map((a) => (
                        <div key={a.id} className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 dark:text-white">{a.fornecedor}</p>
                                    <p className="text-xs text-gray-500">
                                        {dataBR(a.dataPagamento)} · avisado por {a.avisadoPorNome ?? '—'}{a.descricao ? ` · ${a.descricao}` : ''}
                                    </p>
                                </div>
                                <p className="font-bold text-gray-900 dark:text-white whitespace-nowrap">{a.valor > 0 ? moeda(a.valor) : 'ver comprovante'}</p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                {a.temComprovante && (
                                    <button onClick={() => verComprovante(a.id)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                                        <FileText size={14} /> Comprovante
                                    </button>
                                )}
                                {a.status === 'PENDENTE' ? (
                                    <>
                                        <button onClick={() => abrir(a.id)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white">
                                            <Link2 size={14} /> Conciliar
                                        </button>
                                        <button onClick={() => descartar(a.id)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-red-500">
                                            <Trash2 size={14} /> Descartar
                                        </button>
                                    </>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                        <CheckCircle2 size={14} /> Conciliado{a.conciliadoPor ? ` por ${a.conciliadoPor}` : ''}
                                        {a.observacaoFinanceiro ? ` — ${a.observacaoFinanceiro}` : ''}
                                    </span>
                                )}
                            </div>

                            {abertoId === a.id && (
                                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                                    <p className="text-xs font-semibold text-gray-500">Contas a pagar parecidas (dá baixa no valor pago):</p>
                                    {sugestoes.length === 0 && <p className="text-xs text-gray-400">Nenhuma conta em aberto parecida.</p>}
                                    {sugestoes.map((s) => (
                                        <div key={s.conta.id} className="flex items-center justify-between gap-2 text-sm">
                                            <div className="min-w-0">
                                                <p className="truncate text-gray-900 dark:text-white">{s.conta.descricao}</p>
                                                <p className="text-xs text-gray-500">{dataBR(s.conta.vencimento)} · saldo {moeda(s.conta.saldoDevedor)}</p>
                                            </div>
                                            <button onClick={() => conciliar(a.id, s.conta.id)} className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white whitespace-nowrap">Baixar esta</button>
                                        </div>
                                    ))}
                                    <input className={campo} placeholder="Observação (ex: lançado na planilha linha 123)" value={obs} onChange={(e) => setObs(e.target.value)} />
                                    <button onClick={() => conciliar(a.id)} className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200">
                                        Só marcar como conciliado (sem vincular conta)
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
