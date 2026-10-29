import { Fragment, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Printer, Link2, Loader2, CheckCircle2, Trash2, Pencil, Landmark, X, History, Repeat, Clock, ArrowUpCircle, FileText, Copy, Check } from 'lucide-react';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { AbasContas } from '../components/AbasContas';
import { imprimirContas } from '../lib/imprimirContas';
import { corPlaca, COR_GERAL } from '../lib/corPlaca';
import { RateioCarretasModal, EtiquetaRateio } from '../components/RateioCarretasModal';
import { FiltroMes } from '../components/FiltroMes';
import { nomeMes } from '../lib/mes';

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

type DashBloco = { quantidade: number; valor: number };
type DashContas = { hoje: DashBloco; semana: DashBloco; mes: DashBloco; vencidas: DashBloco };

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
    rateios?: { caminhaoId: string; valor: number; caminhao?: { placa: string } }[];
    observacao: string | null;
    valorPago?: number;
    saldoDevedor?: number;
    juros?: number;
    queuedForPaymentAt?: string | null;
    grupo?: Grupo;
    codigoBarras?: string | null;
    pixChave?: string | null;
    pixTipoChave?: string | null;
    pixQrCode?: string | null;
    banco?: string | null;
    agencia?: string | null;
    conta?: string | null;
    favorecido?: string | null;
    documento?: { id: string; nome: string | null; tipo: string | null } | null;
};

// Linha digitável legível (boleto bancário 47 dígitos / concessionária 48).
function formatarLinhaDigitavel(cod?: string | null) {
    const d = (cod ?? '').replace(/\D/g, '');
    if (d.length === 47) return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
    if (d.length === 48) return d.match(/.{1,12}/g)!.map((b) => `${b.slice(0, 11)}-${b.slice(11)}`).join(' ');
    return cod ?? '';
}

function BotaoCopiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
    const [ok, setOk] = useState(false);
    async function copiar() {
        try {
            await navigator.clipboard.writeText(texto);
        } catch {
            const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
        }
        setOk(true); setTimeout(() => setOk(false), 1800);
    }
    return (
        <button type="button" onClick={copiar}
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${ok ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {ok ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> {rotulo}</>}
        </button>
    );
}

async function abrirDocumentoConta(contaId: string) {
    try {
        const r = await api.get(`/financeiro-nf/contas-pagar/${contaId}/documento`, { responseType: 'blob' });
        window.open(URL.createObjectURL(r.data), '_blank');
    } catch {
        alert('Não foi possível abrir o documento.');
    }
}

const CARRETAS = ['POZ', 'QPM', 'RFX', 'RME', 'SEV', 'SEZ', 'SYR', 'TCF'];

type Grupo = 'FORNECEDORES' | 'IMPOSTOS' | 'SOCIOS' | 'TODOS';

const GRUPOS: Array<{ value: Grupo; label: string; descricao: string }> = [
    { value: 'TODOS', label: 'Todas (classificar)', descricao: 'Visão de todos os quadros juntos — use o lápis para mover cada conta para Fornecedores, Impostos ou Sócios.' },
    { value: 'FORNECEDORES', label: 'Fornecedores', descricao: 'Contas urgentes com fornecedores. Organizadas por vencimento.' },
    { value: 'IMPOSTOS', label: 'Impostos', descricao: 'Guias e tributos — separados das contas urgentes, para dividir/pagar com calma.' },
    { value: 'SOCIOS', label: 'Sócios', descricao: 'Retiradas, pró-labore e empréstimos — apenas controle, fora das contas urgentes.' },
];

type Pagamento = {
    id: string;
    valor: number;
    data: string;
    formaPagamento: string | null;
    observacao: string | null;
};

type ContaPagarRecorrente = {
    id: string;
    descricao: string;
    valor: number;
    formaPagamento: string;
    observacao: string | null;
    tipoRecorrencia: 'MENSAL' | 'SEMANAL';
    diaMes: number | null;
    diaSemana: 'SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA' | null;
    ativa: boolean;
};

const DIAS_SEMANA = [
    { value: 'SEGUNDA', label: 'Segunda' },
    { value: 'TERCA', label: 'Terça' },
    { value: 'QUARTA', label: 'Quarta' },
    { value: 'QUINTA', label: 'Quinta' },
    { value: 'SEXTA', label: 'Sexta' },
];

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
    const { usuario } = useAuth();
    const ehFisica = usuario?.empresaTipoPessoa === 'FISICA';

    // Quadro atual (Fornecedores / Impostos / Sócios) e grupo escolhido no formulário
    const [grupo, setGrupo] = useState<Grupo>('FORNECEDORES');
    const [formGrupo, setFormGrupo] = useState<Grupo>('FORNECEDORES');

    // Filtros da lista (a lista sempre sai ordenada por vencimento, do mais próximo pro mais distante)
    const [periodo, setPeriodo] = useState<'' | 'hoje' | 'semana' | 'mes' | 'vencidas'>('');
    const [situacao, setSituacao] = useState<'pendentes' | 'pagas' | 'todas'>('pendentes');
    const [busca, setBusca] = useState('');
    const [filtroDe, setFiltroDe] = useState('');
    const [filtroAte, setFiltroAte] = useState('');
    const [valorMin, setValorMin] = useState('');
    const [valorMax, setValorMax] = useState('');
    // '' = todos os meses; AAAA-MM = a página inteira só com aquele mês (pagas pela data do pagamento, abertas pelo vencimento)
    const [mes, setMes] = useState('');
    const [dash, setDash] = useState<DashContas | null>(null);
    const [detalhe, setDetalhe] = useState<ContaPagar | null>(null);
    const [detalhePagamentos, setDetalhePagamentos] = useState<Pagamento[]>([]);

    const [contas, setContas] = useState<ContaPagar[]>([]);
    // Filtro por caminhão ('' = todos, 'GERAL' = contas sem caminhão)
    const [filtroCaminhao, setFiltroCaminhao] = useState('');
    const [gastos, setGastos] = useState<Array<{ caminhaoId: string; placa: string; pago: number; aberto: number; quantidade: number }>>([]);

    const [modalImprimir, setModalImprimir] = useState(false);
    const [imprimindo, setImprimindo] = useState(false);

    async function imprimir(escolha: Grupo) {
        setImprimindo(true);
        try {
            const todas: any[] = [];
            for (let pg = 1; pg <= 40; pg++) {
                const r = await api.get('/financeiro-nf/contas-pagar', {
                    params: { grupo: escolha, situacao: 'pendentes', page: pg, pageSize: 50 },
                });
                const itens = r.data?.items ?? [];
                todas.push(...itens);
                if (todas.length >= (r.data?.total ?? 0) || itens.length === 0) break;
            }
            const rotulo = { TODOS: 'Todas', FORNECEDORES: 'Fornecedores', IMPOSTOS: 'Impostos', SOCIOS: 'Sócios' }[escolha];
            imprimirContas(todas, rotulo);
            setModalImprimir(false);
        } catch {
            alert('Não foi possível carregar as contas para impressão.');
        } finally {
            setImprimindo(false);
        }
    }

    // Link do proprietário (escolher o que pagar hoje)
    const podeLinkHoje = !!usuario?.isAdminMaster || usuario?.perfil === 'ADMIN';
    const [modalLinkHoje, setModalLinkHoje] = useState(false);
    const [tokenHoje, setTokenHoje] = useState<string | null>(null);
    const [copiadoHoje, setCopiadoHoje] = useState(false);
    const urlLinkHoje = tokenHoje ? `${window.location.origin}/pagar-hoje/${tokenHoje}` : '';

    async function abrirLinkHoje() {
        setModalLinkHoje(true);
        try { setTokenHoje((await api.get('/financeiro-nf/pagar-hoje/link')).data.token); } catch { /* ignora */ }
    }
    async function gerarLinkHoje() {
        if (tokenHoje && !confirm('Gerar um novo link desativa o anterior. Continuar?')) return;
        setTokenHoje((await api.post('/financeiro-nf/pagar-hoje/link')).data.token);
    }
    async function desativarLinkHoje() {
        if (!confirm('Desativar o link?')) return;
        await api.delete('/financeiro-nf/pagar-hoje/link');
        setTokenHoje(null);
    }

    const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
    const [movendo, setMovendo] = useState(false);
    const [massaCaminhao, setMassaCaminhao] = useState('');
    const [modalRateio, setModalRateio] = useState(false);

    async function ratear(caminhaoIds: string[], valores?: number[]) {
        try {
            await api.patch('/financeiro-nf/contas-pagar/ratear', { ids: Array.from(selecionadas), caminhaoIds, valores });
            setModalRateio(false);
            setSelecionadas(new Set());
            await carregar();
        } catch (err: any) {
            alert(err?.response?.data?.message ?? 'Não foi possível dividir.');
        }
    }
    const [massaCategoria, setMassaCategoria] = useState('');

    async function aplicarEmMassa() {
        if (selecionadas.size === 0 || (!massaCaminhao && !massaCategoria)) return;
        setMovendo(true);
        try {
            await api.patch('/financeiro-nf/contas-pagar/editar-em-massa', {
                ids: Array.from(selecionadas),
                caminhaoId: massaCaminhao || undefined,
                categoriaId: massaCategoria || undefined,
            });
            setSelecionadas(new Set());
            setMassaCaminhao('');
            setMassaCategoria('');
            await carregar();
        } catch (err: any) {
            alert(err?.response?.data?.message ?? 'Não foi possível editar as contas.');
        } finally {
            setMovendo(false);
        }
    }

    function alternarSelecao(id: string) {
        setSelecionadas((atual) => {
            const novo = new Set(atual);
            if (novo.has(id)) novo.delete(id); else novo.add(id);
            return novo;
        });
    }

    function alternarTodas() {
        setSelecionadas((atual) =>
            atual.size === contas.length ? new Set() : new Set(contas.map((c) => c.id)),
        );
    }

    async function moverSelecionadas(destino: 'FORNECEDORES' | 'IMPOSTOS' | 'SOCIOS') {
        if (selecionadas.size === 0) return;
        setMovendo(true);
        try {
            await api.patch('/financeiro-nf/contas-pagar/agrupar', { ids: Array.from(selecionadas), grupo: destino });
            setSelecionadas(new Set());
            await carregar();
        } catch (err: any) {
            alert(err?.response?.data?.message ?? 'Não foi possível mover as contas.');
        } finally {
            setMovendo(false);
        }
    }

    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
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
    // Divisão da conta do formulário entre 2+ caminhões (valores opcionais = igual).
    const [formRateio, setFormRateio] = useState<{ ids: string[]; valores?: number[] } | null>(null);
    const [editandoTinhaRateio, setEditandoTinhaRateio] = useState(false);
    const [modalRateioForm, setModalRateioForm] = useState(false);
    const [observacao, setObservacao] = useState('');
    const [codigoBarras, setCodigoBarras] = useState('');
    const [pixChave, setPixChave] = useState('');
    const [pixTipoChave, setPixTipoChave] = useState('');

    // Recorrência (todo dia X do mês, ou todo dia da semana seg-sex) — só
    // disponível pra conta nova (não dá pra "virar" uma conta já existente
    // em recorrente ao editar).
    const [recorrente, setRecorrente] = useState(false);
    const [tipoRecorrencia, setTipoRecorrencia] = useState<'MENSAL' | 'SEMANAL'>('MENSAL');
    const [diaMes, setDiaMes] = useState('5');
    const [diaSemana, setDiaSemana] = useState<'SEGUNDA' | 'TERCA' | 'QUARTA' | 'QUINTA' | 'SEXTA'>('SEGUNDA');
    const [salvandoRecorrente, setSalvandoRecorrente] = useState(false);

    const [recorrencias, setRecorrencias] = useState<ContaPagarRecorrente[]>([]);
    const [mostrarRecorrencias, setMostrarRecorrencias] = useState(false);

    const [colocandoAtrasadasHoje, setColocandoAtrasadasHoje] = useState(false);

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
            const [resContas, resDash] = await Promise.all([
                api.get('/financeiro-nf/contas-pagar', {
                    params: {
                        grupo,
                        caminhaoId: filtroCaminhao || undefined,
                        periodo: periodo || undefined,
                        situacao: periodo ? undefined : situacao,
                        busca: busca.trim() || undefined,
                        de: filtroDe || undefined,
                        ate: filtroAte || undefined,
                        valorMin: valorMin || undefined,
                        valorMax: valorMax || undefined,
                        mes: mes || undefined,
                        page: pageAlvo,
                        pageSize: pageSizeAlvo,
                    },
                }),
                api.get('/financeiro-nf/contas-pagar/dashboard', { params: { grupo, mes: mes || undefined } }),
            ]);
            api.get('/financeiro-nf/contas-pagar/por-caminhao', { params: { grupo, mes: mes || undefined } })
                .then((r) => setGastos(r.data ?? []))
                .catch(() => setGastos([]));
            setContas(resContas.data?.items ?? []);
            setTotal(resContas.data?.total ?? 0);
            setPage(resContas.data?.page ?? pageAlvo);
            setPageSize(resContas.data?.pageSize ?? pageSizeAlvo);
            setDash(resDash.data ?? null);
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
        if (ehFisica) return; // Pessoa Física não usa fornecedor/categoria/caminhão
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

    async function carregarRecorrencias() {
        try {
            const res = await api.get('/financeiro-nf/contas-pagar-recorrentes');
            setRecorrencias(res.data ?? []);
        } catch {
            setRecorrencias([]);
        }
    }

    // Recarrega ao mudar qualquer filtro (a busca por texto espera o usuário parar de digitar).
    useEffect(() => {
        const t = setTimeout(() => carregar(1, pageSize), busca ? 350 : 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grupo, filtroCaminhao, periodo, situacao, busca, filtroDe, filtroAte, valorMin, valorMax, mes]);

    // Carrega as baixas da conta aberta no painel de detalhes.
    useEffect(() => {
        if (!detalhe) { setDetalhePagamentos([]); return; }
        let ativo = true;
        api.get(`/financeiro-nf/contas-pagar/${detalhe.id}/pagamentos`)
            .then((res) => { if (ativo) setDetalhePagamentos(res.data ?? []); })
            .catch(() => { if (ativo) setDetalhePagamentos([]); });
        return () => { ativo = false; };
    }, [detalhe]);

    function limparFiltros() {
        setPeriodo('');
        setSituacao('pendentes');
        setBusca('');
        setFiltroDe('');
        setFiltroAte('');
        setValorMin('');
        setValorMax('');
    }

    function escolherPeriodo(p: typeof periodo) {
        setBusca('');
        setFiltroDe('');
        setFiltroAte('');
        setValorMin('');
        setValorMax('');
        setPeriodo((atual) => (atual === p ? '' : p));
    }

    // Dia único ou intervalo: limpa o atalho do dashboard pra não conflitar.
    function mudarDatas(de: string, ate: string) {
        setPeriodo('');
        setFiltroDe(de);
        setFiltroAte(ate);
    }

    function diasAte(vencimento: string) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const v = new Date(vencimento);
        v.setHours(0, 0, 0, 0);
        return Math.round((v.getTime() - hoje.getTime()) / 86400000);
    }

    function rotuloPrazo(c: ContaPagar) {
        if (c.status === 'PAGA') return { texto: c.pagoEm ? `Paga em ${new Date(c.pagoEm).toLocaleDateString('pt-BR')}` : 'Paga', tom: 'text-green-600 dark:text-green-400' };
        const d = diasAte(c.vencimento);
        if (d < 0) return { texto: `Vencida há ${-d} dia${d === -1 ? '' : 's'}`, tom: 'text-red-600 dark:text-red-400' };
        if (d === 0) return { texto: 'Vence hoje', tom: 'text-amber-600 dark:text-amber-400' };
        if (d === 1) return { texto: 'Vence amanhã', tom: 'text-amber-600 dark:text-amber-400' };
        return { texto: `Em ${d} dias`, tom: 'text-gray-500 dark:text-gray-400' };
    }

    useEffect(() => {
        carregarCadastros();
        carregarRecorrencias();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function limparForm() {
        setFormRateio(null);
        setEditandoTinhaRateio(false);
        setCodigoBarras('');
        setPixChave('');
        setPixTipoChave('');
        setDescricao('');
        setValor('');
        setVencimento(hojeISO());
        setTipo('BOLETO');
        setFormaPagamento('BOLETO');
        setFornecedorNome('');
        setCategoriaNome('');
        setCaminhaoId('');
        setObservacao('');
        setFormGrupo(grupo === 'TODOS' ? 'FORNECEDORES' : grupo);
        setEditandoId(null);
        setRecorrente(false);
        setTipoRecorrencia('MENSAL');
        setDiaMes('5');
        setDiaSemana('SEGUNDA');
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
        setCodigoBarras(conta.codigoBarras ?? '');
        setPixChave(conta.pixChave ?? '');
        setPixTipoChave(conta.pixTipoChave ?? '');
        const rs = conta.rateios ?? [];
        setFormRateio(rs.length >= 2 ? { ids: rs.map((r) => r.caminhaoId), valores: rs.map((r) => r.valor) } : null);
        setEditandoTinhaRateio(rs.length >= 2);
        setObservacao(conta.observacao ?? '');
        setFormGrupo(conta.grupo ?? 'FORNECEDORES');
        setFormAberto(true);
    }

    async function salvar() {
        if (!descricao.trim() || !valor) return;

        // Conta recorrente é um cadastro separado (ContaPagarRecorrencia) —
        // só disponível criando uma conta nova, não editando.
        if (recorrente && !editandoId) {
            await salvarRecorrente();
            return;
        }

        if (!vencimento) return;
        setSalvando(true);
        try {
            let fornecedorId: string | undefined;
            let categoriaId: string | undefined;

            if (!ehFisica && fornecedorNome.trim()) {
                const res = await api.post('/financeiro-nf/fornecedores/encontrar-ou-criar', { nome: fornecedorNome.trim() });
                fornecedorId = res.data?.id;
            }

            if (!ehFisica && categoriaNome.trim()) {
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
                caminhaoId: !ehFisica && !(formRateio && formRateio.ids.length >= 2) ? (caminhaoId || undefined) : undefined,
                observacao: observacao || undefined,
                grupo: formGrupo,
                codigoBarras: codigoBarras.replace(/\D/g, '') || (editandoId ? '' : undefined),
                pixChave: pixChave.trim() || (editandoId ? '' : undefined),
                pixTipoChave: pixTipoChave || undefined,
            };

            let contaId = editandoId;
            if (editandoId) {
                await api.patch(`/financeiro-nf/contas-pagar/${editandoId}`, payload);
            } else {
                contaId = (await api.post('/financeiro-nf/contas-pagar', payload)).data?.id ?? null;
            }

            // Divisão entre caminhões (ou desfaz a divisão que existia).
            if (contaId && !ehFisica) {
                if (formRateio && formRateio.ids.length >= 2) {
                    await api.patch('/financeiro-nf/contas-pagar/ratear', { ids: [contaId], caminhaoIds: formRateio.ids, valores: formRateio.valores });
                } else if (editandoTinhaRateio) {
                    await api.patch('/financeiro-nf/contas-pagar/ratear', { ids: [contaId], caminhaoIds: caminhaoId ? [caminhaoId] : [] });
                }
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

    async function salvarRecorrente() {
        setSalvandoRecorrente(true);
        try {
            await api.post('/financeiro-nf/contas-pagar-recorrentes', {
                descricao,
                valor: Number(valor),
                formaPagamento,
                observacao: observacao || undefined,
                tipoRecorrencia,
                diaMes: tipoRecorrencia === 'MENSAL' ? Number(diaMes) : undefined,
                diaSemana: tipoRecorrencia === 'SEMANAL' ? diaSemana : undefined,
            });
            limparForm();
            setFormAberto(false);
            carregar();
            carregarRecorrencias();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Não foi possível criar a conta recorrente.');
        } finally {
            setSalvandoRecorrente(false);
        }
    }

    async function desativarRecorrencia(id: string) {
        if (!confirm('Desativar essa recorrência? As contas já geradas continuam, só para de gerar novas.')) return;
        try {
            await api.delete(`/financeiro-nf/contas-pagar-recorrentes/${id}`);
            carregarRecorrencias();
        } catch {
            alert('Não foi possível desativar a recorrência.');
        }
    }

    async function incluirHoje(conta: ContaPagar) {
        try {
            await api.patch(`/financeiro-nf/contas-pagar/${conta.id}/incluir-hoje`);
            carregar();
        } catch {
            alert('Não foi possível incluir essa conta em hoje.');
        }
    }

    async function colocarAtrasadasHoje() {
        setColocandoAtrasadasHoje(true);
        try {
            await api.patch('/financeiro-nf/contas-pagar/incluir-hoje/atrasadas');
            carregar();
        } catch {
            alert('Não foi possível colocar as atrasadas em hoje.');
        } finally {
            setColocandoAtrasadasHoje(false);
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
            <AbasContas ativa="pagar" />
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contas a Pagar</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {GRUPOS.find((g) => g.value === grupo)?.descricao} Clique em um card para filtrar e em uma conta para ver os detalhes.
                </p>
            </div>

            <div className="flex flex-wrap gap-2">
                {GRUPOS.map((g) => (
                    <button
                        key={g.value}
                        type="button"
                        onClick={() => { setPeriodo(''); setSelecionadas(new Set()); setGrupo(g.value); setPage(1); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${grupo === g.value
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                    >
                        {g.label}
                    </button>
                ))}
                <button type="button" onClick={() => setModalImprimir(true)}
                    className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Printer size={15} /> Imprimir PDF
                </button>
                {podeLinkHoje && !ehFisica && (
                    <button type="button" onClick={abrirLinkHoje}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <Link2 size={15} /> Link do proprietário
                    </button>
                )}
            </div>

            {modalRateioForm && (
                <RateioCarretasModal
                    caminhoes={caminhoes}
                    valorTotal={Number(String(valor).replace(',', '.')) || undefined}
                    inicial={formRateio?.ids ?? (caminhaoId ? [caminhaoId] : [])}
                    inicialValores={formRateio?.valores}
                    titulo="Dividir esta conta entre caminhões"
                    onConfirmar={(ids, valores) => {
                        if (ids.length >= 2) setFormRateio({ ids, valores });
                        else { setFormRateio(null); setCaminhaoId(ids[0] ?? ''); }
                        setModalRateioForm(false);
                    }}
                    onFechar={() => setModalRateioForm(false)}
                />
            )}

            {modalRateio && (() => {
                const unica = selecionadas.size === 1 ? contas.find((c) => selecionadas.has(c.id)) : undefined;
                const rs = unica?.rateios ?? [];
                return (
                <RateioCarretasModal
                    caminhoes={caminhoes}
                    valorTotal={unica ? unica.valor + (unica.juros ?? 0) : undefined}
                    inicial={rs.length >= 2 ? rs.map((r) => r.caminhaoId) : unica?.caminhao?.id ? [unica.caminhao.id] : []}
                    inicialValores={rs.length >= 2 ? rs.map((r) => r.valor) : undefined}
                    titulo={`Dividir ${selecionadas.size} conta${selecionadas.size > 1 ? 's' : ''} entre carretas`}
                    onConfirmar={ratear}
                    onFechar={() => setModalRateio(false)}
                />
                );
            })()}

            {modalImprimir && (
                <Modal onFechar={() => setModalImprimir(false)} className="z-50 bg-black/50">
                    <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <p className="font-semibold text-gray-900 dark:text-white">O que imprimir? (somente em aberto)</p>
                        {([['TODOS', 'Todas'], ['FORNECEDORES', 'Somente Fornecedores'], ['IMPOSTOS', 'Somente Impostos'], ['SOCIOS', 'Somente Sócios']] as const).map(([v, l]) => (
                            <button key={v} disabled={imprimindo} onClick={() => imprimir(v)}
                                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:opacity-60 inline-flex items-center justify-center gap-2">
                                {imprimindo && <Loader2 size={14} className="animate-spin" />} {l}
                            </button>
                        ))}
                        <p className="text-xs text-gray-400">Abre a impressão — escolha "Salvar como PDF" no destino.</p>
                        <button onClick={() => setModalImprimir(false)} className="w-full text-sm text-gray-500">Cancelar</button>
                    </div>
                </Modal>
            )}

            {modalLinkHoje && (
                <Modal onFechar={() => setModalLinkHoje(false)} className="z-50 bg-black/50">
                    <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <p className="font-semibold text-gray-900 dark:text-white">Link do proprietário — escolher o que pagar hoje</p>
                        <p className="text-xs text-gray-500">
                            Mande por WhatsApp. Ele vê as contas de Fornecedores em aberto, marca as caixinhas e envia.
                            As marcadas viram HOJE; as demais continuam como Vencidas ou A pagar. Não precisa de login.
                        </p>
                        {tokenHoje && (
                            <div className="flex gap-2">
                                <input readOnly value={urlLinkHoje} onFocus={(e) => e.target.select()}
                                    className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" />
                                <button onClick={async () => { await navigator.clipboard.writeText(urlLinkHoje); setCopiadoHoje(true); setTimeout(() => setCopiadoHoje(false), 2000); }}
                                    className="px-3 rounded-lg bg-blue-600 text-white text-sm whitespace-nowrap">{copiadoHoje ? 'Copiado!' : 'Copiar'}</button>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button onClick={gerarLinkHoje} className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200">
                                {tokenHoje ? 'Gerar novo link' : 'Gerar link'}
                            </button>
                            {tokenHoje && <button onClick={desativarLinkHoje} className="text-xs px-3 py-2 rounded-lg text-red-500">Desativar</button>}
                            <button onClick={() => setModalLinkHoje(false)} className="ml-auto text-sm text-gray-500">Fechar</button>
                        </div>
                    </div>
                </Modal>
            )}

            <FiltroMes
                mes={mes}
                onChange={(m) => { setPeriodo(''); if (m) setSituacao('todas'); setMes(m); }}
                dica={mes ? 'Toda a página mostra só as contas com vencimento neste mês (pagas ou não).' : undefined}
            />

            {dash && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {([
                        { chave: 'hoje', titulo: 'Hoje', tom: 'text-amber-600 dark:text-amber-400', borda: 'border-amber-400' },
                        { chave: 'semana', titulo: 'Esta semana', tom: 'text-blue-600 dark:text-blue-400', borda: 'border-blue-500' },
                        { chave: 'mes', titulo: 'Este mês', tom: 'text-gray-900 dark:text-white', borda: 'border-gray-500' },
                        { chave: 'vencidas', titulo: 'Vencidas', tom: 'text-red-600 dark:text-red-400', borda: 'border-red-500' },
                    ] as const).map((b) => {
                        const bloco = dash[b.chave];
                        const ativo = periodo === b.chave;
                        return (
                            <div
                                key={b.chave}
                                className={`p-4 rounded-xl bg-white dark:bg-[#111827] border text-left transition ${ativo
                                    ? `${b.borda} ring-2 ring-offset-0 ring-current/20`
                                    : 'border-gray-200 dark:border-gray-800'
                                    }`}
                            >
                                <button type="button" onClick={() => escolherPeriodo(b.chave)} className="w-full text-left">
                                    <p className="text-xs text-gray-400">{b.titulo}</p>
                                    <p className={`text-lg font-bold ${b.tom}`}>{formatCurrency(bloco.valor)}</p>
                                    <p className="text-xs text-gray-400">
                                        {bloco.quantidade} conta{bloco.quantidade === 1 ? '' : 's'}
                                    </p>
                                </button>
                                {b.chave === 'vencidas' && bloco.quantidade > 0 && grupo === 'FORNECEDORES' && (
                                    <button
                                        type="button"
                                        onClick={colocarAtrasadasHoje}
                                        disabled={colocandoAtrasadasHoje}
                                        className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition"
                                    >
                                        {colocandoAtrasadasHoje ? <Loader2 size={13} className="animate-spin" /> : <ArrowUpCircle size={13} />}
                                        Mandar todas pra hoje
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {!ehFisica && (
                <div className="space-y-2">
                    <p className="text-xs text-gray-400">
                        Gasto por carreta {mes ? <>— <strong className="text-gray-700 dark:text-gray-200">{nomeMes(mes)}</strong></> : '— todos os meses'} (clique para filtrar, clique de novo para limpar)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {CARRETAS.map((cod) => {
                            const cam = caminhoes.find((c) => c.placa.toUpperCase().includes(cod));
                            const g = cam ? gastos.find((x) => x.caminhaoId === cam.id) : undefined;
                            const ativo = !!cam && filtroCaminhao === cam.id;
                            return (
                                <button key={cod} type="button" disabled={!cam}
                                    onClick={() => { if (!cam) return; setPeriodo(''); setFiltroCaminhao(ativo ? '' : cam.id); }}
                                    className={`p-3 rounded-xl border text-left transition disabled:opacity-50 ${corPlaca(cod)} ${ativo ? 'ring-2 ring-blue-500' : ''}`}>
                                    <p className="text-xs font-bold">🚚 {cod}</p>
                                    <p className="text-sm font-bold">{formatCurrency((g?.pago ?? 0) + (g?.aberto ?? 0))}</p>
                                    <p className="text-[10px] opacity-80">pago {formatCurrency(g?.pago ?? 0)} · aberto {formatCurrency(g?.aberto ?? 0)}</p>
                                </button>
                            );
                        })}
                        {(() => {
                            const g = gastos.find((x) => x.caminhaoId === 'GERAL');
                            const ativo = filtroCaminhao === 'GERAL';
                            return (
                                <button type="button" onClick={() => { setPeriodo(''); setFiltroCaminhao(ativo ? '' : 'GERAL'); }}
                                    className={`p-3 rounded-xl border text-left ${COR_GERAL} ${ativo ? 'ring-2 ring-blue-500' : ''}`}>
                                    <p className="text-xs font-bold">Gerais (todas)</p>
                                    <p className="text-sm font-bold">{formatCurrency((g?.pago ?? 0) + (g?.aberto ?? 0))}</p>
                                    <p className="text-[10px] opacity-80">pago {formatCurrency(g?.pago ?? 0)} · aberto {formatCurrency(g?.aberto ?? 0)}</p>
                                </button>
                            );
                        })()}
                    </div>
                </div>
            )}

            <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-3">
                <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    <div className="lg:col-span-2">
                        <label className={labelClasse}>Buscar (nome, fornecedor, categoria, placa)</label>
                        <input
                            value={busca}
                            onChange={(e) => { setPeriodo(''); setBusca(e.target.value); }}
                            className={campoClasse}
                            placeholder="Ex: energia, posto, QPM..."
                        />
                    </div>
                    <div>
                        <label className={labelClasse}>Vencimento de</label>
                        <input type="date" value={filtroDe} onChange={(e) => mudarDatas(e.target.value, filtroAte)} className={campoClasse} />
                    </div>
                    <div>
                        <label className={labelClasse}>até</label>
                        <input type="date" value={filtroAte} onChange={(e) => mudarDatas(filtroDe, e.target.value)} className={campoClasse} />
                    </div>
                    <div>
                        <label className={labelClasse}>Valor mín. (R$)</label>
                        <input type="number" min="0" step="0.01" value={valorMin} onChange={(e) => { setPeriodo(''); setValorMin(e.target.value); }} className={campoClasse} />
                    </div>
                    <div>
                        <label className={labelClasse}>Valor máx. (R$)</label>
                        <input type="number" min="0" step="0.01" value={valorMax} onChange={(e) => { setPeriodo(''); setValorMax(e.target.value); }} className={campoClasse} />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {(['pendentes', 'pagas', 'todas'] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => { setPeriodo(''); setSituacao(s); }}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition ${!periodo && situacao === s
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                        >
                            {s === 'pendentes' ? 'Em aberto' : s === 'pagas' ? 'Pagas' : 'Todas'}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => { const h = hojeISO(); mudarDatas(h, h); }}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                    >
                        Só o dia de hoje
                    </button>
                    {(periodo || busca || filtroDe || filtroAte || valorMin || valorMax || situacao !== 'pendentes') && (
                        <button type="button" onClick={limparFiltros} className="px-3 py-1 rounded-full text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                            Limpar filtros
                        </button>
                    )}
                    {periodo && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            Mostrando: {{ hoje: 'a pagar hoje', semana: 'desta semana', mes: 'deste mês', vencidas: 'vencidas' }[periodo]}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    {!ehFisica && (
                        <button
                            onClick={() => navigate('/financeiro-nf/contas-pagar/conciliar')}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                        >
                            <Landmark size={16} />
                            Conciliar com banco
                        </button>
                    )}

                    <button
                        onClick={() => { limparForm(); setFormAberto(true); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                    >
                        <Plus size={16} />
                        Nova Conta
                    </button>
                </div>
            </div>

            {formAberto && (
                <Modal onFechar={() => { setFormAberto(false); limparForm(); }} className="z-50 bg-black/50">
                <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-4 shadow-2xl">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                            {editandoId ? 'Editar conta' : 'Nova conta a pagar'}
                        </h3>
                        <button onClick={() => { setFormAberto(false); limparForm(); }} title="Fechar (Esc)" className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
                    </div>

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
                            <label className={labelClasse}>Quadro</label>
                            <select
                                value={formGrupo}
                                onChange={(e) => { setFormGrupo(e.target.value as Grupo); if (e.target.value !== 'FORNECEDORES') setRecorrente(false); }}
                                className={campoClasse}
                            >
                                {GRUPOS.filter((g) => g.value !== 'TODOS').map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                            </select>
                        </div>
                        {!recorrente && (
                            <div>
                                <label className={labelClasse}>Vencimento *</label>
                                <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campoClasse} />
                            </div>
                        )}
                        {!ehFisica && (
                            <div>
                                <label className={labelClasse}>Tipo</label>
                                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campoClasse}>
                                    {TIPOS_CONTA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className={labelClasse}>Forma de pagamento</label>
                            <select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className={campoClasse}>
                                {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {!ehFisica && (
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
                                {formRateio && formRateio.ids.length >= 2 ? (
                                    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40">
                                        {formRateio.ids.map((id, i) => {
                                            const placa = caminhoes.find((c) => c.id === id)?.placa ?? '?';
                                            const v = formRateio.valores?.[i] ?? (Number(valor) || 0) / formRateio.ids.length;
                                            return <span key={id} className={`px-1.5 py-0.5 rounded border text-[11px] font-bold ${corPlaca(placa)}`}>{placa} {formatCurrency(v)}</span>;
                                        })}
                                        <button type="button" onClick={() => setModalRateioForm(true)} className="ml-auto text-xs text-blue-600 hover:underline">Alterar</button>
                                        <button type="button" onClick={() => setFormRateio(null)} className="text-xs text-red-500 hover:underline">Remover</button>
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <select value={caminhaoId} onChange={(e) => setCaminhaoId(e.target.value)} className={campoClasse}>
                                            <option value="">Não vinculado</option>
                                            {caminhoes.map((c) => <option key={c.id} value={c.id}>{c.placa}</option>)}
                                        </select>
                                        <button type="button" onClick={() => setModalRateioForm(true)} title="Dividir o valor entre vários caminhões"
                                            className="shrink-0 px-3 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 whitespace-nowrap">
                                            Dividir
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {(tipo === 'BOLETO' || formaPagamento === 'BOLETO' || codigoBarras) && (
                        <div>
                            <label className={labelClasse}>Código de barras / linha digitável do boleto</label>
                            <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} className={`${campoClasse} font-mono`} placeholder="Cole aqui a linha digitável" />
                        </div>
                    )}
                    {(tipo === 'PIX' || formaPagamento === 'PIX' || pixChave) && (
                        <div className="grid sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                                <label className={labelClasse}>Chave Pix</label>
                                <input value={pixChave} onChange={(e) => setPixChave(e.target.value)} className={campoClasse} placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" />
                            </div>
                            <div>
                                <label className={labelClasse}>Tipo da chave</label>
                                <select value={pixTipoChave} onChange={(e) => setPixTipoChave(e.target.value)} className={campoClasse}>
                                    <option value="">—</option>
                                    {['CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA'].map((t) => <option key={t} value={t}>{t === 'ALEATORIA' ? 'Aleatória' : t === 'EMAIL' ? 'E-mail' : t === 'TELEFONE' ? 'Telefone' : t}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className={labelClasse}>Observação</label>
                        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} className={campoClasse} rows={2} />
                    </div>

                    {!editandoId && formGrupo === 'FORNECEDORES' && (
                        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={recorrente}
                                    onChange={(e) => setRecorrente(e.target.checked)}
                                    className="rounded border-gray-300 dark:border-gray-700"
                                />
                                <Repeat size={14} />
                                Conta recorrente (gera automaticamente os próximos 12 meses)
                            </label>

                            {recorrente && (
                                <div className="grid sm:grid-cols-2 gap-3 pl-1">
                                    <div>
                                        <label className={labelClasse}>Repetir</label>
                                        <select
                                            value={tipoRecorrencia}
                                            onChange={(e) => setTipoRecorrencia(e.target.value as 'MENSAL' | 'SEMANAL')}
                                            className={campoClasse}
                                        >
                                            <option value="MENSAL">Todo dia X do mês</option>
                                            <option value="SEMANAL">Todo dia da semana (seg-sex)</option>
                                        </select>
                                    </div>
                                    {tipoRecorrencia === 'MENSAL' ? (
                                        <div>
                                            <label className={labelClasse}>Dia do mês</label>
                                            <select value={diaMes} onChange={(e) => setDiaMes(e.target.value)} className={campoClasse}>
                                                {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                                                    <option key={d} value={d}>{d}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className={labelClasse}>Dia da semana</label>
                                            <select value={diaSemana} onChange={(e) => setDiaSemana(e.target.value as any)} className={campoClasse}>
                                                {DIAS_SEMANA.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setFormAberto(false); limparForm(); }} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                            Cancelar
                        </button>
                        <button
                            onClick={salvar}
                            disabled={salvando || salvandoRecorrente || !descricao.trim() || !valor || (!recorrente && !vencimento)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            {(salvando || salvandoRecorrente) && <Loader2 size={14} className="animate-spin" />}
                            Salvar
                        </button>
                    </div>
                </div></Modal>
            )}

            {recorrencias.length > 0 && (
                <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl p-4">
                    <button
                        onClick={() => setMostrarRecorrencias((v) => !v)}
                        className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                        <Repeat size={14} />
                        Contas recorrentes ativas ({recorrencias.length})
                    </button>

                    {mostrarRecorrencias && (
                        <div className="mt-3 space-y-1.5">
                            {recorrencias.map((r) => (
                                <div key={r.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-sm">
                                    <div>
                                        <p className="text-gray-900 dark:text-white">{r.descricao} — {formatCurrency(r.valor)}</p>
                                        <p className="text-xs text-gray-400">
                                            {r.tipoRecorrencia === 'MENSAL'
                                                ? `Todo dia ${r.diaMes} do mês`
                                                : `Toda ${DIAS_SEMANA.find((d) => d.value === r.diaSemana)?.label ?? r.diaSemana}`}
                                        </p>
                                    </div>
                                    <button onClick={() => desativarRecorrencia(r.id)} title="Desativar recorrência" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                {loading ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
                ) : contas.length === 0 ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Nenhuma conta encontrada com esses filtros.</p>
                ) : (
                    <div className="overflow-x-auto">
                        {selecionadas.size > 0 && (
                            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/30">
                                <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                    {selecionadas.size} selecionada{selecionadas.size > 1 ? 's' : ''} — mover para:
                                </span>
                                {([['FORNECEDORES', 'Fornecedores'], ['IMPOSTOS', 'Impostos'], ['SOCIOS', 'Sócios']] as const).map(([v, l]) => (
                                    <button key={v} disabled={movendo} onClick={() => moverSelecionadas(v)}
                                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:opacity-60">
                                        {l}
                                    </button>
                                ))}
                                {!ehFisica && (
                                    <>
                                        <span className="mx-1 text-gray-300">|</span>
                                        <select value={massaCaminhao} onChange={(e) => setMassaCaminhao(e.target.value)}
                                            className="px-2 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0B1120] text-gray-900 dark:text-white">
                                            <option value="">Carreta: não mudar</option>
                                            <option value="GERAL">Geral (todas)</option>
                                            {caminhoes.map((c) => <option key={c.id} value={c.id}>{c.placa}</option>)}
                                        </select>
                                        <select value={massaCategoria} onChange={(e) => setMassaCategoria(e.target.value)}
                                            className="px-2 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0B1120] text-gray-900 dark:text-white">
                                            <option value="">Categoria: não mudar</option>
                                            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                        </select>
                                        <button type="button" onClick={() => setModalRateio(true)}
                                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 text-white">
                                            Dividir entre carretas
                                        </button>
                                        <button disabled={movendo || (!massaCaminhao && !massaCategoria)} onClick={aplicarEmMassa}
                                            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white disabled:opacity-50">
                                            Aplicar
                                        </button>
                                    </>
                                )}
                                <button onClick={() => setSelecionadas(new Set())} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-300">
                                    Limpar
                                </button>
                            </div>
                        )}
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2.5 pl-4 pr-1 w-8">
                                        <input type="checkbox" title="Selecionar todas desta página"
                                            checked={contas.length > 0 && selecionadas.size === contas.length}
                                            onChange={alternarTodas} />
                                    </th>
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
                                        <tr
                                            onClick={() => setDetalhe(c)}
                                            className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40"
                                        >
                                            <td className="py-2.5 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                                                <input type="checkbox" checked={selecionadas.has(c.id)} onChange={() => alternarSelecao(c.id)} />
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <p className="font-semibold text-gray-900 dark:text-white">
                                                    <span className={`inline-block mr-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase align-middle ${
                                                        (c.grupo ?? 'FORNECEDORES') === 'IMPOSTOS'
                                                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300'
                                                            : (c.grupo ?? 'FORNECEDORES') === 'SOCIOS'
                                                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300'
                                                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                                    }`}>
                                                        {{ FORNECEDORES: 'Fornecedor', IMPOSTOS: 'Imposto', SOCIOS: 'Sócio' }[(c.grupo ?? 'FORNECEDORES') as 'FORNECEDORES' | 'IMPOSTOS' | 'SOCIOS']}
                                                    </span>
                                                    {c.descricao}
                                                </p>
                                                {!ehFisica && (c.rateios?.length ?? 0) >= 2 ? (
                                                    <EtiquetaRateio rateios={c.rateios} />
                                                ) : !ehFisica && (
                                                    c.caminhao ? (
                                                        <Link
                                                            to={`/caminhoes/${encodeURIComponent(c.caminhao.placa)}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className={`inline-block mt-0.5 px-2 py-0.5 rounded border text-xs font-bold hover:opacity-80 ${corPlaca(c.caminhao.placa)}`}
                                                        >
                                                            🚚 {c.caminhao.placa}
                                                        </Link>
                                                    ) : (
                                                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded border text-xs ${COR_GERAL}`}>Geral</span>
                                                    )
                                                )}
                                            </td>
                                            <td className="py-2.5 px-4">{c.fornecedor?.nome ?? '-'}</td>
                                            <td className="py-2.5 px-4">
                                                {c.categoria?.nome ?? '-'}
                                            </td>
                                            <td className="py-2.5 px-4 whitespace-nowrap">
                                                <p>{new Date(c.vencimento).toLocaleDateString('pt-BR')}</p>
                                                <p className={`text-xs ${rotuloPrazo(c).tom}`}>{rotuloPrazo(c).texto}</p>
                                            </td>
                                            <td className="py-2.5 px-4">
                                                <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(c.valor)}</p>
                                                {(c.juros ?? 0) > 0 && (
                                                    <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                                                        Juros + {formatCurrency(c.juros)} · pago {formatCurrency(c.valor + (c.juros ?? 0))}
                                                    </p>
                                                )}
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
                                            <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center gap-2">
                                                    {grupo === 'FORNECEDORES' && c.status !== 'PAGA' && c.status !== 'CANCELADA' && diasAte(c.vencimento) < 0 && (
                                                        <button
                                                            onClick={() => incluirHoje(c)}
                                                            title={c.queuedForPaymentAt ? 'Remover de hoje' : 'Incluir em hoje'}
                                                            className={`p-1.5 rounded-lg transition ${c.queuedForPaymentAt
                                                                ? 'text-amber-600 bg-amber-50 dark:bg-amber-500/10'
                                                                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                                                                }`}
                                                        >
                                                            <Clock size={16} />
                                                        </button>
                                                    )}
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
                                                    {c.documento && (
                                                        <button onClick={() => abrirDocumentoConta(c.id)} title={c.documento.tipo === 'BOLETO' ? 'Ver boleto' : 'Ver documento'} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition">
                                                            <FileText size={16} />
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
                                                <td colSpan={8} className="py-3 px-4">
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

            {detalhe && (
                <Modal onFechar={() => setDetalhe(null)} className="z-40 bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">{detalhe.descricao}</h3>
                                <p className={`text-xs mt-0.5 ${rotuloPrazo(detalhe).tom}`}>{rotuloPrazo(detalhe).texto}</p>
                            </div>
                            <button onClick={() => setDetalhe(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                                <X size={16} />
                            </button>
                        </div>

                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                            {[
                                ['Valor', formatCurrency(detalhe.valor)],
                                ['Saldo a pagar', formatCurrency(detalhe.saldoDevedor ?? detalhe.valor)],
                                ['Vencimento', new Date(detalhe.vencimento).toLocaleDateString('pt-BR')],
                                ['Status', traduzStatus[detalhe.status]],
                                ['Fornecedor', detalhe.fornecedor?.nome ?? '-'],
                                ['Categoria', detalhe.categoria?.nome ?? '-'],
                                ['Forma de pagamento', FORMAS_PAGAMENTO.find((f) => f.value === detalhe.formaPagamento)?.label ?? detalhe.formaPagamento],
                                ['Tipo', TIPOS_CONTA.find((t) => t.value === detalhe.tipo)?.label ?? detalhe.tipo],
                                ['Caminhão', detalhe.caminhao?.placa ?? '-'],
                                ['Pago em', detalhe.pagoEm ? new Date(detalhe.pagoEm).toLocaleDateString('pt-BR') : '-'],
                            ].map(([rotulo, valor]) => (
                                <div key={rotulo}>
                                    <dt className="text-xs text-gray-400">{rotulo}</dt>
                                    <dd className="text-gray-900 dark:text-white font-medium">{valor}</dd>
                                </div>
                            ))}
                        </dl>

                        {(detalhe.codigoBarras || detalhe.pixChave || detalhe.pixQrCode || detalhe.favorecido || detalhe.banco || detalhe.documento) && (
                            <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-500/5 p-3 space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Dados para pagamento</p>
                                    {detalhe.documento && (
                                        <button onClick={() => abrirDocumentoConta(detalhe.id)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-blue-300 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 bg-white dark:bg-transparent hover:bg-blue-50">
                                            <FileText size={13} /> {detalhe.documento.tipo === 'BOLETO' ? 'Ver boleto' : 'Ver documento'}
                                        </button>
                                    )}
                                </div>
                                {detalhe.codigoBarras && (
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Código de barras (linha digitável)</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 min-w-0 break-all px-2.5 py-2 rounded-lg bg-white dark:bg-[#0B1120] border border-gray-200 dark:border-gray-700 text-[13px] font-mono text-gray-900 dark:text-white">{formatarLinhaDigitavel(detalhe.codigoBarras)}</code>
                                            <BotaoCopiar texto={detalhe.codigoBarras.replace(/\D/g, '')} />
                                        </div>
                                    </div>
                                )}
                                {detalhe.pixChave && (
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Chave Pix{detalhe.pixTipoChave ? ` (${detalhe.pixTipoChave.toLowerCase()})` : ''}</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 min-w-0 break-all px-2.5 py-2 rounded-lg bg-white dark:bg-[#0B1120] border border-gray-200 dark:border-gray-700 text-[13px] font-mono text-gray-900 dark:text-white">{detalhe.pixChave}</code>
                                            <BotaoCopiar texto={detalhe.pixChave} />
                                        </div>
                                    </div>
                                )}
                                {detalhe.pixQrCode && (
                                    <div>
                                        <p className="text-xs text-gray-500 mb-1">Pix copia e cola</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 min-w-0 truncate px-2.5 py-2 rounded-lg bg-white dark:bg-[#0B1120] border border-gray-200 dark:border-gray-700 text-[12px] font-mono text-gray-900 dark:text-white">{detalhe.pixQrCode}</code>
                                            <BotaoCopiar texto={detalhe.pixQrCode} />
                                        </div>
                                    </div>
                                )}
                                {(detalhe.favorecido || detalhe.banco || detalhe.agencia || detalhe.conta) && (() => {
                                    const linhas = [
                                        detalhe.favorecido && `Favorecido: ${detalhe.favorecido}`,
                                        detalhe.banco && `Banco: ${detalhe.banco}`,
                                        detalhe.agencia && `Agência: ${detalhe.agencia}`,
                                        detalhe.conta && `Conta: ${detalhe.conta}`,
                                    ].filter(Boolean) as string[];
                                    return (
                                        <div className="flex items-start gap-2">
                                            <div className="flex-1 text-sm text-gray-800 dark:text-gray-200 space-y-0.5">{linhas.map((l) => <p key={l}>{l}</p>)}</div>
                                            <BotaoCopiar texto={linhas.join('\n')} />
                                        </div>
                                    );
                                })()}
                                <div className="flex items-center justify-between text-sm pt-1 border-t border-blue-100 dark:border-blue-500/20">
                                    <span className="text-gray-500">Valor a pagar · vence {new Date(detalhe.vencimento).toLocaleDateString('pt-BR')}</span>
                                    <span className="inline-flex items-center gap-2 font-bold text-gray-900 dark:text-white">
                                        {formatCurrency(detalhe.saldoDevedor ?? detalhe.valor)}
                                        <BotaoCopiar texto={(detalhe.saldoDevedor ?? detalhe.valor).toFixed(2).replace('.', ',')} rotulo="Valor" />
                                    </span>
                                </div>
                            </div>
                        )}

                        {detalhe.observacao && (
                            <div>
                                <p className="text-xs text-gray-400">Observação</p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{detalhe.observacao}</p>
                            </div>
                        )}

                        <div>
                            <p className="text-xs text-gray-400 mb-1.5">Baixas (pagamentos)</p>
                            {detalhePagamentos.length === 0 ? (
                                <p className="text-xs text-gray-400">Nenhuma baixa registrada.</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {detalhePagamentos.map((p) => (
                                        <div key={p.id} className="text-xs bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300">
                                            {new Date(p.data).toLocaleDateString('pt-BR')} — {formatCurrency(p.valor)}
                                            {p.formaPagamento ? ` · ${p.formaPagamento}` : ''}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap justify-end gap-2 pt-1">
                            {detalhe.status !== 'PAGA' && detalhe.status !== 'CANCELADA' && (
                                <>
                                    {(detalhe.grupo ?? 'FORNECEDORES') === 'FORNECEDORES' && (
                                    <button
                                        onClick={() => { const c = detalhe; setDetalhe(null); incluirHoje(c); }}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                    >
                                        <Clock size={14} />
                                        {detalhe.queuedForPaymentAt ? 'Tirar de hoje' : 'Pagar hoje'}
                                    </button>
                                    )}
                                    <button
                                        onClick={() => { const c = detalhe; setDetalhe(null); abrirPagamento(c); }}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition"
                                    >
                                        <CheckCircle2 size={14} />
                                        Registrar pagamento
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => { const c = detalhe; setDetalhe(null); editar(c); }}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                            >
                                <Pencil size={14} />
                                Editar
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {contaPagamento && (
                <Modal onFechar={fecharPagamento} className="z-50 bg-black/40 backdrop-blur-sm">
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
                </Modal>
            )}
        </div>
    );
}
