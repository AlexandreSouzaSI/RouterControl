import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ThemeToggle } from '../components/ThemeToggle';
import { UploadBox } from '../components/UploadBox';
import { ChartViagens } from '../components/ChartViagens';
import { api } from '../services/api';

type Caminhao = {
    id: string;
    placa: string;
};

export function Dashboard() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);
    const [mesSelecionado, setMesSelecionado] = useState<string>('');
    const [placaFiltro, setPlacaFiltro] = useState('');

    async function fetchDashboard() {
        try {
            setLoading(true);

            const res = await api.get('/relatorio/dashboard');

            setData(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchCaminhoes() {
        try {
            const res = await api.get('/caminhoes');

            const lista = Array.isArray(res.data)
                ? res.data
                : res.data.data || [];

            setCaminhoes(lista);
        } catch (error) {
            console.error(error);
        }
    }

    useEffect(() => {
        fetchDashboard();
        fetchCaminhoes();
    }, []);

    const mesesOrdenados = useMemo(() => {
        if (!data?.meses) return [];

        return [...data.meses].sort((a, b) =>
            a.localeCompare(b),
        );
    }, [data]);

    const mesBaseParaComparacao = useMemo(() => {
        if (mesSelecionado) return mesSelecionado;

        if (mesesOrdenados.length === 0) return '';

        return mesesOrdenados[mesesOrdenados.length - 1];
    }, [mesSelecionado, mesesOrdenados]);

    const mesAnterior = useMemo(() => {
        if (!mesBaseParaComparacao) return '';

        const index = mesesOrdenados.indexOf(
            mesBaseParaComparacao,
        );

        if (index <= 0) return '';

        return mesesOrdenados[index - 1];
    }, [mesBaseParaComparacao, mesesOrdenados]);

    const rankingFiltrado = useMemo(() => {
        if (!data?.dadosPorMes) return [];

        let dados: any[] = [];

        if (mesSelecionado === '') {
            dados = Object.entries(data.dadosPorMes).flatMap(
                ([mes, dados]: [string, any]) =>
                    (dados.ranking || []).map((item: any) => ({
                        ...item,
                        mes,
                    })),
            );
        } else {
            dados = (
                data.dadosPorMes[mesSelecionado]?.ranking || []
            ).map((item: any) => ({
                ...item,
                mes: mesSelecionado,
            }));
        }

        if (placaFiltro) {
            dados = dados.filter(
                (item) => item.placa === placaFiltro,
            );
        }

        return dados.sort((a, b) => {
            const mesCompare = a.mes.localeCompare(b.mes);

            if (mesCompare !== 0) return mesCompare;

            return a.placa.localeCompare(b.placa);
        });
    }, [data, mesSelecionado, placaFiltro]);

    const dadosMesSelecionado = useMemo(() => {
        if (!data?.dadosPorMes) return {};

        let dados: any = {};

        if (mesSelecionado === '') {
            dados = {
                totalCaminhoes: Object.values(data.dadosPorMes).reduce(
                    (acc: number, m: any) =>
                        acc + (m.totalCaminhoes || 0),
                    0,
                ),
                totalViagens: Object.values(data.dadosPorMes).reduce(
                    (acc: number, m: any) =>
                        acc + (m.totalViagens || 0),
                    0,
                ),
                diasParados: Object.values(data.dadosPorMes).reduce(
                    (acc: number, m: any) =>
                        acc + (m.diasParados || 0),
                    0,
                ),
                diasRodando: Object.values(data.dadosPorMes).reduce(
                    (acc: number, m: any) =>
                        acc + (m.diasRodando || 0),
                    0,
                ),
            };
        } else {
            dados = data.dadosPorMes[mesSelecionado] || {};
        }

        if (placaFiltro) {
            const filtrados = rankingFiltrado;

            return {
                totalCaminhoes: filtrados.length > 0 ? 1 : 0,
                totalViagens: filtrados.reduce(
                    (acc, item) => acc + (item.totalViagens || 0),
                    0,
                ),
                diasParados: filtrados.reduce(
                    (acc, item) => acc + (item.diasParados || 0),
                    0,
                ),
                diasRodando: filtrados.reduce(
                    (acc, item) => acc + (item.diasRodando || 0),
                    0,
                ),
            };
        }

        return dados;
    }, [data, mesSelecionado, placaFiltro, rankingFiltrado]);

    function getValorMes(mes: string, campo: string) {
        if (!mes || !data?.dadosPorMes?.[mes]) return 0;

        if (!placaFiltro) {
            return data.dadosPorMes[mes]?.[campo] || 0;
        }

        const ranking =
            data.dadosPorMes[mes]?.ranking || [];

        const item = ranking.find(
            (r: any) => r.placa === placaFiltro,
        );

        if (!item) return 0;

        if (campo === 'totalViagens') {
            return (
                item.totalViagens ??
                item.viagens ??
                item.total ??
                0
            );
        }
        if (campo === 'diasParados') return item.diasParados || 0;
        if (campo === 'diasRodando') return item.diasRodando || 0;
        if (campo === 'totalCaminhoes') return 1;

        return 0;
    }

    function calcularCrescimento(campo: string) {
        if (!mesBaseParaComparacao || !mesAnterior) return null;

        const atual = getValorMes(mesBaseParaComparacao, campo);
        const anterior = getValorMes(mesAnterior, campo);

        if (anterior === 0) {
            if (atual === 0) return 0;
            return 100;
        }

        return ((atual - anterior) / anterior) * 100;
    }

    const chartData = useMemo(() => {
        if (!data?.dadosPorMes) return [];

        return mesesOrdenados.map((mes: string) => {
            if (!placaFiltro) {
                return {
                    mes,
                    viagens:
                        data.dadosPorMes[mes]?.totalViagens ?? 0,
                };
            }

            const item = (
                data.dadosPorMes[mes]?.ranking || []
            ).find((r: any) => r.placa === placaFiltro);

            return {
                mes,
                viagens: item?.totalViagens ?? 0,
            };
        });
    }, [data, mesesOrdenados, placaFiltro]);

    function GrowthBadge({ value }: { value: number | null }) {
        if (value === null) {
            return (
                <span className="text-xs text-gray-400">
                    --
                </span>
            );
        }

        const isPositive = value >= 0;

        return (
            <motion.span
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${isPositive
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-red-500/10 text-red-500'
                    }`}
            >
                {isPositive ? '↑' : '↓'}
                {Math.abs(value).toFixed(1)}%
            </motion.span>
        );
    }

    const cards = [
        {
            title: 'Caminhões',
            value: dadosMesSelecionado?.totalCaminhoes ?? 0,
            crescimento: calcularCrescimento('totalCaminhoes'),
        },
        {
            title: 'Viagens',
            value: dadosMesSelecionado?.totalViagens ?? 0,
            crescimento: calcularCrescimento('totalViagens'),
        },
        {
            title: 'Dias Parados',
            value: dadosMesSelecionado?.diasParados ?? 0,
            crescimento: calcularCrescimento('diasParados'),
        },
        {
            title: 'Dias Rodando',
            value: dadosMesSelecionado?.diasRodando ?? 0,
            crescimento: calcularCrescimento('diasRodando'),
        },
    ];

    if (loading) {
        return (
            <div className="p-6 animate-pulse space-y-4">
                <div className="h-10 bg-gray-300 rounded" />
                <div className="h-40 bg-gray-300 rounded" />
            </div>
        );
    }

    if (!data) {
        return <p className="p-6">Erro ao carregar dados</p>;
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <ThemeToggle />
            </div>

            <UploadBox onUploadSuccess={fetchDashboard} />

            <div className="mb-6 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="text-sm text-gray-500 block mb-1">
                        Mês
                    </label>

                    <select
                        value={mesSelecionado}
                        onChange={(e) =>
                            setMesSelecionado(e.target.value)
                        }
                        className="px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-gray-300 dark:border-gray-700"
                    >
                        <option value="">Todos</option>

                        {mesesOrdenados.map((mes: string) => (
                            <option key={mes} value={mes}>
                                {mes}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-sm text-gray-500 block mb-1">
                        Caminhão
                    </label>

                    <select
                        value={placaFiltro}
                        onChange={(e) =>
                            setPlacaFiltro(e.target.value)
                        }
                        className="px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-gray-300 dark:border-gray-700 min-w-[160px]"
                    >
                        <option value="">Todos</option>

                        {caminhoes.map((c) => (
                            <option key={c.id} value={c.placa}>
                                {c.placa}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {cards.map((item, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800"
                    >
                        <p className="text-sm text-gray-500">
                            {item.title}
                        </p>

                        <div className="flex items-center justify-between mt-2">
                            <h2 className="text-2xl font-bold">
                                {item.value}
                            </h2>

                            <GrowthBadge value={item.crescimento} />
                        </div>

                        {mesBaseParaComparacao && mesAnterior && (
                            <p className="text-xs text-gray-400 mt-2">
                                vs {mesAnterior}
                            </p>
                        )}
                    </motion.div>
                ))}
            </div>

            <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800 mb-6">
                <h2 className="mb-4 font-semibold">
                    Resumo por Caminhão
                </h2>

                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
                            <th>Placa</th>
                            <th>Mês</th>
                            <th>Viagens</th>
                            <th>Dias Parados</th>
                            <th>Dias Rodando</th>
                        </tr>
                    </thead>

                    <tbody>
                        {rankingFiltrado.map((item: any, index: number) => (
                            <tr
                                key={`${item.placa}-${item.mes}-${index}`}
                                className="border-b border-gray-100 dark:border-gray-800"
                            >
                                <td>{item.placa}</td>
                                <td>{item.mes}</td>
                                <td>
                                    {item.totalViagens ??
                                        item.viagens ??
                                        item.total ??
                                        0}
                                </td>
                                <td>{item.diasParados}</td>
                                <td>{item.diasRodando}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-2 bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800">
                    <h2 className="font-semibold mb-2">
                        Viagens por mês
                    </h2>

                    <ChartViagens
                        meses={chartData.map((item) => item.mes)}
                        viagens={chartData.map(
                            (item) => item.viagens,
                        )}
                    />
                </div>

                <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800">
                    <h2 className="font-semibold mb-2">Top Caminhões</h2>

                    {rankingFiltrado
                        .sort(
                            (a, b) =>
                                (b.totalViagens ?? b.viagens ?? 0) -
                                (a.totalViagens ?? a.viagens ?? 0),
                        )
                        .slice(0, 5)
                        .map((item: any, index: number) => (
                            <div
                                key={`${item.placa}-${index}`}
                                className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800"
                            >
                                <span>
                                    {index + 1}º - {item.placa}
                                </span>

                                <span className="font-bold">
                                    {item.totalViagens ??
                                        item.viagens ??
                                        item.total ??
                                        0}
                                </span>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
}