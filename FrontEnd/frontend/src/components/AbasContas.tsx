import { Link } from 'react-router-dom';
import { CheckCircle2, Wallet } from 'lucide-react';

// Barra grande no topo: CONTA A PAGAR | REGISTRAR PAGAMENTOS
export function AbasContas({ ativa }: { ativa: 'pagar' | 'paga' }) {
    const base = 'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold tracking-wide transition';
    const on = 'bg-blue-600 text-white shadow';
    const off = 'bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800';
    return (
        <div className="flex gap-3">
            <Link to="/financeiro-nf/contas-pagar" className={`${base} ${ativa === 'pagar' ? on : off}`}>
                <Wallet size={18} /> CONTA A PAGAR
            </Link>
            <Link to="/financeiro-nf/conta-paga" className={`${base} ${ativa === 'paga' ? on : off}`}>
                <CheckCircle2 size={18} /> REGISTRAR PAGAMENTOS
            </Link>
        </div>
    );
}
