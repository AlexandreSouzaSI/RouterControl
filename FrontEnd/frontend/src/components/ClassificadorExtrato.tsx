import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pin, Scissors, Search, X } from 'lucide-react';
import { corPlaca } from '../lib/corPlaca';
import { Modal } from './Modal';
import { FIXOS, TIPO, cent, dataBR, fmt, moeda, norm, num, totaisExtrato, type CaminhaoOpcao, type ItemExtrato, type Parte } from '../lib/extrato';

export type { CaminhaoOpcao, ItemExtrato, Parte };

// =============================================================================
// Lista de pagamentos do extrato pra classificar (caminhão, geral, sócios,
// não é despesa, já lançado). Usada na tela interna (Conciliação do Extrato)
// e no link público. Quem usa guarda o estado; aqui só desenha e avisa.
// =============================================================================

type Aba = 'pend' | 'feitos' | 'todos' | 'SOCIO' | 'JA_LANCADO';

type Props = {
    itens: ItemExtrato[];
    caminhoes: CaminhaoOpcao[];
    totalPagamentos: number;
    nPagamentos: number;
    totalRecebimentos?: number | null;
    saldoAnterior?: number | null;
    saldoFinal?: number | null;
    alterados?: Set<string>;
    onChange: (id: string, mud: { partes?: Parte[]; nota?: string }) => void;
    onVincular?: (it: ItemExtrato) => void;
    topoFixo?: number; // px acima da barra fixa (ex: Topbar do sistema)
    // Quem estava pendente no último salvar/carregar. A aba "Pendentes" usa
    // isto: o que você classifica continua na aba até salvar/enviar.
    pendentesBase?: Set<string>;
};

// Divide igual em centavos (o último leva a sobra).
function igualEntre(valor: number, ks: string[]): Parte[] {
    const c = cent(valor), b = Math.floor(c / ks.length);
    return ks.map((k, i) => ({ k, v: (i === ks.length - 1 ? c - b * (ks.length - 1) : b) / 100 }));
}

export function ClassificadorExtrato({ itens, caminhoes, totalPagamentos, nPagamentos, totalRecebimentos, saldoAnterior, saldoFinal, alterados, onChange, onVincular, topoFixo = 0, pendentesBase }: Props) {
    const [aba, setAba] = useState<Aba>('pend');
    const [card, setCard] = useState<string | null>(null);
    const [busca, setBusca] = useState('');
    const [foco, setFoco] = useState(0);
    const [dividindo, setDividindo] = useState<ItemExtrato | null>(null);
    const placaDe = useMemo(() => new Map(caminhoes.map((c) => [c.id, c.placa])), [caminhoes]);
    const rotulo = useCallback((k: string) => placaDe.get(k) ?? FIXOS[k]?.curto ?? '?', [placaDe]);

    const t = useMemo(() => totaisExtrato(itens), [itens]);
    const mudarNota = useCallback((id: string, nota: string) => onChange(id, { nota }), [onChange]);
    const q = norm(busca.trim());
    const visiveis = useMemo(() => itens.filter((it) => {
        const ps = it.partes;
        const pendente = pendentesBase ? pendentesBase.has(it.id) : !ps.length;
        if (card === 'PEND') { if (!pendente) return false; }
        else if (card) { if (!ps.some((p) => p.k === card)) return false; }
        else if (aba === 'pend' && !pendente) return false;
        else if (aba === 'feitos' && !ps.length) return false;
        else if ((aba === 'SOCIO' || aba === 'JA_LANCADO') && !ps.some((p) => p.k === aba)) return false;
        if (q && !norm(`${it.nome} ${it.descricao} ${dataBR(it.data)} ${fmt(it.valor)} ${it.valor} ${TIPO[it.tipo] ?? ''}`).includes(q)) return false;
        return true;
    }), [itens, aba, card, q, pendentesBase]);
    const focoReal = Math.min(foco, Math.max(0, visiveis.length - 1));

    const contagem = useMemo(() => ({
        pend: t.nPend, feitos: t.feito, todos: itens.length,
        SOCIO: itens.filter((i) => i.partes.some((p) => p.k === 'SOCIO')).length,
        JA_LANCADO: itens.filter((i) => i.partes.some((p) => p.k === 'JA_LANCADO')).length,
    }), [itens, t]);

    // Caminhão: marca/desmarca (pode ter vários — divide igual entre eles).
    // Geral, Sócios, Não é despesa, Já lançado: é um só, substitui tudo.
    const definir = useCallback((it: ItemExtrato, k: string | null) => {
        const atual = it.partes;
        if (!k) return onChange(it.id, { partes: [] });
        if (FIXOS[k]) return onChange(it.id, { partes: atual.length === 1 && atual[0].k === k ? [] : [{ k, v: it.valor }] });
        const sel = atual.every((p) => !FIXOS[p.k]) ? atual.map((p) => p.k) : [];
        const novos = sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k];
        onChange(it.id, { partes: novos.length ? igualEntre(it.valor, novos) : [] });
    }, [onChange]);

    // Atalhos de teclado no pagamento destacado.
    const estado = useRef({ visiveis, focoReal, aba, card, caminhoes, base: pendentesBase, definir });
    useEffect(() => { estado.current = { visiveis, focoReal, aba, card, caminhoes, base: pendentesBase, definir }; });
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (dividindo) return;
            const el = document.activeElement as HTMLElement | null;
            if (el && ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const s = estado.current;
            const it = s.visiveis[s.focoReal];
            if (!it) return;
            const k = e.key.toUpperCase();
            const somePendente = s.aba === 'pend' && !s.card && !s.base;
            const proximo = () => { if (!somePendente) setFoco(Math.min(s.focoReal + 1, s.visiveis.length - 1)); };
            // Shift + número: acrescenta/tira o caminhão (vários) sem pular de linha.
            const dig = /^Digit([1-9])$/.exec(e.code);
            if (e.shiftKey && dig && s.caminhoes[Number(dig[1]) - 1]) { e.preventDefault(); s.definir(it, s.caminhoes[Number(dig[1]) - 1].id); return; }
            if (e.key === 'ArrowDown') { setFoco(Math.min(s.focoReal + 1, s.visiveis.length - 1)); e.preventDefault(); return; }
            if (e.key === 'ArrowUp') { setFoco(Math.max(s.focoReal - 1, 0)); e.preventDefault(); return; }
            let dest: string | null | undefined;
            if (/^[1-9]$/.test(e.key) && s.caminhoes[Number(e.key) - 1]) dest = s.caminhoes[Number(e.key) - 1].id;
            else if (k === 'G') dest = 'GERAL';
            else if (k === 'P') dest = 'SOCIO';
            else if (k === 'N') dest = 'NAO';
            else if (k === 'J') dest = 'JA_LANCADO';
            else if (k === 'S' && it.sugestao) dest = it.sugestao;
            else if (e.key === '0') dest = null;
            else if (k === 'D') { setDividindo(it); e.preventDefault(); return; }
            if (dest === undefined) return;
            e.preventDefault();
            proximo();
            if (dest === null) onChange(it.id, { partes: [] });
            else onChange(it.id, { partes: [{ k: dest, v: it.valor }] });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dividindo, onChange]);

    useEffect(() => {
        const el = document.querySelector<HTMLElement>(`[data-linha="${focoReal}"]`);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const cab = document.getElementById('topo-classificador');
        const fixo = cab && getComputedStyle(cab).position === 'sticky';
        const topo = (fixo ? cab!.getBoundingClientRect().bottom : 0) + 8;
        if (r.top < topo || r.bottom > window.innerHeight - 8) window.scrollBy({ top: r.top - topo - 12, behavior: 'smooth' });
    }, [focoReal]);

    const sCam = caminhoes.reduce((s, c) => s + cent(t.por[c.id]?.tot ?? 0), 0) / 100;
    const vk = (k: string) => t.por[k]?.tot ?? 0;
    const soma = Math.round((sCam + vk('GERAL') + vk('SOCIO') + vk('NAO') + vk('JA_LANCADO') + t.pendente) * 100) / 100;
    const dif = Math.round((totalPagamentos - soma) * 100) / 100;

    const cardCls = (ativo: boolean) => `shrink-0 w-36 md:w-auto snap-start text-left rounded-xl border bg-white dark:bg-[#111827] px-3 py-2 min-w-0 transition ${ativo ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200 dark:border-gray-800 hover:border-blue-400'}`;

    return (
        <div className="space-y-3">
            <div id="topo-classificador" className="md:sticky z-20 -mx-1 px-1 pb-2 bg-gray-50/95 dark:bg-[#0B1120]/95 backdrop-blur space-y-2" style={{ top: topoFixo }}>
                <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden mt-1">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${itens.length ? (t.feito / itens.length) * 100 : 0}%` }} />
                </div>
                <div className="flex md:grid overflow-x-auto md:overflow-visible snap-x md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 pb-1 md:pb-0">
                    {caminhoes.map((c, i) => (
                        <button key={c.id} type="button" onClick={() => setCard(card === c.id ? null : c.id)} className={cardCls(card === c.id)}>
                            <div className="flex items-center justify-between gap-1">
                                <span className={`px-1.5 rounded border text-[11px] font-bold ${corPlaca(c.placa)}`}>{c.placa}</span>
                                {i < 9 && <span className="text-[10px] text-gray-400">{i + 1}</span>}
                            </div>
                            <div className="mt-1 font-bold tabular-nums text-gray-900 dark:text-white truncate">{moeda(vk(c.id))}</div>
                            <div className="text-[11px] text-gray-500">{t.por[c.id]?.n ?? 0} lanç.</div>
                        </button>
                    ))}
                    {Object.entries(FIXOS).map(([k, f]) => (
                        <button key={k} type="button" onClick={() => setCard(card === k ? null : k)} className={cardCls(card === k)}>
                            <div className="flex items-center justify-between gap-1">
                                <span className={`px-1.5 rounded border text-[11px] font-bold truncate ${f.cor}`}>{f.curto}</span>
                                <span className="text-[10px] text-gray-400">{f.tecla}</span>
                            </div>
                            <div className="mt-1 font-bold tabular-nums text-gray-900 dark:text-white truncate">{moeda(vk(k))}</div>
                            <div className="text-[11px] text-gray-500">{t.por[k]?.n ?? 0} lanç.</div>
                        </button>
                    ))}
                    <button type="button" onClick={() => setCard(card === 'PEND' ? null : 'PEND')} className={`${cardCls(card === 'PEND')} !border-amber-300 dark:!border-amber-500/40`}>
                        <span className="px-1.5 rounded border text-[11px] font-bold bg-amber-100 text-amber-800 border-amber-300">Falta classificar</span>
                        <div className="mt-1 font-bold tabular-nums text-gray-900 dark:text-white truncate">{moeda(t.pendente)}</div>
                        <div className="text-[11px] text-gray-500">{t.nPend} pagamentos</div>
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827] px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-gray-900 dark:text-white">Conciliação:</span>
                    <span>Caminhões <b className="tabular-nums">{moeda(sCam)}</b></span>
                    <span>+ Geral <b className="tabular-nums">{moeda(vk('GERAL'))}</b></span>
                    <span>+ Sócios <b className="tabular-nums">{moeda(vk('SOCIO'))}</b></span>
                    <span>+ Não é despesa <b className="tabular-nums">{moeda(vk('NAO'))}</b></span>
                    <span>+ Já lançado <b className="tabular-nums">{moeda(vk('JA_LANCADO'))}</b></span>
                    <span>+ Pendente <b className="tabular-nums">{moeda(t.pendente)}</b></span>
                    <span>= <b className="tabular-nums">{moeda(soma)}</b></span>
                    <span>· Saídas do extrato <b className="tabular-nums">{moeda(totalPagamentos)}</b> ({nPagamentos})</span>
                    {Math.abs(dif) < 0.005
                        ? <span className="font-bold text-emerald-600">✓ Bate</span>
                        : <span className="font-bold text-red-600">✗ Diferença {moeda(dif)}</span>}
                    {totalRecebimentos != null && (
                        <span className="text-gray-400">
                            · Entradas {moeda(totalRecebimentos)}
                            {saldoAnterior != null && saldoFinal != null && <> · Saldo {moeda(saldoAnterior)} → {moeda(saldoFinal)}</>}
                        </span>
                    )}
                </div>
                <div className="flex flex-col md:flex-row gap-2">
                    <div className="relative flex-1">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={busca} onChange={(e) => { setBusca(e.target.value); setFoco(0); }} placeholder="Buscar por nome, descrição, data ou valor…"
                            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white dark:bg-[#111827] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div className="flex rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden text-sm overflow-x-auto">
                        {([['pend', 'Pendentes'], ['feitos', 'Classificados'], ['todos', 'Todos'], ['SOCIO', 'Sócios / proprietários'], ['JA_LANCADO', 'Já lançados']] as [Aba, string][]).map(([a, l]) => (
                            <button key={a} type="button" onClick={() => { setAba(a); setCard(null); setFoco(0); }}
                                className={`px-3 py-2 whitespace-nowrap border-r last:border-r-0 border-gray-300 dark:border-gray-700 ${aba === a && !card ? 'bg-blue-600 text-white' : 'bg-white dark:bg-[#111827] text-gray-700 dark:text-gray-200'}`}>
                                {l} <span className="text-[11px] opacity-75">{contagem[a]}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <p className="text-xs text-gray-500 hidden md:block">
                Clique em mais de um caminhão para dividir igual entre eles. Atalhos: <kbd>1</kbd>–<kbd>9</kbd> caminhão · <kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>9</kbd> soma outro caminhão · <kbd>G</kbd> geral · <kbd>P</kbd> sócios · <kbd>N</kbd> não é despesa · <kbd>J</kbd> já lançado · <kbd>D</kbd> dividir · <kbd>S</kbd> aceitar sugestão · <kbd>0</kbd> limpar · <kbd>↑</kbd><kbd>↓</kbd> navegar.
                {card && <> Mostrando só <b>{card === 'PEND' ? 'pendentes' : rotulo(card)}</b> — <button className="text-blue-600 hover:underline" onClick={() => setCard(null)}>ver todos</button>.</>}
            </p>

            {visiveis.length === 0 ? (
                <div className="text-center text-gray-500 py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                    {aba === 'pend' && !card && !q ? '🎉 Tudo classificado!' : 'Nenhum pagamento neste filtro.'}
                </div>
            ) : (
                <div className="space-y-2">
                    {visiveis.map((it, ix) => (
                        <Linha key={it.id} it={it} ix={ix} foco={ix === focoReal} alterado={!!alterados?.has(it.id)}
                            caminhoes={caminhoes} rotulo={rotulo} onFoco={setFoco} definir={definir} onDividir={setDividindo}
                            onNota={mudarNota} onVincular={onVincular} />
                    ))}
                </div>
            )}

            {dividindo && (
                <DividirModal item={dividindo} caminhoes={caminhoes}
                    onFechar={() => setDividindo(null)}
                    onConfirmar={(partes) => { onChange(dividindo.id, { partes }); setDividindo(null); }} />
            )}
        </div>
    );
}

type LinhaProps = {
    it: ItemExtrato; ix: number; foco: boolean; alterado: boolean;
    caminhoes: CaminhaoOpcao[]; rotulo: (k: string) => string;
    onFoco: (i: number) => void; definir: (it: ItemExtrato, k: string | null) => void;
    onDividir: (it: ItemExtrato) => void; onNota: (id: string, nota: string) => void;
    onVincular?: (it: ItemExtrato) => void;
};

const Linha = memo(function Linha({ it, ix, foco, alterado, caminhoes, rotulo, onFoco, definir, onDividir, onNota, onVincular }: LinhaProps) {
    const ps = it.partes;
    const sel = ps.length === 1 ? ps[0].k : null;
    const dividido = ps.length > 1;
    const marcados = new Set(ps.map((p) => p.k));
    const btn = 'px-2.5 py-1 rounded-md border text-xs font-bold transition';
    const off = 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-400';
    return (
        <div data-linha={ix} onClick={() => onFoco(ix)}
            className={`rounded-xl border p-3 grid grid-cols-[1fr_auto] md:grid-cols-[64px_1fr_auto] gap-x-3 gap-y-2 ${foco ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50/60 dark:bg-blue-500/10' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827]'}`}>
            <div className="text-xs text-gray-500 tabular-nums col-span-2 md:col-span-1">
                <span className="font-semibold text-gray-700 dark:text-gray-300">{dataBR(it.data)}</span>{it.hora ? ` ${it.hora}` : ''}
                <div className="text-[10px] uppercase tracking-wide">{TIPO[it.tipo] ?? it.tipo}</div>
            </div>
            <div className="min-w-0">
                <div className="font-semibold text-gray-900 dark:text-white break-words">{it.nome}</div>
                <div className="text-xs text-gray-500 break-words">{it.descricao || <i>sem descrição</i>}</div>
            </div>
            <div className="text-right font-bold tabular-nums text-gray-900 dark:text-white">
                {moeda(it.valor)}
                {alterado && <div className="text-[10px] font-semibold text-amber-600">não salvo</div>}
            </div>
            <div className="col-span-2 md:col-start-2 md:col-span-2 flex flex-wrap items-center gap-1.5">
                {caminhoes.map((c, i) => (
                    <button key={c.id} type="button" onClick={(e) => { e.stopPropagation(); onFoco(ix); definir(it, c.id); }}
                        title={marcados.has(c.id) ? 'Clique para tirar' : ps.length && !FIXOS[ps[0].k] ? 'Clique para somar este caminhão (divide igual)' : undefined}
                        className={`${btn} ${marcados.has(c.id) ? `${corPlaca(c.placa)} ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-gray-900` : off}`}>
                        {c.placa}{i < 9 && <span className="ml-1 font-normal opacity-50">{i + 1}</span>}
                    </button>
                ))}
                <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
                <button type="button" onClick={(e) => { e.stopPropagation(); onFoco(ix); onDividir(it); }}
                    className={`${btn} inline-flex items-center gap-1 ${dividido ? 'bg-teal-600 text-white border-teal-600' : off}`}>
                    <Scissors size={12} /> Dividir
                </button>
                {Object.entries(FIXOS).map(([k, f]) => (
                    <button key={k} type="button" title={f.nome} onClick={(e) => { e.stopPropagation(); onFoco(ix); definir(it, k); }}
                        className={`${btn} ${sel === k ? f.cor : off}`}>{f.curto}</button>
                ))}
                {ps.length > 0 && (
                    <button type="button" title="Limpar (0)" onClick={(e) => { e.stopPropagation(); definir(it, null); }}
                        className={`${btn} ${off} !px-1.5`}><X size={12} /></button>
                )}
                {it.sugestao && !ps.length && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); definir(it, it.sugestao!); }}
                        className="px-2 py-1 rounded-md border border-dashed border-blue-400 text-xs text-blue-600">Sugestão: {rotulo(it.sugestao)} <kbd>S</kbd></button>
                )}
                {onVincular && (
                    <button type="button" title="Sempre classificar este nome igual (vínculo)" onClick={(e) => { e.stopPropagation(); onVincular(it); }}
                        className="ml-auto p-1 rounded text-gray-400 hover:text-blue-600"><Pin size={14} /></button>
                )}
            </div>
            {(ps.length > 0 || it.motivo) && (
                <div className="col-span-2 md:col-start-2 md:col-span-2 flex flex-wrap items-center gap-1.5 text-xs">
                    {ps.length > 0 && <span className="text-gray-400">→</span>}
                    {ps.map((p) => (
                        <span key={p.k} className={`px-2 py-0.5 rounded-full border font-bold ${placaCor(p.k, rotulo)}`}>
                            {rotulo(p.k)}{dividido ? ` ${moeda(p.v)}` : ''}
                        </span>
                    ))}
                    {it.origem === 'AUTO' && it.motivo && <span className="px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500">automático · {it.motivo}</span>}
                    {it.origem === 'LINK' && <span className="px-2 py-0.5 rounded-full border border-dashed border-violet-300 text-violet-600">pelo link</span>}
                    {!ps.length && it.motivo && <span className="text-gray-500">{it.motivo}</span>}
                </div>
            )}
            <input key={it.nota ?? ''} defaultValue={it.nota ?? ''} onBlur={(e) => { if ((it.nota ?? '') !== e.target.value) onNota(it.id, e.target.value); }}
                onClick={(e) => e.stopPropagation()} placeholder="Observação (opcional)"
                className="col-span-2 md:col-start-2 md:col-span-2 w-full px-2 py-1 rounded-md text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200" />
        </div>
    );
});

function placaCor(k: string, rotulo: (k: string) => string) {
    if (FIXOS[k]) return FIXOS[k].cor;
    return corPlaca(rotulo(k));
}

function DividirModal({ item, caminhoes, onFechar, onConfirmar }: {
    item: ItemExtrato; caminhoes: CaminhaoOpcao[]; onFechar: () => void; onConfirmar: (p: Parte[]) => void;
}) {
    const opcoes = [...caminhoes.map((c) => ({ k: c.id, nome: c.placa, cor: corPlaca(c.placa) })), ...Object.entries(FIXOS).filter(([k]) => k !== 'JA_LANCADO').map(([k, f]) => ({ k, nome: f.curto, cor: f.cor }))];
    const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(item.partes.map((p) => [p.k, fmt(p.v)])));
    const [ultimo, setUltimo] = useState<string | null>(null);
    const marcados = opcoes.filter((o) => vals[o.k] !== undefined).map((o) => o.k);
    const soma = marcados.reduce((s, k) => s + cent(num(vals[k])), 0);
    const falta = (cent(item.valor) - soma) / 100;
    const ok = marcados.length >= 2 && Math.abs(falta) < 0.005 && marcados.every((k) => num(vals[k]) > 0);

    const igual = (ks: string[]) => {
        if (!ks.length) return setVals({});
        const c = cent(item.valor), b = Math.floor(c / ks.length);
        setVals(Object.fromEntries(ks.map((k, i) => [k, fmt((i === ks.length - 1 ? c - b * (ks.length - 1) : b) / 100)])));
    };
    const alternar = (k: string) => {
        const ks = marcados.includes(k) ? marcados.filter((x) => x !== k) : [...marcados, k];
        igual(ks);
    };
    const resto = () => {
        if (marcados.length < 2) return;
        const u = marcados.find((k) => k !== ultimo && !num(vals[k])) ?? [...marcados].reverse().find((k) => k !== ultimo)!;
        const outros = marcados.filter((k) => k !== u).reduce((s, k) => s + cent(num(vals[k])), 0);
        setVals((v) => ({ ...v, [u]: fmt(Math.max(0, cent(item.valor) - outros) / 100) }));
    };

    return (
        <Modal onFechar={onFechar} className="z-[60] bg-black/50">
            <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#111827] p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-white">Dividir {moeda(item.valor)}</p>
                        <p className="text-xs text-gray-500">{item.nome}{item.descricao ? ` — ${item.descricao}` : ''}</p>
                    </div>
                    <button type="button" onClick={onFechar} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {opcoes.map((o) => {
                        const on = vals[o.k] !== undefined;
                        return (
                            <div key={o.k} className="flex items-center gap-2 py-1.5">
                                <label className="flex-1 flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={on} onChange={() => alternar(o.k)} />
                                    <span className={`px-2 py-0.5 rounded border text-xs font-bold ${o.cor}`}>{o.nome}</span>
                                </label>
                                <input inputMode="decimal" value={vals[o.k] ?? ''} placeholder="0,00"
                                    onChange={(e) => { const v = e.target.value; setUltimo(o.k); setVals((x) => ({ ...x, [o.k]: v })); }}
                                    className="w-32 px-2 py-1.5 rounded-lg text-sm text-right tabular-nums bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" />
                            </div>
                        );
                    })}
                </div>
                <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                        <button type="button" onClick={() => igual(marcados)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200">Dividir igual</button>
                        <button type="button" onClick={resto} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200">O resto</button>
                    </div>
                    <span className={`text-sm font-semibold ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {marcados.length < 2 ? 'Marque 2 ou mais' : ok ? 'Fechou ✓' : falta > 0 ? `Falta ${moeda(falta)}` : `Passou ${moeda(-falta)}`}
                    </span>
                </div>
                <button type="button" disabled={!ok} onClick={() => onConfirmar(marcados.map((k) => ({ k, v: cent(num(vals[k])) / 100 })))}
                    className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Confirmar divisão</button>
            </div>
        </Modal>
    );
}
