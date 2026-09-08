import { Search, Bell } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from './ThemeToggle';
import { useAuth } from '../context/AuthContext';

const TITULOS: Record<string, string> = {
    '/': 'Dashboard',
    '/caminhoes': 'Caminhões',
    '/Rotas': 'Rotas em tempo real',
    '/relatorios': 'Relatórios',
    '/pagamentos': 'Pagamentos',
    '/proprietarios': 'Proprietários',
    '/config': 'Configurações',
    '/financeiro': 'Financeiro',
    '/regras': 'Regras Financeiras',
};

export function Topbar() {
    const [open, setOpen] = useState(false);
    const location = useLocation();
    const { usuario, sair } = useAuth();

    const titulo = TITULOS[location.pathname] ?? 'RotaApp';

    const iniciais = (usuario?.email ?? '??')
        .slice(0, 2)
        .toUpperCase();

    return (
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-[#0B1120]/70 backdrop-blur">
            {/* TÍTULO DA PÁGINA */}
            <div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    RotaApp
                </p>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                    {titulo}
                </h1>
            </div>

            {/* AÇÕES */}
            <div className="flex items-center gap-3">
                {/* SEARCH */}
                <div className="hidden lg:flex items-center gap-2 bg-gray-100 dark:bg-gray-800/70 px-3 py-2 rounded-xl w-64 text-gray-500 dark:text-gray-400 focus-within:ring-2 focus-within:ring-blue-500/40 transition">
                    <Search size={16} />
                    <input
                        placeholder="Buscar..."
                        className="bg-transparent outline-none text-sm w-full text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                </div>

                <ThemeToggle />

                <button
                    className="relative w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                    aria-label="Notificações"
                >
                    <Bell size={18} />
                </button>

                {/* USER */}
                <div className="relative">
                    <button
                        onClick={() => setOpen(!open)}
                        className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center rounded-xl cursor-pointer font-semibold text-sm shadow-sm"
                    >
                        {iniciais}
                    </button>

                    <AnimatePresence>
                        {open && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl p-2 z-20"
                            >
                                {usuario?.email && (
                                    <div className="px-2 py-1.5 mb-1 text-xs text-gray-400 dark:text-gray-500 truncate border-b border-gray-100 dark:border-gray-700">
                                        {usuario.email}
                                    </div>
                                )}
                                <button
                                    onClick={sair}
                                    className="w-full text-left p-2 text-sm rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                    Sair
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
