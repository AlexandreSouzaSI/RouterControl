import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

import { deslocarMes, mesAtualISO, nomeMes } from '../lib/mes';

// Seletor de mês (AAAA-MM) usado em Contas a Pagar, Contas a Receber e na
// tela de cada caminhão. Valor '' = todos os meses.
export function FiltroMes({ mes, onChange, dica }: { mes: string; onChange: (mes: string) => void; dica?: string }) {
    const btn = 'p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300';
    return (
        <div className={`flex flex-wrap items-center gap-3 p-3 rounded-2xl border ${mes ? 'border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827]'}`}>
            <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {mes ? nomeMes(mes) : 'Todos os meses'}
                </span>
            </div>
            <div className="inline-flex items-center gap-1">
                <button type="button" title="Mês anterior" onClick={() => onChange(deslocarMes(mes || mesAtualISO(), -1))} className={btn}>
                    <ChevronLeft size={16} />
                </button>
                <input type="month" value={mes} onChange={(e) => onChange(e.target.value)}
                    className="px-2 py-1 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white" />
                <button type="button" title="Próximo mês" onClick={() => onChange(deslocarMes(mes || mesAtualISO(), 1))} className={btn}>
                    <ChevronRight size={16} />
                </button>
                <button type="button" onClick={() => onChange(mesAtualISO())}
                    className="ml-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                    Este mês
                </button>
                <button type="button" onClick={() => onChange('')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${!mes ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                    Todos
                </button>
            </div>
            {dica && <p className="text-xs text-gray-500 dark:text-gray-400 w-full sm:w-auto sm:ml-auto">{dica}</p>}
        </div>
    );
}
