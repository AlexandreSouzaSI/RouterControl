import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { ClassificadorExtrato } from '../components/ClassificadorExtrato';
import type { CaminhaoOpcao, ItemExtrato, Parte } from '../lib/extrato';
import { nomeMes } from '../lib/mes';

// Página PÚBLICA (sem login) do link de conciliação: mostra os pagamentos do
// extrato, a pessoa classifica e envia. Volta direto pra tela do financeiro.

const API = import.meta.env.VITE_API_URL;

type Dados = {
    empresa: string; mes: string; banco: string | null;
    totalPagamentos: number; nPagamentos: number; totalRecebimentos: number;
    saldoAnterior: number | null; saldoFinal: number | null;
    linkEnviadoEm: string | null; linkEnviadoPor: string | null;
    caminhoes: CaminhaoOpcao[]; itens: ItemExtrato[];
};

export function ConciliarExtratoPublico() {
    const { token } = useParams();
    const [d, setD] = useState<Dados | null>(null);
    const [invalido, setInvalido] = useState(false);
    const [itens, setItens] = useState<ItemExtrato[]>([]);
    const [alterados, setAlterados] = useState<Set<string>>(new Set());
    // Pendentes de quando o link foi aberto: o que for classificado continua
    // na aba até abrir o link de novo (aí já vem fora).
    const [pendentesBase, setPendentesBase] = useState<Set<string>>(new Set());
    const [nome, setNome] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [ok, setOk] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    const carregar = useCallback(async (novaBase = true) => {
        const r = await axios.get(`${API}/conciliar-extrato/${token}`);
        setD(r.data);
        const lista = (r.data.itens as ItemExtrato[]).map((i) => ({ ...i, partes: (i.partes as Parte[]) ?? [] }));
        setItens(lista);
        if (novaBase) setPendentesBase(new Set(lista.filter((i) => !i.partes.length).map((i) => i.id)));
        setAlterados(new Set());
    }, [token]);

    useEffect(() => {
        carregar().catch(() => setInvalido(true));
        try { setNome(localStorage.getItem('conciliar-extrato-nome') ?? ''); } catch { /* ignora */ }
    }, [carregar]);

    useEffect(() => {
        const f = (e: BeforeUnloadEvent) => { if (alterados.size) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', f);
        return () => window.removeEventListener('beforeunload', f);
    }, [alterados]);

    const onChange = useCallback((id: string, mud: { partes?: Parte[]; nota?: string }) => {
        setItens((l) => l.map((i) => (i.id === id ? { ...i, ...(mud.partes !== undefined ? { partes: mud.partes, origem: mud.partes.length ? 'LINK' : null, motivo: null } : {}), ...(mud.nota !== undefined ? { nota: mud.nota } : {}) } : i)));
        setAlterados((s) => new Set(s).add(id));
        setOk(null);
    }, []);

    async function enviar() {
        setErro(null); setEnviando(true);
        try {
            try { localStorage.setItem('conciliar-extrato-nome', nome.trim()); } catch { /* ignora */ }
            const payload = itens.filter((i) => alterados.has(i.id)).map((i) => ({ id: i.id, partes: i.partes, nota: i.nota ?? '' }));
            await axios.put(`${API}/conciliar-extrato/${token}`, { nome: nome.trim(), itens: payload });
            await carregar(false);
            setOk(`Enviado! ${payload.length} pagamento(s) atualizados. Pode continuar e enviar de novo quando quiser.`);
        } catch (e: any) {
            setErro(e?.response?.data?.message ?? 'Não foi possível enviar. Tente de novo.');
        } finally {
            setEnviando(false);
        }
    }

    if (invalido) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 text-center text-gray-600">Este link não é válido ou foi desativado.</div>;
    }
    if (!d) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 pb-28">
            <div className="max-w-6xl mx-auto px-4 py-4 space-y-3">
                <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">{d.empresa}</p>
                    <h1 className="text-xl font-bold">Classificar pagamentos · Extrato {nomeMes(d.mes)}</h1>
                    <p className="text-sm text-gray-500">Para cada pagamento, toque no caminhão (ou Geral, Sócios, Não é despesa). Use &quot;Dividir&quot; quando for de mais de um. No fim, toque em <b>Enviar</b>.</p>
                    {d.linkEnviadoEm && <p className="text-xs text-violet-700 mt-1">Última vez enviado {d.linkEnviadoPor ? `por ${d.linkEnviadoPor} ` : ''}em {new Date(d.linkEnviadoEm).toLocaleString('pt-BR')}.</p>}
                </div>
                <ClassificadorExtrato
                    itens={itens}
                    caminhoes={d.caminhoes}
                    totalPagamentos={d.totalPagamentos}
                    nPagamentos={d.nPagamentos}
                    totalRecebimentos={d.totalRecebimentos}
                    saldoAnterior={d.saldoAnterior}
                    saldoFinal={d.saldoFinal}
                    alterados={alterados}
                    onChange={onChange}
                    pendentesBase={pendentesBase}
                />
            </div>

            <div className="fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-[#111827]/95 backdrop-blur">
                <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome"
                        className="sm:w-56 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0B1120] text-base" />
                    <div className="flex-1 text-sm">
                        {erro && <span className="text-red-600">{erro}</span>}
                        {ok && <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={16} /> {ok}</span>}
                        {!erro && !ok && <span className="text-gray-500">{alterados.size ? `${alterados.size} alteração(ões) por enviar` : 'Nada novo para enviar.'}</span>}
                    </div>
                    <button onClick={enviar} disabled={!alterados.size || enviando}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50">
                        {enviando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />} Enviar classificação
                    </button>
                </div>
            </div>
        </div>
    );
}
