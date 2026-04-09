import { useEffect, useState } from 'react';

export function ThemeToggle() {
    const [dark, setDark] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('theme');
        if (saved === 'dark') {
            document.documentElement.classList.add('dark');
            setDark(true);
        }
    }, []);

    function toggleTheme() {
        if (dark) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
        setDark(!dark);
    }

    return (
        <button
            onClick={toggleTheme}
            className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-800"
        >
            {dark ? '🌙 Dark' : '☀️ Light'}
        </button>
    );
}