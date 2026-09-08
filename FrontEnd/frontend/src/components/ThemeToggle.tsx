import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
    const [dark, setDark] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('theme');

        const inicial =
            saved === 'dark' ||
            (!saved &&
                window.matchMedia('(prefers-color-scheme: dark)').matches);

        setDark(inicial);
    }, []);

    function toggleTheme() {
        const novoDark = !dark;

        document.documentElement.classList.toggle('dark', novoDark);
        localStorage.setItem('theme', novoDark ? 'dark' : 'light');
        setDark(novoDark);
    }

    return (
        <button
            onClick={toggleTheme}
            aria-label={
                dark ? 'Mudar para tema claro' : 'Mudar para tema escuro'
            }
            title={dark ? 'Tema claro' : 'Tema escuro'}
            className="
                relative flex items-center justify-center
                w-10 h-10 rounded-xl
                bg-gray-100 text-gray-600
                hover:bg-gray-200 hover:text-gray-900
                dark:bg-gray-800 dark:text-gray-300
                dark:hover:bg-gray-700 dark:hover:text-white
                transition-colors
            "
        >
            <Sun
                size={18}
                className={`absolute transition-all duration-300 ${dark ? 'opacity-0 -rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
                    }`}
            />
            <Moon
                size={18}
                className={`absolute transition-all duration-300 ${dark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'
                    }`}
            />
        </button>
    );
}
