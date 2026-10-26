import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, Loader2 } from 'lucide-react';

// Página PÚBLICA (sem login), link secreto: o proprietário marca nas caixinhas
// o que quer pagar HOJE e envia de volta ao financeiro.

const API = import.meta.env.VITE_API_URL;
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (v: string) => new Date(v).toLocaleDateString('pt-BR');

type Conta = {
    id: string; descricao: string; fornecedor: string | null; vencimento: string;
    saldo: number; vencida: boolean; venceHoje: boolean; selecionada: boolean;
};

export function PagarHoje() {
    const { token } = useParams();
    const [empresa, setEmpresa] = useState('');
    const [contas, setContas] = useState<Conta[]>([]);
    const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
    const [invalido, setInvalido] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [ok, setOk] = useState<{ quantidade: number; total: number } | null>(null);

    useEffect(() => {
        axios.get(`${API}/pagar-hoje/${token}`)
            .then((r) => {
                setEmpresa(r.data.empresa);
                setContas(r.data.contas);
                setMarcadas(new Set(r.data.contas.filter((c: Conta) => c.selecionada).map((c: Conta) => c.id)));
            })
            .catch(() => setInvalido(true))
            .finally(() => setCarregando(false));
    }, [token]);

    const total = useMemo(
        () => contas.filter((c) => marcadas.has(c.id)).reduce((t, c) => t + c.saldo, 0),
        [contas, marcadas],
    );

    function alternar(id: string) {
        setMarcadas((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    }

    async function enviar() {
        setErro(null);
        setEnviando(true);
        try {
            const r = await axios.post(`${API}/pagar-hoje/${token}`, { ids: Array.from(marcadas) });
            setOk({ quantidade: r.data.quantidade, total: r.data.total });
        } catch (e: any) {
            setErro(e?.response?.data?.message ?? 'Não foi possível enviar.');
        } finally {
            setEnviando(false);
        }
    }

    if (carregando) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-gray-400" /></div>;
    if (invalido) return <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 text-gray-600 text-center">Link inválido ou desativado. Peça um novo ao financeiro.</div>;

    if (ok) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
                <div className="max-w-sm text-center space-y-3">
                    <CheckCircle2 className="mx-auto text-green-600" size={56} />
                    <p className="text-xl font-bold text-gray-900">Enviado ao financeiro!</p>
                    <p className="text-gray-600">{ok.quantidade} conta{ok.quantidade === 1 ? '' : 's'} para hoje · {moeda(ok.total)}</p>
                    <button onClick={() => setOk(null)} className="text-sm text-blue-600 underline">Alterar seleção</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-32">
            <div className="max-w-xl mx-auto p-4 space-y-3">
                <div className="pt-4">
                    <h1 className="text-xl font-bold text-gray-900">O que pagar hoje?</h1>
                    <p className="text-sm text-gray-500">{empresa} · marque as contas e toque em Enviar.</p>
                </div>

                {contas.length === 0 && <p className="text-center text-gray-400 py-10">Nenhuma conta em aberto.</p>}

                {contas.map((c) => (
                    <label key={c.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${marcadas.has(c.id) ? 'bg-amber-50 border-amber-400' : 'bg-white border-gray-200'}`}>
                        <input type="checkbox" className="w-6 h-6 shrink-0" checked={marcadas.has(c.id)} onChange={() => alternar(c.id)} />
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 truncate">{c.descricao}</p>
                            <p className="text-xs text-gray-500 truncate">
                                {c.fornecedor ? `${c.fornecedor} · ` : ''}vence {dataBR(c.vencimento)}
                                {c.vencida && <span className="ml-1 font-semibold text-red-600">· vencida</span>}
                                {c.venceHoje && <span className="ml-1 font-semibold text-amber-600">· vence hoje</span>}
                            </p>
                        </div>
                        <p className="font-bold text-gray-900 whitespace-nowrap">{moeda(c.saldo)}</p>
                    </label>
                ))}
            </div>

            <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-4">
                <div className="max-w-xl mx-auto space-y-2">
                    {erro && <p className="text-sm text-red-600">{erro}</p>}
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{marcadas.size} selecionada{marcadas.size === 1 ? '' : 's'}</span>
                        <span className="font-bold text-gray-900">{moeda(total)}</span>
                    </div>
                    <button onClick={enviar} disabled={enviando}
                        className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2">
                        {enviando && <Loader2 size={16} className="animate-spin" />} Enviar ao financeiro
                    </button>
                </div>
            </div>
        </div>
    );
}
