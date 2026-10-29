import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowDown, ArrowUp, ChevronDown, Clock, Copy, Download, FileSpreadsheet, Filter, Loader2, Pencil, Plus, Search, Settings2, Trash2, Truck, Upload, Users, Wallet, X,
} from 'lucide-react';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import { FiltroMes } from '../components/FiltroMes';
import { corPlaca } from '../lib/corPlaca';

// =============================================================================
// Controle de Viagens — a planilha de viagens dentro do sistema. Cada aba tem
// as próprias colunas (configuráveis); dá pra importar o Excel, filtrar por
// qualquer campo, criar/editar/duplicar viagens e exportar de volta pro Excel.
// =============================================================================

type TipoColuna = 'texto' | 'data' | 'hora' | 'numero' | 'moeda' | 'duracao';
type Coluna = {
    key: string;
    label: string;
    tipo: TipoColuna;
    calculo?: { inicioData: string; inicioHora?: string; fimData: string; fimHora?: string };
    largura?: number;
};
type Aba = { id: string; nome: string; titulo: string | null; ordem: number; colunas: Coluna[]; totalLinhas: number };
type Linha = { id: string; dados: Record<string, any>; ordem: number; createdAt: string };
type Modelo = { id: string; nome: string; colunas: Coluna[] };

const TIPOS: { value: TipoColuna; label: string }[] = [
    { value: 'texto', label: 'Texto' },
    { value: 'data', label: 'Data' },
    { value: 'hora', label: 'Hora' },
    { value: 'numero', label: 'Número' },
    { value: 'moeda', label: 'Valor (R$)' },
    { value: 'duracao', label: 'Duração (calculada)' },
];

const campo = 'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const rotulo = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition';
const btnSec = `${btn} bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800`;

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function duracaoMin(d: Record<string, any>, c?: Coluna['calculo']): number | null {
    if (!c) return null;
    const inst = (data?: string, hora?: string) => {
        if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
        const [h, m] = /^\d{2}:\d{2}$/.test(hora ?? '') ? hora!.split(':').map(Number) : [0, 0];
        const [a, me, di] = data.split('-').map(Number);
        return Date.UTC(a, me - 1, di, h, m) / 60000;
    };
    const ini = inst(d[c.inicioData], c.inicioHora ? d[c.inicioHora] : undefined);
    const fim = inst(d[c.fimData], c.fimHora ? d[c.fimHora] : undefined);
    return ini === null || fim === null ? null : fim - ini;
}

// Valor pronto pra mostrar (e pra filtrar: o filtro procura no texto mostrado).
function formatar(col: Coluna, dados: Record<string, any>): string {
    const v = dados[col.key];
    switch (col.tipo) {
        case 'duracao': {
            const m = duracaoMin(dados, col.calculo);
            if (m === null) return '';
            const neg = m < 0 ? '-' : '';
            const a = Math.abs(m);
            return `${neg}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
        }
        case 'data':
            return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : (v ?? '');
        case 'moeda':
            return typeof v === 'number' ? moeda(v) : (v ?? '');
        case 'numero':
            return typeof v === 'number' ? v.toLocaleString('pt-BR') : (v ?? '');
        default:
            return v === undefined || v === null ? '' : String(v);
    }
}

function valorOrdenacao(col: Coluna, dados: Record<string, any>): string | number {
    if (col.tipo === 'duracao') return duracaoMin(dados, col.calculo) ?? -Infinity;
    const v = dados[col.key];
    if (col.tipo === 'numero' || col.tipo === 'moeda') return typeof v === 'number' ? v : -Infinity;
    return v === undefined || v === null ? '' : semAcento(String(v));
}

// Filtro de uma coluna: texto contido; em número/valor/duração aceita ">1000", "<=500".
function passaFiltro(col: Coluna, dados: Record<string, any>, filtro: string): boolean {
    const f = filtro.trim();
    if (!f) return true;
    const cmp = /^(>=|<=|>|<|=)\s*(-?[\d.,]+)$/.exec(f);
    if (cmp && (col.tipo === 'numero' || col.tipo === 'moeda' || col.tipo === 'duracao')) {
        const alvo = Number(cmp[2].replace(/\./g, '').replace(',', '.'));
        const v = col.tipo === 'duracao' ? (duracaoMin(dados, col.calculo) ?? NaN) / 60 : Number(dados[col.key]);
        if (!Number.isFinite(v)) return false;
        return { '>': v > alvo, '<': v < alvo, '>=': v >= alvo, '<=': v <= alvo, '=': v === alvo }[cmp[1]]!;
    }
    if (f === '(vazio)') return formatar(col, dados) === '';
    return semAcento(formatar(col, dados)).includes(semAcento(f));
}

// ---------------------------------------------------------------------------
// Visão "de sistema": em vez de uma coluna por campo (cara de Excel), agrupa
// campos relacionados numa célula só — Motorista + Transportadora, Cavalo +
// Carretas, Origem → Destino, Data + Hora, Entrada → Saída. O que não se
// encaixa em nenhum grupo vira uma coluna normal.
// ---------------------------------------------------------------------------

type Celula = {
    id: string;
    titulo: string;
    keys: string[];
    sortKey: string;
    alinhar?: 'right' | 'center';
    render: (d: Record<string, any>) => React.ReactNode;
};

const vazio = <span className="text-gray-300 dark:text-gray-600">—</span>;
const dataCurta = (v?: string) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(2, 4)}` : v || '');

function montarVisao(colunas: Coluna[]): Celula[] {
    const por = new Map(colunas.map((c) => [c.key, c]));
    const usados = new Set<string>();
    const out: Celula[] = [];
    const usar = (...ks: string[]) => ks.forEach((k) => usados.add(k));

    for (const c of colunas) {
        if (usados.has(c.key)) continue;
        const k = c.key;

        if (k === 'motorista') {
            const t = por.get('transportadora');
            usar(k, ...(t ? [t.key] : []));
            out.push({
                id: k, titulo: 'Motorista', keys: [k, ...(t ? [t.key] : [])], sortKey: k,
                render: (d) => (
                    <div className="min-w-[170px]">
                        <p className="font-medium text-gray-900 dark:text-white">{d[k] || vazio}</p>
                        {t && d[t.key] && <p className="text-xs text-gray-500 dark:text-gray-400">{d[t.key]}</p>}
                    </div>
                ),
            });
            continue;
        }

        if (/^(cavalo|placa)$/.test(k) || /^carreta/.test(k)) {
            const grupo = colunas.filter((x) => /^(cavalo|placa)$/.test(x.key) || /^carreta/.test(x.key)).map((x) => x.key);
            usar(...grupo);
            out.push({
                id: 'conjunto', titulo: 'Conjunto', keys: grupo, sortKey: grupo[0],
                render: (d) => {
                    const [cav, ...carr] = grupo.map((g) => d[g]).filter(Boolean) as string[];
                    if (!cav && !carr.length) return vazio;
                    return (
                        <div className="flex items-center gap-1 whitespace-nowrap">
                            {cav && <span className={`px-2 py-0.5 rounded-md border text-xs font-bold ${corPlaca(cav)}`}>{cav}</span>}
                            {carr.map((p) => <span key={p} className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-[11px] font-medium text-gray-600 dark:text-gray-300">{p}</span>)}
                        </div>
                    );
                },
            });
            continue;
        }

        if (k === 'origem' && por.has('destino')) {
            usar('origem', 'destino');
            out.push({
                id: 'rota', titulo: 'Rota', keys: ['origem', 'destino'], sortKey: 'origem',
                render: (d) => (d.origem || d.destino
                    ? <span className="whitespace-nowrap text-gray-800 dark:text-gray-200">{d.origem || '?'} <span className="text-gray-400">→</span> {d.destino || '?'}</span>
                    : vazio),
            });
            continue;
        }

        if (k === 'entrada' && por.get('entrada')?.tipo === 'hora' && por.get('saida')?.tipo === 'hora') {
            usar('entrada', 'saida');
            out.push({
                id: 'terminal_horas', titulo: 'Entrada → Saída', keys: ['entrada', 'saida'], sortKey: 'entrada', alinhar: 'center',
                render: (d) => (d.entrada || d.saida ? <span className="tabular-nums whitespace-nowrap">{d.entrada || '--:--'} <span className="text-gray-400">→</span> {d.saida || '--:--'}</span> : vazio),
            });
            continue;
        }

        if (c.tipo === 'data') {
            const h = colunas.find((x) => x.tipo === 'hora' && !usados.has(x.key) && x.key === `hora_${k}`);
            usar(k, ...(h ? [h.key] : []));
            out.push({
                id: k, titulo: c.label, keys: [k, ...(h ? [h.key] : [])], sortKey: k, alinhar: 'center',
                render: (d) => (d[k]
                    ? <span className="tabular-nums whitespace-nowrap">{dataCurta(d[k])}{h && d[h.key] ? <span className="text-gray-400"> · {d[h.key]}</span> : ''}</span>
                    : vazio),
            });
            continue;
        }

        usar(k);
        out.push({
            id: k, titulo: c.label, keys: [k], sortKey: k,
            alinhar: c.tipo === 'moeda' || c.tipo === 'numero' ? 'right' : c.tipo === 'hora' || c.tipo === 'duracao' ? 'center' : undefined,
            render: (d) => {
                const t = formatar(c, d);
                if (!t) return vazio;
                if (/^ok$/i.test(t)) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400">OK</span>;
                if (/^pendente$/i.test(t)) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">Pendente</span>;
                if (c.tipo === 'moeda') return <span className="font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">{t}</span>;
                if (c.tipo === 'duracao') return <span className="inline-flex px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-semibold tabular-nums">{t}h</span>;
                if (/container/i.test(c.label)) {
                    return <div className="font-mono text-[11px] leading-4 text-gray-600 dark:text-gray-300">{t.split(/\s*\/\s*/).map((p) => <div key={p}>{p}</div>)}</div>;
                }
                if (/^(cte|rpa|cte_nf|nf)$/.test(k)) return <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{t}</span>;
                return <span className="text-gray-700 dark:text-gray-300 whitespace-nowrap">{t}</span>;
            },
        });
    }
    return out;
}

function Kpi({ titulo, valor, sub, icone: Icone, cor }: { titulo: string; valor: string; sub?: string; icone: typeof Truck; cor: string }) {
    return (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
            <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{titulo}</p>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cor}1A` }}><Icone size={16} style={{ color: cor }} /></div>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums mt-1">{valor}</p>
            {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
        </div>
    );
}

export function ControleViagens() {
    const [abas, setAbas] = useState<Aba[]>([]);
    const [abaId, setAbaId] = useState<string>('');
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [modelos, setModelos] = useState<Modelo[]>([]);

    const [busca, setBusca] = useState('');
    const [mes, setMes] = useState('');
    const [filtros, setFiltros] = useState<Record<string, string>>({});
    const [painelFiltros, setPainelFiltros] = useState(false);
    const [ordem, setOrdem] = useState<{ key: string; dir: 1 | -1 } | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const [modalViagem, setModalViagem] = useState<{ id?: string; dados: Record<string, any> } | null>(null);
    const [modalAba, setModalAba] = useState(false);
    const [modalColunas, setModalColunas] = useState(false);
    const [menuAba, setMenuAba] = useState(false);
    const [importando, setImportando] = useState(false);
    const inputImport = useRef<HTMLInputElement>(null);

    // Tabela larga: dá pra arrastar com o mouse (clicar e puxar pro lado) além
    // da barra de rolagem, que fica sempre visível no rodapé da caixa.
    const rolagem = useRef<HTMLDivElement>(null);
    const arraste = useRef<{ x: number; y: number; l: number; t: number; moveu: boolean } | null>(null);
    const arrastar = {
        onMouseDown: (e: React.MouseEvent) => {
            if (e.button !== 0 || (e.target as HTMLElement).closest('button,input,select,a') || !rolagem.current) return;
            arraste.current = { x: e.clientX, y: e.clientY, l: rolagem.current.scrollLeft, t: rolagem.current.scrollTop, moveu: false };
        },
        onMouseMove: (e: React.MouseEvent) => {
            const a = arraste.current;
            if (!a || !rolagem.current) return;
            const dx = e.clientX - a.x; const dy = e.clientY - a.y;
            if (!a.moveu && Math.abs(dx) + Math.abs(dy) < 6) return;
            a.moveu = true;
            rolagem.current.scrollLeft = a.l - dx;
            rolagem.current.scrollTop = a.t - dy;
        },
        onMouseUp: () => { setTimeout(() => { arraste.current = null; }, 0); },
        onMouseLeave: () => { arraste.current = null; },
        onClickCapture: (e: React.MouseEvent) => {
            if (arraste.current?.moveu) { e.stopPropagation(); e.preventDefault(); }
            arraste.current = null;
        },
    };

    const aba = abas.find((a) => a.id === abaId) ?? null;
    const colunas = useMemo(() => aba?.colunas ?? [], [aba]);
    const visao = useMemo(() => montarVisao(colunas), [colunas]);
    const colData = useMemo(() => colunas.find((c) => c.key === 'data') ?? colunas.find((c) => c.tipo === 'data'), [colunas]);

    const carregarAbas = useCallback(async (selecionar?: string) => {
        const r = await api.get('/controle-viagens/abas');
        const lista: Aba[] = r.data ?? [];
        setAbas(lista);
        let salvo = '';
        try { salvo = localStorage.getItem('controle-viagens-aba') ?? ''; } catch { /* ignora */ }
        const alvo = selecionar ?? (lista.some((a) => a.id === abaId) ? abaId : lista.some((a) => a.id === salvo) ? salvo : lista[0]?.id ?? '');
        setAbaId(alvo);
    }, [abaId]);

    useEffect(() => {
        carregarAbas().catch(() => { });
        api.get('/controle-viagens/modelos').then((r) => setModelos(r.data ?? [])).catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const carregarLinhas = useCallback(async () => {
        if (!abaId) { setLinhas([]); return; }
        setCarregando(true);
        try {
            const r = await api.get(`/controle-viagens/abas/${abaId}/linhas`);
            setLinhas(r.data ?? []);
        } catch {
            setLinhas([]);
        } finally {
            setCarregando(false);
        }
    }, [abaId]);

    useEffect(() => {
        carregarLinhas();
        setFiltros({}); setBusca(''); setOrdem(null); setPage(1);
        try { if (abaId) localStorage.setItem('controle-viagens-aba', abaId); } catch { /* ignora */ }
    }, [abaId, carregarLinhas]);

    useEffect(() => { setPage(1); }, [busca, filtros, mes, ordem]);

    const filtradas = useMemo(() => {
        const b = semAcento(busca.trim());
        let l = linhas.filter((ln) =>
            (!mes || !colData || String(ln.dados[colData.key] ?? '').startsWith(mes)) &&
            (!b || colunas.some((c) => semAcento(formatar(c, ln.dados)).includes(b))) &&
            colunas.every((c) => passaFiltro(c, ln.dados, filtros[c.key] ?? '')),
        );
        const col = ordem ? colunas.find((c) => c.key === ordem.key) : colData;
        const dir = ordem ? ordem.dir : -1; // padrão: mais recente primeiro
        if (col) l = [...l].sort((x, y) => {
            const a = valorOrdenacao(col, x.dados); const bb = valorOrdenacao(col, y.dados);
            return (a < bb ? -1 : a > bb ? 1 : 0) * dir || (y.ordem - x.ordem) * (ordem ? 0 : 1);
        });
        return l;
    }, [linhas, colunas, busca, filtros, ordem, mes, colData]);

    const pagina = filtradas.slice((page - 1) * pageSize, page * pageSize);

    const resumo = useMemo(() => {
        const colMoeda = colunas.find((c) => c.tipo === 'moeda');
        const colDur = colunas.find((c) => c.tipo === 'duracao');
        const distintos = (k: string) => new Set(filtradas.map((l) => l.dados[k]).filter(Boolean)).size;
        const dur = colDur ? filtradas.map((l) => duracaoMin(l.dados, colDur.calculo)).filter((m): m is number => m !== null && m >= 0) : [];
        return {
            colMoeda,
            frete: colMoeda ? filtradas.reduce((s, l) => s + (typeof l.dados[colMoeda.key] === 'number' ? l.dados[colMoeda.key] : 0), 0) : 0,
            motoristas: colunas.some((c) => c.key === 'motorista') ? distintos('motorista') : null,
            cavalos: colunas.some((c) => c.key === 'cavalo') ? distintos('cavalo') : null,
            mediaDur: dur.length ? dur.reduce((s, m) => s + m, 0) / dur.length : null,
            colDur,
        };
    }, [colunas, filtradas]);

    const sugestoes = useMemo(() => {
        const m: Record<string, string[]> = {};
        for (const c of colunas) {
            if (c.tipo !== 'texto') continue;
            const cont = new Map<string, number>();
            for (const l of linhas) { const v = l.dados[c.key]; if (typeof v === 'string' && v) cont.set(v, (cont.get(v) ?? 0) + 1); }
            m[c.key] = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([v]) => v);
        }
        return m;
    }, [colunas, linhas]);

    const filtrosAtivos = Object.entries(filtros).filter(([, v]) => v.trim());
    const temFiltro = !!busca.trim() || filtrosAtivos.length > 0 || !!mes;

    async function importar(file: File) {
        setImportando(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const r = await api.post('/controle-viagens/importar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            const criadas: { id: string; nome: string; linhas: number }[] = r.data?.abas ?? [];
            alert(`Importado:\n${criadas.map((a) => `• ${a.nome}: ${a.linhas} viagens`).join('\n')}`);
            await carregarAbas(criadas[0]?.id);
        } catch (e: any) {
            alert(e?.response?.data?.message ?? 'Não foi possível importar a planilha.');
        } finally {
            setImportando(false);
            if (inputImport.current) inputImport.current.value = '';
        }
    }

    async function exportar() {
        if (!aba) return;
        const r = await api.get(`/controle-viagens/abas/${aba.id}/exportar`, { responseType: 'blob' });
        const url = URL.createObjectURL(r.data);
        const a = document.createElement('a');
        a.href = url; a.download = `Controle de Viagens - ${aba.nome}.xlsx`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    async function renomearAba() {
        if (!aba) return;
        const nome = prompt('Nome da aba:', aba.nome);
        if (nome === null || !nome.trim()) return;
        const titulo = prompt('Descrição da operação (opcional):', aba.titulo ?? '');
        await api.patch(`/controle-viagens/abas/${aba.id}`, { nome, titulo: titulo ?? aba.titulo });
        carregarAbas(aba.id);
    }

    async function excluirAba() {
        if (!aba) return;
        if (!confirm(`Excluir a aba "${aba.nome}" e as ${aba.totalLinhas} viagens dela? Isso não tem volta.`)) return;
        if (prompt(`Para confirmar, digite o nome da aba: ${aba.nome}`) !== aba.nome) return;
        await api.delete(`/controle-viagens/abas/${aba.id}`);
        carregarAbas('');
    }

    async function moverAba(dir: -1 | 1) {
        if (!aba) return;
        const i = abas.findIndex((a) => a.id === aba.id);
        const j = i + dir;
        if (j < 0 || j >= abas.length) return;
        const nova = [...abas];
        [nova[i], nova[j]] = [nova[j], nova[i]];
        await Promise.all(nova.map((a, k) => (a.ordem === k ? null : api.patch(`/controle-viagens/abas/${a.id}`, { ordem: k }))));
        carregarAbas(aba.id);
    }

    async function excluirLinha(l: Linha) {
        if (!confirm('Excluir esta viagem?')) return;
        await api.delete(`/controle-viagens/linhas/${l.id}`);
        setLinhas((ls) => ls.filter((x) => x.id !== l.id));
        setAbas((as) => as.map((a) => (a.id === abaId ? { ...a, totalLinhas: a.totalLinhas - 1 } : a)));
    }

    function novaViagem() {
        const dados: Record<string, any> = {};
        if (colData) dados[colData.key] = hojeISO();
        setModalViagem({ dados });
    }

    const ordenarPor = (key: string) => setOrdem((o) => (o?.key === key ? (o.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Controle de Viagens</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{aba?.titulo || 'Viagens por operação. Clique numa viagem para ver ou editar.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <input ref={inputImport} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
                    <button onClick={() => inputImport.current?.click()} disabled={importando} className={btnSec}>
                        {importando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Importar
                    </button>
                    {aba && <button onClick={exportar} className={btnSec}><Download size={16} /> Exportar</button>}
                    {aba && <button onClick={novaViagem} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}><Plus size={16} /> Nova viagem</button>}
                </div>
            </div>

            {/* Operações (abas) */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900 overflow-x-auto max-w-full">
                    {abas.map((a) => (
                        <button key={a.id} onClick={() => setAbaId(a.id)}
                            className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${a.id === abaId
                                ? 'bg-white dark:bg-[#111827] text-gray-900 dark:text-white shadow'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                            {a.nome}
                            <span className={`px-1.5 py-0.5 rounded-md text-[11px] ${a.id === abaId ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>{a.totalLinhas}</span>
                        </button>
                    ))}
                </div>
                <button onClick={() => setModalAba(true)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10">
                    <Plus size={15} /> Nova operação
                </button>
                {aba && (
                    <div className="relative ml-auto">
                        <button onClick={() => setMenuAba((v) => !v)} className={btnSec}><Settings2 size={15} /> Configurar <ChevronDown size={14} /></button>
                        {menuAba && (
                            <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827] shadow-lg py-1 text-sm"
                                onMouseLeave={() => setMenuAba(false)}>
                                {[
                                    { l: 'Campos da operação', f: () => setModalColunas(true) },
                                    { l: 'Renomear / descrição', f: renomearAba },
                                    { l: 'Mover para a esquerda', f: () => moverAba(-1) },
                                    { l: 'Mover para a direita', f: () => moverAba(1) },
                                ].map((o) => (
                                    <button key={o.l} onClick={() => { setMenuAba(false); o.f(); }} className="block w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200">{o.l}</button>
                                ))}
                                <button onClick={() => { setMenuAba(false); excluirAba(); }} className="block w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-600">Excluir operação</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {!aba ? (
                <div className="p-10 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-center space-y-3">
                    <FileSpreadsheet className="mx-auto text-blue-600" size={36} />
                    <p className="text-gray-700 dark:text-gray-200 font-medium">Nenhuma operação cadastrada.</p>
                    <p className="text-sm text-gray-500">Importe sua planilha do Excel (cada aba vira uma operação) ou crie uma operação nova.</p>
                    <div className="flex justify-center gap-2">
                        <button onClick={() => inputImport.current?.click()} className={btnSec}><Upload size={16} /> Importar Excel</button>
                        <button onClick={() => setModalAba(true)} className={`${btn} bg-blue-600 text-white`}><Plus size={16} /> Nova operação</button>
                    </div>
                </div>
            ) : (
                <>
                    {colData && <FiltroMes mes={mes} onChange={setMes} />}

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Kpi titulo="Viagens" valor={filtradas.length.toLocaleString('pt-BR')} sub={temFiltro ? `de ${linhas.length} na operação` : 'na operação'} icone={Truck} cor="#3b82f6" />
                        {resumo.colMoeda
                            ? <Kpi titulo={resumo.colMoeda.label} valor={moeda(resumo.frete)} sub={filtradas.length ? `média ${moeda(resumo.frete / filtradas.length)}` : undefined} icone={Wallet} cor="#22c55e" />
                            : <Kpi titulo={resumo.colDur?.label ?? 'Diárias'} valor={resumo.mediaDur === null ? '—' : `${Math.floor(resumo.mediaDur / 60)}h${String(Math.round(resumo.mediaDur % 60)).padStart(2, '0')}`} sub="tempo médio no cliente" icone={Clock} cor="#f59e0b" />}
                        <Kpi titulo="Motoristas" valor={resumo.motoristas === null ? '—' : String(resumo.motoristas)} sub="diferentes no período" icone={Users} cor="#a855f7" />
                        <Kpi titulo="Cavalos" valor={resumo.cavalos === null ? '—' : String(resumo.cavalos)} sub="placas diferentes" icone={Truck} cor="#ef4444" />
                    </div>

                    <div className="p-3 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[220px]">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input value={busca} onChange={(e) => setBusca(e.target.value)} className={`${campo} pl-9`}
                                    placeholder="Buscar por motorista, placa, CT-e, container, cliente, valor..." />
                            </div>
                            <button onClick={() => setPainelFiltros((v) => !v)} className={`${btnSec} ${painelFiltros || filtrosAtivos.length ? '!border-blue-400 !text-blue-700 dark:!text-blue-300' : ''}`}>
                                <Filter size={16} /> Filtros{filtrosAtivos.length ? ` (${filtrosAtivos.length})` : ''}
                            </button>
                            {temFiltro && (
                                <button onClick={() => { setBusca(''); setFiltros({}); setMes(''); }} className={`${btn} text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10`}><X size={16} /> Limpar</button>
                            )}
                        </div>
                        {painelFiltros && (
                            <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 pt-1">
                                {colunas.map((c) => (
                                    <div key={c.key}>
                                        <label className={rotulo}>{c.label}</label>
                                        <input value={filtros[c.key] ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, [c.key]: e.target.value }))}
                                            list={c.tipo === 'texto' ? `filtro-${c.key}` : undefined}
                                            placeholder={c.tipo === 'moeda' || c.tipo === 'numero' ? 'ex: >5000' : c.tipo === 'data' ? 'ex: 05/2026' : c.tipo === 'duracao' ? 'ex: >24 (horas)' : 'contém...'}
                                            className={campo} />
                                        {c.tipo === 'texto' && <datalist id={`filtro-${c.key}`}>{(sugestoes[c.key] ?? []).slice(0, 60).map((s) => <option key={s} value={s} />)}</datalist>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {filtrosAtivos.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {filtrosAtivos.map(([k, v]) => (
                                    <span key={k} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs">
                                        {colunas.find((c) => c.key === k)?.label}: <strong>{v}</strong>
                                        <button onClick={() => setFiltros((f) => ({ ...f, [k]: '' }))} className="p-0.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20"><X size={12} /></button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 overflow-hidden">
                        <div ref={rolagem} className="overflow-auto max-h-[calc(100vh-140px)] select-none" {...arrastar}>
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-[#0f1729] shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40">
                                        {visao.map((v) => (
                                            <th key={v.id} onClick={() => ordenarPor(v.sortKey)}
                                                className={`py-3 px-4 font-semibold whitespace-nowrap cursor-pointer select-none hover:text-gray-800 dark:hover:text-gray-200 ${v.alinhar === 'right' ? 'text-right' : v.alinhar === 'center' ? 'text-center' : ''}`}>
                                                <span className="inline-flex items-center gap-1">
                                                    {v.titulo}
                                                    {ordem?.key === v.sortKey && (ordem.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                                </span>
                                            </th>
                                        ))}
                                        <th className="py-3 px-4 w-24" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {carregando && (
                                        <tr><td colSpan={visao.length + 1} className="py-12 text-center text-gray-400"><Loader2 className="inline animate-spin mr-2" size={18} />Carregando...</td></tr>
                                    )}
                                    {!carregando && filtradas.length === 0 && (
                                        <tr><td colSpan={visao.length + 1} className="py-12 text-center text-gray-400">{linhas.length ? 'Nenhuma viagem com esse filtro.' : 'Nenhuma viagem nesta operação ainda.'}</td></tr>
                                    )}
                                    {!carregando && pagina.map((l) => (
                                        <tr key={l.id} onClick={() => setModalViagem({ id: l.id, dados: { ...l.dados } })}
                                            className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
                                            {visao.map((v) => (
                                                <td key={v.id} className={`py-3 px-4 align-middle ${v.alinhar === 'right' ? 'text-right' : v.alinhar === 'center' ? 'text-center' : ''}`}>{v.render(l.dados)}</td>
                                            ))}
                                            <td className="py-3 px-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="inline-flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                                                    <button title="Editar" onClick={() => setModalViagem({ id: l.id, dados: { ...l.dados } })} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><Pencil size={14} /></button>
                                                    <button title="Duplicar (nova viagem igual)" onClick={() => setModalViagem({ dados: { ...l.dados } })} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><Copy size={14} /></button>
                                                    <button title="Excluir" onClick={() => excluirLinha(l)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500"><Trash2 size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={page} pageSize={pageSize} total={filtradas.length} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
                    </div>
                </>
            )}

            {modalViagem && aba && (
                <ModalViagem
                    aba={aba}
                    inicial={modalViagem}
                    sugestoes={sugestoes}
                    onFechar={() => setModalViagem(null)}
                    onSalvo={(linha, novo) => {
                        setLinhas((ls) => (novo ? [...ls, linha] : ls.map((x) => (x.id === linha.id ? linha : x))));
                        if (novo) setAbas((as) => as.map((a) => (a.id === aba.id ? { ...a, totalLinhas: a.totalLinhas + 1 } : a)));
                    }}
                />
            )}
            {modalAba && (
                <ModalNovaAba abas={abas} modelos={modelos} onFechar={() => setModalAba(false)}
                    onCriada={(id) => { setModalAba(false); carregarAbas(id); }} />
            )}
            {modalColunas && aba && (
                <ModalColunas aba={aba} onFechar={() => setModalColunas(false)} onSalvo={() => { setModalColunas(false); carregarAbas(aba.id); }} />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Nova / editar viagem
// ---------------------------------------------------------------------------

// Agrupa os campos do formulário em seções, pelo nome/tipo do campo.
function secoesDoFormulario(colunas: Coluna[]): { titulo: string; colunas: Coluna[] }[] {
    const regras: [string, (c: Coluna) => boolean][] = [
        ['Motorista e veículo', (c) => c.key === 'data' || /^(motorista|transportadora|cavalo|placa|carreta)/.test(c.key)],
        ['Rota e cliente', (c) => /^(origem|destino|terminal|cliente|comercial|agendamento)/.test(c.key)],
        ['Documentos e valores', (c) => /^(cte|rpa|nf|container|frete|valor)/.test(c.key) || c.tipo === 'moeda'],
        ['Horários', (c) => c.tipo === 'data' || c.tipo === 'hora' || c.tipo === 'duracao' || /^(entrada|saida|chegada)/.test(c.key)],
    ];
    const usados = new Set<string>();
    const secoes = regras.map(([titulo, f]) => {
        const cs = colunas.filter((c) => !usados.has(c.key) && f(c));
        cs.forEach((c) => usados.add(c.key));
        return { titulo, colunas: cs };
    });
    secoes.push({ titulo: 'Outros', colunas: colunas.filter((c) => !usados.has(c.key)) });
    return secoes.filter((x) => x.colunas.length);
}

function ModalViagem({ aba, inicial, sugestoes, onFechar, onSalvo }: {
    aba: Aba;
    inicial: { id?: string; dados: Record<string, any> };
    sugestoes: Record<string, string[]>;
    onFechar: () => void;
    onSalvo: (l: Linha, novo: boolean) => void;
}) {
    const [dados, setDados] = useState<Record<string, any>>(() => {
        const d: Record<string, any> = {};
        for (const c of aba.colunas) {
            const v = inicial.dados[c.key];
            d[c.key] = v === undefined || v === null ? '' : (c.tipo === 'moeda' || c.tipo === 'numero') && typeof v === 'number' ? String(v).replace('.', ',') : String(v);
        }
        return d;
    });
    const [salvando, setSalvando] = useState(false);
    const editando = !!inicial.id;

    const payload = () => {
        const out: Record<string, any> = {};
        for (const c of aba.colunas) {
            if (c.tipo === 'duracao') continue;
            const v = String(dados[c.key] ?? '').trim();
            if (!v) continue;
            out[c.key] = c.tipo === 'moeda' || c.tipo === 'numero' ? Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v) : v;
        }
        return out;
    };

    async function salvar(continuar: boolean) {
        setSalvando(true);
        try {
            const r = editando
                ? await api.patch(`/controle-viagens/linhas/${inicial.id}`, { dados: payload() })
                : await api.post(`/controle-viagens/abas/${aba.id}/linhas`, { dados: payload() });
            onSalvo(r.data, !editando);
            if (continuar && !editando) {
                // Mantém data/motorista/transportadora/placas pra lançar a próxima mais rápido.
                setDados((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, ['data', 'motorista', 'transportadora', 'cavalo', 'carreta_1', 'carreta_2', 'terminal', 'origem', 'cliente', 'comercial'].includes(k) ? v : ''])));
            } else {
                onFechar();
            }
        } catch (e: any) {
            alert(e?.response?.data?.message ?? 'Não foi possível salvar.');
        } finally {
            setSalvando(false);
        }
    }

    const previaDuracao = (c: Coluna) => {
        const d: Record<string, any> = {};
        for (const k of Object.keys(dados)) d[k] = dados[k];
        return formatar(c, d) || '—';
    };

    return (
        <Modal onFechar={onFechar} className="z-50 bg-black/50">
            <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{editando ? 'Viagem' : 'Nova viagem'}</h3>
                        <p className="text-xs text-gray-500">{aba.nome}{aba.titulo ? ` · ${aba.titulo}` : ''}</p>
                    </div>
                    <button onClick={onFechar} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
                </div>
                {secoesDoFormulario(aba.colunas).map((sec) => (
                    <div key={sec.titulo} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{sec.titulo}</p>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {sec.colunas.map((c) => (
                                <div key={c.key} className={/container/i.test(c.label) ? 'sm:col-span-2' : ''}>
                                    <label className={rotulo}>{c.label}</label>
                                    {c.tipo === 'duracao' ? (
                                        <div className="px-3 py-2 rounded-lg text-sm bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 tabular-nums font-semibold">
                                            {previaDuracao(c)} <span className="text-xs font-normal opacity-70">(calculado)</span>
                                        </div>
                                    ) : (
                                        <>
                                            <input
                                                className={campo}
                                                type={c.tipo === 'data' ? 'date' : c.tipo === 'hora' ? 'time' : 'text'}
                                                inputMode={c.tipo === 'moeda' || c.tipo === 'numero' ? 'decimal' : undefined}
                                                list={c.tipo === 'texto' ? `sug-${c.key}` : undefined}
                                                placeholder={c.tipo === 'moeda' ? '0,00' : ''}
                                                value={dados[c.key] ?? ''}
                                                onChange={(e) => setDados((d) => ({ ...d, [c.key]: c.tipo === 'texto' && /^(cavalo|placa|carreta)/.test(c.key) ? e.target.value.toUpperCase() : e.target.value }))}
                                            />
                                            {c.tipo === 'texto' && <datalist id={`sug-${c.key}`}>{(sugestoes[c.key] ?? []).map((sg) => <option key={sg} value={sg} />)}</datalist>}
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={onFechar} className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancelar</button>
                    {!editando && (
                        <button disabled={salvando} onClick={() => salvar(true)} className={btnSec}>Salvar e lançar outra</button>
                    )}
                    <button disabled={salvando} onClick={() => salvar(false)} className={`${btn} bg-blue-600 text-white disabled:opacity-50`}>
                        {salvando && <Loader2 size={16} className="animate-spin" />} Salvar
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// Nova aba
// ---------------------------------------------------------------------------

function ModalNovaAba({ abas, modelos, onFechar, onCriada }: { abas: Aba[]; modelos: Modelo[]; onFechar: () => void; onCriada: (id: string) => void }) {
    const [nome, setNome] = useState('');
    const [titulo, setTitulo] = useState('');
    const [origem, setOrigem] = useState(abas[0] ? `aba:${abas[0].id}` : 'modelo:diversos');
    const [salvando, setSalvando] = useState(false);

    async function criar() {
        if (!nome.trim()) return;
        setSalvando(true);
        try {
            const [tipo, id] = origem.split(':');
            const r = await api.post('/controle-viagens/abas', { nome, titulo, ...(tipo === 'aba' ? { copiarDeId: id } : { modelo: id }) });
            onCriada(r.data.id);
        } catch (e: any) {
            alert(e?.response?.data?.message ?? 'Não foi possível criar a aba.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <Modal onFechar={onFechar} className="z-50 bg-black/50">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-semibold text-gray-900 dark:text-white">Nova operação</h3>
                <div><label className={rotulo}>Nome da operação *</label><input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: MIDEA, Stellantis..." autoFocus /></div>
                <div><label className={rotulo}>Descrição (opcional)</label><input className={campo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: OPERAÇÃO MIDEA - SANTOS x POUSO ALEGRE" /></div>
                <div>
                    <label className={rotulo}>Campos</label>
                    <select className={campo} value={origem} onChange={(e) => setOrigem(e.target.value)}>
                        {abas.length > 0 && <optgroup label="Copiar campos de uma operação">{abas.map((a) => <option key={a.id} value={`aba:${a.id}`}>Igual a “{a.nome}”</option>)}</optgroup>}
                        <optgroup label="Modelos">{modelos.map((m) => <option key={m.id} value={`modelo:${m.id}`}>{m.nome}</option>)}</optgroup>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Depois dá para adicionar, renomear ou remover campos em Configurar → Campos da operação.</p>
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={onFechar} className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancelar</button>
                    <button onClick={criar} disabled={salvando || !nome.trim()} className={`${btn} bg-blue-600 text-white disabled:opacity-50`}>Criar operação</button>
                </div>
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// Configurar colunas
// ---------------------------------------------------------------------------

function ModalColunas({ aba, onFechar, onSalvo }: { aba: Aba; onFechar: () => void; onSalvo: () => void }) {
    const [cols, setCols] = useState<Coluna[]>(() => aba.colunas.map((c) => ({ ...c, calculo: c.calculo ? { ...c.calculo } : undefined })));
    const [salvando, setSalvando] = useState(false);
    const datas = cols.filter((c) => c.tipo === 'data');
    const horas = cols.filter((c) => c.tipo === 'hora');

    const set = (i: number, patch: Partial<Coluna>) => setCols((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    const mover = (i: number, d: -1 | 1) => setCols((cs) => {
        const j = i + d; if (j < 0 || j >= cs.length) return cs;
        const n = [...cs]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });

    async function salvar() {
        setSalvando(true);
        try {
            await api.patch(`/controle-viagens/abas/${aba.id}`, { colunas: cols });
            onSalvo();
        } catch (e: any) {
            alert(e?.response?.data?.message ?? 'Não foi possível salvar as colunas.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <Modal onFechar={onFechar} className="z-50 bg-black/50">
            <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Campos da operação “{aba.nome}”</h3>
                    <button onClick={onFechar} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
                </div>
                <p className="text-xs text-gray-500">Remover um campo só esconde: os valores já lançados continuam guardados e voltam se o campo for recriado com o mesmo nome interno.</p>
                <div className="space-y-2">
                    {cols.map((c, i) => (
                        <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-800 p-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-gray-400 w-6 text-right">{i + 1}</span>
                                <input className={`${campo} !w-56`} value={c.label} onChange={(e) => set(i, { label: e.target.value })} />
                                <select className={`${campo} !w-44`} value={c.tipo}
                                    onChange={(e) => {
                                        const tipo = e.target.value as TipoColuna;
                                        set(i, { tipo, calculo: tipo === 'duracao' ? (c.calculo ?? { inicioData: datas[0]?.key ?? '', fimData: datas[1]?.key ?? datas[0]?.key ?? '' }) : undefined });
                                    }}>
                                    {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                <div className="ml-auto flex gap-1">
                                    <button onClick={() => mover(i, -1)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><ArrowUp size={14} /></button>
                                    <button onClick={() => mover(i, 1)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"><ArrowDown size={14} /></button>
                                    <button onClick={() => setCols((cs) => cs.filter((_, j) => j !== i))} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500"><Trash2 size={14} /></button>
                                </div>
                            </div>
                            {c.tipo === 'duracao' && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-8 text-xs">
                                    {([['inicioData', 'Início (data)', datas], ['inicioHora', 'Início (hora)', horas], ['fimData', 'Fim (data)', datas], ['fimHora', 'Fim (hora)', horas]] as const).map(([k, l, opcoes]) => (
                                        <div key={k}>
                                            <label className={rotulo}>{l}</label>
                                            <select className={campo} value={(c.calculo as any)?.[k] ?? ''}
                                                onChange={(e) => set(i, { calculo: { ...(c.calculo ?? { inicioData: '', fimData: '' }), [k]: e.target.value || undefined } as Coluna['calculo'] })}>
                                                <option value="">—</option>
                                                {opcoes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <button onClick={() => setCols((cs) => [...cs, { key: '', label: `Nova coluna ${cs.length + 1}`, tipo: 'texto' }])} className={btnSec}><Plus size={15} /> Adicionar campo</button>
                <div className="flex justify-end gap-2">
                    <button onClick={onFechar} className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancelar</button>
                    <button onClick={salvar} disabled={salvando} className={`${btn} bg-blue-600 text-white disabled:opacity-50`}>{salvando && <Loader2 size={16} className="animate-spin" />} Salvar campos</button>
                </div>
            </div>
        </Modal>
    );
}
