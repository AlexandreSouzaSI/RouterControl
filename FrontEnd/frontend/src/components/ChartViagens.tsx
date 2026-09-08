import { useEffect, useState } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
    CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';

interface Serie {
    placa: string;
    valores: number[];
}

interface Props {
    meses: string[];
    series: Serie[];
}

const PALETA = [
    '#3b82f6', // azul
    '#22c55e', // verde
    '#f59e0b', // âmbar
    '#a855f7', // roxo
    '#ec4899', // rosa
    '#06b6d4', // ciano
    '#f97316', // laranja
    '#ef4444', // vermelho
    '#14b8a6', // teal
    '#6366f1', // índigo
];

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

function formatarMes(mes: string) {
    const [ano, mesNum] = mes.split('-');
    const nomes = [
        'Jan',
        'Fev',
        'Mar',
        'Abr',
        'Mai',
        'Jun',
        'Jul',
        'Ago',
        'Set',
        'Out',
        'Nov',
        'Dez',
    ];

    const idx = Number(mesNum) - 1;

    if (!ano || idx < 0 || idx > 11) return mes;

    return `${nomes[idx]}/${ano.slice(2)}`;
}

export function ChartViagens({ meses, series }: Props) {
    const isDark = useIsDark();

    if (!meses.length || !series.length) {
        return (
            <div className="h-[280px] flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
                Sem dados suficientes para gerar gráfico
            </div>
        );
    }

    const data = meses.map((mes, index) => {
        const ponto: Record<string, string | number> = {
            mes: formatarMes(mes),
        };

        series.forEach((serie) => {
            ponto[serie.placa] = serie.valores[index] ?? 0;
        });

        return ponto;
    });

    const corGrade = isDark ? '#1f2937' : '#e5e7eb';
    const corEixo = isDark ? '#6b7280' : '#9ca3af';
    const corTooltipBg = isDark ? '#111827' : '#ffffff';
    const corTooltipBorder = isDark ? '#1f2937' : '#e5e7eb';
    const corTooltipTexto = isDark ? '#f3f4f6' : '#111827';

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full h-[300px]"
        >
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={data}
                    margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={corGrade}
                        vertical={false}
                    />

                    <XAxis
                        dataKey="mes"
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
                        cursor={{ stroke: corGrade, strokeWidth: 1 }}
                        contentStyle={{
                            backgroundColor: corTooltipBg,
                            border: `1px solid ${corTooltipBorder}`,
                            borderRadius: '12px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        }}
                        labelStyle={{
                            color: corTooltipTexto,
                            fontWeight: 600,
                            marginBottom: 4,
                        }}
                        itemStyle={{ color: corTooltipTexto }}
                        formatter={(value: any) => [`${value} viagens`, undefined]}
                    />

                    {series.length > 1 && (
                        <Legend
                            wrapperStyle={{ fontSize: 12, color: corEixo }}
                            iconType="circle"
                            iconSize={8}
                        />
                    )}

                    {series.map((serie, index) => (
                        <Line
                            key={serie.placa}
                            type="monotone"
                            dataKey={serie.placa}
                            name={serie.placa}
                            stroke={PALETA[index % PALETA.length]}
                            strokeWidth={2.5}
                            dot={{ r: 3, strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </motion.div>
    );
}
