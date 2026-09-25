import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Download, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../services/api';
import { Pagination } from '../components/Pagination';

// =============================================================================
// NF de Serviço — página própria (grupo Financeiro no menu).
// O botão "Buscar agora" dispara a sincronização com o ADN sob demanda
// (POST /financeiro-nf/nf-servico/buscar) além do cron automático que já
// roda a cada 10 minutos no backend.
// =============================================================================

type SefazSyncLog = {
    id: string;
    origem: string;
    sucesso: boolean;
    mensagem: string;
    totalBuscado: number;
    createdAt: string;
};

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const labelClasse = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';

function formatCurrency(value: number | null | undefined) {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type NfServicoItem = {
    id: string;
    numeroNf: string | null;
    prestadorNome: string | null;
    prestadorDoc: string | null;
    valor: number | null;
    dataEmissao: string | null;
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

export function NfServico() {
    const [de, setDe] = useState('');
    const [ate, setAte] = useState('');
    const [mes, setMes] = useState('');
    const [items, setItems] = useState<NfServicoItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [loading, setLoading] = useState(false);
    const [baixando, setBaixando] = useState(false);
    const [buscando, setBuscando] = useState(false);
    const [ultimoLog, setUltimoLog] = useState<SefazSyncLog | null>(null);

    async function carregar(pageAlvo = page, pageSizeAlvo = pageSize) {
        setLoading(true);
        try {
            const res = await api.get('/financeiro-nf/nf-servico', {
                params: {
                    de: mes ? undefined : de || undefined,
                    ate: mes ? undefined : ate || undefined,
                    mes: mes || undefined,
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

    async function carregarUltimoLog() {
        try {
            const res = await api.get<SefazSyncLog[]>('/financeiro-nf/sefaz-logs');
            const logNfServico = (res.data ?? []).find((log) => log.origem === 'NFSE_SERVICO');
            setUltimoLog(logNfServico ?? null);
        } catch {
            // histórico é só informativo — não precisa travar a tela
        }
    }

    useEffect(() => {
        carregar();
        carregarUltimoLog();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function buscarAgora() {
        setBuscando(true);
        try {
            const res = await api.post('/financeiro-nf/nf-servico/buscar');
            const totalNovas = res.data?.totalNovas ?? 0;
            toast.success(
                totalNovas > 0
                    ? `${totalNovas} documento(s) novo(s) encontrado(s).`
                    : 'Busca concluída, nenhum documento novo.',
            );
            await carregar(1, pageSize);
            await carregarUltimoLog();
        } catch (e) {
            toast.error(await extrairMensagemErro(e, 'Não foi possível buscar as NFs agora.'));
        } finally {
            setBuscando(false);
        }
    }

    async function baixarZip() {
        setBaixando(true);
        try {
            const res = await api.get('/financeiro-nf/nf-servico/download/zip', {
                params: { de: de || undefined, ate: ate || undefined },
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `nf-servico${de || ate ? `-${de || 'inicio'}_a_${ate || 'fim'}` : ''}.zip`);
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
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">NF de Serviço</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Notas fiscais de serviço tomadas pela empresa.
                </p>
            </div>

            <div className="flex items-start gap-3 p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Info size={18} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                        Busca no ADN (NFS-e nacional)
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        A lista abaixo é alimentada automaticamente a cada 10 minutos (quando há
                        certificado digital cadastrado em Financeiro → Certificado Digital e CNPJ
                        preenchido). Use "Buscar agora" pra forçar uma busca imediata.
                    </p>
                    {ultimoLog && (
                        <p className="text-xs text-gray-400 mt-2">
                            Última busca: {new Date(ultimoLog.createdAt).toLocaleString('pt-BR')} —{' '}
                            <span className={ultimoLog.sucesso ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                                {ultimoLog.mensagem}
                            </span>
                        </p>
                    )}
                </div>
                <button
                    onClick={buscarAgora}
                    disabled={buscando}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition shrink-0"
                >
                    {buscando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Buscar agora
                </button>
            </div>

            <div className="flex flex-wrap items-end gap-3">
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
                        Nenhuma NF de serviço encontrada {de || ate ? 'nesse período' : 'ainda'}.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2.5 px-4 font-medium">Prestador</th>
                                    <th className="py-2.5 px-4 font-medium">Nº NF</th>
                                    <th className="py-2.5 px-4 font-medium">Emissão</th>
                                    <th className="py-2.5 px-4 font-medium">Valor</th>
                                    <th className="py-2.5 px-4 font-medium">Caminhão</th>
                                    <th className="py-2.5 px-4 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id} className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300">
                                        <td className="py-2.5 px-4">
                                            <p className="font-semibold text-gray-900 dark:text-white">{item.prestadorNome ?? '-'}</p>
                                            {item.prestadorDoc && <p className="text-xs text-gray-400">{item.prestadorDoc}</p>}
                                        </td>
                                        <td className="py-2.5 px-4">{item.numeroNf ?? '-'}</td>
                                        <td className="py-2.5 px-4 whitespace-nowrap">
                                            {item.dataEmissao ? new Date(item.dataEmissao).toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                        <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white">{formatCurrency(item.valor)}</td>
                                        <td className="py-2.5 px-4">
                                            {item.caminhao ? (
                                                <Link
                                                    to={`/caminhoes/${encodeURIComponent(item.caminhao.placa)}`}
                                                    className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                    🚚 {item.caminhao.placa}
                                                </Link>
                                            ) : (
                                                '-'
                                            )}
                                        </td>
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
        </div>
    );
}
