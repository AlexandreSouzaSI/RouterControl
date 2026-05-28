import {
    Home,
    Truck,
    BarChart3,
    Settings,
    X,
    Wallet,
    UserRound,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
    const menu = [
        { name: 'Dashboard', icon: Home, path: '/' },
        { name: 'Caminhões', icon: Truck, path: '/caminhoes' },
        { name: 'Relatórios', icon: BarChart3, path: '/relatorios' },
        { name: 'Pagamentos', icon: Wallet, path: '/pagamentos' },
        { name: 'Proprietários', icon: UserRound, path: '/proprietarios' },
        { name: 'Configurações', icon: Settings, path: '/config' },
        { name: 'Financeiro', icon: Settings, path: '/financeiro' },
        { name: 'Financeiro Regras', icon: Settings, path: '/regras' },
    ];

    return (
        <>
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
                            className="fixed top-0 left-0 h-full w-72 bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-xl z-50 p-5 shadow-2xl border-r border-gray-200 dark:border-gray-800"
                        >
                            <div className="flex justify-between items-center mb-8">
                                <h1 className="font-bold text-lg text-gray-900 dark:text-white">
                                    🚛 RotaApp
                                </h1>

                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <nav className="flex flex-col gap-2">
                                {menu.map((item, index) => {
                                    const Icon = item.icon;

                                    return (
                                        <NavLink
                                            key={index}
                                            to={item.path}
                                            onClick={onClose}
                                            className={({ isActive }) =>
                                                `flex items-center gap-4 p-3 rounded-xl text-base transition-all
                                                ${isActive
                                                    ? 'bg-blue-500 text-white shadow-lg scale-[1.02]'
                                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-950 dark:hover:text-white active:scale-95'
                                                }`
                                            }
                                        >
                                            <Icon size={20} />
                                            <span>{item.name}</span>
                                        </NavLink>
                                    );
                                })}
                            </nav>

                            <div className="absolute bottom-6 left-5 text-xs text-gray-400 dark:text-gray-500">
                                v1.0
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <div className="hidden md:flex h-screen w-64 bg-white dark:bg-[#0F172A] border-r border-gray-200 dark:border-gray-800 p-4 flex-col">
                <h1 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">
                    🚛 RotaApp
                </h1>

                <nav className="flex flex-col gap-2">
                    {menu.map((item, index) => {
                        const Icon = item.icon;

                        return (
                            <NavLink
                                key={index}
                                to={item.path}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 p-3 rounded-xl transition-all
                                    ${isActive
                                        ? 'bg-blue-500 text-white shadow-sm'
                                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-950 dark:hover:text-white'
                                    }`
                                }
                            >
                                <Icon size={18} />
                                <span>{item.name}</span>
                            </NavLink>
                        );
                    })}
                </nav>
            </div>
        </>
    );
}