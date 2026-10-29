import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, FileUp, Landmark, Loader2, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { RateioCarretasModal } from '../components/RateioCarretasModal';

// =============================================================================
// Conciliação bancária da Conta a Pagar — importa o extrato (.ofx) e sugere,
// pra cada saída, as contas em aberto mais parecidas (valor + data + texto).
// =============================================================================

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';

function formatCurrency(value: number | null | undefined) {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string) {
    return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
}

type Fornecedor = { id: string; nome: string };
type Categoria = { id: string; nome: string };

type ContaPagar = {
    id: string;
    descricao: string;
    valor: number;
    vencimento: string;
    status: 'ABERTA' | 'PAGA' | 'VENCIDA' | 'CANCELADA' | 'PARCIAL';
    observacao?: string | null;
    fornecedor: Fornecedor | null;
    categoria: Categoria | null;
    valorPago?: number;
    saldoDevedor?: number;
};

type OfxTransaction = {
    fitId: string;
    type: string;
    postedAt: string;
    amount: number;
    description: string;
};

type RowStatus = 'PENDING' | 'CONFIRMED' | 'IGNORED';
type Filtro = 'TODAS' | 'COM' | 'SEM';

type Sugestao = { conta: ContaPagar; score: number; motivos: string[] };

// ---------- pontuação de semelhança ----------

const PALAVRAS_IGNORADAS = new Set([
    'pagamento', 'pix', 'pixdeb', 'deb', 'debito', 'transferencia', 'pgto', 'cobranca', 'boleto',
    'compra', 'ltda', 'eireli', 'comercio', 'servicos', 'brasil', 'para', 'placa', 'conta', 'tarifa',
]);

function normalizar(texto: string) {
    return (texto || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

function palavras(texto: string) {
    return normalizar(texto)
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((p) => p.length >= 4 && !/^\d+$/.test(p) && !PALAVRAS_IGNORADAS.has(p));
}

function numerosLongos(texto: string) {
    return (texto.match(/\d{8,}/g) ?? []).map((n) => n.replace(/^0+/, ''));
}

function diasEntre(a: string, b: string) {
    const da = new Date(`${a.slice(0, 10)}T12:00:00`).getTime();
    const db = new Date(`${b.slice(0, 10)}T12:00:00`).getTime();
    return Math.round((da - db) / 86400000);
}

function pontuar(conta: ContaPagar, t: OfxTransaction): Sugestao {
    const motivos: string[] = [];
    let score = 0;
    const valorTransacao = Math.abs(t.amount);
    const saldo = conta.saldoDevedor ?? conta.valor;

    // valor
    const dif = Math.abs(saldo - valorTransacao);
    const pct = valorTransacao > 0 ? dif / valorTransacao : 1;
    if (dif < 0.01) { score += 60; motivos.push('valor igual'); }
    else if (Math.abs(conta.valor - valorTransacao) < 0.01) { score += 55; motivos.push('valor igual ao total'); }
    else if (pct <= 0.02) { score += 45; motivos.push('valor quase igual'); }
    else if (pct <= 0.1) { score += 25; motivos.push('valor parecido'); }
    else if (pct <= 0.25) { score += 8; }
    // transação menor que o saldo = possível baixa parcial (sem bônus de valor)

    // data
    const dias = Math.abs(diasEntre(conta.vencimento, t.postedAt));
    if (dias <= 3) { score += 25; motivos.push(dias === 0 ? 'mesmo dia' : `${dias} dia(s) de diferença`); }
    else if (dias <= 10) { score += 18; motivos.push(`${dias} dias de diferença`); }
    else if (dias <= 20) { score += 10; motivos.push(`${dias} dias de diferença`); }
    else if (dias <= 35) { score += 4; }

    // texto
    const alvo = `${conta.descricao} ${conta.fornecedor?.nome ?? ''} ${conta.categoria?.nome ?? ''} ${conta.observacao ?? ''}`;
    const nums = numerosLongos(t.description);
    const numerosAlvo = alvo.replace(/[.\-\/]/g, '');
    if (nums.some((n) => n.length >= 8 && numerosAlvo.includes(n))) {
        score += 30;
        motivos.push('CNPJ/CPF confere');
    }
    const palavrasT = new Set(palavras(t.description));
    const palavrasC = new Set(palavras(alvo));
    let comuns = 0;
    palavrasT.forEach((p) => { if (palavrasC.has(p)) comuns++; });
    if (comuns > 0) {
        score += Math.min(25, 12 + comuns * 6);
        motivos.push('nome parecido');
    }

    return { conta, score, motivos };
}

export function ContasPagarConciliar() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [contasAbertas, setContasAbertas] = useState<ContaPagar[]>([]);
    const [carregandoContas, setCarregandoContas] = useState(true);
    const [enviando, setEnviando] = useState(false);

    const [transacoes, setTransacoes] = useState<OfxTransaction[]>([]);
    // escolha manual do usuário (sobrepõe a sugestão automática)
    const [escolha, setEscolha] = useState<Record<string, string>>({});
    const [statusLinha, setStatusLinha] = useState<Record<string, RowStatus>>({});
    const [fitIdProcessando, setFitIdProcessando] = useState<string | null>(null);
    const [lote, setLote] = useState(false);
    const [filtro, setFiltro] = useState<Filtro>('TODAS');
    const [erro, setErro] = useState<string | null>(null);
    // Carretas escolhidas por transação (2+ = valor dividido entre elas)
    const [caminhoes, setCaminhoes] = useState<{ id: string; placa: string }[]>([]);
    const [carretasEscolha, setCarretasEscolha] = useState<Record<string, string[]>>({});
    const [valoresEscolha, setValoresEscolha] = useState<Record<string, number[] | undefined>>({});
    const [rateioFit, setRateioFit] = useState<string | null>(null);

    useEffect(() => {
        api.get('/caminhoes')
            .then((r) => setCaminhoes((Array.isArray(r.data) ? r.data : r.data?.data ?? []).filter((c: any) => c.placa)))
            .catch(() => { });
    }, []);
    const [saldoRestante, setSaldoRestante] = useState<Record<string, number>>({});

    async function carregarContasAbertas() {
        setCarregandoContas(true);
        try {
            const res = await api.get('/financeiro-nf/contas-pagar/pendentes');
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

    // Sugestões por transação (recalculadas quando as contas mudam após cada baixa).
    // A melhor sugestão só vira pré-seleção se for clara (boa pontuação, sem empate)
    // e se a mesma conta não já tiver sido escolhida por outra transação acima.
    const { sugestoes, preSelecionadas } = useMemo(() => {
        const sug: Record<string, Sugestao[]> = {};
        const pre: Record<string, string> = {};
        const usadas = new Set<string>();
        for (const t of transacoes) {
            const lista = contasAbertas
                .map((c) => pontuar(c, t))
                .filter((s) => s.score >= 35)
                .sort((a, b) => b.score - a.score)
                .slice(0, 4);
            sug[t.fitId] = lista;
            if (statusLinha[t.fitId] === 'CONFIRMED' || statusLinha[t.fitId] === 'IGNORED') continue;
            const melhor = lista.find((s) => !usadas.has(s.conta.id));
            if (melhor && melhor.score >= 65) {
                const segundo = lista.find((s) => s !== melhor && !usadas.has(s.conta.id));
                if (!segundo || melhor.score - segundo.score >= 10) {
                    pre[t.fitId] = melhor.conta.id;
                    usadas.add(melhor.conta.id);
                }
            }
        }
        return { sugestoes: sug, preSelecionadas: pre };
    }, [transacoes, contasAbertas, statusLinha]);

    const selecionada = (fitId: string) => escolha[fitId] ?? preSelecionadas[fitId] ?? '';

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
            const todas: OfxTransaction[] = response.data?.transactions ?? [];
            const debitos = todas.filter((t) => t.amount < 0).sort((a, b) => a.postedAt.localeCompare(b.postedAt));
            setTransacoes(debitos);
            setEscolha({});
            setStatusLinha({});
            setSaldoRestante({});
            setFiltro('TODAS');
        } catch (e: any) {
            setErro(e?.response?.data?.message || 'Erro ao ler o arquivo OFX.');
        } finally {
            setEnviando(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    async function baixar(transacao: OfxTransaction, contaId: string) {
        const valorPago = Math.abs(transacao.amount);
        const res = await api.post(`/financeiro-nf/contas-pagar/${contaId}/pagamentos`, {
            valor: valorPago,
            data: transacao.postedAt,
        });
        const contaAtualizada = res.data;
        const restante = Math.max(
            0,
            (contaAtualizada?.valor ?? 0) -
                (contaAtualizada?.pagamentos ?? []).reduce((soma: number, p: any) => soma + p.valor, 0),
        );
        setContasAbertas((atual) =>
            restante <= 0.01
                ? atual.filter((c) => c.id !== contaId)
                : atual.map((c) => (c.id === contaId ? { ...c, saldoDevedor: restante } : c)),
        );
        if (restante > 0.01) setSaldoRestante((atual) => ({ ...atual, [transacao.fitId]: restante }));
        const carretas = carretasEscolha[transacao.fitId];
        if (carretas && carretas.length > 0) {
            await api.patch('/financeiro-nf/contas-pagar/ratear', { ids: [contaId], caminhaoIds: carretas, valores: valoresEscolha[transacao.fitId], proporcional: true });
        }
        setStatusLinha((atual) => ({ ...atual, [transacao.fitId]: 'CONFIRMED' }));
    }

    async function confirmarVinculo(transacao: OfxTransaction) {
        const contaId = selecionada(transacao.fitId);
        if (!contaId) {
            alert('Selecione a conta correspondente antes de confirmar.');
            return;
        }
        try {
            setFitIdProcessando(transacao.fitId);
            await baixar(transacao, contaId);
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Erro ao confirmar pagamento.');
        } finally {
            setFitIdProcessando(null);
        }
    }

    function ignorarTransacao(fitId: string) {
        setStatusLinha((atual) => ({ ...atual, [fitId]: 'IGNORED' }));
    }

    const pendentesLista = transacoes.filter((t) => !statusLinha[t.fitId]);
    const comSugestaoAuto = pendentesLista.filter((t) => selecionada(t.fitId));

    async function confirmarSugeridas() {
        if (!comSugestaoAuto.length) return;
        if (!confirm(`Confirmar ${comSugestaoAuto.length} baixa(s) com a conta sugerida? Confira antes se estão certas.`)) return;
        setLote(true);
        const usadas = new Set<string>();
        for (const t of comSugestaoAuto) {
            const contaId = selecionada(t.fitId);
            if (!contaId || usadas.has(contaId)) continue;
            usadas.add(contaId);
            try {
                await baixar(t, contaId);
            } catch {
                /* segue; a linha permanece pendente */
            }
        }
        setLote(false);
    }

    const visiveis = transacoes.filter((t) => {
        if (filtro === 'TODAS') return true;
        const tem = (sugestoes[t.fitId] ?? []).length > 0;
        return filtro === 'COM' ? tem : !tem;
    });

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
                        Importe o extrato (.ofx) e confirme quais contas em aberto já foram pagas. Sugerimos as contas com
                        valor, data e nome parecidos.
                    </p>
                </div>

                <div>
                    <input ref={fileInputRef} type="file" accept=".ofx" className="hidden" onChange={handleFileChange} />
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
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-sm text-red-600 dark:text-red-400">{erro}</div>
            )}

            {transacoes.length === 0 ? (
                <div className="p-10 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111827] text-center">
                    <Landmark className="mx-auto mb-3 text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nenhum extrato importado ainda</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                        Exporte o extrato do internet banking em formato OFX e importe aqui.
                    </p>
                    {!carregandoContas && contasAbertas.length === 0 && (
                        <p className="mt-4 text-sm text-yellow-600 dark:text-yellow-400">
                            Não há contas em aberto pra conciliar no momento.
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <div className="flex flex-col gap-3 p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-gray-500 dark:text-gray-400">
                            {pendentesLista.length} de {transacoes.length} saída(s) pendente(s) •{' '}
                            {comSugestaoAuto.length} com sugestão forte
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                            {(['TODAS', 'COM', 'SEM'] as Filtro[]).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFiltro(f)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                        filtro === f
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {f === 'TODAS' ? 'Todas' : f === 'COM' ? 'Com sugestão' : 'Sem sugestão'}
                                </button>
                            ))}
                            <button
                                onClick={confirmarSugeridas}
                                disabled={lote || comSugestaoAuto.length === 0}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition"
                            >
                                {lote ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                Confirmar sugeridas ({comSugestaoAuto.length})
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {visiveis.map((transacao) => {
                            const status = statusLinha[transacao.fitId] || 'PENDING';
                            const processando = fitIdProcessando === transacao.fitId;
                            const lista = sugestoes[transacao.fitId] ?? [];
                            const atual = selecionada(transacao.fitId);
                            const descricao = transacao.description.replace(/\s+/g, ' ').trim();

                            return (
                                <div
                                    key={transacao.fitId}
                                    className={`p-4 rounded-2xl border ${
                                        status === 'CONFIRMED'
                                            ? 'border-green-300 dark:border-green-500/30 bg-green-50 dark:bg-green-500/5'
                                            : status === 'IGNORED'
                                            ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 opacity-60'
                                            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827]'
                                    }`}
                                >
                                    {/* cabeçalho da saída: data | descrição | valor */}
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(transacao.postedAt)}</p>
                                            <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white break-words">
                                                {descricao}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-base font-bold text-red-500 dark:text-red-400">
                                            {formatCurrency(Math.abs(transacao.amount))}
                                        </span>
                                    </div>

                                    {status === 'CONFIRMED' ? (
                                        <div className="mt-3 flex flex-wrap items-center gap-3">
                                            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-500/10 text-sm font-medium text-green-700 dark:text-green-400">
                                                <CheckCircle2 size={15} />
                                                Conciliada
                                            </span>
                                            {saldoRestante[transacao.fitId] > 0.01 && (
                                                <span className="text-xs text-amber-600 dark:text-amber-400">
                                                    Baixa parcial — ainda falta {formatCurrency(saldoRestante[transacao.fitId])} dessa conta.
                                                </span>
                                            )}
                                        </div>
                                    ) : status === 'IGNORED' ? (
                                        <span className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400">
                                            <Ban size={15} />
                                            Ignorada
                                        </span>
                                    ) : (
                                        <div className="mt-3 space-y-3">
                                            {lista.length > 0 ? (
                                                <div className="grid gap-2 md:grid-cols-2">
                                                    {lista.map((s) => {
                                                        const ativa = atual === s.conta.id;
                                                        return (
                                                            <button
                                                                key={s.conta.id}
                                                                onClick={() => setEscolha((e) => ({ ...e, [transacao.fitId]: s.conta.id }))}
                                                                className={`text-left p-3 rounded-xl border transition ${
                                                                    ativa
                                                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                                                                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500/50'
                                                                }`}
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <span className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                                                                        {s.conta.descricao}
                                                                    </span>
                                                                    <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                                        {formatCurrency(s.conta.saldoDevedor ?? s.conta.valor)}
                                                                    </span>
                                                                </div>
                                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                                    vence {formatDate(s.conta.vencimento)}
                                                                    {s.conta.status === 'PARCIAL' ? ' • parcial' : ''}
                                                                    {s.conta.categoria ? ` • ${s.conta.categoria.nome}` : ''}
                                                                </p>
                                                                <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                                                                    {s.motivos.join(' • ') || 'semelhança'} ({Math.min(99, s.score)}%)
                                                                </p>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Nenhuma conta parecida encontrada — escolha manualmente ou ignore.
                                                </p>
                                            )}

                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                <select
                                                    value={atual}
                                                    onChange={(e) => setEscolha((x) => ({ ...x, [transacao.fitId]: e.target.value }))}
                                                    className={`${campoClasse} sm:flex-1`}
                                                >
                                                    <option value="">Outra conta…</option>
                                                    {contasAbertas.map((conta) => (
                                                        <option key={conta.id} value={conta.id}>
                                                            {formatDate(conta.vencimento)} • {formatCurrency(conta.saldoDevedor ?? conta.valor)} •{' '}
                                                            {conta.descricao.slice(0, 70)}
                                                        </option>
                                                    ))}
                                                </select>

                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setRateioFit(transacao.fitId)}
                                                        title="Se o valor é de mais de uma carreta, ele será dividido entre elas"
                                                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${(carretasEscolha[transacao.fitId]?.length ?? 0) > 0 ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}
                                                    >
                                                        🚚 {(carretasEscolha[transacao.fitId]?.length ?? 0) >= 2
                                                            ? `Dividir em ${carretasEscolha[transacao.fitId].length}`
                                                            : (carretasEscolha[transacao.fitId]?.length ?? 0) === 1
                                                                ? caminhoes.find((c) => c.id === carretasEscolha[transacao.fitId][0])?.placa
                                                                : 'Carretas'}
                                                    </button>
                                                    <button
                                                        onClick={() => confirmarVinculo(transacao)}
                                                        disabled={processando || !atual}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                                                    >
                                                        {processando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
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
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
            {rateioFit && (
                <RateioCarretasModal
                    caminhoes={caminhoes}
                    valorTotal={Math.abs(transacoes.find((t) => t.fitId === rateioFit)?.amount ?? 0)}
                    inicial={carretasEscolha[rateioFit] ?? []}
                    inicialValores={valoresEscolha[rateioFit]}
                    onConfirmar={(ids, valores) => { setCarretasEscolha((e) => ({ ...e, [rateioFit]: ids })); setValoresEscolha((e) => ({ ...e, [rateioFit]: valores })); setRateioFit(null); }}
                    onFechar={() => setRateioFit(null)}
                />
            )}
        </div>
    );
}
