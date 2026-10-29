import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { motion } from 'framer-motion';
import { ClipboardList, FileSignature, FileText, Receipt, Truck } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

// =============================================================================
// Dashboard Fiscal — notas do mês (Entrada, Transporte, Serviço), tendência dos
// últimos 6 meses e, se o módulo Fiscal estiver ativo, RPA e CIOT.
// =============================================================================

type Resumo = { total: number; quantidade: number; aceitas: number; pendentes: number };
type Dados = {
    mesReferencia: string;
    entradas: Resumo;
    transporte: Resumo;
    servicos: Resumo;
    graficoMensal: { mes: string; label: string; entradas: number; transporte: number; servicos: number }[];
};
type ResumoRpa = { quantidade: number; pendentes: number; totalBruto: number; totalInss: number; totalIrrf: number; totalLiquido: number };

const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

function useIsDark() {
    const [isDark, setIsDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
    useEffect(() => {
        const root = document.documentElement;
        const obs = new MutationObserver(() => setIsDark(root.classList.contains('dark')));
        obs.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => obs.disconnect();
    }, []);
    return isDark;
}

function Card({ titulo, valor, linha2, icone: Icone, cor, link }: { titulo: string; valor: string; linha2?: string; icone: typeof FileText; cor: string; link?: string }) {
    const corpo = (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className="h-full p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 shadow-sm hover:border-blue-300 dark:hover:border-blue-800 transition">
            <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{titulo}</p>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${cor}1A` }}>
                    <Icone size={17} style={{ color: cor }} />
                </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{valor}</p>
            {linha2 && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{linha2}</p>}
        </motion.div>
    );
    return link ? <Link to={link} className="block h-full">{corpo}</Link> : corpo;
}

const linhaNf = (r?: Resumo) => (r ? `${r.quantidade} nota${r.quantidade === 1 ? '' : 's'} · ${r.aceitas} aceita${r.aceitas === 1 ? '' : 's'} · ${r.pendentes} pendente${r.pendentes === 1 ? '' : 's'}` : '');

export function DashboardFiscal() {
    const { usuario } = useAuth();
    const temFiscal = !!usuario?.isAdminMaster || !!usuario?.modulosHabilitados?.includes('FISCAL');
    const [mes, setMes] = useState(mesAtual());
    const [dados, setDados] = useState<Dados | null>(null);
    const [rpa, setRpa] = useState<ResumoRpa | null>(null);
    const [ciotPendentes, setCiotPendentes] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const isDark = useIsDark();

    async function carregar() {
        setLoading(true);
        try {
            setDados((await api.get('/financeiro-nf/dashboard-fiscal', { params: { mes } })).data);
        } catch {
            setDados(null);
        } finally {
            setLoading(false);
        }
        if (temFiscal) {
            api.get('/fiscal/rpa/resumo', { params: { competencia: mes } }).then((r) => setRpa(r.data)).catch(() => setRpa(null));
            api.get('/fiscal/ciot').then((r) => setCiotPendentes((r.data ?? []).filter((c: { status: string }) => c.status === 'PENDENTE').length)).catch(() => setCiotPendentes(null));
        }
    }

    useEffect(() => {
        carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mes, temFiscal]);

    const corGrade = isDark ? '#1f2937' : '#e5e7eb';
    const corEixo = isDark ? '#6b7280' : '#9ca3af';

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard Fiscal</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Notas de entrada, transporte e serviço{temFiscal ? ', RPA e CIOT' : ''} do mês.</p>
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Mês de referência</label>
                    <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mesAtual())}
                        className="px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" />
                </div>
            </div>

            {loading && !dados ? (
                <p className="text-sm text-gray-400 py-12 text-center">Carregando...</p>
            ) : !dados ? (
                <p className="text-sm text-gray-400 py-12 text-center">Não foi possível carregar o dashboard.</p>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Card titulo="NF de Entrada" valor={moeda(dados.entradas.total)} linha2={linhaNf(dados.entradas)} icone={FileText} cor="#3b82f6" link="/financeiro-nf/entrada" />
                        <Card titulo="NF de Transporte" valor={moeda(dados.transporte.total)} linha2={linhaNf(dados.transporte)} icone={Truck} cor="#f59e0b" link="/financeiro-nf/transporte" />
                        <Card titulo="NF de Serviço" valor={moeda(dados.servicos.total)} linha2={linhaNf(dados.servicos)} icone={ClipboardList} cor="#0ea5e9" link="/financeiro-nf/servico" />
                    </div>

                    {temFiscal && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Card titulo="RPA do mês (bruto)" valor={moeda(rpa?.totalBruto)} linha2={rpa ? `${rpa.quantidade} recibo${rpa.quantidade === 1 ? '' : 's'} · ${rpa.pendentes} a pagar` : ''} icone={Receipt} cor="#a855f7" link="/fiscal" />
                            <Card titulo="Retenções do mês (INSS + IRRF)" valor={moeda((rpa?.totalInss ?? 0) + (rpa?.totalIrrf ?? 0))} linha2={rpa ? `INSS ${moeda(rpa.totalInss)} · IRRF ${moeda(rpa.totalIrrf)}` : ''} icone={Receipt} cor="#ec4899" link="/fiscal" />
                            <Card titulo="CIOT pendentes" valor={ciotPendentes === null ? '—' : String(ciotPendentes)} linha2="Registros sem número de CIOT" icone={FileSignature} cor="#ef4444" link="/fiscal" />
                        </div>
                    )}

                    <div className="p-5 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Notas por mês — últimos 6 meses</h2>
                        <div className="w-full h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dados.graficoMensal} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={corGrade} vertical={false} />
                                    <XAxis dataKey="label" stroke={corEixo} tick={{ fontSize: 12, fill: corEixo }} axisLine={false} tickLine={false} />
                                    <YAxis stroke={corEixo} tick={{ fontSize: 11, fill: corEixo }} axisLine={false} tickLine={false} width={80} tickFormatter={(v) => moeda(v)} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: isDark ? '#111827' : '#fff', border: `1px solid ${corGrade}`, borderRadius: 12 }}
                                        labelStyle={{ color: isDark ? '#f3f4f6' : '#111827', fontWeight: 600 }}
                                        formatter={(v) => moeda(Number(v))}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 12, color: corEixo }} iconType="circle" iconSize={8} />
                                    <Bar dataKey="entradas" name="Entrada" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="transporte" name="Transporte" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="servicos" name="Serviço" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
