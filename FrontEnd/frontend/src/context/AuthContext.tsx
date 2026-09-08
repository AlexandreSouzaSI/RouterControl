import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import { api, getToken, limparToken, setToken as salvarToken } from '../services/api';

type Usuario = {
    id: string;
    email: string;
};

type AuthContextValue = {
    usuario: Usuario | null;
    carregando: boolean;
    autenticado: boolean;
    entrar: (email: string, senha: string) => Promise<void>;
    sair: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [usuario, setUsuario] = useState<Usuario | null>(null);
    const [carregando, setCarregando] = useState(true);

    useEffect(() => {
        const token = getToken();

        if (!token) {
            setCarregando(false);
            return;
        }

        // Token salvo de uma sessão anterior — confirma com o backend que
        // ele ainda é válido antes de liberar o app.
        api
            .get('/auth/me')
            .then((res) => setUsuario(res.data))
            .catch(() => limparToken())
            .finally(() => setCarregando(false));
    }, []);

    const entrar = useCallback(async (email: string, senha: string) => {
        const res = await api.post('/auth/login', { email, senha });

        salvarToken(res.data.token);
        setUsuario(res.data.usuario);
    }, []);

    const sair = useCallback(() => {
        limparToken();
        setUsuario(null);
        window.location.href = '/login';
    }, []);

    return (
        <AuthContext.Provider
            value={{ usuario, carregando, autenticado: !!usuario, entrar, sair }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);

    if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');

    return ctx;
}
