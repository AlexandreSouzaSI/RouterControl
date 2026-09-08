import axios from 'axios';

const TOKEN_KEY = 'rota_token';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function limparToken() {
    localStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
});

// Anexa o token salvo em toda requisição — sem isso, com o backend
// protegido por JWT, tudo viraria 401 depois do login.
api.interceptors.request.use((config) => {
    const token = getToken();

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

// Token expirado ou inválido: limpa e manda pra tela de login. Evita
// telas "quebradas" mostrando erro em vez de pedir login de novo.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error?.response?.status === 401) {
            limparToken();

            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    },
);
