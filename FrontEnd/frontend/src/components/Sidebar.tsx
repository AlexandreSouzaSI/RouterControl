import { Home, Truck, BarChart3, Settings, X } from 'lucide-react';
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
        { name: 'Configurações', icon: Settings, path: '/config' },
    ];

    return (
        <>
            {/* MOBILE */}
            {/* MOBILE MELHORADO */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* OVERLAY COM BLUR */}
                        <motion.div
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                        />

                        {/* SIDEBAR COM GESTO */}
                        <motion.div
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            onDragEnd={(event, info) => {
                                if (info.offset.x < -100) {
                                    onClose(); // 👈 swipe pra fechar
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
                            className="fixed top-0 left-0 h-full w-72 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl z-50 p-5 shadow-2xl"
                        >
                            {/* HEADER */}
                            <div className="flex justify-between items-center mb-8">
                                <h1 className="font-bold text-lg">🚛 RotaApp</h1>

                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800"
                                >
                                    <X />
                                </button>
                            </div>

                            {/* MENU */}
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
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95'
                                                }`
                                            }
                                        >
                                            <Icon size={20} />
                                            <span>{item.name}</span>
                                        </NavLink>
                                    );
                                })}
                            </nav>

                            {/* FOOTER */}
                            <div className="absolute bottom-6 left-5 text-xs text-gray-400">
                                v1.0
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* DESKTOP */}
            <div className="hidden md:flex h-screen w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4 flex-col">
                <h1 className="text-xl font-bold mb-6">🚛 RotaApp</h1>

                <nav className="flex flex-col gap-2">
                    {menu.map((item, index) => {
                        const Icon = item.icon;

                        return (
                            <NavLink
                                key={index}
                                to={item.path}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 p-3 rounded-xl
                                    ${isActive
                                        ? 'bg-blue-500 text-white'
                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
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