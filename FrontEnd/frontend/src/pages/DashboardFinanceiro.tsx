import { useEffect, useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { motion } from 'framer-motion';
import {
    TrendingUp,
    Wallet,
    FileText,
    HandCoins,
    CalendarClock,
    CalendarDays,
    CalendarRange,
    AlertTriangle,
    Info,
} from 'lucide-react';
import { api } from '../services/api';

// =============================================================================
// Dashboard Financeiro — visão executiva do módulo Financeiro/NF: KPIs de
// Entradas, Serviços Pagos, Receitas (ainda sem fonte de dado) e Contas a
// Pagar por período, mais os gráficos de tendência, status e categoria.
// =============================================================================

function formatCurrency(value: number | null | undefined) {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function mesAtual() {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

function useIsDark() {
    const [isDark, setIsDark] = useState(
        () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
    );

    useEffect(() => {
        const root = document.documentElement;
        const observer = new MutationObserver(() => setIsDark(root.classList.contains('dark')));
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return isDark;
}

type Bucket = { total: number; quantidade: number };

type DashboardData = {
    mesReferencia: string;
    entradas: { total: number; quantidade: number; aceitas: number; pendentes: number };
    servicosPagos: { total: number; quantidade: number };
    receitas: { disponivel: boolean };
    contasPagar: {
        hoje: Bucket;
        semana: Bucket;
        mes: Bucket;
        atrasadas: Bucket;
        totalAberto: Bucket;
    };
    graficoMensal: { mes: string; label: string; entradas: number; contasPagas: number; contasAbertas: number }[];
    graficoPorCategoria: { categoria: string; valor: number }[];
    graficoStatus: { status: string; valor: number; quantidade: number }[];
};

const CORES_STATUS: Record<string, string> = {
    Aberta: '#3b82f6',
    Paga: '#22c55e',
    Vencida: '#ef4444',
    Cancelada: '#9ca3af',
};

const PALETA_CATEGORIA = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#f97316', '#14b8a6'];

function KpiCard({
    titulo,
    valor,
    subtitulo,
    icone: Icone,
    cor,
    indisponivel,
}: {
    titulo: string;
    valor: string;
    subtitulo?: string;
    icone: any;
    cor: string;
    indisponivel?: boolean;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 shadow-sm"
        >
            <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{titulo}</p>
                <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${cor}1A` }}
                >
                    <Icone size={17} style={{ color: cor }} />
                </div>
            </div>

            {indisponivel ? (
                <div>
                    <p className="text-lg font-bold text-gray-300 dark:text-gray-600">Em breve</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Fonte de dado ainda não definida</p>
                </div>
            ) : (
                <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{valor}</p>
                    {subtitulo && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitulo}</p>}
                </div>
            )}
        </motion.div>
    );
}

function PeriodoCard({
    titulo,
    bucket,
    cor,
    icone: Icone,
}: {
    titulo: string;
    bucket: Bucket;
    cor: string;
    icone: any;
}) {
    return (
        <div
            className="p-4 rounded-xl border flex items-center gap-3"
            style={{ backgroundColor: `${cor}0D`, borderColor: `${cor}33` }}
        >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${cor}22` }}>
                <Icone size={18} style={{ color: cor }} />
            </div>
            <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{titulo}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums truncate">
                    {formatCurrency(bucket.total)}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    {bucket.quantidade} conta{bucket.quantidade === 1 ? '' : 's'}
                </p>
            </div>
        </div>
    );
}

export function DashboardFinanceiro() {
    const [mes, setMes] = useState(mesAtual());
    const [dados, setDados] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(false);
    const isDark = useIsDark();

    async function carregar() {
        setLoading(true);
        try {
            const res = await api.get('/financeiro-nf/dashboard', { params: { mes } });
            setDados(res.data);
        } catch {
            setDados(null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mes]);

    const corGrade = isDark ? '#1f2937' : '#e5e7eb';
    const corEixo = isDark ? '#6b7280' : '#9ca3af';
    const corTooltipBg = isDark ? '#111827' : '#ffffff';
    const corTooltipBorder = isDark ? '#1f2937' : '#e5e7eb';
    const corTooltipTexto = isDark ? '#f3f4f6' : '#111827';

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Financeiro</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Visão geral de entradas, serviços, receitas e contas a pagar.
                    </p>
                </div>

                <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Mês de referência</label>
                    <input
                        type="month"
                        value={mes}
                        onChange={(e) => setMes(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            {loading && !dados ? (
                <p className="text-sm text-gray-400 py-12 text-center">Carregando...</p>
            ) : !dados ? (
                <p className="text-sm text-gray-400 py-12 text-center">Não foi possível carregar o dashboard.</p>
            ) : (
                <>
                    {(dados.entradas.quantidade === 0 && dados.servicosPagos.quantidade === 0) && (
                        <div className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                            <Info size={16} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Entradas e Serviços Pagos ainda estão zerados porque a busca automática de NF (Sefaz/ADN)
                                está em construção. Os números de Contas a Pagar abaixo já refletem os lançamentos
                                manuais existentes.
                            </p>
                        </div>
                    )}

                    {/* KPIs principais */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <KpiCard
                            titulo="Entradas (NF)"
                            valor={formatCurrency(dados.entradas.total)}
                            subtitulo={`${dados.entradas.quantidade} NF · ${dados.entradas.aceitas} aceitas`}
                            icone={FileText}
                            cor="#3b82f6"
                        />
                        <KpiCard
                            titulo="Serviços Pagos"
                            valor={formatCurrency(dados.servicosPagos.total)}
                            subtitulo={`${dados.servicosPagos.quantidade} pagamento${dados.servicosPagos.quantidade === 1 ? '' : 's'}`}
                            icone={HandCoins}
                            cor="#22c55e"
                        />
                        <KpiCard titulo="Receitas" valor="" icone={TrendingUp} cor="#a855f7" indisponivel />
                        <KpiCard
                            titulo="Contas a Pagar (aberto)"
                            valor={formatCurrency(dados.contasPagar.totalAberto.total)}
                            subtitulo={`${dados.contasPagar.totalAberto.quantidade} conta${dados.contasPagar.totalAberto.quantidade === 1 ? '' : 's'} em aberto`}
                            icone={Wallet}
                            cor="#f59e0b"
                        />
                    </div>

                    {/* Contas a Pagar por período */}
                    <div>
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Contas a Pagar por período</h2>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <PeriodoCard titulo="Vence hoje" bucket={dados.contasPagar.hoje} cor="#f59e0b" icone={CalendarClock} />
                            <PeriodoCard titulo="Próximos 7 dias" bucket={dados.contasPagar.semana} cor="#3b82f6" icone={CalendarDays} />
                            <PeriodoCard titulo="Esse mês" bucket={dados.contasPagar.mes} cor="#6366f1" icone={CalendarRange} />
                            <PeriodoCard titulo="Atrasadas" bucket={dados.contasPagar.atrasadas} cor="#ef4444" icone={AlertTriangle} />
                        </div>
                    </div>

                    {/* Gráfico de tendência mensal */}
                    <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                            Entradas x Contas Pagas x Contas em aberto — últimos 6 meses
                        </h2>

                        <div className="w-full h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dados.graficoMensal} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={corGrade} vertical={false} />
                                    <XAxis dataKey="label" stroke={corEixo} tick={{ fontSize: 12, fill: corEixo }} axisLine={false} tickLine={false} />
                                    <YAxis
                                        stroke={corEixo}
                                        tick={{ fontSize: 11, fill: corEixo }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={70}
                                        tickFormatter={(v) => formatCurrency(v)}
                                    />
                                    <Tooltip
                                        cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                                        contentStyle={{
                                            backgroundColor: corTooltipBg,
                                            border: `1px solid ${corTooltipBorder}`,
                                            borderRadius: '12px',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                        }}
                                        labelStyle={{ color: corTooltipTexto, fontWeight: 600, marginBottom: 4 }}
                                        itemStyle={{ color: corTooltipTexto }}
                                        formatter={(value: any) => formatCurrency(Number(value))}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 12, color: corEixo }} iconType="circle" iconSize={8} />
                                    <Bar dataKey="entradas" name="Entradas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="contasPagas" name="Contas Pagas" fill="#22c55e" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="contasAbertas" name="Contas em aberto" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Status + Categoria */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                                Status das contas — {dados.mesReferencia}
                            </h2>

                            {dados.graficoStatus.length === 0 ? (
                                <p className="text-sm text-gray-400 py-16 text-center">Sem contas nesse mês.</p>
                            ) : (
                                <div className="w-full h-[260px] flex items-center">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={dados.graficoStatus}
                                                dataKey="valor"
                                                nameKey="status"
                                                innerRadius={60}
                                                outerRadius={95}
                                                paddingAngle={2}
                                            >
                                                {dados.graficoStatus.map((entry) => (
                                                    <Cell key={entry.status} fill={CORES_STATUS[entry.status] || '#9ca3af'} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: corTooltipBg,
                                                    border: `1px solid ${corTooltipBorder}`,
                                                    borderRadius: '12px',
                                                }}
                                                labelStyle={{ color: corTooltipTexto, fontWeight: 600 }}
                                                itemStyle={{ color: corTooltipTexto }}
                                                formatter={(value: any, _name: any, item: any) => [
                                                    `${formatCurrency(Number(value))} (${item.payload.quantidade})`,
                                                    item.payload.status,
                                                ]}
                                            />
                                            <Legend wrapperStyle={{ fontSize: 12, color: corEixo }} iconType="circle" iconSize={8} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                                Top categorias de gasto (contas em aberto)
                            </h2>

                            {dados.graficoPorCategoria.length === 0 ? (
                                <p className="text-sm text-gray-400 py-16 text-center">Sem contas em aberto categorizadas.</p>
                            ) : (
                                <div className="w-full h-[260px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={dados.graficoPorCategoria}
                                            layout="vertical"
                                            margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke={corGrade} horizontal={false} />
                                            <XAxis
                                                type="number"
                                                stroke={corEixo}
                                                tick={{ fontSize: 11, fill: corEixo }}
                                                axisLine={false}
                                                tickLine={false}
                                                tickFormatter={(v) => formatCurrency(v)}
                                            />
                                            <YAxis
                                                type="category"
                                                dataKey="categoria"
                                                stroke={corEixo}
                                                tick={{ fontSize: 12, fill: corEixo }}
                                                axisLine={false}
                                                tickLine={false}
                                                width={110}
                                            />
                                            <Tooltip
                                                cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                                                contentStyle={{
                                                    backgroundColor: corTooltipBg,
                                                    border: `1px solid ${corTooltipBorder}`,
                                                    borderRadius: '12px',
                                                }}
                                                labelStyle={{ color: corTooltipTexto, fontWeight: 600 }}
                                                itemStyle={{ color: corTooltipTexto }}
                                                formatter={(value: any) => formatCurrency(Number(value))}
                                            />
                                            <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                                                {dados.graficoPorCategoria.map((_entry, index) => (
                                                    <Cell key={index} fill={PALETA_CATEGORIA[index % PALETA_CATEGORIA.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
