import {
    LineChart,
    Line,
    XAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    Area,
    Dot
} from 'recharts';
import { motion } from 'framer-motion';

interface Props {
    meses: string[];
    viagens: number[];
}

export function ChartViagens({ meses, viagens }: Props) {
    const data = meses.map((mes, index) => ({
        mes,
        atual: viagens[index],
        anterior: viagens[index - 1] ?? null
    }));

    // 🔥 tendência
    const ultimo = viagens[viagens.length - 1] ?? 0;
    const anterior = viagens[viagens.length - 2] ?? 0;

    const crescimento = anterior
        ? ((ultimo - anterior) / anterior) * 100
        : 0;

    const isUp = crescimento >= 0;
    const cor = isUp ? '#22c55e' : '#ef4444';

    // 🔮 previsão simples (média de crescimento)
    const previsao = ultimo + (ultimo - anterior);

    const dataComPrevisao = [
        ...data,
        {
            mes: 'Próximo',
            atual: previsao,
            anterior: null
        }
    ];

    if (!meses.length || !viagens.length) {
        return (
            <div className="h-[320px] flex items-center justify-center text-gray-400">
                Sem dados suficientes para gerar gráfico
            </div>
        );
    }

    return (
        <div className="w-full h-[300px]">
            {/* 🧠 INSIGHT AUTOMÁTICO */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 text-sm text-gray-400"
            >
                {isUp ? '📈 Crescimento' : '📉 Queda'} de{' '}
                <span className={isUp ? 'text-green-400' : 'text-red-400'}>
                    {Math.abs(crescimento).toFixed(1)}%
                </span>{' '}
                em relação ao mês anterior
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="w-full h-[300px]"
            >
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dataComPrevisao}>
                        <defs>
                            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={cor} stopOpacity={0.4} />
                                <stop offset="95%" stopColor={cor} stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#1f2937"
                            opacity={0.15}
                        />

                        <XAxis dataKey="mes" stroke="#9ca3af" />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#020617',
                                border: '1px solid #1f2937',
                                borderRadius: '12px',
                                color: '#fff'
                            }}
                        />

                        {/* 🔥 ÁREA */}
                        <Area
                            type="monotone"
                            dataKey="atual"
                            stroke="none"
                            fill="url(#gradient)"
                        />

                        {/* 🔥 LINHA ATUAL */}
                        <Line
                            type="monotone"
                            dataKey="atual"
                            stroke={cor}
                            strokeWidth={3}
                            dot={false}
                            animationDuration={1200}
                        />

                        {/* 🔥 LINHA ANTERIOR (comparação) */}
                        <Line
                            type="monotone"
                            dataKey="anterior"
                            stroke="#64748b"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                        />

                        {/* 🔮 PREVISÃO */}
                        <Line
                            type="monotone"
                            dataKey="atual"
                            stroke={cor}
                            strokeDasharray="4 4"
                            dot={(props: any) => {
                                if (props.index !== dataComPrevisao.length - 1) return null;

                                return (
                                    <Dot
                                        {...props}
                                        r={6}
                                        fill={cor}
                                        stroke="#020617"
                                        strokeWidth={2}
                                    />
                                );
                            }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </motion.div>
        </div>
    );
}