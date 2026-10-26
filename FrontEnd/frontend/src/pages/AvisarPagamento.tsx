import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, Loader2, Paperclip, Upload } from 'lucide-react';

// Página PÚBLICA (sem login) acessada pelo link secreto: o proprietário só
// anexa o comprovante (ou informa valor/fornecedor) e envia ao financeiro.

const API = import.meta.env.VITE_API_URL;
const campo =
    'w-full px-3 py-3 rounded-xl text-base bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400';

export function AvisarPagamento() {
    const { token } = useParams();
    const [empresa, setEmpresa] = useState<string | null>(null);
    const [invalido, setInvalido] = useState(false);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [fornecedor, setFornecedor] = useState('');
    const [valor, setValor] = useState('');
    const [descricao, setDescricao] = useState('');
    const [caminhoes, setCaminhoes] = useState<{ id: string; placa: string }[]>([]);
    const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
    const [caminhaoId, setCaminhaoId] = useState('');
    const [categoriaId, setCategoriaId] = useState('');
    const [maisDados, setMaisDados] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    useEffect(() => {
        axios.get(`${API}/avisar/${token}`)
            .then((r) => { setEmpresa(r.data.empresa); setCaminhoes(r.data.caminhoes ?? []); setCategorias(r.data.categorias ?? []); })
            .catch(() => setInvalido(true));
    }, [token]);

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        setErro(null);
        setEnviando(true);
        try {
            const fd = new FormData();
            if (arquivo) fd.append('file', arquivo);
            fd.append('fornecedor', fornecedor);
            fd.append('valor', valor);
            fd.append('descricao', descricao);
            if (caminhaoId) fd.append('caminhaoId', caminhaoId);
            if (categoriaId) fd.append('categoriaId', categoriaId);
            const r = await axios.post(`${API}/avisar/${token}`, fd);
            setOk(r.data.valor > 0 ? `${r.data.fornecedor} — ${r.data.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : 'Comprovante recebido.');
            setArquivo(null); setFornecedor(''); setValor(''); setDescricao(''); setCaminhaoId(''); setCategoriaId('');
        } catch (err: any) {
            setErro(err?.response?.data?.message ?? 'Não foi possível enviar.');
        } finally {
            setEnviando(false);
        }
    }

    if (invalido) {
        return <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 text-gray-600 text-center">Link inválido ou desativado. Peça um novo ao financeiro.</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center p-4">
            <div className="w-full max-w-md space-y-4 pt-6">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Registrar pagamento</h1>
                    <p className="text-sm text-gray-500">{empresa ?? 'Carregando...'}</p>
                </div>

                {ok ? (
                    <div className="bg-white rounded-2xl border border-green-200 p-6 text-center space-y-3">
                        <CheckCircle2 className="mx-auto text-green-600" size={40} />
                        <p className="font-semibold text-gray-900">Enviado ao financeiro</p>
                        <p className="text-sm text-gray-500">{ok}</p>
                        <button onClick={() => setOk(null)} className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold">Enviar outro</button>
                    </div>
                ) : (
                    <form onSubmit={enviar} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                        <label className="flex items-center justify-center gap-2 px-3 py-6 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 font-semibold cursor-pointer text-center">
                            <Paperclip size={20} />
                            {arquivo ? arquivo.name : 'Anexar comprovante (PDF ou foto)'}
                            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                        </label>

                        <select className={campo} value={caminhaoId} onChange={(e) => setCaminhaoId(e.target.value)}>
                            <option value="">Caminhão (opcional) — nenhum / todos</option>
                            {caminhoes.map((c) => <option key={c.id} value={c.id}>{c.placa}</option>)}
                        </select>
                        <select className={campo} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                            <option value="">Tipo (opcional) — Abastecimento, Borracharia...</option>
                            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>

                        <button type="button" onClick={() => setMaisDados((v) => !v)} className="text-sm text-blue-600">
                            {maisDados ? 'Ocultar dados' : 'Informar valor / fornecedor (opcional com PDF)'}
                        </button>

                        {maisDados && (
                            <>
                                <input className={campo} placeholder="Fornecedor / quem recebeu" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
                                <input className={campo} placeholder="Valor pago (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
                                <input className={campo} placeholder="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                            </>
                        )}

                        {erro && <p className="text-sm text-red-600">{erro}</p>}
                        <button disabled={enviando || (!arquivo && !maisDados)} className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">
                            {enviando ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} Enviar
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
