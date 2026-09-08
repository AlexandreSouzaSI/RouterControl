import { useEffect, useState } from 'react';
import {
    buscarResumoFinanceiro,
    importarExtrato,
    listarCaminhoesFinanceiro,
    listarCategoriasFinanceiras,
    listarTransacoes,
    type DirecaoFinanceira,
    type FinanceiroFiltros,
    classificarTransacao,
} from '../services/financeiro';

type Caminhao = {
    id: string;
    placa: string;
};

type Categoria = {
    id: string;
    nome: string;
};

type Transacao = {
    id: string;
    data: string;
    lancamento: string;
    razaoSocial?: string;
    valor: string;
    direcao: DirecaoFinanceira;
    caminhao?: Caminhao;
    categoria?: Categoria;
    status: string;
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function Financeiro() {
    const [transacoes, setTransacoes] = useState<Transacao[]>([]);
    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [resumo, setResumo] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [classificando, setClassificando] = useState<string | null>(null);
    const [arquivo, setArquivo] = useState<File | null>(null);

    const [filtros, setFiltros] = useState<FinanceiroFiltros>({
        dataInicio: '',
        dataFim: '',
        caminhaoId: '',
        categoriaId: '',
        direcao: undefined,
    });

    async function handleClassificar(
        transacaoId: string,
        caminhaoId?: string,
        categoriaId?: string,
    ) {
        try {
            setClassificando(transacaoId);

            await classificarTransacao(transacaoId, {
                caminhaoId: caminhaoId || undefined,
                categoriaId: categoriaId || undefined,
            });

            await carregarDados();
        } finally {
            setClassificando(null);
        }
    }

    async function carregarDados() {
        setLoading(true);

        try {
            const filtrosLimpos = Object.fromEntries(
                Object.entries(filtros).filter(([, value]) => value),
            );

            const [transacoesData, resumoData, caminhoesData, categoriasData] =
                await Promise.all([
                    listarTransacoes(filtrosLimpos),
                    buscarResumoFinanceiro(filtrosLimpos),
                    listarCaminhoesFinanceiro(),
                    listarCategoriasFinanceiras(),
                ]);

            setTransacoes(transacoesData);
            setResumo(resumoData);
            setCaminhoes(caminhoesData);
            setCategorias(categoriasData);
        } finally {
            setLoading(false);
        }
    }

    async function handleImportar() {
        if (!arquivo) {
            alert('Selecione um arquivo primeiro.');
            return;
        }

        setLoading(true);

        try {
            await importarExtrato(arquivo);
            setArquivo(null);
            await carregarDados();
            alert('Extrato importado com sucesso.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregarDados();
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Financeiro por Caminhão</h1>
                <p className="text-zinc-500">
                    Importe extratos, filtre entradas/saídas e classifique por caminhão e categoria.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <p className="text-sm text-zinc-500">Entradas</p>
                    <strong className="text-xl text-green-600">
                        {formatCurrency(resumo?.totalEntradas ?? 0)}
                    </strong>
                </div>

                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <p className="text-sm text-zinc-500">Saídas</p>
                    <strong className="text-xl text-red-600">
                        {formatCurrency(resumo?.totalSaidas ?? 0)}
                    </strong>
                </div>

                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <p className="text-sm text-zinc-500">Saldo</p>
                    <strong className="text-xl">
                        {formatCurrency(resumo?.saldo ?? 0)}
                    </strong>
                </div>

                <div className="rounded-xl border bg-white p-4 shadow-sm">
                    <p className="text-sm text-zinc-500">Transações</p>
                    <strong className="text-xl">
                        {resumo?.quantidadeTransacoes ?? 0}
                    </strong>
                </div>
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
                    <input
                        type="date"
                        className="rounded-lg border px-3 py-2"
                        value={filtros.dataInicio}
                        onChange={(e) =>
                            setFiltros((old) => ({ ...old, dataInicio: e.target.value }))
                        }
                    />

                    <input
                        type="date"
                        className="rounded-lg border px-3 py-2"
                        value={filtros.dataFim}
                        onChange={(e) =>
                            setFiltros((old) => ({ ...old, dataFim: e.target.value }))
                        }
                    />

                    <select
                        className="rounded-lg border px-3 py-2"
                        value={filtros.caminhaoId}
                        onChange={(e) =>
                            setFiltros((old) => ({ ...old, caminhaoId: e.target.value }))
                        }
                    >
                        <option value="">Todos caminhões</option>
                        {caminhoes.map((caminhao) => (
                            <option key={caminhao.id} value={caminhao.id}>
                                {caminhao.placa}
                            </option>
                        ))}
                    </select>

                    <select
                        className="rounded-lg border px-3 py-2"
                        value={filtros.categoriaId}
                        onChange={(e) =>
                            setFiltros((old) => ({ ...old, categoriaId: e.target.value }))
                        }
                    >
                        <option value="">Todas categorias</option>
                        {categorias.map((categoria) => (
                            <option key={categoria.id} value={categoria.id}>
                                {categoria.nome}
                            </option>
                        ))}
                    </select>

                    <select
                        className="rounded-lg border px-3 py-2"
                        value={filtros.direcao ?? ''}
                        onChange={(e) =>
                            setFiltros((old) => ({
                                ...old,
                                direcao: e.target.value as DirecaoFinanceira || undefined,
                            }))
                        }
                    >
                        <option value="">Entradas e saídas</option>
                        <option value="ENTRADA">Recebíveis</option>
                        <option value="SAIDA">Saídas</option>
                    </select>

                    <button
                        onClick={carregarDados}
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-white"
                    >
                        Filtrar
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
                <div>
                    <strong>Importar extrato</strong>
                    <p className="text-sm text-zinc-500">Envie o Excel do banco.</p>
                </div>

                <div className="flex items-center gap-3">
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                    />

                    <button
                        onClick={handleImportar}
                        disabled={!arquivo || loading}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
                    >
                        {loading ? 'Enviando...' : 'Enviar'}
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-100 text-left">
                        <tr>
                            <th className="p-3">Data</th>
                            <th className="p-3">Lançamento</th>
                            <th className="p-3">Razão Social</th>
                            <th className="p-3">Tipo</th>
                            <th className="p-3">Caminhão</th>
                            <th className="p-3">Categoria</th>
                            <th className="p-3 text-right">Valor</th>
                        </tr>
                    </thead>

                    <tbody>
                        {loading ? (
                            <tr>
                                <td className="p-4 text-center" colSpan={7}>
                                    Carregando...
                                </td>
                            </tr>
                        ) : (
                            transacoes.map((transacao) => (
                                <tr key={transacao.id} className="border-t">
                                    <td className="p-3">
                                        {new Date(transacao.data).toLocaleDateString('pt-BR')}
                                    </td>

                                    <td className="p-3">{transacao.lancamento}</td>

                                    <td className="p-3">
                                        {transacao.razaoSocial || '-'}
                                    </td>

                                    <td className="p-3">
                                        {transacao.direcao === 'ENTRADA'
                                            ? 'Recebível'
                                            : 'Saída'}
                                    </td>

                                    <td className="p-3">
                                        <select
                                            className="rounded border px-2 py-1 text-sm"
                                            value={transacao.caminhao?.id || ''}
                                            onChange={(e) =>
                                                handleClassificar(
                                                    transacao.id,
                                                    e.target.value,
                                                    transacao.categoria?.id,
                                                )
                                            }
                                            disabled={classificando === transacao.id}
                                        >
                                            <option value="">Sem caminhão</option>

                                            {caminhoes.map((caminhao) => (
                                                <option
                                                    key={caminhao.id}
                                                    value={caminhao.id}
                                                >
                                                    {caminhao.placa}
                                                </option>
                                            ))}
                                        </select>
                                    </td>

                                    <td className="p-3">
                                        <select
                                            className="rounded border px-2 py-1 text-sm"
                                            value={transacao.categoria?.id || ''}
                                            onChange={(e) =>
                                                handleClassificar(
                                                    transacao.id,
                                                    transacao.caminhao?.id,
                                                    e.target.value,
                                                )
                                            }
                                            disabled={classificando === transacao.id}
                                        >
                                            <option value="">Sem categoria</option>

                                            {categorias.map((categoria) => (
                                                <option
                                                    key={categoria.id}
                                                    value={categoria.id}
                                                >
                                                    {categoria.nome}
                                                </option>
                                            ))}
                                        </select>
                                    </td>

                                    <td className="p-3 text-right font-semibold">
                                        <span
                                            className={
                                                transacao.direcao === 'ENTRADA'
                                                    ? 'text-green-600'
                                                    : 'text-red-600'
                                            }
                                        >
                                            {formatCurrency(Number(transacao.valor))}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}