import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, FileCode, FileWarning, Landmark, Loader2, X } from 'lucide-react';
import { api } from '../services/api';

// =============================================================================
// Modal de visualização de NF (entrada ou serviço) — portado do Controle NF
// (src/components/ui/NfViewerModal.tsx). Busca o resumo legível no endpoint
// .../view (parse do XML salvo em disco, sob demanda) e detecta sozinho se é
// NF de mercadoria (emitente/destinatário/itens) ou de serviço
// (prestador/tomador/valores) pra desenhar a seção certa. Baixar DANFE e
// baixar XML original são opcionais — só aparecem se o endpoint existir e
// tiver dado disponível.
// =============================================================================

type NfeAddress = {
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
};

type NfeViewItem = {
    numero?: string;
    descricao?: string;
    ncm?: string;
    cfop?: string;
    quantidade?: number;
    unidade?: string;
    valorUnitario?: number;
    valorTotal?: number;
};

type NfeView = {
    chaveAcesso: string;
    tipoDocumento?: string;
    naturezaOperacao?: string;
    issueDate?: string;
    situacao?: string;
    emitente: { nome?: string; cnpj?: string; endereco?: NfeAddress };
    destinatario: {
        nome?: string;
        cnpj?: string;
        cpf?: string;
        endereco?: NfeAddress;
    };
    itens: NfeViewItem[];
    totais: {
        valorProdutos?: number;
        valorDesconto?: number;
        valorFrete?: number;
        valorSeguro?: number;
        valorOutrasDespesas?: number;
        valorTotal?: number;
        valorICMS?: number;
        valorIPI?: number;
        valorPIS?: number;
        valorCOFINS?: number;
    };
    detalhamentoCompleto: boolean;
};

type NfseParty = {
    nome?: string;
    cnpj?: string;
    cpf?: string;
    inscricaoMunicipal?: string;
    email?: string;
    endereco?: NfeAddress;
};

type NfseView = {
    numeroNf?: string;
    issueDate?: string;
    competencia?: string;
    prestador: NfseParty;
    tomador: NfseParty;
    servico: {
        descricao?: string;
        codigoTributacaoNacional?: string;
        codigoTributacaoMunicipal?: string;
    };
    valores: {
        valorServico?: number;
        baseCalculo?: number;
        aliquota?: number;
        valorISS?: number;
        valorLiquido?: number;
        issRetido?: boolean;
    };
    detalhamentoCompleto: boolean;
};

type ViewResponse = {
    source: 'xml' | 'resumo' | 'arquivo' | 'nenhum';
    resumo: Record<string, any> | null;
    nf: NfeView | NfseView | null;
};

type NfViewerModalProps = {
    title: string;
    viewUrl: string;
    danfeUrl?: string;
    xmlUrl?: string;
    onClose: () => void;
};

function formatCurrency(value: number | string | null | undefined) {
    if (value === null || value === undefined || value === '') return '—';
    return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value?: string | null) {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleDateString('pt-BR');
}

function formatPercent(value?: number | null) {
    if (value === null || value === undefined) return '—';
    return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatAddress(address?: NfeAddress) {
    if (!address) return null;
    const line1 = [address.logradouro, address.numero].filter(Boolean).join(', ');
    const line2 = [address.bairro, address.municipio, address.uf].filter(Boolean).join(' - ');
    const parts = [line1, line2, address.cep ? `CEP ${address.cep}` : null].filter(Boolean);
    return parts.length > 0 ? parts.join(' • ') : null;
}

function isNfeView(nf: NfeView | NfseView): nf is NfeView {
    return 'emitente' in nf;
}

function Field({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null;
    return (
        <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-sm text-gray-800 dark:text-gray-200">{value}</p>
        </div>
    );
}

export function NfViewerModal({ title, viewUrl, danfeUrl, xmlUrl, onClose }: NfViewerModalProps) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<ViewResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [downloadingDanfe, setDownloadingDanfe] = useState(false);
    const [downloadingXml, setDownloadingXml] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);

            try {
                const response = await api.get(viewUrl);
                if (!cancelled) setData(response.data);
            } catch {
                if (!cancelled) setError('Não foi possível carregar os dados dessa NF.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [viewUrl]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

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

    async function handleDownloadDanfe() {
        if (!danfeUrl) return;

        try {
            setDownloadingDanfe(true);

            const response = await api.get(danfeUrl, { responseType: 'blob' });
            const blobUrl = window.URL.createObjectURL(new Blob([response.data]));

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = 'danfe.pdf';
            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            toast.error(await extrairMensagemErro(error, 'Erro ao gerar a DANFE.'));
        } finally {
            setDownloadingDanfe(false);
        }
    }

    async function handleDownloadXml() {
        if (!xmlUrl) return;

        try {
            setDownloadingXml(true);

            const response = await api.get(xmlUrl, { responseType: 'blob' });
            const blobUrl = window.URL.createObjectURL(new Blob([response.data]));

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = 'nf.xml';
            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            toast.error(await extrairMensagemErro(error, 'Erro ao baixar o XML original.'));
        } finally {
            setDownloadingXml(false);
        }
    }

    const canDownloadDanfe =
        !!danfeUrl && !loading && !error && !!data && data.source !== 'nenhum';
    const canDownloadXml = !!xmlUrl && !loading && !error && !!data && data.source === 'xml';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827] shadow-2xl">
                <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827] p-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
                    <div className="flex items-center gap-2">
                        {canDownloadXml && (
                            <button
                                onClick={handleDownloadXml}
                                disabled={downloadingXml}
                                title="Baixar o XML original — o documento que realmente tem validade fiscal"
                                className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 disabled:opacity-60"
                            >
                                {downloadingXml ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <FileCode size={14} />
                                )}
                                Baixar XML
                            </button>
                        )}
                        {canDownloadDanfe && (
                            <button
                                onClick={handleDownloadDanfe}
                                disabled={downloadingDanfe}
                                title="Baixar DANFE simplificado — PDF gerado pelo sistema pra conferência interna, não é o layout oficial"
                                className="inline-flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-500/20 disabled:opacity-60"
                            >
                                {downloadingDanfe ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Download size={14} />
                                )}
                                Baixar DANFE
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
                            <Loader2 size={18} className="animate-spin" />
                            Carregando...
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center text-gray-500">
                            <FileWarning size={24} />
                            {error}
                        </div>
                    ) : !data || data.source === 'nenhum' ? (
                        <div className="flex flex-col items-center gap-2 py-10 text-center text-gray-500">
                            <FileWarning size={24} />
                            Nenhum XML anexado a essa NF.
                        </div>
                    ) : data.nf && isNfeView(data.nf) ? (
                        <GoodsNfView nf={data.nf} />
                    ) : data.nf ? (
                        <ServiceNfView nf={data.nf as NfseView} />
                    ) : (
                        <ResumoOnlyView resumo={data.resumo} />
                    )}
                </div>
            </div>
        </div>
    );
}

function ResumoOnlyView({ resumo }: { resumo: Record<string, any> | null }) {
    if (!resumo) return null;

    return (
        <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Essa NF só tem o resumo capturado automaticamente — sem itens ou detalhamento
                completo (o XML integral não estava disponível).
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Empresa" value={resumo.issuerName} />
                <Field label="CNPJ/CPF" value={resumo.issuerCnpj || resumo.issuerDoc} />
                <Field label="Valor" value={formatCurrency(resumo.value)} />
                <Field label="Data de emissão" value={formatDate(resumo.issueDate)} />
                <Field label="Situação" value={resumo.situacao} />
                <Field label="Chave de acesso" value={resumo.chaveAcesso} />
            </div>
        </div>
    );
}

function GoodsNfView({ nf }: { nf: NfeView }) {
    const emitAddress = formatAddress(nf.emitente.endereco);
    const destAddress = formatAddress(nf.destinatario.endereco);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
                {nf.situacao && (
                    <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {nf.situacao}
                    </span>
                )}
                {nf.naturezaOperacao && (
                    <span className="rounded-full bg-gray-500/10 px-2.5 py-1 text-xs font-medium text-gray-500">
                        {nf.naturezaOperacao}
                    </span>
                )}
                {!nf.detalhamentoCompleto && (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                        Só resumo — sem itens detalhados
                    </span>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Emitente</p>
                    <Field label="Nome" value={nf.emitente.nome} />
                    <Field label="CNPJ" value={nf.emitente.cnpj} />
                    <Field label="Endereço" value={emitAddress || undefined} />
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                        Destinatário
                    </p>
                    <Field label="Nome" value={nf.destinatario.nome} />
                    <Field label="CNPJ/CPF" value={nf.destinatario.cnpj || nf.destinatario.cpf} />
                    <Field label="Endereço" value={destAddress || undefined} />
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Data de emissão" value={formatDate(nf.issueDate)} />
                <Field label="Chave de acesso" value={nf.chaveAcesso} />
                <Field label="Tipo" value={nf.tipoDocumento === '65' ? 'NFC-e' : 'NF-e'} />
            </div>

            {nf.itens.length > 0 && (
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Itens</p>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-900 text-xs text-gray-500">
                                <tr>
                                    <th className="p-2 text-left">Item</th>
                                    <th className="p-2 text-right">Qtd</th>
                                    <th className="p-2 text-right">Vl. unit.</th>
                                    <th className="p-2 text-right">Vl. total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {nf.itens.map((item, index) => (
                                    <tr
                                        key={index}
                                        className="border-t border-gray-100 dark:border-gray-800"
                                    >
                                        <td className="p-2 text-gray-800 dark:text-gray-200">
                                            {item.descricao || 'Item sem descrição'}
                                            {item.unidade ? (
                                                <span className="text-gray-500"> ({item.unidade})</span>
                                            ) : null}
                                        </td>
                                        <td className="p-2 text-right text-gray-800 dark:text-gray-200">
                                            {item.quantidade ?? '—'}
                                        </td>
                                        <td className="p-2 text-right text-gray-800 dark:text-gray-200">
                                            {formatCurrency(item.valorUnitario)}
                                        </td>
                                        <td className="p-2 text-right font-medium text-gray-900 dark:text-white">
                                            {formatCurrency(item.valorTotal)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <TaxHighlightBox
                items={[
                    { label: 'ICMS', value: formatCurrency(nf.totais.valorICMS) },
                    { label: 'IPI', value: formatCurrency(nf.totais.valorIPI) },
                    { label: 'PIS', value: formatCurrency(nf.totais.valorPIS) },
                    { label: 'COFINS', value: formatCurrency(nf.totais.valorCOFINS) },
                ]}
                note="Confirme com seu contador se esses impostos geram crédito antes de lançar."
            />

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Valores</p>
                <div className="grid gap-2 sm:grid-cols-3">
                    <Field label="Produtos" value={formatCurrency(nf.totais.valorProdutos)} />
                    <Field label="Desconto" value={formatCurrency(nf.totais.valorDesconto)} />
                    <Field label="Frete" value={formatCurrency(nf.totais.valorFrete)} />
                </div>
                <p className="mt-3 text-xl font-bold text-orange-500 dark:text-orange-400">
                    {formatCurrency(nf.totais.valorTotal)}
                </p>
            </div>
        </div>
    );
}

function TaxHighlightBox({
    items,
    note,
}: {
    items: { label: string; value?: string }[];
    note: string;
}) {
    return (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
            <div className="mb-2 flex items-center gap-2">
                <Landmark size={16} className="text-blue-600 dark:text-blue-400" />
                <p className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400">
                    Impostos
                </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
                {items.map((item) => (
                    <Field key={item.label} label={item.label} value={item.value} />
                ))}
            </div>
            <p className="mt-3 text-xs text-gray-500">{note}</p>
        </div>
    );
}

function ServiceNfView({ nf }: { nf: NfseView }) {
    const prestAddress = formatAddress(nf.prestador.endereco);
    const tomaAddress = formatAddress(nf.tomador.endereco);

    return (
        <div className="space-y-5">
            {!nf.detalhamentoCompleto && (
                <span className="inline-block rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Detalhamento parcial — alguns campos podem não ter sido encontrados no XML.
                </span>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Prestador</p>
                    <Field label="Nome" value={nf.prestador.nome} />
                    <Field label="CNPJ/CPF" value={nf.prestador.cnpj || nf.prestador.cpf} />
                    <Field label="Inscrição municipal" value={nf.prestador.inscricaoMunicipal} />
                    <Field label="E-mail" value={nf.prestador.email} />
                    <Field label="Endereço" value={prestAddress || undefined} />
                </div>

                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Tomador</p>
                    <Field label="Nome" value={nf.tomador.nome} />
                    <Field label="CNPJ/CPF" value={nf.tomador.cnpj || nf.tomador.cpf} />
                    <Field label="Endereço" value={tomaAddress || undefined} />
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Número da NF" value={nf.numeroNf} />
                <Field label="Data de emissão" value={formatDate(nf.issueDate)} />
            </div>

            {nf.servico.descricao && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                    <p className="mb-1 text-xs font-semibold uppercase text-gray-500">
                        Descrição do serviço
                    </p>
                    <p className="text-sm text-gray-800 dark:text-gray-200">
                        {nf.servico.descricao}
                    </p>
                </div>
            )}

            <TaxHighlightBox
                items={[
                    { label: 'Base de cálculo', value: formatCurrency(nf.valores.baseCalculo) },
                    { label: 'Alíquota ISS', value: formatPercent(nf.valores.aliquota) },
                    { label: 'Valor do ISS', value: formatCurrency(nf.valores.valorISS) },
                    {
                        label: 'ISS retido',
                        value:
                            nf.valores.issRetido === undefined
                                ? '—'
                                : nf.valores.issRetido
                                    ? 'Sim'
                                    : 'Não',
                    },
                ]}
                note="Confirme com seu contador se esse serviço gera crédito de PIS/COFINS antes de lançar."
            />

            <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Valores</p>
                <Field label="Valor líquido" value={formatCurrency(nf.valores.valorLiquido)} />
                <p className="mt-3 text-xl font-bold text-orange-500 dark:text-orange-400">
                    {formatCurrency(nf.valores.valorServico)}
                </p>
            </div>
        </div>
    );
}
