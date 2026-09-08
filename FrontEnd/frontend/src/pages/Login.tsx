import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Lock, Mail, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Login() {
    const { entrar } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setErro(null);
        setEnviando(true);

        try {
            await entrar(email.trim(), senha);
            navigate('/', { replace: true });
        } catch (err: any) {
            setErro(
                err?.response?.data?.message ?? 'Não foi possível entrar. Tente de novo.',
            );
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0B1120] px-4">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg mb-3">
                        <Truck size={26} className="text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                        RotaApp
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Controle de viagens
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="bg-white dark:bg-[#111827] p-6 rounded-2xl shadow border border-gray-200 dark:border-gray-800 space-y-4"
                >
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                            E-mail
                        </label>
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/70 px-3 py-2.5 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/40 transition">
                            <Mail size={16} className="text-gray-400 shrink-0" />
                            <input
                                type="email"
                                required
                                autoFocus
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                className="bg-transparent outline-none text-sm w-full text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                            Senha
                        </label>
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/70 px-3 py-2.5 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/40 transition">
                            <Lock size={16} className="text-gray-400 shrink-0" />
                            <input
                                type={mostrarSenha ? 'text' : 'password'}
                                required
                                autoComplete="current-password"
                                value={senha}
                                onChange={(e) => setSenha(e.target.value)}
                                placeholder="••••••••"
                                className="bg-transparent outline-none text-sm w-full text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                            />
                            <button
                                type="button"
                                onClick={() => setMostrarSenha((v) => !v)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                                tabIndex={-1}
                            >
                                {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    {erro && (
                        <div className="text-sm text-red-500 bg-red-500/10 px-3 py-2 rounded-xl">
                            {erro}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={enviando}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-medium text-sm py-2.5 rounded-xl shadow-sm hover:opacity-90 transition disabled:opacity-60"
                    >
                        {enviando && <LoaderCircle size={16} className="animate-spin" />}
                        Entrar
                    </button>
                </form>
            </div>
        </div>
    );
}
