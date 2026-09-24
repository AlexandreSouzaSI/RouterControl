import { useEffect, useState } from 'react';
import { Plus, Loader2, CheckCircle2, Trash2, Pencil } from 'lucide-react';
import { api } from '../services/api';

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
    status: 'ABERTA' | 'PAGA' | 'VENCIDA' | 'CANCELADA';
    fornecedor: Fornecedor | null;
    categoria: Categoria | null;
    caminhao: Caminhao | null;
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
    const [mesFiltro, setMesFiltro] = useState(mesAtual());
    const [contas, setContas] = useState<ContaPagar[]>([]);
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

    async function carregar() {
        setLoading(true);
        try {
            const [resContas, resResumo] = await Promise.all([
                api.get('/financeiro-nf/contas-pagar', { params: { mes: mesFiltro || undefined } }),
                api.get('/financeiro-nf/contas-pagar/resumo', { params: { mes: mesFiltro || undefined } }),
            ]);
            setContas(resContas.data ?? []);
            setResumo(resResumo.data ?? null);
        } catch {
            // segue com lista vazia
        } finally {
            setLoading(false);
        }
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
        carregar();
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

    async function marcarPaga(id: string) {
        try {
            await api.patch(`/financeiro-nf/contas-pagar/${id}/pagar`, { pagoEm: hojeISO() });
            carregar();
        } catch {
            alert('Não foi possível marcar como paga.');
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
    };
    const traduzStatus: Record<string, string> = {
        ABERTA: 'Aberta',
        PAGA: 'Paga',
        VENCIDA: 'Vencida',
        CANCELADA: 'Cancelada',
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

                <button
                    onClick={() => { limparForm(); setFormAberto((v) => !v); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                >
                    <Plus size={16} />
                    Nova Conta
                </button>
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
                                    <tr key={c.id} className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300">
                                        <td className="py-2.5 px-4">
                                            <p className="font-semibold text-gray-900 dark:text-white">{c.descricao}</p>
                                            {c.caminhao && <p className="text-xs text-gray-400">{c.caminhao.placa}</p>}
                                        </td>
                                        <td className="py-2.5 px-4">{c.fornecedor?.nome ?? '-'}</td>
                                        <td className="py-2.5 px-4">{c.categoria?.nome ?? '-'}</td>
                                        <td className="py-2.5 px-4 whitespace-nowrap">{new Date(c.vencimento).toLocaleDateString('pt-BR')}</td>
                                        <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white">{formatCurrency(c.valor)}</td>
                                        <td className="py-2.5 px-4">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tonsStatus[c.status]}`}>
                                                {traduzStatus[c.status]}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="flex items-center gap-2">
                                                {c.status !== 'PAGA' && (
                                                    <button onClick={() => marcarPaga(c.id)} title="Marcar como paga" className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 transition">
                                                        <CheckCircle2 size={16} />
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
