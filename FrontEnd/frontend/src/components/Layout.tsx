import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useState } from 'react';
import { Menu } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">

            {/* SIDEBAR */}
            <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} />

            <div className="flex-1 flex flex-col">

                {/* MOBILE HEADER */}
                <div className="md:hidden flex items-center p-4 border-b dark:border-gray-800">
                    <button onClick={() => setIsOpen(true)}>
                        <Menu />
                    </button>
                    <h1 className="ml-4 font-bold">RotaApp</h1>
                </div>

                {/* TOPBAR DESKTOP */}
                <div className="hidden md:block">
                    <Topbar />
                </div>

                {/* CONTENT */}
                <main className="p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}