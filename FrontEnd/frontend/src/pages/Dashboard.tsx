import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Truck,
    Gauge,
    Clock,
    TrendingUp,
    TrendingDown,
    RefreshCw,
    Navigation,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
    CartesianGrid,
} from 'recharts';
import { api } from '../services/api';
import { FleetMap, type PontoFrota } from '../components/FleetMap';

type Localizacao = {
    dataHora: string;
    latitude: number;
    longitude: number;
    municipio: string | null;
    uf: string | null;
    rua: string | null;
    rodovia: string | null;
    velocidade: number | null;
};

type CaminhaoLocalizacao = {
    veiID: number;
    placa: string | null;
    nome: string;
    equipamento: number | null;
    localizacao: Localizacao | null;
};

type RelatorioDashboard = {
    cards: {
        diasParados: number;
    };
    topCaminhoes: {
        placa: string;
        viagens: number;
        diasParados: number;
        diasRodando: number;
    }[];
};

type ResumoFinanceiro = {
    totalEntradas: number;
    totalSaidas: number;
    saldo: number;
};

type Transacao = {
    data: string;
    valor: string | number;
    direcao: 'ENTRADA' | 'SAIDA';
};

type ViagemGps = {
    id: string;
    veiId: number;
    placa: string | null;
    origemMunicipio: string;
    origemUf: string | null;
    dataHoraInicio: string;
    destinoMunicipio: string | null;
    destinoUf: string | null;
    dataHoraFim: string | null;
    status: 'EM_ANDAMENTO' | 'CONCLUIDA';
};

function formatarDataISO(data: Date) {
    return data.toISOString().slice(0, 10);
}

function primeiroDiaDoMes() {
    const data = new Date();
    data.setDate(1);
    return formatarDataISO(data);
}

function formatarMoeda(valor: number) {
    return valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
    });
}

function formatarDataCurta(iso: string) {
    const [, mes, dia] = iso.split('-');
    return `${dia}/${mes}`;
}

function formatarTempoDecorrido(iso: string) {
    const inicio = new Date(iso).getTime();
    const agora = Date.now();
    const minutos = Math.max(0, Math.floor((agora - inicio) / 60000));

    const dias = Math.floor(minutos / (60 * 24));
    const horas = Math.floor((minutos % (60 * 24)) / 60);
    const mins = minutos % 60;

    if (dias > 0) return `${dias}d ${horas}h`;
    if (horas > 0) return `${horas}h ${mins}min`;
    return `${mins}min`;
}

function useIsDark() {
    const [isDark, setIsDark] = useState(
        () =>
            typeof document !== 'undefined' &&
            document.documentElement.classList.contains('dark'),
    );

    useEffect(() => {
        const root = document.documentElement;

        const observer = new MutationObserver(() => {
            setIsDark(root.classList.contains('dark'));
        });

        observer.observe(root, {
            attributes: true,
            attributeFilter: ['class'],
        });

        return () => observer.disconnect();
    }, []);

    return isDark;
}

export function Dashboard() {
    const isDark = useIsDark();

    // Período fixo (mês atual) por enquanto — sem seletor pro usuário.
    // Se um dia fizer sentido escolher outro período, dá pra reativar os
    // inputs de data que já existiam aqui.
    const dataInicio = useMemo(() => primeiroDiaDoMes(), []);
    const dataFim = useMemo(() => formatarDataISO(new Date()), []);

    const [localizacoes, setLocalizacoes] = useState<CaminhaoLocalizacao[]>([]);
    const [relatorio, setRelatorio] = useState<RelatorioDashboard | null>(null);
    const [resumoFinanceiro, setResumoFinanceiro] = useState<ResumoFinanceiro | null>(null);
    const [transacoes, setTransacoes] = useState<Transacao[]>([]);
    const [viagensAtivas, setViagensAtivas] = useState<ViagemGps[]>([]);
    const [loading, setLoading] = useState(true);
    const [atualizandoRastreio, setAtualizandoRastreio] = useState(false);

    async function carregarRastreio() {
        try {
            setAtualizandoRastreio(true);

            const [locRes, viagensRes] = await Promise.all([
                api.get('/trucks-control/caminhoes-localizacao'),
                api.get('/trucks-control/viagens', { params: { status: 'EM_ANDAMENTO' } }),
            ]);

            // O endpoint devolve { caminhoes: [...], origemMensagens }, não
            // um array direto — mesma resposta usada pela tela Rotas.
            const lista = locRes.data?.caminhoes ?? locRes.data;

            setLocalizacoes(Array.isArray(lista) ? lista : []);
            setViagensAtivas(Array.isArray(viagensRes.data) ? viagensRes.data : []);
        } catch (error) {
            console.error(error);
        } finally {
            setAtualizandoRastreio(false);
        }
    }

    async function carregarPeriodo() {
        try {
            setLoading(true);

            const [relatorioRes, resumoRes, transacoesRes] = await Promise.all([
                api.get('/relatorio/dashboard', { params: { dataInicio, dataFim } }),
                api.get('/financeiro/resumo', { params: { dataInicio, dataFim } }),
                api.get('/financeiro/transacoes', { params: { dataInicio, dataFim } }),
            ]);

            setRelatorio(relatorioRes.data);
            setResumoFinanceiro(resumoRes.data);
            setTransacoes(Array.isArray(transacoesRes.data) ? transacoesRes.data : []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregarRastreio();

        // Rastreamento em tempo real: atualiza sozinho a cada 60s, sem
        // depender do usuário ficar recarregando a página.
        const intervalo = setInterval(carregarRastreio, 60000);
        return () => clearInterval(intervalo);
    }, []);

    useEffect(() => {
        carregarPeriodo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataInicio, dataFim]);

    const pontosFrota: PontoFrota[] = useMemo(() => {
        return localizacoes
            .filter((c) => c.localizacao)
            .map((c) => {
                const loc = c.localizacao!;

                return {
                    veiID: c.veiID,
                    placa: c.placa || c.nome,
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    velocidade: loc.velocidade,
                    dataHora: new Date(loc.dataHora).toLocaleString('pt-BR'),
                    endereco: [loc.rua ?? loc.rodovia, loc.municipio, loc.uf]
                        .filter(Boolean)
                        .join(' - '),
                };
            });
    }, [localizacoes]);

    const caminhoesAtivos = pontosFrota.length;
    const totalCaminhoes = localizacoes.length;

    const velocidadeMedia = useMemo(() => {
        const comVelocidade = pontosFrota.filter((p) => p.velocidade !== null);

        if (comVelocidade.length === 0) return 0;

        const soma = comVelocidade.reduce((acc, p) => acc + (p.velocidade || 0), 0);

        return Math.round(soma / comVelocidade.length);
    }, [pontosFrota]);

    const diasParadosPeriodo = relatorio?.cards.diasParados ?? 0;

    const dadosDiasParados = useMemo(() => {
        return [...(relatorio?.topCaminhoes ?? [])]
            .sort((a, b) => b.diasParados - a.diasParados)
            .slice(0, 6);
    }, [relatorio]);

    const dadosResumoFinanceiro = useMemo(() => {
        const porDia = new Map<string, { data: string; receita: number; custos: number }>();

        for (const t of transacoes) {
            const dia = t.data.slice(0, 10);

            if (!porDia.has(dia)) {
                porDia.set(dia, { data: dia, receita: 0, custos: 0 });
            }

            const registro = porDia.get(dia)!;
            const valor = Number(t.valor);

            if (t.direcao === 'ENTRADA') registro.receita += valor;
            else registro.custos += valor;
        }

        return Array.from(porDia.values())
            .sort((a, b) => a.data.localeCompare(b.data))
            .map((item) => ({
                ...item,
                diaFormatado: formatarDataCurta(item.data),
            }));
    }, [transacoes]);

    const corGrade = isDark ? '#1f2937' : '#e5e7eb';
    const corEixo = isDark ? '#6b7280' : '#9ca3af';
    const corTooltipBg = isDark ? '#111827' : '#ffffff';
    const corTooltipBorder = isDark ? '#1f2937' : '#e5e7eb';
    const corTooltipTexto = isDark ? '#f3f4f6' : '#111827';

    const kpis = [
        {
            titulo: 'Caminhões Ativos',
            valor: `${caminhoesAtivos}/${totalCaminhoes}`,
            icone: Truck,
            cor: 'blue',
        },
        {
            titulo: 'Viagens Ativas',
            valor: viagensAtivas.length,
            icone: Navigation,
            cor: 'indigo',
        },
        {
            titulo: 'Velocidade Média',
            valor: `${velocidadeMedia} km/h`,
            icone: Gauge,
            cor: 'purple',
        },
        {
            titulo: 'Dias Parados (mês)',
            valor: diasParadosPeriodo,
            icone: Clock,
            cor: 'amber',
        },
        {
            titulo: 'Receita no Mês',
            valor: formatarMoeda(resumoFinanceiro?.totalEntradas ?? 0),
            icone: TrendingUp,
            cor: 'green',
        },
        {
            titulo: 'Custo no Mês',
            valor: formatarMoeda(resumoFinanceiro?.totalSaidas ?? 0),
            icone: TrendingDown,
            cor: 'red',
        },
    ];

    const corClasses: Record<string, string> = {
        blue: 'bg-blue-500/10 text-blue-500',
        purple: 'bg-purple-500/10 text-purple-500',
        amber: 'bg-amber-500/10 text-amber-500',
        green: 'bg-green-500/10 text-green-500',
        red: 'bg-red-500/10 text-red-500',
        indigo: 'bg-indigo-500/10 text-indigo-500',
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                        Dashboard Operacional
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Visão geral da frota e do financeiro neste mês.
                    </p>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    <button
                        onClick={carregarRastreio}
                        title="Atualizar rastreamento"
                        className="p-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    >
                        <RefreshCw
                            size={16}
                            className={atualizandoRastreio ? 'animate-spin' : ''}
                        />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                {kpis.map((item) => {
                    const Icone = item.icone;

                    return (
                        <motion.div
                            key={item.titulo}
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800"
                        >
                            <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${corClasses[item.cor]}`}
                            >
                                <Icone size={18} />
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {item.titulo}
                            </p>

                            <h2 className="text-xl font-bold mt-1 text-gray-900 dark:text-white">
                                {loading ? '...' : item.valor}
                            </h2>
                        </motion.div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                <div className="lg:col-span-2 bg-white dark:bg-[#111827] rounded-2xl shadow border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
                    <div className="p-4 pb-0 flex items-center justify-between">
                        <h2 className="font-semibold text-gray-900 dark:text-white">
                            Rastreamento em Tempo Real
                        </h2>

                        <span className="text-xs text-gray-400">
                            {caminhoesAtivos} caminhão(ões) com sinal
                        </span>
                    </div>

                    <div className="h-[420px] mt-3">
                        <FleetMap pontos={pontosFrota} />
                    </div>
                </div>

                <div className="bg-white dark:bg-[#111827] rounded-2xl shadow border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
                    <div className="p-4 pb-0">
                        <h2 className="font-semibold text-gray-900 dark:text-white">
                            Viagens em Andamento
                        </h2>

                        <p className="text-xs text-gray-400 mt-0.5">
                            Saída de Santos → chegada em Betim ou Pouso Alegre
                        </p>
                    </div>

                    {viagensAtivas.length === 0 ? (
                        <div className="flex-1 min-h-[300px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 text-center px-4">
                            Nenhuma viagem em andamento no momento
                        </div>
                    ) : (
                        <div className="mt-3 px-4 pb-4 space-y-2 overflow-y-auto max-h-[420px]">
                            {viagensAtivas.map((v) => (
                                <div
                                    key={v.id}
                                    className="p-3 rounded-xl border border-gray-100 dark:border-gray-800/60 bg-gray-50 dark:bg-gray-900/40"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-gray-900 dark:text-white">
                                            {v.placa || v.veiId}
                                        </span>

                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-500">
                                            {formatarTempoDecorrido(v.dataHoraInicio)}
                                        </span>
                                    </div>

                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {v.origemMunicipio}
                                        {v.origemUf ? ` - ${v.origemUf}` : ''}
                                    </p>

                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                                        Saiu em {new Date(v.dataHoraInicio).toLocaleString('pt-BR')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800">
                    <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">
                        Dias Parados por Veículo
                    </h2>

                    {dadosDiasParados.length === 0 ? (
                        <div className="h-[260px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                            Sem dados no período selecionado
                        </div>
                    ) : (
                        <div className="w-full h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={dadosDiasParados}
                                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke={corGrade}
                                        vertical={false}
                                    />

                                    <XAxis
                                        dataKey="placa"
                                        stroke={corEixo}
                                        tick={{ fontSize: 12, fill: corEixo }}
                                        axisLine={false}
                                        tickLine={false}
                                    />

                                    <YAxis
                                        stroke={corEixo}
                                        tick={{ fontSize: 12, fill: corEixo }}
                                        axisLine={false}
                                        tickLine={false}
                                        allowDecimals={false}
                                        width={30}
                                    />

                                    <Tooltip
                                        cursor={{ fill: corGrade, opacity: 0.3 }}
                                        contentStyle={{
                                            backgroundColor: corTooltipBg,
                                            border: `1px solid ${corTooltipBorder}`,
                                            borderRadius: '12px',
                                        }}
                                        labelStyle={{ color: corTooltipTexto, fontWeight: 600 }}
                                        itemStyle={{ color: corTooltipTexto }}
                                        formatter={(value: any) => [`${value} dia(s)`, 'Parado']}
                                    />

                                    <Bar
                                        dataKey="diasParados"
                                        name="Dias parados"
                                        fill="#ef4444"
                                        radius={[6, 6, 0, 0]}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800">
                    <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">
                        Resumo Financeiro
                    </h2>

                    {dadosResumoFinanceiro.length === 0 ? (
                        <div className="h-[260px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                            Sem transações no período selecionado
                        </div>
                    ) : (
                        <div className="w-full h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={dadosResumoFinanceiro}
                                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                                >
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke={corGrade}
                                        vertical={false}
                                    />

                                    <XAxis
                                        dataKey="diaFormatado"
                                        stroke={corEixo}
                                        tick={{ fontSize: 12, fill: corEixo }}
                                        axisLine={false}
                                        tickLine={false}
                                    />

                                    <YAxis
                                        stroke={corEixo}
                                        tick={{ fontSize: 12, fill: corEixo }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={30}
                                        tickFormatter={(v) =>
                                            v >= 1000 ? `${Math.round(v / 1000)}k` : v
                                        }
                                    />

                                    <Tooltip
                                        cursor={{ stroke: corGrade, strokeWidth: 1 }}
                                        contentStyle={{
                                            backgroundColor: corTooltipBg,
                                            border: `1px solid ${corTooltipBorder}`,
                                            borderRadius: '12px',
                                        }}
                                        labelStyle={{ color: corTooltipTexto, fontWeight: 600 }}
                                        itemStyle={{ color: corTooltipTexto }}
                                        formatter={(value: any) => formatarMoeda(Number(value))}
                                    />

                                    <Legend
                                        wrapperStyle={{ fontSize: 12, color: corEixo }}
                                        iconType="circle"
                                        iconSize={8}
                                    />

                                    <Line
                                        type="monotone"
                                        dataKey="receita"
                                        name="Receita"
                                        stroke="#22c55e"
                                        strokeWidth={2.5}
                                        dot={{ r: 3, strokeWidth: 0 }}
                                        activeDot={{ r: 5 }}
                                    />

                                    <Line
                                        type="monotone"
                                        dataKey="custos"
                                        name="Custos"
                                        stroke="#ef4444"
                                        strokeWidth={2.5}
                                        dot={{ r: 3, strokeWidth: 0 }}
                                        activeDot={{ r: 5 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
