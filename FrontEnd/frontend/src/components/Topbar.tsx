import { Search, Bell } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Topbar() {
    const [open, setOpen] = useState(false);

    return (
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur">

            {/* SEARCH */}
            <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-xl w-72">
                <Search size={16} />
                <input
                    placeholder="Buscar..."
                    className="bg-transparent outline-none text-sm w-full"
                />
            </div>

            {/* ACTIONS */}
            <div className="flex items-center gap-4">

                {/* NOTIFICATION */}
                <Bell className="cursor-pointer" />

                {/* USER */}
                <div className="relative">
                    <div
                        onClick={() => setOpen(!open)}
                        className="w-9 h-9 bg-blue-500 text-white flex items-center justify-center rounded-full cursor-pointer"
                    >
                        AS
                    </div>

                    <AnimatePresence>
                        {open && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-2"
                            >
                                <button className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                                    Perfil
                                </button>
                                <button className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
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