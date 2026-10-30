import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Loader2, Truck, Landmark, Search, X } from 'lucide-react';
import { api } from '../services/api';
import { FiltroMes } from '../components/FiltroMes';
import { lerMesCaminhoes, salvarMesCaminhoes } from '../lib/mes';

// =============================================================================
// Página de detalhe de um caminhão, buscado pela PLACA (não pelo id) —
// funciona tanto pra caminhão cadastrado (frota própria) quanto pra placa de
// terceiro que só existe em ViagemGps. Mostra o comparativo Receita
// (quadro azul) x Despesa (quadro vermelho) com total e diferença — é pra
// onde toda placa clicável no sistema (NF de Entrada/Serviço, Contas a
// Pagar etc) aponta.
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

type Detalhe = {
    placa: string;
    cadastrado: boolean;
    id: string | null;
    ativo: boolean | null;
    terceiro: boolean;
    totalReceita: number;
    totalDespesa: number;
    diferenca: number;
};

type Lancamento = {
    id: string;
    tipo: 'RECEITA' | 'DESPESA';
    descricao: string;
    valor: string | number;
    data: string;
    origem?: 'MANUAL' | 'CONTA_PAGAR' | 'CONTA_RECEBER' | 'EXTRATO' | 'ANTECIPACAO';
    status?: 'ABERTA' | 'PAGA' | 'VENCIDA' | 'CANCELADA' | 'PARCIAL';
};

const traduzStatusConta: Record<string, string> = {
    ABERTA: 'Aberta',
    PAGA: 'Paga',
    VENCIDA: 'Vencida',
    CANCELADA: 'Cancelada',
    PARCIAL: 'Parcial',
};

const tonsStatusConta: Record<string, string> = {
    ABERTA: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    PAGA: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    VENCIDA: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
    CANCELADA: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    PARCIAL: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
};

export function CaminhaoDetalhe() {
    const { placa } = useParams<{ placa: string }>();

    const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
    const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
    const [loading, setLoading] = useState(false);
    const [formAberto, setFormAberto] = useState<'' | 'RECEITA' | 'DESPESA'>('');
    const [descricao, setDescricao] = useState('');
    const [valor, setValor] = useState('');
    const [data, setData] = useState(hojeISO());
    const [salvando, setSalvando] = useState(false);
    const [filtro, setFiltro] = useState('');
    // '' = todos os meses; AAAA-MM = receita, despesa, lucro e lançamentos só daquele mês
    // Vem do card da tela Caminhões (?mes=AAAA-MM) já com o mês escolhido lá.
    const [searchParams] = useSearchParams();
    // Mês vem do link (?mes=) ou do último escolhido; trocar aqui vale também pra lista de Caminhões.
    const [mes, setMesEstado] = useState(() => (/^\d{4}-\d{2}$/.test(searchParams.get('mes') ?? '') ? searchParams.get('mes')! : lerMesCaminhoes()));
    const setMes = (m: string) => { setMesEstado(m); salvarMesCaminhoes(m); };

    async function carregar() {
        if (!placa) return;
        setLoading(true);
        try {
            const [resDetalhe, resLancamentos] = await Promise.all([
                api.get(`/caminhoes/detalhe/${encodeURIComponent(placa)}`, { params: { mes: mes || undefined } }),
                api.get(`/caminhoes/lancamentos/${encodeURIComponent(placa)}`, { params: { mes: mes || undefined } }),
            ]);
            setDetalhe(resDetalhe.data ?? null);
            setLancamentos(resLancamentos.data ?? []);
        } catch {
            setDetalhe(null);
            setLancamentos([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placa, mes]);

    function abrirForm(tipo: 'RECEITA' | 'DESPESA') {
        setFormAberto(tipo);
        setDescricao('');
        setValor('');
        setData(hojeISO());
    }

    async function salvarLancamento() {
        if (!placa || !formAberto || !descricao.trim() || !valor) return;
        setSalvando(true);
        try {
            await api.post('/caminhoes/lancamentos', {
                placa,
                tipo: formAberto,
                descricao: descricao.trim(),
                valor: Number(valor),
                data,
            });
            setFormAberto('');
            await carregar();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Não foi possível salvar o lançamento.');
        } finally {
            setSalvando(false);
        }
    }

    async function excluirLancamento(id: string) {
        if (!confirm('Excluir este lançamento?')) return;
        try {
            await api.delete(`/caminhoes/lancamentos/${id}`);
            await carregar();
        } catch {
            alert('Não foi possível excluir.');
        }
    }

    // Filtro por qualquer palavra da descrição, valor (2071,69 / 2.071,69) ou data.
    const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const termos = semAcento(filtro.trim()).split(/\s+/).filter(Boolean);
    const bate = (l: Lancamento) => {
        if (!termos.length) return true;
        const v = Number(l.valor);
        const alvo = semAcento(`${l.descricao} ${v.toFixed(2)} ${v.toFixed(2).replace('.', ',')} ${formatCurrency(v)} ${new Date(l.data).toLocaleDateString('pt-BR')}`);
        return termos.every((t) => alvo.includes(t));
    };
    const receitas = lancamentos.filter((l) => l.tipo === 'RECEITA' && bate(l));
    const despesas = lancamentos.filter((l) => l.tipo === 'DESPESA' && bate(l));
    const somaLista = (ls: Lancamento[]) => ls.reduce((s, l) => s + Number(l.valor), 0);

    return (
        <div className="space-y-6">
            <Link
                to="/caminhoes"
                className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
            >
                <ArrowLeft size={16} />
                Voltar pra Caminhões
            </Link>

            <div className="flex flex-wrap items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Truck size={22} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{placa}</h1>
                    <div className="flex items-center gap-2 mt-1">
                        {detalhe?.terceiro && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                                Terceiro
                            </span>
                        )}
                        {detalhe && !detalhe.cadastrado && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                Sem cadastro na frota
                            </span>
                        )}
                        {detalhe?.cadastrado && detalhe.ativo === false && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                                Inativo
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <FiltroMes
                mes={mes}
                onChange={setMes}
                dica={mes ? 'Receita, despesa, lucro e lançamentos só deste mês (receita de CT-e pela emissão; contas a pagar pelo vencimento).' : undefined}
            />

            {loading ? (
                <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
            ) : (
                <>
                    {/* Comparativo Receita x Despesa */}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="p-5 rounded-2xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-blue-700 dark:text-blue-400">Receita</h3>
                                <button
                                    onClick={() => abrirForm('RECEITA')}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition"
                                >
                                    <Plus size={14} />
                                    Nova
                                </button>
                            </div>
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                                {formatCurrency(detalhe?.totalReceita)}
                            </p>
                        </div>

                        <div className="p-5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-red-700 dark:text-red-400">Despesa</h3>
                                <button
                                    onClick={() => abrirForm('DESPESA')}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition"
                                >
                                    <Plus size={14} />
                                    Nova
                                </button>
                            </div>
                            <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                                {formatCurrency(detalhe?.totalDespesa)}
                            </p>
                        </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                            {(detalhe?.diferenca ?? 0) >= 0 ? 'Lucro' : 'Prejuízo'}
                        </span>
                        <span
                            className={`text-xl font-bold ${(detalhe?.diferenca ?? 0) >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                                }`}
                        >
                            {formatCurrency(detalhe?.diferenca)}
                        </span>
                    </div>

                    {formAberto && (
                        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                                Novo lançamento de {formAberto === 'RECEITA' ? 'receita' : 'despesa'}
                            </h3>
                            <div className="grid sm:grid-cols-3 gap-3">
                                <div className="sm:col-span-2">
                                    <label className={labelClasse}>Descrição *</label>
                                    <input
                                        value={descricao}
                                        onChange={(e) => setDescricao(e.target.value)}
                                        className={campoClasse}
                                        placeholder={formAberto === 'RECEITA' ? 'Ex: Frete Santos-Betim' : 'Ex: Manutenção, combustível'}
                                    />
                                </div>
                                <div>
                                    <label className={labelClasse}>Valor (R$) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={valor}
                                        onChange={(e) => setValor(e.target.value)}
                                        className={campoClasse}
                                        placeholder="0,00"
                                    />
                                </div>
                            </div>
                            <div className="sm:w-48">
                                <label className={labelClasse}>Data</label>
                                <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campoClasse} />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setFormAberto('')}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={salvarLancamento}
                                    disabled={salvando || !descricao.trim() || !valor}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition ${formAberto === 'RECEITA' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                                        }`}
                                >
                                    {salvando && <Loader2 size={14} className="animate-spin" />}
                                    Salvar
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={filtro} onChange={(e) => setFiltro(e.target.value)}
                            placeholder="Filtrar lançamentos por palavra, valor ou data (ex.: posto, 2071,69, 30/09)…"
                            className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm bg-white dark:bg-[#111827] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" />
                        {filtro && (
                            <button onClick={() => setFiltro('')} title="Limpar filtro" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X size={16} /></button>
                        )}
                    </div>
                    {termos.length > 0 && (
                        <p className="text-xs text-gray-500 -mt-2">
                            Filtro “{filtro.trim()}”: {receitas.length} receita(s) · {formatCurrency(somaLista(receitas))} — {despesas.length} despesa(s) · {formatCurrency(somaLista(despesas))}
                        </p>
                    )}

                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                            <h4 className="px-4 py-3 text-sm font-semibold text-blue-700 dark:text-blue-400 border-b border-gray-100 dark:border-gray-800 flex justify-between gap-2">
                                <span>Lançamentos de receita</span>
                                {termos.length > 0 && <span className="text-xs font-medium tabular-nums">{receitas.length} · {formatCurrency(somaLista(receitas))}</span>}
                            </h4>
                            {receitas.length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">{termos.length ? 'Nada encontrado com esse filtro.' : 'Nenhum lançamento ainda.'}</p>
                            ) : (
                                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {receitas.map((l) => (
                                        <li key={l.id} className="flex items-center justify-between px-4 py-2.5">
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">{l.descricao}</p>
                                                <p className="text-xs text-gray-400">{new Date(l.data).toLocaleDateString('pt-BR')}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                                                    {formatCurrency(Number(l.valor))}
                                                </span>
                                                {l.origem === 'CONTA_RECEBER' || l.origem === 'ANTECIPACAO' ? (
                                                    <Link
                                                        to="/financeiro-nf/contas-receber"
                                                        title="Ver em Contas a Receber"
                                                        className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
                                                    >
                                                        <Landmark size={14} />
                                                    </Link>
                                                ) : (
                                                    <button
                                                        onClick={() => excluirLancamento(l.id)}
                                                        className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                            <h4 className="px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-400 border-b border-gray-100 dark:border-gray-800 flex justify-between gap-2">
                                <span>Lançamentos de despesa</span>
                                {termos.length > 0 && <span className="text-xs font-medium tabular-nums">{despesas.length} · {formatCurrency(somaLista(despesas))}</span>}
                            </h4>
                            {despesas.length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">{termos.length ? 'Nada encontrado com esse filtro.' : 'Nenhum lançamento ainda.'}</p>
                            ) : (
                                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {despesas.map((l) => (
                                        <li key={l.id} className="flex items-center justify-between px-4 py-2.5">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{l.descricao}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <p className="text-xs text-gray-400">{new Date(l.data).toLocaleDateString('pt-BR')}</p>
                                                    {l.origem === 'CONTA_PAGAR' && l.status && (
                                                        <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${tonsStatusConta[l.status]}`}>
                                                            {traduzStatusConta[l.status]}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                                                    {formatCurrency(Number(l.valor))}
                                                </span>
                                                {l.origem === 'CONTA_PAGAR' || l.origem === 'EXTRATO' || l.origem === 'ANTECIPACAO' ? (
                                                    <Link
                                                        to={l.origem === 'EXTRATO' ? '/financeiro-nf/conciliacao-extrato' : l.origem === 'ANTECIPACAO' ? '/financeiro-nf/contas-receber' : '/financeiro-nf/contas-pagar'}
                                                        title={l.origem === 'EXTRATO' ? 'Veio da Conciliação do Extrato' : l.origem === 'ANTECIPACAO' ? 'Taxa da antecipação (Contas a Receber → Antecipação)' : 'Ver em Contas a Pagar'}
                                                        className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition"
                                                    >
                                                        <Landmark size={14} />
                                                    </Link>
                                                ) : (
                                                    <button
                                                        onClick={() => excluirLancamento(l.id)}
                                                        className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
