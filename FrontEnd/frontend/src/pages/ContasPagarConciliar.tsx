import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, FileUp, Landmark, Loader2 } from 'lucide-react';
import { api } from '../services/api';

// =============================================================================
// Conciliação bancária da Conta a Pagar — importa o extrato (.ofx) do banco
// e deixa o usuário vincular cada saída a uma conta em aberto, confirmando
// a baixa. Mesmo fluxo da tela equivalente do Controle NF
// (frontend/app/bills/reconcile/page.tsx), adaptado ao stack do Rota
// (React Router + Vite, sem AutocompleteInput — select nativo já resolve).
// =============================================================================

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';

function formatCurrency(value: number | null | undefined) {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string) {
    return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}

type Fornecedor = { id: string; nome: string };
type Categoria = { id: string; nome: string };

type ContaPagar = {
    id: string;
    descricao: string;
    valor: number;
    vencimento: string;
    status: 'ABERTA' | 'PAGA' | 'VENCIDA' | 'CANCELADA';
    fornecedor: Fornecedor | null;
    categoria: Categoria | null;
};

type OfxTransaction = {
    fitId: string;
    type: string;
    postedAt: string;
    amount: number;
    description: string;
};

type RowStatus = 'PENDING' | 'CONFIRMED' | 'IGNORED';

export function ContasPagarConciliar() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [contasAbertas, setContasAbertas] = useState<ContaPagar[]>([]);
    const [carregandoContas, setCarregandoContas] = useState(true);
    const [enviando, setEnviando] = useState(false);

    const [transacoes, setTransacoes] = useState<OfxTransaction[]>([]);
    const [contaSelecionada, setContaSelecionada] = useState<Record<string, string>>({});
    const [statusLinha, setStatusLinha] = useState<Record<string, RowStatus>>({});
    const [fitIdProcessando, setFitIdProcessando] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    async function carregarContasAbertas() {
        setCarregandoContas(true);
        try {
            const res = await api.get('/financeiro-nf/contas-pagar', { params: { status: 'ABERTA' } });
            setContasAbertas(res.data ?? []);
        } catch {
            setErro('Erro ao carregar contas em aberto.');
        } finally {
            setCarregandoContas(false);
        }
    }

    useEffect(() => {
        carregarContasAbertas();
    }, []);

    // Contas já usadas em alguma linha confirmada não devem aparecer como
    // opção pras outras transações.
    const idsUsados = useMemo(() => {
        return new Set(
            Object.entries(statusLinha)
                .filter(([, status]) => status === 'CONFIRMED')
                .map(([fitId]) => contaSelecionada[fitId])
                .filter(Boolean),
        );
    }, [statusLinha, contaSelecionada]);

    const contasDisponiveis = useMemo(
        () => contasAbertas.filter((conta) => !idsUsados.has(conta.id)),
        [contasAbertas, idsUsados],
    );

    async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        setErro(null);

        try {
            setEnviando(true);

            const response = await api.post('/financeiro-nf/contas-pagar/reconcile/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const todasTransacoes: OfxTransaction[] = response.data?.transactions ?? [];

            // Conta a pagar é dinheiro saindo — olhamos só os débitos do
            // extrato, que é o que pode corresponder a uma conta paga.
            const debitos = todasTransacoes
                .filter((transacao) => transacao.amount < 0)
                .sort((a, b) => a.postedAt.localeCompare(b.postedAt));

            setTransacoes(debitos);

            const selecaoInicial: Record<string, string> = {};

            for (const transacao of debitos) {
                const candidatas = contasAbertas.filter(
                    (conta) => Math.abs(conta.valor - Math.abs(transacao.amount)) < 0.01,
                );

                if (candidatas.length === 1) {
                    selecaoInicial[transacao.fitId] = candidatas[0].id;
                }
            }

            setContaSelecionada(selecaoInicial);
            setStatusLinha({});
        } catch (e: any) {
            setErro(e?.response?.data?.message || 'Erro ao ler o arquivo OFX.');
        } finally {
            setEnviando(false);

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }

    async function confirmarVinculo(transacao: OfxTransaction) {
        const contaId = contaSelecionada[transacao.fitId];

        if (!contaId) {
            alert('Selecione a conta correspondente antes de confirmar.');
            return;
        }

        try {
            setFitIdProcessando(transacao.fitId);

            await api.patch(`/financeiro-nf/contas-pagar/${contaId}/pagar`, {
                pagoEm: transacao.postedAt,
            });

            setStatusLinha((atual) => ({ ...atual, [transacao.fitId]: 'CONFIRMED' }));
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Erro ao confirmar pagamento.');
        } finally {
            setFitIdProcessando(null);
        }
    }

    function ignorarTransacao(fitId: string) {
        setStatusLinha((atual) => ({ ...atual, [fitId]: 'IGNORED' }));
    }

    const pendentes = transacoes.filter(
        (transacao) => !statusLinha[transacao.fitId] || statusLinha[transacao.fitId] === 'PENDING',
    ).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <button
                        onClick={() => navigate('/financeiro-nf/contas-pagar')}
                        className="mb-2 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                    >
                        <ArrowLeft size={16} />
                        Voltar para Contas a Pagar
                    </button>

                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Conciliação bancária</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Importe o extrato (.ofx) do banco e confirme quais contas em aberto já foram pagas.
                    </p>
                </div>

                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".ofx"
                        className="hidden"
                        onChange={handleFileChange}
                    />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={enviando || carregandoContas}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                        {enviando ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                        {transacoes.length > 0 ? 'Importar outro extrato' : 'Importar extrato OFX'}
                    </button>
                </div>
            </div>

            {erro && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-sm text-red-600 dark:text-red-400">
                    {erro}
                </div>
            )}

            {transacoes.length === 0 ? (
                <div className="p-10 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111827] text-center">
                    <Landmark className="mx-auto mb-3 text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nenhum extrato importado ainda</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                        Exporte o extrato do internet banking em formato OFX e importe aqui. A gente sugere qual
                        conta em aberto bate com cada saída — você só confirma.
                    </p>

                    {!carregandoContas && contasAbertas.length === 0 && (
                        <p className="mt-4 text-sm text-yellow-600 dark:text-yellow-400">
                            Não há contas em aberto pra conciliar no momento.
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400">
                        {pendentes} de {transacoes.length} saída(s) ainda pendente(s) de conferência.
                    </div>

                    <div className="space-y-3">
                        {transacoes.map((transacao) => {
                            const status = statusLinha[transacao.fitId] || 'PENDING';
                            const processando = fitIdProcessando === transacao.fitId;

                            return (
                                <div
                                    key={transacao.fitId}
                                    className={`p-5 rounded-2xl border ${
                                        status === 'CONFIRMED'
                                            ? 'border-green-300 dark:border-green-500/30 bg-green-50 dark:bg-green-500/5'
                                            : status === 'IGNORED'
                                            ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 opacity-60'
                                            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827]'
                                    }`}
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-gray-900 dark:text-white">
                                                {transacao.description}
                                            </p>
                                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                {formatDate(transacao.postedAt)} •{' '}
                                                <span className="font-medium text-red-500 dark:text-red-400">
                                                    {formatCurrency(Math.abs(transacao.amount))}
                                                </span>
                                            </p>
                                        </div>

                                        {status === 'CONFIRMED' ? (
                                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-100 dark:bg-green-500/10 text-sm font-medium text-green-700 dark:text-green-400">
                                                <CheckCircle2 size={16} />
                                                Conciliada
                                            </span>
                                        ) : status === 'IGNORED' ? (
                                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400">
                                                <Ban size={16} />
                                                Ignorada
                                            </span>
                                        ) : (
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                <select
                                                    value={contaSelecionada[transacao.fitId] || ''}
                                                    onChange={(e) =>
                                                        setContaSelecionada((atual) => ({
                                                            ...atual,
                                                            [transacao.fitId]: e.target.value,
                                                        }))
                                                    }
                                                    className={`${campoClasse} sm:min-w-[280px]`}
                                                >
                                                    <option value="">Selecionar conta correspondente</option>
                                                    {contasDisponiveis.map((conta) => (
                                                        <option key={conta.id} value={conta.id}>
                                                            {conta.descricao}
                                                            {conta.fornecedor ? ` • ${conta.fornecedor.nome}` : ''} •{' '}
                                                            {formatCurrency(conta.valor)} • vence{' '}
                                                            {formatDate(conta.vencimento.slice(0, 10))}
                                                        </option>
                                                    ))}
                                                </select>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => confirmarVinculo(transacao)}
                                                        disabled={processando || !contaSelecionada[transacao.fitId]}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                                                    >
                                                        {processando ? (
                                                            <Loader2 size={14} className="animate-spin" />
                                                        ) : (
                                                            <CheckCircle2 size={14} />
                                                        )}
                                                        Confirmar
                                                    </button>

                                                    <button
                                                        onClick={() => ignorarTransacao(transacao.fitId)}
                                                        title="Não corresponde a nenhuma conta"
                                                        className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                                    >
                                                        <Ban size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
