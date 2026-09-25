import { Fragment, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Loader2, CheckCircle2, Trash2, Pencil, Landmark, X, History } from 'lucide-react';
import { api } from '../services/api';
import { Pagination } from '../components/Pagination';

// =============================================================================
// Contas a Pagar — página própria (grupo Financeiro no menu). Lançamento
// manual, já funcional. Quando o sync de NF de Entrada/Serviço (Fases 4/5)
// entrar, as NFs aceitas vão poder gerar conta a pagar automaticamente,
// igual ao fluxo do Controle NF.
// =============================================================================

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const labelClasse = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';

function formatCurrency(value: number | null | undefined) {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

function mesAtual() {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

type Fornecedor = { id: string; nome: string };
type Categoria = { id: string; nome: string };
type Caminhao = { id: string; placa: string };

type ContaPagar = {
    id: string;
    descricao: string;
    valor: number;
    tipo: string;
    formaPagamento: string;
    vencimento: string;
    pagoEm: string | null;
    status: 'ABERTA' | 'PAGA' | 'VENCIDA' | 'CANCELADA' | 'PARCIAL';
    fornecedor: Fornecedor | null;
    categoria: Categoria | null;
    caminhao: Caminhao | null;
    observacao: string | null;
    valorPago?: number;
    saldoDevedor?: number;
};

type Pagamento = {
    id: string;
    valor: number;
    data: string;
    formaPagamento: string | null;
    observacao: string | null;
};

type Resumo = {
    totalAberto: number;
    totalPago: number;
    totalVencido: number;
    quantidadeAberta: number;
    quantidadeVencida: number;
    quantidadeTotal: number;
};

const TIPOS_CONTA = [
    { value: 'BOLETO', label: 'Boleto' },
    { value: 'PIX', label: 'Pix' },
    { value: 'CARTAO', label: 'Cartão' },
    { value: 'SEM_BOLETO', label: 'Sem boleto' },
];

const FORMAS_PAGAMENTO = [
    { value: 'BOLETO', label: 'Boleto' },
    { value: 'PIX', label: 'Pix' },
    { value: 'CARTAO_CREDITO', label: 'Cartão de crédito' },
    { value: 'CARTAO_DEBITO', label: 'Cartão de débito' },
    { value: 'DINHEIRO', label: 'Dinheiro' },
    { value: 'TRANSFERENCIA', label: 'Transferência' },
    { value: 'CONTA_EMPRESA', label: 'Conta da empresa' },
];

export function ContasPagar() {
    const navigate = useNavigate();
    const [mesFiltro, setMesFiltro] = useState(mesAtual());
    const [contas, setContas] = useState<ContaPagar[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [loading, setLoading] = useState(false);
    const [formAberto, setFormAberto] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [editandoId, setEditandoId] = useState<string | null>(null);

    const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);

    const [descricao, setDescricao] = useState('');
    const [valor, setValor] = useState('');
    const [vencimento, setVencimento] = useState(hojeISO());
    const [tipo, setTipo] = useState('BOLETO');
    const [formaPagamento, setFormaPagamento] = useState('BOLETO');
    const [fornecedorNome, setFornecedorNome] = useState('');
    const [categoriaNome, setCategoriaNome] = useState('');
    const [caminhaoId, setCaminhaoId] = useState('');
    const [observacao, setObservacao] = useState('');

    // Registrar pagamento (total ou parcial)
    const [contaPagamento, setContaPagamento] = useState<ContaPagar | null>(null);
    const [pagamentoValor, setPagamentoValor] = useState('');
    const [pagamentoData, setPagamentoData] = useState(hojeISO());
    const [pagamentoForma, setPagamentoForma] = useState('PIX');
    const [registrandoPagamento, setRegistrandoPagamento] = useState(false);

    // Histórico de baixas por conta (expandido por linha)
    const [historicoAbertoId, setHistoricoAbertoId] = useState<string | null>(null);
    const [historicoPagamentos, setHistoricoPagamentos] = useState<Pagamento[]>([]);
    const [carregandoHistorico, setCarregandoHistorico] = useState(false);

    async function carregar(pageAlvo = page, pageSizeAlvo = pageSize) {
        setLoading(true);
        try {
            const [resContas, resResumo] = await Promise.all([
                api.get('/financeiro-nf/contas-pagar', {
                    params: { mes: mesFiltro || undefined, page: pageAlvo, pageSize: pageSizeAlvo },
                }),
                api.get('/financeiro-nf/contas-pagar/resumo', { params: { mes: mesFiltro || undefined } }),
            ]);
            setContas(resContas.data?.items ?? []);
            setTotal(resContas.data?.total ?? 0);
            setPage(resContas.data?.page ?? pageAlvo);
            setPageSize(resContas.data?.pageSize ?? pageSizeAlvo);
            setResumo(resResumo.data ?? null);
        } catch {
            // segue com lista vazia
        } finally {
            setLoading(false);
        }
    }

    function mudarPagina(novaPagina: number) {
        carregar(novaPagina, pageSize);
    }

    function mudarPageSize(novoTamanho: number) {
        carregar(1, novoTamanho);
    }

    async function carregarCadastros() {
        try {
            const [resForn, resCat, resCam] = await Promise.all([
                api.get('/financeiro-nf/fornecedores'),
                api.get('/financeiro-nf/categorias'),
                api.get('/caminhoes'),
            ]);
            setFornecedores(resForn.data ?? []);
            setCategorias(resCat.data ?? []);
            const listaCaminhoes = Array.isArray(resCam.data) ? resCam.data : resCam.data?.data ?? [];
            setCaminhoes(listaCaminhoes);
        } catch {
            // segue vazio
        }
    }

    useEffect(() => {
        carregar(1, pageSize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mesFiltro]);

    useEffect(() => {
        carregarCadastros();
    }, []);

    function limparForm() {
        setDescricao('');
        setValor('');
        setVencimento(hojeISO());
        setTipo('BOLETO');
        setFormaPagamento('BOLETO');
        setFornecedorNome('');
        setCategoriaNome('');
        setCaminhaoId('');
        setObservacao('');
        setEditandoId(null);
    }

    function editar(conta: ContaPagar) {
        setEditandoId(conta.id);
        setDescricao(conta.descricao);
        setValor(String(conta.valor));
        setVencimento(conta.vencimento.slice(0, 10));
        setTipo(conta.tipo);
        setFormaPagamento(conta.formaPagamento);
        setFornecedorNome(conta.fornecedor?.nome ?? '');
        setCategoriaNome(conta.categoria?.nome ?? '');
        setCaminhaoId(conta.caminhao?.id ?? '');
        setObservacao(conta.observacao ?? '');
        setFormAberto(true);
    }

    async function salvar() {
        if (!descricao.trim() || !valor || !vencimento) return;
        setSalvando(true);
        try {
            let fornecedorId: string | undefined;
            let categoriaId: string | undefined;

            if (fornecedorNome.trim()) {
                const res = await api.post('/financeiro-nf/fornecedores/encontrar-ou-criar', { nome: fornecedorNome.trim() });
                fornecedorId = res.data?.id;
            }

            if (categoriaNome.trim()) {
                const res = await api.post('/financeiro-nf/categorias/encontrar-ou-criar', { nome: categoriaNome.trim() });
                categoriaId = res.data?.id;
            }

            const payload = {
                descricao,
                valor: Number(valor),
                vencimento,
                tipo,
                formaPagamento,
                fornecedorId,
                categoriaId,
                caminhaoId: caminhaoId || undefined,
                observacao: observacao || undefined,
            };

            if (editandoId) {
                await api.patch(`/financeiro-nf/contas-pagar/${editandoId}`, payload);
            } else {
                await api.post('/financeiro-nf/contas-pagar', payload);
            }

            limparForm();
            setFormAberto(false);
            carregar();
            carregarCadastros();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Não foi possível salvar a conta.');
        } finally {
            setSalvando(false);
        }
    }

    function abrirPagamento(conta: ContaPagar) {
        const saldo = conta.saldoDevedor ?? conta.valor;
        setContaPagamento(conta);
        setPagamentoValor(saldo.toFixed(2));
        setPagamentoData(hojeISO());
        setPagamentoForma(conta.formaPagamento || 'PIX');
    }

    function fecharPagamento() {
        setContaPagamento(null);
        setPagamentoValor('');
    }

    async function confirmarPagamento() {
        if (!contaPagamento || !pagamentoValor || Number(pagamentoValor) <= 0) return;
        setRegistrandoPagamento(true);
        try {
            await api.post(`/financeiro-nf/contas-pagar/${contaPagamento.id}/pagamentos`, {
                valor: Number(pagamentoValor),
                data: pagamentoData,
                formaPagamento: pagamentoForma,
            });
            fecharPagamento();
            carregar();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Não foi possível registrar o pagamento.');
        } finally {
            setRegistrandoPagamento(false);
        }
    }

    async function alternarHistorico(id: string) {
        if (historicoAbertoId === id) {
            setHistoricoAbertoId(null);
            return;
        }

        setHistoricoAbertoId(id);
        setCarregandoHistorico(true);
        try {
            const res = await api.get(`/financeiro-nf/contas-pagar/${id}/pagamentos`);
            setHistoricoPagamentos(res.data ?? []);
        } catch {
            setHistoricoPagamentos([]);
        } finally {
            setCarregandoHistorico(false);
        }
    }

    async function excluirPagamento(pagamentoId: string, contaId: string) {
        if (!confirm('Excluir essa baixa? O status da conta volta a refletir o valor pendente.')) return;
        try {
            await api.delete(`/financeiro-nf/contas-pagar/pagamentos/${pagamentoId}`);
            const res = await api.get(`/financeiro-nf/contas-pagar/${contaId}/pagamentos`);
            setHistoricoPagamentos(res.data ?? []);
            carregar();
        } catch {
            alert('Não foi possível excluir o pagamento.');
        }
    }

    async function excluir(id: string) {
        if (!confirm('Excluir esta conta a pagar?')) return;
        try {
            await api.delete(`/financeiro-nf/contas-pagar/${id}`);
            carregar();
        } catch {
            alert('Não foi possível excluir.');
        }
    }

    const tonsStatus: Record<string, string> = {
        ABERTA: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
        PAGA: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
        VENCIDA: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
        CANCELADA: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
        PARCIAL: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    };
    const traduzStatus: Record<string, string> = {
        ABERTA: 'Aberta',
        PAGA: 'Paga',
        VENCIDA: 'Vencida',
        CANCELADA: 'Cancelada',
        PARCIAL: 'Parcial',
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contas a Pagar</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Lançamentos manuais de contas da empresa.
                </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <label className={labelClasse}>Mês</label>
                    <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} className={campoClasse} />
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('/financeiro-nf/contas-pagar/conciliar')}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    >
                        <Landmark size={16} />
                        Conciliar com banco
                    </button>

                    <button
                        onClick={() => { limparForm(); setFormAberto((v) => !v); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                    >
                        <Plus size={16} />
                        Nova Conta
                    </button>
                </div>
            </div>

            {resumo && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <p className="text-xs text-gray-400">Em aberto</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(resumo.totalAberto)}</p>
                        <p className="text-xs text-gray-400">{resumo.quantidadeAberta} conta{resumo.quantidadeAberta === 1 ? '' : 's'}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <p className="text-xs text-gray-400">Vencidas</p>
                        <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(resumo.totalVencido)}</p>
                        <p className="text-xs text-gray-400">{resumo.quantidadeVencida} conta{resumo.quantidadeVencida === 1 ? '' : 's'}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <p className="text-xs text-gray-400">Pago no mês</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(resumo.totalPago)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <p className="text-xs text-gray-400">Total de contas</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{resumo.quantidadeTotal}</p>
                    </div>
                </div>
            )}

            {formAberto && (
                <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                        {editandoId ? 'Editar conta' : 'Nova conta a pagar'}
                    </h3>

                    <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClasse}>Descrição *</label>
                            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={campoClasse} placeholder="Ex: Manutenção do caminhão QPM" />
                        </div>
                        <div>
                            <label className={labelClasse}>Valor (R$) *</label>
                            <input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} className={campoClasse} placeholder="0,00" />
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                            <label className={labelClasse}>Vencimento *</label>
                            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campoClasse} />
                        </div>
                        <div>
                            <label className={labelClasse}>Tipo</label>
                            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campoClasse}>
                                {TIPOS_CONTA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelClasse}>Forma de pagamento</label>
                            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className={campoClasse}>
                                {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                            <label className={labelClasse}>Fornecedor</label>
                            <input
                                list="fornecedores-lista"
                                value={fornecedorNome}
                                onChange={(e) => setFornecedorNome(e.target.value)}
                                className={campoClasse}
                                placeholder="Digite ou escolha"
                            />
                            <datalist id="fornecedores-lista">
                                {fornecedores.map((f) => <option key={f.id} value={f.nome} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className={labelClasse}>Categoria</label>
                            <input
                                list="categorias-lista"
                                value={categoriaNome}
                                onChange={(e) => setCategoriaNome(e.target.value)}
                                className={campoClasse}
                                placeholder="Digite ou escolha"
                            />
                            <datalist id="categorias-lista">
                                {categorias.map((c) => <option key={c.id} value={c.nome} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className={labelClasse}>Caminhão</label>
                            <select value={caminhaoId} onChange={(e) => setCaminhaoId(e.target.value)} className={campoClasse}>
                                <option value="">Não vinculado</option>
                                {caminhoes.map((c) => <option key={c.id} value={c.id}>{c.placa}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className={labelClasse}>Observação</label>
                        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} className={campoClasse} rows={2} />
                    </div>

                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setFormAberto(false); limparForm(); }} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                            Cancelar
                        </button>
                        <button
                            onClick={salvar}
                            disabled={salvando || !descricao.trim() || !valor || !vencimento}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            {salvando && <Loader2 size={14} className="animate-spin" />}
                            Salvar
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                {loading ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
                ) : contas.length === 0 ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Nenhuma conta nesse mês.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2.5 px-4 font-medium">Descrição</th>
                                    <th className="py-2.5 px-4 font-medium">Fornecedor</th>
                                    <th className="py-2.5 px-4 font-medium">Categoria</th>
                                    <th className="py-2.5 px-4 font-medium">Vencimento</th>
                                    <th className="py-2.5 px-4 font-medium">Valor</th>
                                    <th className="py-2.5 px-4 font-medium">Status</th>
                                    <th className="py-2.5 px-4 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {contas.map((c) => (
                                    <Fragment key={c.id}>
                                        <tr className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300">
                                            <td className="py-2.5 px-4">
                                                <p className="font-semibold text-gray-900 dark:text-white">{c.descricao}</p>
                                                {c.caminhao && (
                                                    <Link
                                                        to={`/caminhoes/${encodeURIComponent(c.caminhao.placa)}`}
                                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        🚚 {c.caminhao.placa}
                                                    </Link>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-4">{c.fornecedor?.nome ?? '-'}</td>
                                            <td className="py-2.5 px-4">{c.categoria?.nome ?? '-'}</td>
                                            <td className="py-2.5 px-4 whitespace-nowrap">{new Date(c.vencimento).toLocaleDateString('pt-BR')}</td>
                                            <td className="py-2.5 px-4">
                                                <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(c.valor)}</p>
                                                {c.status === 'PARCIAL' && (
                                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                                        Pago {formatCurrency(c.valorPago)} · falta {formatCurrency(c.saldoDevedor)}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tonsStatus[c.status]}`}>
                                                    {traduzStatus[c.status]}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <div className="flex items-center gap-2">
                                                    {c.status !== 'PAGA' && c.status !== 'CANCELADA' && (
                                                        <button onClick={() => abrirPagamento(c)} title="Registrar pagamento" className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 transition">
                                                            <CheckCircle2 size={16} />
                                                        </button>
                                                    )}
                                                    {(c.status === 'PAGA' || c.status === 'PARCIAL') && (
                                                        <button onClick={() => alternarHistorico(c.id)} title="Ver baixas" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                                                            <History size={16} />
                                                        </button>
                                                    )}
                                                    <button onClick={() => editar(c)} title="Editar" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button onClick={() => excluir(c.id)} title="Excluir" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {historicoAbertoId === c.id && (
                                            <tr key={`${c.id}-historico`} className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800">
                                                <td colSpan={7} className="py-3 px-4">
                                                    {carregandoHistorico ? (
                                                        <p className="text-xs text-gray-400">Carregando baixas...</p>
                                                    ) : historicoPagamentos.length === 0 ? (
                                                        <p className="text-xs text-gray-400">Nenhuma baixa registrada.</p>
                                                    ) : (
                                                        <div className="space-y-1.5">
                                                            {historicoPagamentos.map((p) => (
                                                                <div key={p.id} className="flex items-center justify-between text-xs bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5">
                                                                    <span className="text-gray-700 dark:text-gray-300">
                                                                        {new Date(p.data).toLocaleDateString('pt-BR')} — {formatCurrency(p.valor)}
                                                                        {p.formaPagamento ? ` · ${p.formaPagamento}` : ''}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => excluirPagamento(p.id, c.id)}
                                                                        title="Excluir baixa"
                                                                        className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                        <Pagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPageChange={mudarPagina}
                            onPageSizeChange={mudarPageSize}
                        />
                    </div>
                )}
            </div>

            {contaPagamento && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Registrar pagamento</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{contaPagamento.descricao}</p>
                            </div>
                            <button onClick={fecharPagamento} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2">
                            Valor total: <strong>{formatCurrency(contaPagamento.valor)}</strong>
                            {(contaPagamento.valorPago ?? 0) > 0 && (
                                <> · Já pago: <strong>{formatCurrency(contaPagamento.valorPago)}</strong></>
                            )}
                            <> · Saldo devedor: <strong>{formatCurrency(contaPagamento.saldoDevedor ?? contaPagamento.valor)}</strong></>
                        </div>

                        <p className="text-xs text-gray-400 -mt-2">
                            Se a pessoa não pagou tudo, digite só o valor pago agora — a conta fica "Parcial" e o restante continua em aberto pra uma próxima baixa.
                        </p>

                        <div>
                            <label className={labelClasse}>Valor pago agora (R$) *</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={contaPagamento.saldoDevedor ?? contaPagamento.valor}
                                value={pagamentoValor}
                                onChange={(e) => setPagamentoValor(e.target.value)}
                                className={campoClasse}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelClasse}>Data</label>
                                <input type="date" value={pagamentoData} onChange={(e) => setPagamentoData(e.target.value)} className={campoClasse} />
                            </div>
                            <div>
                                <label className={labelClasse}>Forma</label>
                                <select value={pagamentoForma} onChange={(e) => setPagamentoForma(e.target.value)} className={campoClasse}>
                                    {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <button onClick={fecharPagamento} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                                Cancelar
                            </button>
                            <button
                                onClick={confirmarPagamento}
                                disabled={registrandoPagamento || !pagamentoValor || Number(pagamentoValor) <= 0}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
                            >
                                {registrandoPagamento && <Loader2 size={14} className="animate-spin" />}
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
