// Dashboard.tsx
import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ThemeToggle } from '../components/ThemeToggle';
import { UploadBox } from '../components/UploadBox';
import { ChartViagens } from '../components/ChartViagens';

export function Dashboard() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [mesSelecionado, setMesSelecionado] = useState<string>('');

    async function fetchDashboard() {
        try {
            setLoading(true);
            const res = await axios.get('http://localhost:3000/relatorio/dashboard');
            setData(res.data);
            console.log("aqui ", res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchDashboard();
    }, []);

    // ✅ Ordenação segura
    const mesesOrdenados = useMemo(() => {
        if (!data?.meses) return [];

        return [...data.meses].sort((a, b) => {
            const [mesA, anoA] = a.split('/').map(Number);
            const [mesB, anoB] = b.split('/').map(Number);

            if (anoA !== anoB) return anoA - anoB;
            return mesA - mesB;
        });
    }, [data]);

    // ✅ Define mês padrão com segurança
    useEffect(() => {
        if (mesesOrdenados.length > 0 && !mesSelecionado) {
            setMesSelecionado(mesesOrdenados[mesesOrdenados.length - 1]);
        }
    }, [mesesOrdenados, mesSelecionado]);

    if (!data?.meses?.length) {
        return (
            <div className="p-10 flex flex-col items-center justify-center text-center">
                <div className="text-5xl mb-4">📊</div>

                <h2 className="text-lg font-semibold mb-2">
                    Nenhum dado encontrado
                </h2>

                <p className="text-gray-400 mb-4">
                    Faça upload de um relatório para visualizar o dashboard
                </p>

                <UploadBox onUploadSuccess={fetchDashboard} />
            </div>
        );
    }

    // ✅ Dados protegidos
    const dadosMes = data?.dadosPorMes?.[mesSelecionado] ?? {};

    function getMesAnterior(meses: string[], atual: string) {
        const index = meses.indexOf(atual);
        if (index <= 0) return null;
        return meses[index - 1];
    }

    const mesAnterior = getMesAnterior(mesesOrdenados, mesSelecionado);

    const dadosMesAnterior = data?.dadosPorMes?.[mesAnterior!] ?? {};

    // 🔴 RETURNS só depois dos hooks
    if (loading) {
        return (
            <div className="p-6 animate-pulse space-y-4">
                <div className="h-10 bg-gray-300 rounded"></div>
                <div className="h-40 bg-gray-300 rounded"></div>
            </div>
        );
    }
    if (!data) return <p className="p-6">Erro ao carregar dados</p>;

    function calcularCrescimento(atual: number, anterior: number | undefined) {
        if (anterior === undefined || anterior === null) return null;
        if (anterior === 0) return null;

        return ((atual - anterior) / anterior) * 100;
    }

    const rankingFiltrado = dadosMes?.ranking || [];

    const chartData = mesesOrdenados.map((mes: string) => ({
        mes,
        viagens: data?.dadosPorMes?.[mes]?.totalViagens ?? 0
    }));

    function GrowthBadge({ value }: { value: number | null }) {
        if (value === null) {
            return <span className="text-xs text-gray-400">--</span>;
        }

        const isPositive = value >= 0;

        return (
            <motion.span
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${isPositive
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-red-500/10 text-red-400'
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
            value: dadosMes?.totalCaminhoes ?? 0,
            crescimento: calcularCrescimento(
                dadosMes?.totalCaminhoes ?? 0,
                dadosMesAnterior?.totalCaminhoes ?? 0
            )
        },
        {
            title: 'Viagens',
            value: dadosMes?.totalViagens ?? 0,
            crescimento: calcularCrescimento(
                dadosMes?.totalViagens ?? 0,
                dadosMesAnterior?.totalViagens ?? 0
            )
        },
        {
            title: 'Dias Parados',
            value: dadosMes?.diasParados ?? 0,
            crescimento: calcularCrescimento(
                dadosMes?.diasParados ?? 0,
                dadosMesAnterior?.diasParados ?? 0
            )
        },
        {
            title: 'Dias Rodando',
            value: dadosMes?.diasRodando ?? 0,
            crescimento: calcularCrescimento(
                dadosMes?.diasRodando ?? 0,
                dadosMesAnterior?.diasRodando ?? 0
            )
        },
    ];

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 p-6">

            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <ThemeToggle />
            </div>

            <UploadBox onUploadSuccess={fetchDashboard} />

            {/* FILTRO */}
            <div className="mb-6 flex gap-4 items-center">
                <label className="text-sm text-gray-500">Mês:</label>

                <select
                    value={mesSelecionado}
                    onChange={(e) => setMesSelecionado(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-gray-300 dark:border-gray-700"
                >
                    {mesesOrdenados.map((mes: string, i: number) => (
                        <option key={i} value={mes}>{mes}</option>
                    ))}
                </select>
            </div>

            {/* CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {cards.map((item, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800"
                    >
                        <p className="text-sm text-gray-500">{item.title}</p>

                        <div className="flex items-center justify-between mt-2">
                            <h2 className="text-2xl font-bold">{item.value}</h2>
                            <GrowthBadge value={item.crescimento} />
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* TABELA */}
            <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800 mb-6">
                <h2 className="mb-4 font-semibold">Resumo por Caminhão</h2>

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
                            <tr key={index} className="border-b border-gray-100 dark:border-gray-800">
                                <td>{item.placa}</td>
                                <td>{mesSelecionado}</td>
                                <td>{item.total}</td>
                                <td>{item.diasParados ?? '-'}</td>
                                <td>{item.diasRodando ?? '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                <div className="col-span-2 bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800">
                    <h2 className="font-semibold mb-2">Viagens por mês</h2>

                    <ChartViagens
                        meses={chartData.map(item => item.mes)}
                        viagens={chartData.map(item => item.viagens)}
                    />
                </div>

                <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800">
                    <h2 className="font-semibold mb-2">Top Caminhões</h2>

                    {rankingFiltrado.map((item: any, index: number) => (
                        <div key={index} className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-800">
                            <span>{index + 1}º - {item.placa}</span>
                            <span className="font-bold">{item.total}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}