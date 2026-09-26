import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Gauge,
    MapPin,
    Clock,
    RefreshCw,
    Navigation2,
    Radio,
    Fuel,
    Activity,
    TrendingDown,
    Route as RouteIcon,
    Droplet,
    Percent,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { TruckMap } from '../components/TruckMap';
import { api } from '../services/api';

type Veiculo = {
    veiID: number;
    placa: string | null;
    motorista: string | null;
    equipamento: number | null;
};

type Localizacao = {
    dataHora: string;
    latitude: number;
    longitude: number;
    municipio: string | null;
    uf: string | null;
    rua: string | null;
    rodovia: string | null;
    velocidade: number | null;
    // Só vêm preenchidos se o rastreador do veículo mandar esses dados —
    // nem todo equipamento tem sensor de combustível, por exemplo.
    litrosTanque: number | null;
    odometro: number | null;
    rpm: number | null;
};

type TelemetriaResumo = {
    dataHora: string;
    percentualTanque: number | null;
    percentualAcelerador: number | null;
};

type CaminhaoLocalizacao = {
    veiID: number;
    placa: string | null;
    nome: string;
    motorista?: string | null;
    equipamento: number | null;
    localizacao: Localizacao | null;
    historico: Localizacao[];
    // Última leitura real de combustível via Telemetria (CAN) — vem
    // separada de `localizacao.litrosTanque` porque o suporte da Trucks
    // Control confirmou que esse campo antigo normalmente não é
    // preenchido; percentualTanque é a fonte confiável (ver Cadastros →
    // Rastreador / Dados Capturados pra mais contexto).
    telemetria: TelemetriaResumo | null;
};

// Resumo de consumo/autonomia calculado no backend a partir da Telemetria
// V2.5 real (combustível via CAN) — já com o delta por bloco corrigido
// (ConsumoLitros/HodometroTotal são leituras cumulativas, o backend faz a
// subtração), km/L, autonomia e lista de abastecimentos detectados.
type TelemetriaResumoConsumo = {
    veiId: number;
    placa: string | null;
    periodo: { dataInicio: string | null; dataFim: string | null };
    dadosSuficientes: boolean;
    blocosValidos: number;
    totalBlocos: number;
    totalKm: number;
    totalLitros: number;
    consumoMedioKmPorLitro: number | null;
    consumoMedioLPor100km: number | null;
    capacidadeTanqueLitros: number | null;
    percentualTanqueAtual: number | null;
    autonomiaTanqueCheioKm: number | null;
    autonomiaAtualKm: number | null;
    qtdAbastecimentos: number;
    abastecimentos: {
        dataHora: string;
        percentualAntes: number;
        percentualDepois: number;
        deltaPercent: number;
        litrosEstimados: number | null;
    }[];
};

type Consumo = {
    veiId: number;
    placa: string | null;
    periodo: { dataInicio: string | null; dataFim: string | null };
    dadosSuficientes: boolean;
    amostras: number;
    totalKm: number;
    totalLitrosConsumidos: number;
    consumoMedioKmPorLitro: number | null;
    consumoMedioLPor100km: number | null;
    autonomiaEstimadaKm: number | null;
    ultimoLitrosTanque: number | null;
    ultimoOdometro: number | null;
    abastecimentos: { dataHora: string; litros: number; odometro: number }[];
};

type TimelineItem = {
    key: string;
    titulo: string;
    dataHora: string;
    local: string;
    velocidade: number | null;
    latitude: number;
    longitude: number;
};

function formatarDataISO(data: Date) {
    return data.toISOString().slice(0, 10);
}

function dataDiasAtras(dias: number) {
    const data = new Date();
    data.setDate(data.getDate() - dias);
    return formatarDataISO(data);
}

function formatarDataHoraBr(dataHoraISO?: string | null) {
    if (!dataHoraISO) return '-';

    const data = new Date(dataHoraISO);
    if (Number.isNaN(data.getTime())) return dataHoraISO;

    return data.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatarEndereco(loc: Localizacao | null | undefined) {
    if (!loc) return '-';

    const via = loc.rua ?? loc.rodovia ?? '-';
    const cidade = `${loc.municipio ?? '-'} / ${loc.uf ?? '-'}`;

    return `${via} - ${cidade}`;
}

function formatarTempoRelativo(dataHoraISO?: string | null) {
    if (!dataHoraISO) return '-';

    const data = new Date(dataHoraISO);

    if (Number.isNaN(data.getTime())) return '-';

    const diffMs = Date.now() - data.getTime();
    const diffMin = Math.round(diffMs / 60000);

    if (diffMin < 1) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin} min`;

    const diffH = Math.round(diffMin / 60);

    if (diffH < 24) return `há ${diffH}h`;

    const diffD = Math.round(diffH / 24);

    return `há ${diffD}d`;
}

export function TrackingPage() {
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [localizacoes, setLocalizacoes] = useState<CaminhaoLocalizacao[]>([]);
    const [veiculoSelecionado, setVeiculoSelecionado] = useState<number | null>(null);
    const [loadingVeiculos, setLoadingVeiculos] = useState(false);
    const [loadingLocalizacao, setLoadingLocalizacao] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [origem, setOrigem] = useState('');

    const [dataInicio, setDataInicio] = useState(() => dataDiasAtras(2));
    const [dataFim, setDataFim] = useState(() => formatarDataISO(new Date()));
    const [historico, setHistorico] = useState<Localizacao[]>([]);
    const [loadingHistorico, setLoadingHistorico] = useState(false);

    // Período próprio pro consumo — separado da timeline porque consumo
    // confiável precisa de mais histórico (30 dias por padrão) do que a
    // janela curta usada pra ver o trajeto recente.
    const [dataInicioConsumo, setDataInicioConsumo] = useState(() => dataDiasAtras(30));
    const [dataFimConsumo, setDataFimConsumo] = useState(() => formatarDataISO(new Date()));
    const [consumo, setConsumo] = useState<Consumo | null>(null);
    const [loadingConsumo, setLoadingConsumo] = useState(false);

    // Resumo de Telemetria (combustível real, via CAN) pro mesmo período do
    // card de Consumo & Autonomia acima — vem pronto do backend
    // (/trucks-control/telemetria-resumo), já com os deltas por bloco
    // corrigidos, km/L, autonomia e abastecimentos detectados.
    const [telemetriaResumo, setTelemetriaResumo] = useState<TelemetriaResumoConsumo | null>(null);
    const [loadingTelemetriaResumo, setLoadingTelemetriaResumo] = useState(false);
    const [capacidadeInput, setCapacidadeInput] = useState('');
    const [salvandoCapacidade, setSalvandoCapacidade] = useState(false);

    async function carregarVeiculos() {
        try {
            setLoadingVeiculos(true);
            setErro(null);

            const res = await api.get('/trucks-control/veiculos');

            const data = res.data;
            const lista: Veiculo[] = data.veiculos ?? data ?? [];

            setVeiculos(lista);

            if (lista.length > 0 && !veiculoSelecionado) {
                setVeiculoSelecionado(lista[0].veiID);
            }
        } catch (err: any) {
            setErro(err.message ?? 'Erro ao buscar veículos');
        } finally {
            setLoadingVeiculos(false);
        }
    }

    async function carregarLocalizacoes(forcar = false) {
        try {
            setLoadingLocalizacao(true);
            setErro(null);

            const res = await api.get('/trucks-control/caminhoes-localizacao', {
                params: forcar ? { forcar: 'true' } : undefined,
            });

            const data = res.data;

            setLocalizacoes(data.caminhoes ?? []);
            setOrigem(data.origemMensagens ?? '');
        } catch (err: any) {
            setErro(err.message ?? 'Erro ao buscar localização');
        } finally {
            setLoadingLocalizacao(false);
        }
    }

    async function carregarHistorico() {
        if (!veiculoSelecionado) return;

        try {
            setLoadingHistorico(true);
            setErro(null);

            const res = await api.get('/trucks-control/historico', {
                params: {
                    veiId: String(veiculoSelecionado),
                    dataInicio,
                    dataFim,
                },
            });

            const data = res.data;

            setHistorico(data.posicoes ?? []);
        } catch (err: any) {
            setErro(err.message ?? 'Erro ao buscar histórico');
        } finally {
            setLoadingHistorico(false);
        }
    }

    async function carregarConsumo() {
        if (!veiculoSelecionado) return;

        try {
            setLoadingConsumo(true);

            const res = await api.get('/trucks-control/consumo', {
                params: {
                    veiId: String(veiculoSelecionado),
                    dataInicio: dataInicioConsumo,
                    dataFim: dataFimConsumo,
                },
            });

            setConsumo(res.data ?? null);
        } catch (err) {
            console.error(err);
            setConsumo(null);
        } finally {
            setLoadingConsumo(false);
        }
    }

    useEffect(() => {
        carregarVeiculos();
        carregarLocalizacoes();

        // Atualização automática — só lê o que já está salvo no banco
        // (sem forçar), então não conta pro limite de requisições da API
        // externa. O cron no backend é quem de fato busca posição nova
        // na API a cada 30min; aqui é só refletir isso na tela sozinho.
        const intervalo = setInterval(() => {
            carregarLocalizacoes();
        }, 60_000);

        return () => clearInterval(intervalo);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function carregarTelemetriaResumo() {
        if (!veiculoSelecionado) return;

        try {
            setLoadingTelemetriaResumo(true);

            const res = await api.get('/trucks-control/telemetria-resumo', {
                params: {
                    veiId: String(veiculoSelecionado),
                    dataInicio: dataInicioConsumo,
                    dataFim: dataFimConsumo,
                },
            });

            setTelemetriaResumo(res.data ?? null);
        } catch (err) {
            console.error(err);
            setTelemetriaResumo(null);
        } finally {
            setLoadingTelemetriaResumo(false);
        }
    }

    useEffect(() => {
        carregarHistorico();
        carregarConsumo();
        carregarTelemetriaResumo();
        setCapacidadeInput('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [veiculoSelecionado]);

    // Cadastra a capacidade do tanque direto daqui — evita mandar o
    // usuário pra Cadastros → Caminhões só pra preencher um campo. Busca
    // o id do Caminhao pela placa (não temos ele à mão nessa tela) e usa
    // o mesmo PATCH /caminhoes/:id que a tela de Cadastros usa.
    async function salvarCapacidadeTanque() {
        if (!veiculoAtual?.placa) return;

        const valor = Number(capacidadeInput.replace(',', '.'));
        if (!capacidadeInput || Number.isNaN(valor) || valor <= 0) {
            toast.error('Informe uma capacidade válida, em litros.');
            return;
        }

        try {
            setSalvandoCapacidade(true);
            const detalhe = await api.get(`/caminhoes/detalhe/${encodeURIComponent(veiculoAtual.placa)}`);
            const caminhaoId = detalhe.data?.id;

            if (!caminhaoId) {
                toast.error('Esse caminhão ainda não está cadastrado em Cadastros → Caminhões.');
                return;
            }

            await api.patch(`/caminhoes/${caminhaoId}`, { capacidadeTanqueLitros: valor });
            toast.success('Capacidade do tanque salva.');
            setCapacidadeInput('');
            await carregarTelemetriaResumo();
        } catch (err) {
            console.error(err);
            toast.error('Não foi possível salvar a capacidade do tanque.');
        } finally {
            setSalvandoCapacidade(false);
        }
    }

    const localizacaoPorVeiculo = useMemo(() => {
        const map = new Map<number, CaminhaoLocalizacao>();

        for (const item of localizacoes) {
            map.set(Number(item.veiID), item);
        }

        return map;
    }, [localizacoes]);

    const veiculoAtual = veiculos.find((v) => v.veiID === veiculoSelecionado);

    const localizacaoAtual = veiculoSelecionado
        ? localizacaoPorVeiculo.get(veiculoSelecionado)
        : null;

    const posicao = localizacaoAtual?.localizacao ?? null;
    const emMovimento = (posicao?.velocidade ?? 0) > 3;

    const timeline = useMemo<TimelineItem[]>(() => {
        if (!historico.length) return [];

        const ordenado = [...historico].sort(
            (a, b) =>
                new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime(),
        );

        const cidadesUnicas: TimelineItem[] = [];
        let ultimoLocal = '';

        for (const item of ordenado) {
            const cidade = `${item.municipio ?? '-'} / ${item.uf ?? '-'}`;
            const rua = item.rua ?? item.rodovia ?? '-';
            const localCompleto = `${rua} - ${cidade}`;

            if (cidade === ultimoLocal) continue;

            ultimoLocal = cidade;

            cidadesUnicas.push({
                key: `${item.dataHora}-${item.latitude}-${item.longitude}`,
                titulo: `Passou por ${cidade}`,
                dataHora: item.dataHora,
                local: localCompleto,
                velocidade: item.velocidade,
                latitude: item.latitude,
                longitude: item.longitude,
            });
        }

        return cidadesUnicas;
    }, [historico]);

    const rotaMapa = useMemo(() => {
        if (!historico.length) return undefined;

        return [...historico]
            .sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime())
            .map((h) => ({ latitude: h.latitude, longitude: h.longitude }));
    }, [historico]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Rotas em tempo real
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Acompanhamento ao vivo da frota
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={carregarVeiculos}
                        disabled={loadingVeiculos}
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                        {loadingVeiculos ? 'Carregando placas...' : 'Atualizar placas'}
                    </button>

                    <button
                        onClick={() => carregarLocalizacoes(true)}
                        disabled={loadingLocalizacao}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 transition"
                    >
                        <RefreshCw
                            size={14}
                            className={loadingLocalizacao ? 'animate-spin' : ''}
                        />
                        {loadingLocalizacao
                            ? 'Buscando localização...'
                            : 'Buscar nova localização'}
                    </button>

                    {origem && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                            Origem: {origem}
                        </span>
                    )}
                </div>
            </div>

            {erro && (
                <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm border border-red-200 dark:border-red-500/20">
                    {erro}
                </div>
            )}

            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                {veiculos.map((v) => {
                    const pos = localizacaoPorVeiculo.get(v.veiID);
                    const loc = pos?.localizacao ?? null;
                    const selecionado = v.veiID === veiculoSelecionado;
                    const movimento = (loc?.velocidade ?? 0) > 3;

                    return (
                        <button
                            key={v.veiID}
                            onClick={() => setVeiculoSelecionado(v.veiID)}
                            className={`flex-shrink-0 min-w-[190px] text-left p-3 rounded-xl border transition ${selecionado
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-500/40'
                                    : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827] hover:bg-gray-50 dark:hover:bg-gray-800/60'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <strong className="text-gray-900 dark:text-white text-sm">
                                    {v.placa ?? `Veículo ${v.veiID}`}
                                </strong>

                                <span
                                    className={`w-2 h-2 rounded-full ${loc
                                            ? movimento
                                                ? 'bg-green-500'
                                                : 'bg-gray-400'
                                            : 'bg-gray-300 dark:bg-gray-700'
                                        }`}
                                />
                            </div>

                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {loc
                                    ? `${loc.velocidade ?? 0} km/h · ${loc.municipio ?? '-'}/${loc.uf ?? '-'}`
                                    : 'Sem ponto novo'}
                            </div>

                            {loc?.litrosTanque != null && (
                                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    <Fuel size={12} />
                                    {loc.litrosTanque} L
                                </div>
                            )}
                        </button>
                    );
                })}

                {veiculos.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 py-2">
                        Nenhum caminhão encontrado.
                    </p>
                )}
            </div>

            {!veiculoAtual && (
                <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl shadow p-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Selecione um caminhão.
                    </p>
                </div>
            )}

            {veiculoAtual && (
                <>
                    <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl shadow p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {veiculoAtual.placa ? (
                                        <Link
                                            to={`/caminhoes/${encodeURIComponent(veiculoAtual.placa)}`}
                                            className="text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            {veiculoAtual.placa}
                                        </Link>
                                    ) : (
                                        `Veículo ${veiculoAtual.veiID}`
                                    )}
                                </h2>

                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    ID: {veiculoAtual.veiID}
                                    {veiculoAtual.motorista && ` · ${veiculoAtual.motorista}`}
                                </p>
                            </div>

                            <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${!posicao
                                        ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                        : emMovimento
                                            ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400'
                                            : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                                    }`}
                            >
                                <Radio size={12} />
                                {!posicao
                                    ? 'Sem sinal'
                                    : emMovimento
                                        ? 'Em movimento'
                                        : 'Parado'}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                    <Gauge size={14} />
                                    Velocidade
                                </div>

                                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {posicao?.velocidade ?? 0}
                                    <span className="text-sm font-normal text-gray-400 ml-1">
                                        km/h
                                    </span>
                                </p>
                            </div>

                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                    <MapPin size={14} />
                                    Localização
                                </div>

                                <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">
                                    {formatarEndereco(posicao)}
                                </p>
                            </div>

                            <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                    <Clock size={14} />
                                    Última atualização
                                </div>

                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {formatarTempoRelativo(posicao?.dataHora)}
                                </p>

                                {posicao?.dataHora && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        {formatarDataHoraBr(posicao.dataHora)}
                                    </p>
                                )}
                            </div>
                        </div>

                        {posicao && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                                <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                        <Fuel size={14} />
                                        Combustível
                                    </div>

                                    {posicao.litrosTanque != null ? (
                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {posicao.litrosTanque}
                                            <span className="text-sm font-normal text-gray-400 ml-1">
                                                L
                                            </span>
                                        </p>
                                    ) : (
                                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                                            Esperando informação
                                        </p>
                                    )}
                                </div>

                                <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                        <Navigation2 size={14} />
                                        Odômetro
                                    </div>

                                    {posicao.odometro != null ? (
                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {posicao.odometro.toLocaleString('pt-BR')}
                                            <span className="text-sm font-normal text-gray-400 ml-1">
                                                km
                                            </span>
                                        </p>
                                    ) : (
                                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                                            Esperando informação
                                        </p>
                                    )}
                                </div>

                                <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                        <Activity size={14} />
                                        RPM
                                    </div>

                                    {posicao.rpm != null ? (
                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {posicao.rpm}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                                            Esperando informação
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl shadow p-6">
                        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <TrendingDown size={16} />
                                    Consumo &amp; Autonomia
                                </h3>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                    Calculado a partir do combustível e odômetro reais desse caminhão
                                </p>
                            </div>

                            <div className="flex flex-wrap items-end gap-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">
                                        De
                                    </label>

                                    <input
                                        type="date"
                                        value={dataInicioConsumo}
                                        onChange={(e) => setDataInicioConsumo(e.target.value)}
                                        className="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">
                                        Até
                                    </label>

                                    <input
                                        type="date"
                                        value={dataFimConsumo}
                                        onChange={(e) => setDataFimConsumo(e.target.value)}
                                        className="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                                    />
                                </div>

                                <button
                                    onClick={() => {
                                        carregarConsumo();
                                        carregarTelemetriaResumo();
                                    }}
                                    disabled={loadingConsumo}
                                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                                >
                                    {loadingConsumo ? 'Calculando...' : 'Buscar'}
                                </button>
                            </div>
                        </div>

                        {/* Resumo de Telemetria (combustível real) — sempre visível
                            aqui em cima, independente de calcularConsumo() ter dado
                            "dados insuficientes" ou não, porque usa fonte diferente
                            (RequestTelemetriaOcorrenciasHoje/V25), não litrosTanque.
                            Os litros/km já vêm corrigidos do backend (delta por
                            bloco, não o valor cumulativo do medidor). */}
                        <div className="mb-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
                            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 text-xs font-semibold mb-3">
                                <Percent size={14} />
                                Telemetria (combustível real via CAN)
                            </div>

                            {loadingTelemetriaResumo && (
                                <p className="text-sm text-blue-700/80 dark:text-blue-300/70">
                                    Calculando...
                                </p>
                            )}

                            {!loadingTelemetriaResumo && (!telemetriaResumo || !telemetriaResumo.dadosSuficientes) && (
                                <p className="text-xs text-blue-700/80 dark:text-blue-300/70">
                                    {telemetriaResumo?.percentualTanqueAtual != null
                                        ? `Tanque agora: ${telemetriaResumo.percentualTanqueAtual}%. `
                                        : ''}
                                    Ainda não há blocos de Telemetria suficientes nesse período pra
                                    calcular consumo/autonomia — precisa de telemetria habilitada no
                                    plano e embarcada no equipamento (ver Cadastros → Rastreador).
                                </p>
                            )}

                            {!loadingTelemetriaResumo && telemetriaResumo && telemetriaResumo.dadosSuficientes && (
                                <>
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                {telemetriaResumo.consumoMedioKmPorLitro ?? '-'}
                                                <span className="text-sm font-normal text-gray-400 ml-1">km/L</span>
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                consumo médio
                                                {telemetriaResumo.consumoMedioLPor100km != null && (
                                                    <> ({telemetriaResumo.consumoMedioLPor100km} L/100km)</>
                                                )}
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                {telemetriaResumo.percentualTanqueAtual ?? '-'}
                                                <span className="text-sm font-normal text-gray-400 ml-1">%</span>
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                do tanque agora
                                                {localizacaoAtual?.telemetria?.dataHora && (
                                                    <> · {formatarTempoRelativo(localizacaoAtual.telemetria.dataHora)}</>
                                                )}
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                {telemetriaResumo.autonomiaAtualKm ?? '-'}
                                                <span className="text-sm font-normal text-gray-400 ml-1">km</span>
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                autonomia com o % atual
                                            </p>
                                        </div>

                                        <div>
                                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                                {telemetriaResumo.autonomiaTanqueCheioKm ?? '-'}
                                                <span className="text-sm font-normal text-gray-400 ml-1">km</span>
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                autonomia com tanque cheio
                                            </p>
                                        </div>
                                    </div>

                                    <p className="text-xs text-blue-700/70 dark:text-blue-300/60 mt-3">
                                        {telemetriaResumo.totalLitros} L consumidos em {telemetriaResumo.totalKm} km
                                        ({telemetriaResumo.blocosValidos} bloco{telemetriaResumo.blocosValidos === 1 ? '' : 's'} válido{telemetriaResumo.blocosValidos === 1 ? '' : 's'} no período)
                                        {' · '}
                                        {telemetriaResumo.qtdAbastecimentos} abastecimento{telemetriaResumo.qtdAbastecimentos === 1 ? '' : 's'} detectado{telemetriaResumo.qtdAbastecimentos === 1 ? '' : 's'}
                                    </p>

                                    {telemetriaResumo.capacidadeTanqueLitros == null && (
                                        <div className="mt-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                                            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                                                Autonomia não calculada — falta a capacidade do tanque (litros) desse caminhão.
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    min={1}
                                                    value={capacidadeInput}
                                                    onChange={(e) => setCapacidadeInput(e.target.value)}
                                                    placeholder="Ex.: 600"
                                                    className="w-28 px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-amber-300 dark:border-amber-500/30"
                                                />
                                                <span className="text-xs text-gray-500 dark:text-gray-400">litros</span>
                                                <button
                                                    onClick={salvarCapacidadeTanque}
                                                    disabled={salvandoCapacidade}
                                                    className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-50 transition"
                                                >
                                                    {salvandoCapacidade ? 'Salvando...' : 'Salvar'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {telemetriaResumo.abastecimentos.length > 0 && (
                                        <div className="mt-3">
                                            <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1.5">
                                                Abastecimentos detectados no período
                                            </h4>

                                            <div className="space-y-1">
                                                {telemetriaResumo.abastecimentos.map((a, index) => (
                                                    <div
                                                        key={`${a.dataHora}-${index}`}
                                                        className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg bg-white/60 dark:bg-[#0B1120]/60 border border-blue-100 dark:border-blue-500/10"
                                                    >
                                                        <span className="text-gray-600 dark:text-gray-300">
                                                            {formatarDataHoraBr(a.dataHora)}
                                                        </span>
                                                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                                                            {a.percentualAntes}% → {a.percentualDepois}%
                                                        </span>
                                                        <span className="font-medium text-gray-900 dark:text-white">
                                                            {a.litrosEstimados != null ? `+${a.litrosEstimados} L` : `+${a.deltaPercent}%`}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {loadingConsumo && (
                            <p className="text-sm text-gray-400 dark:text-gray-500 py-4">
                                Calculando...
                            </p>
                        )}

                        {!loadingConsumo && (!consumo || !consumo.dadosSuficientes) && (
                            <div className="py-4">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Ainda não há dados suficientes de combustível pra calcular
                                    consumo desse caminhão nesse período
                                    {consumo && consumo.amostras > 0
                                        ? ` (${consumo.amostras} leitura${consumo.amostras === 1 ? '' : 's'} útil${consumo.amostras === 1 ? '' : 'eis'} até agora — precisa de pelo menos 2).`
                                        : '.'}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                                    Isso é normal logo no início — pode ser porque ainda não
                                    passou tempo suficiente, ou porque o rastreador desse
                                    caminhão não manda nível de combustível.
                                </p>
                            </div>
                        )}

                        {!loadingConsumo && consumo && consumo.dadosSuficientes && (
                            <>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                            <Fuel size={14} />
                                            Consumo médio
                                        </div>

                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {consumo.consumoMedioKmPorLitro ?? '-'}
                                            <span className="text-sm font-normal text-gray-400 ml-1">
                                                km/L
                                            </span>
                                        </p>

                                        {consumo.consumoMedioLPor100km != null && (
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {consumo.consumoMedioLPor100km} L/100km
                                            </p>
                                        )}
                                    </div>

                                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                            <Gauge size={14} />
                                            Autonomia estimada
                                        </div>

                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {consumo.autonomiaEstimadaKm ?? '-'}
                                            <span className="text-sm font-normal text-gray-400 ml-1">
                                                km
                                            </span>
                                        </p>

                                        <p className="text-xs text-gray-400 mt-0.5">
                                            com {consumo.ultimoLitrosTanque ?? '-'} L no tanque
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                            <RouteIcon size={14} />
                                            Percorrido no período
                                        </div>

                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {consumo.totalKm.toLocaleString('pt-BR')}
                                            <span className="text-sm font-normal text-gray-400 ml-1">
                                                km
                                            </span>
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0B1120] border border-gray-200 dark:border-gray-800">
                                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-medium mb-1.5">
                                            <Droplet size={14} />
                                            Consumido no período
                                        </div>

                                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                            {consumo.totalLitrosConsumidos.toLocaleString('pt-BR')}
                                            <span className="text-sm font-normal text-gray-400 ml-1">
                                                L
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                                    Baseado em {consumo.amostras} trecho{consumo.amostras === 1 ? '' : 's'} de rodagem com leitura de combustível válida.
                                </p>

                                {consumo.abastecimentos.length > 0 && (
                                    <div className="mt-5">
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                                            Abastecimentos identificados no período
                                        </h4>

                                        <div className="space-y-1.5">
                                            {consumo.abastecimentos.map((a, index) => (
                                                <div
                                                    key={`${a.dataHora}-${index}`}
                                                    className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#0B1120] border border-gray-100 dark:border-gray-800"
                                                >
                                                    <span className="text-gray-600 dark:text-gray-300">
                                                        {formatarDataHoraBr(a.dataHora)}
                                                    </span>
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        +{a.litros} L
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
                        <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow h-[320px] md:h-[460px]">
                            {posicao ? (
                                <TruckMap
                                    latitude={posicao.latitude}
                                    longitude={posicao.longitude}
                                    placa={veiculoAtual.placa ?? `Veículo ${veiculoAtual.veiID}`}
                                    velocidade={posicao.velocidade}
                                    dataHora={posicao.dataHora}
                                    endereco={formatarEndereco(posicao)}
                                    path={rotaMapa}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-50 dark:bg-[#0B1120] text-sm text-gray-400 dark:text-gray-500">
                                    Sem posição pra mostrar no mapa ainda.
                                </div>
                            )}
                        </div>

                        <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl shadow p-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                <Navigation2 size={15} />
                                Detalhes da posição
                            </h3>

                            {posicao ? (
                                <div className="space-y-3 text-sm">
                                    <div>
                                        <p className="text-xs text-gray-400">Município</p>
                                        <p className="text-gray-800 dark:text-gray-200 font-medium">
                                            {posicao.municipio ?? '-'}/{posicao.uf ?? '-'}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-gray-400">Via</p>
                                        <p className="text-gray-800 dark:text-gray-200 font-medium">
                                            {posicao.rua ?? posicao.rodovia ?? '-'}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-gray-400">Coordenadas</p>
                                        <p className="text-gray-800 dark:text-gray-200 font-medium">
                                            {posicao.latitude.toFixed(5)}, {posicao.longitude.toFixed(5)}
                                        </p>
                                    </div>

                                    <a
                                        href={`https://www.google.com/maps?q=${posicao.latitude},${posicao.longitude}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        Abrir no Google Maps
                                    </a>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 dark:text-gray-500">
                                    Ainda não recebemos nenhuma posição desse caminhão.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl shadow p-6">
                        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                Timeline do Caminhão
                            </h3>

                            <div className="flex flex-wrap items-end gap-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">
                                        De
                                    </label>

                                    <input
                                        type="date"
                                        value={dataInicio}
                                        onChange={(e) => setDataInicio(e.target.value)}
                                        className="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">
                                        Até
                                    </label>

                                    <input
                                        type="date"
                                        value={dataFim}
                                        onChange={(e) => setDataFim(e.target.value)}
                                        className="px-2 py-1.5 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                                    />
                                </div>

                                <button
                                    onClick={carregarHistorico}
                                    disabled={loadingHistorico}
                                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                                >
                                    {loadingHistorico ? 'Buscando...' : 'Buscar'}
                                </button>
                            </div>
                        </div>

                        {timeline.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-gray-500">
                                Nenhum ponto de rota salvo pra esse caminhão nesse
                                período.
                            </p>
                        )}

                        <div className="relative">
                            {timeline.map((item, index) => (
                                <div
                                    key={item.key}
                                    className="grid grid-cols-[24px_1fr] gap-3 mb-6"
                                >
                                    <div className="relative">
                                        <div
                                            className={`w-3 h-3 rounded-full mt-1 ${index === 0
                                                    ? 'bg-green-500'
                                                    : 'bg-blue-500'
                                                }`}
                                        />

                                        <div className="absolute top-5 left-[5px] w-0.5 h-[70px] bg-gray-200 dark:bg-gray-700" />
                                    </div>

                                    <div>
                                        <strong className="text-gray-900 dark:text-white text-sm">
                                            {item.titulo}
                                        </strong>

                                        <p className="text-xs text-gray-500 dark:text-gray-400 my-1.5">
                                            {formatarDataHoraBr(item.dataHora)}
                                        </p>

                                        <p className="text-sm text-gray-600 dark:text-gray-300 my-1.5">
                                            {item.local}
                                        </p>

                                        <span className="inline-block px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 text-xs font-medium">
                                            Velocidade: {item.velocidade ?? 0} km/h
                                        </span>

                                        <a
                                            href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            Abrir ponto no mapa
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
