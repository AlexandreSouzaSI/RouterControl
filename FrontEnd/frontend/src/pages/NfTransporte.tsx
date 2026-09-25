import { useEffect, useState } from 'react';
import { Info, Download, Eye, Loader2, Search } from 'lucide-react';
import { api } from '../services/api';
import { Pagination } from '../components/Pagination';
import { NfViewerModal } from '../components/NfViewerModal';

// =============================================================================
// NF de Transporte — notas fiscais em que a empresa aparece só como
// transportadora (mercadoria de terceiro, destinatário de outra empresa).
// Vem da mesma sincronização e da mesma tabela da NF de Entrada
// (financeiro-nf/nf-entrada), só filtrando ehCarga=true no backend — não é
// compra própria, por isso fica separada e não tem botão de aceitar/gerar
// conta a pagar.
// =============================================================================

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const labelClasse = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';

function formatCurrency(value: number | null | undefined) {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type NfTransporteItem = {
    id: string;
    chaveAcesso: string;
    numeroNf: string | null;
    emitenteNome: string | null;
    emitenteCnpj: string | null;
    destinatarioNome: string | null;
    valor: number | null;
    dataEmissao: string | null;
    situacao: string | null;
};

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

export function NfTransporte() {
    const [de, setDe] = useState('');
    const [ate, setAte] = useState('');
    const [mes, setMes] = useState('');
    const [busca, setBusca] = useState('');
    const [items, setItems] = useState<NfTransporteItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [loading, setLoading] = useState(false);
    const [baixando, setBaixando] = useState(false);
    const [visualizandoId, setVisualizandoId] = useState<string | null>(null);

    async function carregar(pageAlvo = page, pageSizeAlvo = pageSize) {
        setLoading(true);
        try {
            const res = await api.get('/financeiro-nf/nf-transporte', {
                params: {
                    de: mes ? undefined : de || undefined,
                    ate: mes ? undefined : ate || undefined,
                    mes: mes || undefined,
                    busca: busca || undefined,
                    page: pageAlvo,
                    pageSize: pageSizeAlvo,
                },
            });
            setItems(res.data?.items ?? []);
            setTotal(res.data?.total ?? 0);
            setPage(res.data?.page ?? pageAlvo);
            setPageSize(res.data?.pageSize ?? pageSizeAlvo);
        } catch {
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }

    function filtrar() {
        carregar(1, pageSize);
    }

    function mudarPagina(novaPagina: number) {
        carregar(novaPagina, pageSize);
    }

    function mudarPageSize(novoTamanho: number) {
        carregar(1, novoTamanho);
    }

    useEffect(() => {
        carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function baixarZip() {
        setBaixando(true);
        try {
            const res = await api.get('/financeiro-nf/nf-transporte/download/zip', {
                params: { de: de || undefined, ate: ate || undefined },
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `nf-transporte${de || ate ? `-${de || 'inicio'}_a_${ate || 'fim'}` : ''}.zip`);
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
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NF de Transporte</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Notas fiscais de carga de terceiros — a empresa aparece só como
                    transportadora, não são compras próprias.
                </p>
            </div>

            <div className="flex items-start gap-3 p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Info size={18} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                        O que aparece aqui
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Quando a Sefaz devolve uma NF-e em que a empresa consta só no
                        grupo de transporte (destinatário é outra empresa), ela cai
                        aqui automaticamente em vez de entrar em NF de Entrada — pra
                        não misturar carga transportada com compra própria.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                    <label className={labelClasse}>Buscar (fornecedor, CNPJ, valor ou chave)</label>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') filtrar();
                            }}
                            placeholder="Ex: Distribuidora, 123.45 ou 12345678..."
                            className={`${campoClasse} pl-8`}
                        />
                    </div>
                </div>
                <div>
                    <label className={labelClasse}>Mês</label>
                    <input
                        type="month"
                        value={mes}
                        onChange={(e) => {
                            setMes(e.target.value);
                            if (e.target.value) {
                                setDe('');
                                setAte('');
                            }
                        }}
                        className={campoClasse}
                    />
                </div>
                <div>
                    <label className={labelClasse}>De</label>
                    <input
                        type="date"
                        value={de}
                        onChange={(e) => {
                            setDe(e.target.value);
                            if (e.target.value) setMes('');
                        }}
                        className={campoClasse}
                    />
                </div>
                <div>
                    <label className={labelClasse}>Até</label>
                    <input
                        type="date"
                        value={ate}
                        onChange={(e) => {
                            setAte(e.target.value);
                            if (e.target.value) setMes('');
                        }}
                        className={campoClasse}
                    />
                </div>
                <button
                    onClick={filtrar}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                >
                    Filtrar
                </button>
                <button
                    onClick={baixarZip}
                    disabled={baixando}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition"
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
                        Nenhuma NF de transporte encontrada {de || ate ? 'nesse período' : 'ainda'}.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2.5 px-4 font-medium">Nº NF</th>
                                    <th className="py-2.5 px-4 font-medium">Emitente</th>
                                    <th className="py-2.5 px-4 font-medium">Destinatário</th>
                                    <th className="py-2.5 px-4 font-medium">Emissão</th>
                                    <th className="py-2.5 px-4 font-medium">Valor</th>
                                    <th className="py-2.5 px-4 font-medium">Situação</th>
                                    <th className="py-2.5 px-4 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id} className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300">
                                        <td className="py-2.5 px-4 whitespace-nowrap">{item.numeroNf ?? '-'}</td>
                                        <td className="py-2.5 px-4">
                                            <p className="font-semibold text-gray-900 dark:text-white">{item.emitenteNome ?? '-'}</p>
                                            {item.emitenteCnpj && <p className="text-xs text-gray-400">{item.emitenteCnpj}</p>}
                                        </td>
                                        <td className="py-2.5 px-4">{item.destinatarioNome ?? '-'}</td>
                                        <td className="py-2.5 px-4 whitespace-nowrap">
                                            {item.dataEmissao ? new Date(item.dataEmissao).toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                        <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white">{formatCurrency(item.valor)}</td>
                                        <td className="py-2.5 px-4">{item.situacao ?? '-'}</td>
                                        <td className="py-2.5 px-4 text-right">
                                            <button
                                                onClick={() => setVisualizandoId(item.id)}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                            >
                                                <Eye size={14} />
                                                Visualizar
                                            </button>
                                        </td>
                                    </tr>
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

            {visualizandoId && (
                <NfViewerModal
                    title="NF de Transporte"
                    viewUrl={`/financeiro-nf/nf-entrada/${visualizandoId}/view`}
                    danfeUrl={`/financeiro-nf/nf-entrada/${visualizandoId}/danfe`}
                    xmlUrl={`/financeiro-nf/nf-entrada/${visualizandoId}/xml`}
                    onClose={() => setVisualizandoId(null)}
                />
            )}
        </div>
    );
}
