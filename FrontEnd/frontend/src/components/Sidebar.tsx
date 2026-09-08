import {
    LayoutDashboard,
    Truck,
    X,
    Route,
    LogOut,
    type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

type MenuItem = {
    name: string;
    icon: LucideIcon;
    path: string;
};

type MenuGroup = {
    titulo: string;
    itens: MenuItem[];
};

const grupos: MenuGroup[] = [
    {
        titulo: 'Operação',
        itens: [
            { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
            { name: 'Viagens', icon: Truck, path: '/viagens' },
            { name: 'Rotas', icon: Route, path: '/Rotas' },
        ],
    },
];

function Marca() {
    return (
        <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-lg shadow-lg shadow-blue-500/20">
                🚛
            </div>
            <div className="leading-tight">
                <h1 className="font-bold text-base text-gray-900 dark:text-white">
                    RotaApp
                </h1>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    Controle de viagens
                </p>
            </div>
        </div>
    );
}

function Navegacao({ onNavigate }: { onNavigate?: () => void }) {
    return (
        <nav className="flex flex-col gap-5">
            {grupos.map((grupo) => (
                <div key={grupo.titulo}>
                    <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {grupo.titulo}
                    </p>

                    <div className="flex flex-col gap-1">
                        {grupo.itens.map((item) => {
                            const Icon = item.icon;

                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    onClick={onNavigate}
                                    className={({ isActive }) =>
                                        `group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl text-sm font-medium transition-all
                                        ${isActive
                                            ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-white'
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            <span
                                                className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full bg-blue-500 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'
                                                    }`}
                                            />
                                            <Icon
                                                size={18}
                                                className={
                                                    isActive
                                                        ? 'text-blue-500'
                                                        : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300'
                                                }
                                            />
                                            <span>{item.name}</span>
                                        </>
                                    )}
                                </NavLink>
                            );
                        })}
                    </div>
                </div>
            ))}
        </nav>
    );
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const { sair, usuario } = useAuth();

    return (
        <>
            {/* MOBILE (drawer) */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                        />

                        <motion.div
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            onDragEnd={(_, info) => {
                                if (info.offset.x < -100) {
                                    onClose();
                                }
                            }}
                            initial={{ x: -320, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -320, opacity: 0 }}
                            transition={{
                                type: 'spring',
                                stiffness: 260,
                                damping: 25,
                            }}
                            className="fixed top-0 left-0 h-full w-72 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-xl z-50 p-5 shadow-2xl border-r border-gray-200 dark:border-gray-800 overflow-y-auto"
                        >
                            <div className="flex justify-between items-center mb-8">
                                <Marca />

                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <Navegacao onNavigate={onClose} />

                            <div className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-800">
                                {usuario?.email && (
                                    <p className="px-3 mb-2 text-xs text-gray-400 dark:text-gray-500 truncate">
                                        {usuario.email}
                                    </p>
                                )}

                                <button
                                    onClick={sair}
                                    className="w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-white transition-all"
                                >
                                    <LogOut size={18} className="text-gray-400 dark:text-gray-500" />
                                    Sair
                                </button>

                                <p className="px-3 mt-3 text-xs text-gray-400 dark:text-gray-500">
                                    v1.0
                                </p>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* DESKTOP (fixa) */}
            <div className="hidden md:flex h-screen w-64 shrink-0 bg-white dark:bg-[#0F172A] border-r border-gray-200 dark:border-gray-800 p-4 flex-col sticky top-0">
                <div className="px-1 mb-8 mt-1">
                    <Marca />
                </div>

                <div className="flex-1 overflow-y-auto">
                    <Navegacao />
                </div>

                <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500 px-1">
                    v1.0
                </div>
            </div>
        </>
    );
}
