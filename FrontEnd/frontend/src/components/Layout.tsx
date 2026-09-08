import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ThemeToggle } from './ThemeToggle';
import { useState } from 'react';
import { Menu } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-gray-50 dark:bg-[#0B1120] text-gray-900 dark:text-gray-100">

            {/* SIDEBAR */}
            <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />

            <div className="flex-1 flex flex-col min-w-0">

                {/* MOBILE HEADER */}
                <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-[#0B1120]/70 backdrop-blur">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsOpen(true)}
                            className="p-2 -ml-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                            <Menu size={20} />
                        </button>
                        <h1 className="font-bold text-gray-900 dark:text-white">
                            🚛 RotaApp
                        </h1>
                    </div>

                    <ThemeToggle />
                </div>

                {/* TOPBAR DESKTOP */}
                <div className="hidden md:block">
                    <Topbar />
                </div>

                {/* CONTENT */}
                <main className="flex-1 p-4 md:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
