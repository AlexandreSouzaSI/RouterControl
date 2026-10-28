import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, Loader2, Paperclip, Upload } from 'lucide-react';

// Página PÚBLICA (sem login) acessada pelo link secreto: envia um boleto ou
// uma nota (PDF, XML ou foto), com caminhão e tipo opcionais. O financeiro
// confere e lança em Contas a Pagar.

const API = import.meta.env.VITE_API_URL;
const campo = 'w-full px-3 py-3 rounded-xl text-base bg-white border border-gray-300 text-gray-900 placeholder:text-gray-400';
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function EnviarConta() {
    const { token } = useParams();
    const [empresa, setEmpresa] = useState<string | null>(null);
    const [invalido, setInvalido] = useState(false);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [caminhoes, setCaminhoes] = useState<{ id: string; placa: string }[]>([]);
    const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
    const [caminhaoId, setCaminhaoId] = useState('');
    const [categoriaId, setCategoriaId] = useState('');
    const [observacao, setObservacao] = useState('');
    const [nome, setNome] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    useEffect(() => {
        axios.get(`${API}/enviar-conta/${token}`)
            .then((r) => { setEmpresa(r.data.empresa); setCaminhoes(r.data.caminhoes ?? []); setCategorias(r.data.categorias ?? []); })
            .catch(() => setInvalido(true));
        try { setNome(localStorage.getItem('enviar-conta-nome') ?? ''); } catch { /* ignora */ }
    }, [token]);

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        if (!arquivo) return;
        setErro(null);
        setEnviando(true);
        try {
            const fd = new FormData();
            fd.append('file', arquivo);
            if (caminhaoId) fd.append('caminhaoId', caminhaoId);
            if (categoriaId) fd.append('categoriaId', categoriaId);
            if (observacao.trim()) fd.append('observacao', observacao.trim());
            if (nome.trim()) fd.append('nome', nome.trim());
            try { localStorage.setItem('enviar-conta-nome', nome.trim()); } catch { /* ignora */ }
            const r = await axios.post(`${API}/enviar-conta/${token}`, fd);
            const partes = [r.data.fornecedor, r.data.valor ? moeda(r.data.valor) : null].filter(Boolean);
            setOk(partes.length ? partes.join(' — ') : 'Documento recebido. O financeiro vai conferir os dados.');
            setArquivo(null); setCaminhaoId(''); setCategoriaId(''); setObservacao('');
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
                    <h1 className="text-xl font-bold text-gray-900">Enviar boleto ou nota</h1>
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
                            {arquivo ? arquivo.name : 'Anexar boleto ou nota (PDF, XML ou foto)'}
                            <input type="file" accept="image/*,application/pdf,.xml,text/xml" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                        </label>

                        <select className={campo} value={caminhaoId} onChange={(e) => setCaminhaoId(e.target.value)}>
                            <option value="">Caminhão (opcional)</option>
                            {caminhoes.map((c) => <option key={c.id} value={c.id}>{c.placa}</option>)}
                        </select>
                        <select className={campo} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                            <option value="">Tipo (opcional) — Manutenção, Pneu, Rastreador...</option>
                            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                        <input className={campo} placeholder="Observação (opcional) — ex: 3 parcelas" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                        <input className={campo} placeholder="Seu nome (opcional)" value={nome} onChange={(e) => setNome(e.target.value)} />

                        {erro && <p className="text-sm text-red-600">{erro}</p>}
                        <button disabled={enviando || !arquivo} className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">
                            {enviando ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} Enviar
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
