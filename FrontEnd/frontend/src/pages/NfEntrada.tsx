import { useEffect, useState } from 'react';
import { Info, Download, Loader2 } from 'lucide-react';
import { api } from '../services/api';

// =============================================================================
// NF de Entrada — página própria (grupo Financeiro no menu).
// A lista fica vazia até a Fase 4 (cliente Sefaz NF-e) entrar — o filtro
// de período e o download em ZIP já ficam prontos pra quando isso
// acontecer, sem precisar mexer aqui de novo.
// =============================================================================

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const labelClasse = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';

function formatCurrency(value: number | null | undefined) {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type NfEntradaItem = {
    id: string;
    chaveAcesso: string;
    emitenteNome: string | null;
    emitenteCnpj: string | null;
    valor: number | null;
    dataEmissao: string | null;
    situacao: string | null;
    aceita: boolean;
    caminhao: { placa: string } | null;
};

// Extrai a mensagem de erro mesmo quando a resposta veio como blob (caso
// do download de ZIP) — sem isso, o alert mostrava "[object Object]" em
// vez do texto real do backend.
async function extrairMensagemErro(erro: any, padrao: string) {
    const dado = erro?.response?.data;
    if (dado instanceof Blob) {
        try {
            const texto = await dado.text();
            const parsed = JSON.parse(texto);
            return parsed?.message || padrao;
        } catch {
            return padrao;
        }
    }
    return dado?.message || padrao;
}

export function NfEntrada() {
    const [de, setDe] = useState('');
    const [ate, setAte] = useState('');
    const [items, setItems] = useState<NfEntradaItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [baixando, setBaixando] = useState(false);

    async function carregar() {
        setLoading(true);
        try {
            const res = await api.get('/financeiro-nf/nf-entrada', {
                params: { de: de || undefined, ate: ate || undefined },
            });
            setItems(res.data ?? []);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function baixarZip() {
        setBaixando(true);
        try {
            const res = await api.get('/financeiro-nf/nf-entrada/download/zip', {
                params: { de: de || undefined, ate: ate || undefined },
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `nf-entrada${de || ate ? `-${de || 'inicio'}_a_${ate || 'fim'}` : ''}.zip`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert(await extrairMensagemErro(e, 'Não foi possível baixar o ZIP.'));
        } finally {
            setBaixando(false);
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NF de Entrada</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Notas fiscais de compra recebidas pela empresa.
                </p>
            </div>

            <div className="flex items-start gap-3 p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Info size={18} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                        Busca automática de NF de entrada — em construção
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Essa lista vai preencher sozinha quando o cliente Sefaz (assinatura XML +
                        distribuição) entrar. O filtro por período e o download em ZIP abaixo já estão
                        prontos e vão trazer as NFs — aceitas ou não — assim que existirem. O
                        certificado digital já pode ser cadastrado em Cadastros → Certificado Digital,
                        adiantando esse passo.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className={labelClasse}>De</label>
                    <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={campoClasse} />
                </div>
                <div>
                    <label className={labelClasse}>Até</label>
                    <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={campoClasse} />
                </div>
                <button
                    onClick={carregar}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                    Filtrar
                </button>
                <button
                    onClick={baixarZip}
                    disabled={baixando}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                >
                    {baixando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    Baixar ZIP {de || ate ? 'do período' : ''}
                </button>
            </div>

            <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                {loading ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
                ) : items.length === 0 ? (
                    <p className="text-sm text-gray-400 py-8 text-center">
                        Nenhuma NF de entrada encontrada {de || ate ? 'nesse período' : 'ainda'}.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2.5 px-4 font-medium">Emitente</th>
                                    <th className="py-2.5 px-4 font-medium">Emissão</th>
                                    <th className="py-2.5 px-4 font-medium">Valor</th>
                                    <th className="py-2.5 px-4 font-medium">Situação</th>
                                    <th className="py-2.5 px-4 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id} className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300">
                                        <td className="py-2.5 px-4">
                                            <p className="font-semibold text-gray-900 dark:text-white">{item.emitenteNome ?? '-'}</p>
                                            {item.emitenteCnpj && <p className="text-xs text-gray-400">{item.emitenteCnpj}</p>}
                                        </td>
                                        <td className="py-2.5 px-4 whitespace-nowrap">
                                            {item.dataEmissao ? new Date(item.dataEmissao).toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                        <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white">{formatCurrency(item.valor)}</td>
                                        <td className="py-2.5 px-4">{item.situacao ?? '-'}</td>
                                        <td className="py-2.5 px-4">
                                            <span
                                                className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${item.aceita
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400'
                                                    }`}
                                            >
                                                {item.aceita ? 'Aceita' : 'Pendente'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
