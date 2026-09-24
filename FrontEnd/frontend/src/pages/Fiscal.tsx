import { useEffect, useState } from 'react';
import {
    Receipt,
    FileSignature,
    FileCheck2,
    FileStack,
    Plus,
    Trash2,
    CheckCircle2,
    Info,
    Loader2,
} from 'lucide-react';
import { api } from '../services/api';

// =============================================================================
// Fiscal — RPA (pagamento de autônomo/agregado), CIOT (obrigação da operação
// agregada), e preparação de CT-e/MDF-e (operação própria). A empresa roda
// nos dois modelos: caminhão próprio carregando sob o CT-e dela (CT-e/MDF-e)
// e caminhão agregado/autônomo rodando sob o CT-e de outra transportadora
// (CIOT + RPA pro motorista). CT-e/MDF-e ainda não são emitidos de verdade
// por aqui — dependem de credenciamento externo (RNTRC, Sefaz) que a empresa
// ainda não confirmou ter concluído; por enquanto é um checklist de preparo.
// =============================================================================

type Caminhao = { id: string; placa: string; ativo: boolean };

function formatCurrency(value: number | null | undefined) {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mesAtual() {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

// Mesma tabela usada no backend (fiscal.service.ts) — só pra dar uma prévia
// instantânea enquanto o usuário digita, sem esperar o servidor. O valor que
// vale de verdade é sempre o que o backend calcula e salva.
const TETO_INSS_VALOR = 951.63;
const FAIXAS_IRRF = [
    { ate: 2259.2, aliquota: 0, deduzir: 0 },
    { ate: 2826.65, aliquota: 7.5, deduzir: 169.44 },
    { ate: 3751.05, aliquota: 15, deduzir: 381.44 },
    { ate: 4664.68, aliquota: 22.5, deduzir: 662.77 },
    { ate: Infinity, aliquota: 27.5, deduzir: 896.0 },
];

function calcularPreviaRpa(valorBruto: number, aliquotaInss: number) {
    if (!valorBruto || valorBruto <= 0) {
        return { valorInss: 0, baseIrrf: 0, valorIrrf: 0, valorLiquido: 0 };
    }
    const valorInss = Math.min(valorBruto * (aliquotaInss / 100), TETO_INSS_VALOR);
    const baseIrrf = Math.max(0, valorBruto - valorInss);
    const faixa = FAIXAS_IRRF.find((f) => baseIrrf <= f.ate) ?? FAIXAS_IRRF[FAIXAS_IRRF.length - 1];
    const valorIrrf = Math.max(0, baseIrrf * (faixa.aliquota / 100) - faixa.deduzir);
    const valorLiquido = valorBruto - valorInss - valorIrrf;
    return {
        valorInss: Number(valorInss.toFixed(2)),
        baseIrrf: Number(baseIrrf.toFixed(2)),
        valorIrrf: Number(valorIrrf.toFixed(2)),
        valorLiquido: Number(valorLiquido.toFixed(2)),
    };
}

function StatusBadge({ status, tons }: { status: string; tons: Record<string, string> }) {
    return (
        <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tons[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                }`}
        >
            {status}
        </span>
    );
}

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const labelClasse = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';

// =============================================================================
// RPA
// =============================================================================

type Rpa = {
    id: string;
    motoristaNome: string;
    motoristaCpf: string | null;
    motoristaPix: string | null;
    caminhaoId: string | null;
    caminhao: { placa: string } | null;
    competencia: string;
    descricaoServico: string | null;
    valorBruto: number;
    aliquotaInss: number;
    valorInss: number;
    baseIrrf: number;
    aliquotaIrrf: number;
    valorIrrf: number;
    valorLiquido: number;
    status: 'PENDENTE' | 'PAGO';
    dataPagamento: string | null;
    formaPagamento: string | null;
    observacao: string | null;
};

type ResumoRpa = {
    quantidade: number;
    pendentes: number;
    totalBruto: number;
    totalInss: number;
    totalIrrf: number;
    totalLiquido: number;
};

function RpaTab({ caminhoes }: { caminhoes: Caminhao[] }) {
    const [competenciaFiltro, setCompetenciaFiltro] = useState(mesAtual());
    const [recibos, setRecibos] = useState<Rpa[]>([]);
    const [resumo, setResumo] = useState<ResumoRpa | null>(null);
    const [loading, setLoading] = useState(false);
    const [formAberto, setFormAberto] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const [motoristaNome, setMotoristaNome] = useState('');
    const [motoristaCpf, setMotoristaCpf] = useState('');
    const [motoristaPix, setMotoristaPix] = useState('');
    const [caminhaoId, setCaminhaoId] = useState('');
    const [competencia, setCompetencia] = useState(mesAtual());
    const [descricaoServico, setDescricaoServico] = useState('');
    const [valorBruto, setValorBruto] = useState('');
    const [aliquotaInss, setAliquotaInss] = useState('11');
    const [observacao, setObservacao] = useState('');

    async function carregar() {
        setLoading(true);
        try {
            const [resRecibos, resResumo] = await Promise.all([
                api.get('/fiscal/rpa', { params: { competencia: competenciaFiltro || undefined } }),
                api.get('/fiscal/rpa/resumo', { params: { competencia: competenciaFiltro || undefined } }),
            ]);
            setRecibos(resRecibos.data ?? []);
            setResumo(resResumo.data ?? null);
        } catch {
            // segue com lista vazia
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [competenciaFiltro]);

    function limparForm() {
        setMotoristaNome('');
        setMotoristaCpf('');
        setMotoristaPix('');
        setCaminhaoId('');
        setCompetencia(mesAtual());
        setDescricaoServico('');
        setValorBruto('');
        setAliquotaInss('11');
        setObservacao('');
    }

    async function salvar() {
        if (!motoristaNome.trim() || !competencia || !valorBruto) return;
        setSalvando(true);
        try {
            await api.post('/fiscal/rpa', {
                motoristaNome,
                motoristaCpf: motoristaCpf || undefined,
                motoristaPix: motoristaPix || undefined,
                caminhaoId: caminhaoId || undefined,
                competencia,
                descricaoServico: descricaoServico || undefined,
                valorBruto: Number(valorBruto),
                aliquotaInss: Number(aliquotaInss) || 11,
                observacao: observacao || undefined,
            });
            limparForm();
            setFormAberto(false);
            setCompetenciaFiltro(competencia);
            carregar();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Não foi possível salvar o RPA.');
        } finally {
            setSalvando(false);
        }
    }

    async function marcarPago(id: string) {
        try {
            await api.patch(`/fiscal/rpa/${id}/pagar`, { dataPagamento: hojeISO() });
            carregar();
        } catch {
            alert('Não foi possível marcar como pago.');
        }
    }

    async function excluir(id: string) {
        if (!confirm('Excluir este RPA?')) return;
        try {
            await api.delete(`/fiscal/rpa/${id}`);
            carregar();
        } catch {
            alert('Não foi possível excluir.');
        }
    }

    const previa = calcularPreviaRpa(Number(valorBruto) || 0, Number(aliquotaInss) || 11);

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-sm text-blue-800 dark:text-blue-300">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                    Recibo de Pagamento Autônomo — comprovante de pagamento a motorista
                    autônomo/agregado, com INSS (11%) e IRRF calculados automaticamente
                    a partir do valor bruto. Não é um documento fiscal eletrônico (sem
                    envio à Sefaz); os valores calculados são uma referência e podem ser
                    ajustados — confirme com o contador antes de repassar ao motorista.
                </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-end gap-2">
                    <div>
                        <label className={labelClasse}>Competência</label>
                        <input
                            type="month"
                            value={competenciaFiltro}
                            onChange={(e) => setCompetenciaFiltro(e.target.value)}
                            className={campoClasse}
                        />
                    </div>
                </div>

                <button
                    onClick={() => setFormAberto((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                >
                    <Plus size={16} />
                    Novo RPA
                </button>
            </div>

            {resumo && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <p className="text-xs text-gray-400">Recibos</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {resumo.quantidade}{' '}
                            <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
                                ({resumo.pendentes} pendente{resumo.pendentes === 1 ? '' : 's'})
                            </span>
                        </p>
                    </div>
                    <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <p className="text-xs text-gray-400">Total bruto</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(resumo.totalBruto)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <p className="text-xs text-gray-400">INSS + IRRF retidos</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatCurrency(resumo.totalInss + resumo.totalIrrf)}
                        </p>
                    </div>
                    <div className="p-4 rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <p className="text-xs text-gray-400">Total líquido</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                            {formatCurrency(resumo.totalLiquido)}
                        </p>
                    </div>
                </div>
            )}

            {formAberto && (
                <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Novo RPA</h3>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                            <label className={labelClasse}>Motorista *</label>
                            <input value={motoristaNome} onChange={(e) => setMotoristaNome(e.target.value)} className={campoClasse} placeholder="Nome completo" />
                        </div>
                        <div>
                            <label className={labelClasse}>CPF</label>
                            <input value={motoristaCpf} onChange={(e) => setMotoristaCpf(e.target.value)} className={campoClasse} placeholder="000.000.000-00" />
                        </div>
                        <div>
                            <label className={labelClasse}>Chave Pix</label>
                            <input value={motoristaPix} onChange={(e) => setMotoristaPix(e.target.value)} className={campoClasse} placeholder="Opcional" />
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                            <label className={labelClasse}>Caminhão</label>
                            <select value={caminhaoId} onChange={(e) => setCaminhaoId(e.target.value)} className={campoClasse}>
                                <option value="">Frete avulso / não informado</option>
                                {caminhoes.map((c) => (
                                    <option key={c.id} value={c.id}>{c.placa}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClasse}>Competência *</label>
                            <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={campoClasse} />
                        </div>
                        <div>
                            <label className={labelClasse}>Descrição do serviço</label>
                            <input value={descricaoServico} onChange={(e) => setDescricaoServico(e.target.value)} className={campoClasse} placeholder="Ex: Frete Santos → Betim" />
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClasse}>Valor bruto (R$) *</label>
                            <input type="number" step="0.01" min="0" value={valorBruto} onChange={(e) => setValorBruto(e.target.value)} className={campoClasse} placeholder="0,00" />
                        </div>
                        <div>
                            <label className={labelClasse}>Alíquota INSS (%)</label>
                            <input type="number" step="0.1" value={aliquotaInss} onChange={(e) => setAliquotaInss(e.target.value)} className={campoClasse} />
                        </div>
                    </div>

                    {Number(valorBruto) > 0 && (
                        <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm">
                            <div>
                                <p className="text-xs text-gray-400">INSS estimado</p>
                                <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(previa.valorInss)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">IRRF estimado</p>
                                <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(previa.valorIrrf)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Líquido estimado</p>
                                <p className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(previa.valorLiquido)}</p>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className={labelClasse}>Observação</label>
                        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} className={campoClasse} rows={2} />
                    </div>

                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setFormAberto(false); limparForm(); }} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                            Cancelar
                        </button>
                        <button
                            onClick={salvar}
                            disabled={salvando || !motoristaNome.trim() || !valorBruto}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            {salvando && <Loader2 size={14} className="animate-spin" />}
                            Salvar RPA
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                {loading ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
                ) : recibos.length === 0 ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Nenhum RPA nessa competência.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2.5 px-4 font-medium">Motorista</th>
                                    <th className="py-2.5 px-4 font-medium">Caminhão</th>
                                    <th className="py-2.5 px-4 font-medium">Bruto</th>
                                    <th className="py-2.5 px-4 font-medium">INSS</th>
                                    <th className="py-2.5 px-4 font-medium">IRRF</th>
                                    <th className="py-2.5 px-4 font-medium">Líquido</th>
                                    <th className="py-2.5 px-4 font-medium">Status</th>
                                    <th className="py-2.5 px-4 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {recibos.map((r) => (
                                    <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300">
                                        <td className="py-2.5 px-4">
                                            <p className="font-semibold text-gray-900 dark:text-white">{r.motoristaNome}</p>
                                            {r.descricaoServico && <p className="text-xs text-gray-400">{r.descricaoServico}</p>}
                                        </td>
                                        <td className="py-2.5 px-4">{r.caminhao?.placa ?? '-'}</td>
                                        <td className="py-2.5 px-4">{formatCurrency(r.valorBruto)}</td>
                                        <td className="py-2.5 px-4">{formatCurrency(r.valorInss)}</td>
                                        <td className="py-2.5 px-4">{formatCurrency(r.valorIrrf)}</td>
                                        <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white">{formatCurrency(r.valorLiquido)}</td>
                                        <td className="py-2.5 px-4">
                                            <StatusBadge
                                                status={r.status === 'PAGO' ? 'Pago' : 'Pendente'}
                                                tons={{
                                                    Pago: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
                                                    Pendente: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
                                                }}
                                            />
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <div className="flex items-center gap-2">
                                                {r.status === 'PENDENTE' && (
                                                    <button onClick={() => marcarPago(r.id)} title="Marcar como pago" className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 transition">
                                                        <CheckCircle2 size={16} />
                                                    </button>
                                                )}
                                                <button onClick={() => excluir(r.id)} title="Excluir" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
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

// =============================================================================
// CIOT
// =============================================================================

type Ciot = {
    id: string;
    numeroCiot: string | null;
    operadora: string | null;
    caminhaoId: string | null;
    caminhao: { placa: string } | null;
    motoristaNome: string;
    motoristaCpf: string | null;
    origemMunicipio: string;
    destinoMunicipio: string;
    dataViagem: string;
    valorFrete: number | null;
    status: 'PENDENTE' | 'EMITIDO' | 'CANCELADO';
};

const OPERADORAS_CIOT = ['Strada Pay', 'Repom', 'Roadcard', 'SEM PARAR Frete', 'Vipp', 'CargoX'];

function CiotTab({ caminhoes }: { caminhoes: Caminhao[] }) {
    const [registros, setRegistros] = useState<Ciot[]>([]);
    const [loading, setLoading] = useState(false);
    const [formAberto, setFormAberto] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [registrandoId, setRegistrandoId] = useState<string | null>(null);
    const [numeroParaRegistrar, setNumeroParaRegistrar] = useState('');
    const [operadoraParaRegistrar, setOperadoraParaRegistrar] = useState('');

    const [caminhaoId, setCaminhaoId] = useState('');
    const [motoristaNome, setMotoristaNome] = useState('');
    const [motoristaCpf, setMotoristaCpf] = useState('');
    const [origemMunicipio, setOrigemMunicipio] = useState('');
    const [destinoMunicipio, setDestinoMunicipio] = useState('');
    const [dataViagem, setDataViagem] = useState(hojeISO());
    const [valorFrete, setValorFrete] = useState('');
    const [operadora, setOperadora] = useState('');
    const [numeroCiot, setNumeroCiot] = useState('');

    async function carregar() {
        setLoading(true);
        try {
            const res = await api.get('/fiscal/ciot');
            setRegistros(res.data ?? []);
        } catch {
            // segue vazio
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregar();
    }, []);

    function limparForm() {
        setCaminhaoId('');
        setMotoristaNome('');
        setMotoristaCpf('');
        setOrigemMunicipio('');
        setDestinoMunicipio('');
        setDataViagem(hojeISO());
        setValorFrete('');
        setOperadora('');
        setNumeroCiot('');
    }

    async function salvar() {
        if (!motoristaNome.trim() || !origemMunicipio.trim() || !destinoMunicipio.trim() || !dataViagem) return;
        setSalvando(true);
        try {
            await api.post('/fiscal/ciot', {
                caminhaoId: caminhaoId || undefined,
                motoristaNome,
                motoristaCpf: motoristaCpf || undefined,
                origemMunicipio,
                destinoMunicipio,
                dataViagem,
                valorFrete: valorFrete ? Number(valorFrete) : undefined,
                operadora: operadora || undefined,
                numeroCiot: numeroCiot || undefined,
            });
            limparForm();
            setFormAberto(false);
            carregar();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Não foi possível salvar o registro.');
        } finally {
            setSalvando(false);
        }
    }

    async function confirmarNumero(id: string) {
        try {
            await api.patch(`/fiscal/ciot/${id}`, {
                numeroCiot: numeroParaRegistrar,
                operadora: operadoraParaRegistrar || undefined,
            });
            setRegistrandoId(null);
            setNumeroParaRegistrar('');
            setOperadoraParaRegistrar('');
            carregar();
        } catch {
            alert('Não foi possível registrar o número do CIOT.');
        }
    }

    async function excluir(id: string) {
        if (!confirm('Excluir este registro de CIOT?')) return;
        try {
            await api.delete(`/fiscal/ciot/${id}`);
            carregar();
        } catch {
            alert('Não foi possível excluir.');
        }
    }

    const tonsCiot: Record<string, string> = {
        Pendente: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
        Emitido: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
        Cancelado: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    };
    const traduzStatus = { PENDENTE: 'Pendente', EMITIDO: 'Emitido', CANCELADO: 'Cancelado' } as const;

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-sm text-blue-800 dark:text-blue-300">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                    CIOT é obrigatório ao contratar motorista autônomo/agregado (viagem
                    sob o CT-e de outra transportadora) — obrigatório também pra quem
                    contrata via TAC a partir de 24/05/2026. A emissão real depende de
                    um operador credenciado na ANTT (IPEF) — Strada Pay, Repom, Roadcard
                    etc. Enquanto a empresa não contrata um, use este registro pra não
                    perder nenhuma viagem agregada; assim que emitir no operador,
                    registre o número aqui.
                </p>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={() => setFormAberto((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                >
                    <Plus size={16} />
                    Novo registro
                </button>
            </div>

            {formAberto && (
                <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 space-y-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Novo registro de CIOT</h3>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                            <label className={labelClasse}>Motorista *</label>
                            <input value={motoristaNome} onChange={(e) => setMotoristaNome(e.target.value)} className={campoClasse} placeholder="Nome completo" />
                        </div>
                        <div>
                            <label className={labelClasse}>CPF</label>
                            <input value={motoristaCpf} onChange={(e) => setMotoristaCpf(e.target.value)} className={campoClasse} placeholder="000.000.000-00" />
                        </div>
                        <div>
                            <label className={labelClasse}>Caminhão</label>
                            <select value={caminhaoId} onChange={(e) => setCaminhaoId(e.target.value)} className={campoClasse}>
                                <option value="">Não informado</option>
                                {caminhoes.map((c) => (
                                    <option key={c.id} value={c.id}>{c.placa}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                            <label className={labelClasse}>Origem *</label>
                            <input value={origemMunicipio} onChange={(e) => setOrigemMunicipio(e.target.value)} className={campoClasse} placeholder="Cidade/UF" />
                        </div>
                        <div>
                            <label className={labelClasse}>Destino *</label>
                            <input value={destinoMunicipio} onChange={(e) => setDestinoMunicipio(e.target.value)} className={campoClasse} placeholder="Cidade/UF" />
                        </div>
                        <div>
                            <label className={labelClasse}>Data da viagem *</label>
                            <input type="date" value={dataViagem} onChange={(e) => setDataViagem(e.target.value)} className={campoClasse} />
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                            <label className={labelClasse}>Valor do frete (R$)</label>
                            <input type="number" step="0.01" min="0" value={valorFrete} onChange={(e) => setValorFrete(e.target.value)} className={campoClasse} placeholder="Opcional" />
                        </div>
                        <div>
                            <label className={labelClasse}>Operadora (IPEF)</label>
                            <input list="operadoras-ciot" value={operadora} onChange={(e) => setOperadora(e.target.value)} className={campoClasse} placeholder="Ex: Strada Pay" />
                            <datalist id="operadoras-ciot">
                                {OPERADORAS_CIOT.map((op) => <option key={op} value={op} />)}
                            </datalist>
                        </div>
                        <div>
                            <label className={labelClasse}>Número do CIOT</label>
                            <input value={numeroCiot} onChange={(e) => setNumeroCiot(e.target.value)} className={campoClasse} placeholder="Preencha se já tiver emitido" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button onClick={() => { setFormAberto(false); limparForm(); }} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                            Cancelar
                        </button>
                        <button
                            onClick={salvar}
                            disabled={salvando || !motoristaNome.trim() || !origemMunicipio.trim() || !destinoMunicipio.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                        >
                            {salvando && <Loader2 size={14} className="animate-spin" />}
                            Salvar
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                {loading ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
                ) : registros.length === 0 ? (
                    <p className="text-sm text-gray-400 py-8 text-center">Nenhum registro de CIOT ainda.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                                    <th className="py-2.5 px-4 font-medium">Motorista</th>
                                    <th className="py-2.5 px-4 font-medium">Caminhão</th>
                                    <th className="py-2.5 px-4 font-medium">Trajeto</th>
                                    <th className="py-2.5 px-4 font-medium">Data</th>
                                    <th className="py-2.5 px-4 font-medium">Operadora / Nº CIOT</th>
                                    <th className="py-2.5 px-4 font-medium">Status</th>
                                    <th className="py-2.5 px-4 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {registros.map((r) => (
                                    <tr key={r.id} className="border-b border-gray-50 dark:border-gray-800/60 text-gray-700 dark:text-gray-300 align-top">
                                        <td className="py-2.5 px-4 font-semibold text-gray-900 dark:text-white">{r.motoristaNome}</td>
                                        <td className="py-2.5 px-4">{r.caminhao?.placa ?? '-'}</td>
                                        <td className="py-2.5 px-4">{r.origemMunicipio} → {r.destinoMunicipio}</td>
                                        <td className="py-2.5 px-4 whitespace-nowrap">{new Date(r.dataViagem).toLocaleDateString('pt-BR')}</td>
                                        <td className="py-2.5 px-4">
                                            {registrandoId === r.id ? (
                                                <div className="flex flex-col gap-1.5 min-w-[160px]">
                                                    <input
                                                        value={numeroParaRegistrar}
                                                        onChange={(e) => setNumeroParaRegistrar(e.target.value)}
                                                        placeholder="Número do CIOT"
                                                        className="px-2 py-1 rounded text-xs bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                                                    />
                                                    <input
                                                        list="operadoras-ciot"
                                                        value={operadoraParaRegistrar}
                                                        onChange={(e) => setOperadoraParaRegistrar(e.target.value)}
                                                        placeholder="Operadora"
                                                        className="px-2 py-1 rounded text-xs bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                                                    />
                                                    <div className="flex gap-1.5">
                                                        <button onClick={() => confirmarNumero(r.id)} className="px-2 py-1 rounded bg-blue-600 text-white text-xs">Salvar</button>
                                                        <button onClick={() => setRegistrandoId(null)} className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-xs">Cancelar</button>
                                                    </div>
                                                </div>
                                            ) : r.numeroCiot ? (
                                                <>
                                                    <p className="font-medium text-gray-900 dark:text-white">{r.numeroCiot}</p>
                                                    <p className="text-xs text-gray-400">{r.operadora ?? '-'}</p>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => { setRegistrandoId(r.id); setNumeroParaRegistrar(''); setOperadoraParaRegistrar(r.operadora ?? ''); }}
                                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                    Registrar número
                                                </button>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <StatusBadge status={traduzStatus[r.status]} tons={tonsCiot} />
                                        </td>
                                        <td className="py-2.5 px-4">
                                            <button onClick={() => excluir(r.id)} title="Excluir" className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                                                <Trash2 size={16} />
                                            </button>
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

// =============================================================================
// Preparação CT-e / MDF-e (checklist)
// =============================================================================

type PreparoItem = {
    id: string;
    titulo: string;
    descricao: string | null;
    concluido: boolean;
};

type Preparo = {
    tipo: string;
    itens: PreparoItem[];
    totalItens: number;
    concluidos: number;
    percentual: number;
    pronto: boolean;
};

function PreparoTab({ tipo, nome, contexto }: { tipo: 'CTE' | 'MDFE'; nome: string; contexto: string }) {
    const [preparo, setPreparo] = useState<Preparo | null>(null);
    const [loading, setLoading] = useState(true);

    async function carregar() {
        setLoading(true);
        try {
            const res = await api.get('/fiscal/preparo', { params: { tipo } });
            setPreparo(res.data ?? null);
        } catch {
            // segue null
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tipo]);

    async function alternar(id: string, concluido: boolean) {
        setPreparo((p) => p ? { ...p, itens: p.itens.map((i) => i.id === id ? { ...i, concluido } : i) } : p);
        try {
            await api.patch(`/fiscal/preparo/${id}`, { concluido });
            carregar();
        } catch {
            carregar();
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-sm text-blue-800 dark:text-blue-300">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>{contexto}</p>
            </div>

            {loading ? (
                <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
            ) : !preparo ? (
                <p className="text-sm text-gray-400 py-8 text-center">Não foi possível carregar o checklist.</p>
            ) : (
                <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-5">
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                                Preparação pra emitir {nome}
                            </h3>
                            <span className={`text-xs font-medium ${preparo.pronto ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {preparo.concluidos}/{preparo.totalItens} concluídos
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${preparo.pronto ? 'bg-green-500' : 'bg-blue-500'}`}
                                style={{ width: `${preparo.percentual}%` }}
                            />
                        </div>
                        {preparo.pronto && (
                            <p className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center gap-1.5">
                                <CheckCircle2 size={14} /> Pré-requisitos concluídos — falta apenas decidir/configurar o emissor técnico do {nome}.
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        {preparo.itens.map((item) => (
                            <label
                                key={item.id}
                                className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer transition"
                            >
                                <input
                                    type="checkbox"
                                    checked={item.concluido}
                                    onChange={(e) => alternar(item.id, e.target.checked)}
                                    className="mt-0.5 w-4 h-4 rounded accent-blue-600"
                                />
                                <div>
                                    <p className={`text-sm font-medium ${item.concluido ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-white'}`}>
                                        {item.titulo}
                                    </p>
                                    {item.descricao && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.descricao}</p>
                                    )}
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Página
// =============================================================================

type AbaFiscal = 'rpa' | 'ciot' | 'cte' | 'mdfe';

export function Fiscal() {
    const [aba, setAba] = useState<AbaFiscal>('rpa');
    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);

    useEffect(() => {
        api.get('/caminhoes').then((res) => setCaminhoes(res.data ?? [])).catch(() => { });
    }, []);

    const abas: { id: AbaFiscal; nome: string; icone: any }[] = [
        { id: 'rpa', nome: 'RPA', icone: Receipt },
        { id: 'ciot', nome: 'CIOT', icone: FileSignature },
        { id: 'cte', nome: 'CT-e', icone: FileCheck2 },
        { id: 'mdfe', nome: 'MDF-e', icone: FileStack },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fiscal</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    RPA e CIOT pra operação agregada (motorista autônomo), preparação de
                    CT-e e MDF-e pra operação própria.
                </p>
            </div>

            <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900 w-fit overflow-x-auto max-w-full">
                {abas.map((a) => {
                    const Icone = a.icone;
                    const ativa = aba === a.id;
                    return (
                        <button
                            key={a.id}
                            onClick={() => setAba(a.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${ativa
                                    ? 'bg-white dark:bg-[#111827] text-gray-900 dark:text-white shadow'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                }`}
                        >
                            <Icone size={16} />
                            {a.nome}
                        </button>
                    );
                })}
            </div>

            {aba === 'rpa' && <RpaTab caminhoes={caminhoes} />}
            {aba === 'ciot' && <CiotTab caminhoes={caminhoes} />}
            {aba === 'cte' && (
                <PreparoTab
                    tipo="CTE"
                    nome="CT-e"
                    contexto="CT-e (Conhecimento de Transporte Eletrônico) é obrigatório pra viagens próprias, onde a empresa é a transportadora responsável pelo frete. A emissão depende de credenciamento externo na Sefaz e RNTRC ativo na ANTT — o sistema ainda não emite CT-e; este checklist ajuda a acompanhar o que falta pra chegar lá."
                />
            )}
            {aba === 'mdfe' && (
                <PreparoTab
                    tipo="MDFE"
                    nome="MDF-e"
                    contexto="MDF-e (Manifesto Eletrônico de Documentos Fiscais) agrupa os CT-e (e/ou NF-e) de uma viagem por veículo — só faz sentido depois que o CT-e estiver em produção. O sistema ainda não emite MDF-e; este checklist ajuda a acompanhar o que falta."
                />
            )}
        </div>
    );
}
