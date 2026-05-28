import { api } from './api';

export type DirecaoFinanceira = 'ENTRADA' | 'SAIDA';

export type FinanceiroFiltros = {
    caminhaoId?: string;
    categoriaId?: string;
    direcao?: DirecaoFinanceira;
    dataInicio?: string;
    dataFim?: string;
};

export async function listarTransacoes(filtros: FinanceiroFiltros) {
    const { data } = await api.get('/financeiro/transacoes', {
        params: filtros,
    });

    return data;
}

export async function buscarResumoFinanceiro(filtros: FinanceiroFiltros) {
    const { data } = await api.get('/financeiro/resumo', {
        params: filtros,
    });

    return data;
}

export async function listarCategoriasFinanceiras() {
    const { data } = await api.get('/financeiro/categorias');
    return data;
}

export async function listarCaminhoesFinanceiro() {
    const { data } = await api.get('/financeiro/caminhoes');
    return data;
}

export async function importarExtrato(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const { data } = await api.post('/financeiro/importar-extrato', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });

    return data;
}

export async function classificarTransacao(
    id: string,
    payload: {
        caminhaoId?: string;
        categoriaId?: string;
        observacao?: string;
    },
) {
    const { data } = await api.patch(
        `/financeiro/transacoes/${id}/classificar`,
        payload,
    );

    return data;
}

export async function listarRegrasFinanceiras() {
    const { data } = await api.get('/financeiro/regras');
    return data;
}

export async function criarRegraFinanceira(payload: {
    palavra: string;
    caminhaoId?: string;
    categoriaId?: string;
    prioridade?: number;
}) {
    const { data } = await api.post('/financeiro/regras', payload);
    return data;
}

export async function reprocessarClassificacaoFinanceira() {
    const { data } = await api.post('/financeiro/reprocessar-classificacao');
    return data;
}

export async function criarCategoriaFinanceira(payload: { nome: string }) {
    const { data } = await api.post('/financeiro/categorias', payload);
    return data;
}