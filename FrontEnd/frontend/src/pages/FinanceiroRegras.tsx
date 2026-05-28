import { useEffect, useState } from 'react';
import {
    criarCategoriaFinanceira,
    criarRegraFinanceira,
    listarCaminhoesFinanceiro,
    listarCategoriasFinanceiras,
    listarRegrasFinanceiras,
    reprocessarClassificacaoFinanceira,
} from '../services/financeiro';

type Caminhao = {
    id: string;
    placa: string;
};

type Categoria = {
    id: string;
    nome: string;
};

type Regra = {
    id: string;
    palavra: string;
    prioridade: number;
    caminhao?: Caminhao;
    categoria?: Categoria;
};

export function FinanceiroRegras() {
    const [regras, setRegras] = useState<Regra[]>([]);
    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);

    const [palavra, setPalavra] = useState('');
    const [caminhaoId, setCaminhaoId] = useState('');
    const [categoriaId, setCategoriaId] = useState('');
    const [prioridade, setPrioridade] = useState(0);
    const [loading, setLoading] = useState(false);
    const [novaCategoria, setNovaCategoria] = useState('');

    async function handleCriarCategoria() {
        if (!novaCategoria.trim()) return;

        await criarCategoriaFinanceira({
            nome: novaCategoria,
        });

        setNovaCategoria('');
        await carregarDados();
    }

    async function carregarDados() {
        const [regrasData, caminhoesData, categoriasData] = await Promise.all([
            listarRegrasFinanceiras(),
            listarCaminhoesFinanceiro(),
            listarCategoriasFinanceiras(),
        ]);

        setRegras(regrasData);
        setCaminhoes(caminhoesData);
        setCategorias(categoriasData);
    }

    async function handleCriarRegra() {
        if (!palavra.trim()) return;

        await criarRegraFinanceira({
            palavra,
            caminhaoId: caminhaoId || undefined,
            categoriaId: categoriaId || undefined,
            prioridade,
        });

        setPalavra('');
        setCaminhaoId('');
        setCategoriaId('');
        setPrioridade(0);

        await carregarDados();
    }

    async function handleReprocessar() {
        setLoading(true);

        try {
            const result = await reprocessarClassificacaoFinanceira();

            alert(
                `Analisadas: ${result.totalAnalisadas}\nClassificadas: ${result.classificadas}\nPendentes: ${result.pendentes}`,
            );

            await carregarDados();
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregarDados();
    }, []);

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold">Regras Financeiras</h1>
                <p className="text-zinc-500">
                    Cadastre palavras-chave para classificar automaticamente caminhões e categorias.
                </p>
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h2 className="mb-4 font-semibold">Nova categoria</h2>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input
                        className="rounded-lg border px-3 py-2"
                        placeholder="Ex: Manutenção, Aluguel, Salário"
                        value={novaCategoria}
                        onChange={(e) => setNovaCategoria(e.target.value)}
                    />

                    <button
                        onClick={handleCriarCategoria}
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-white"
                    >
                        Salvar categoria
                    </button>
                </div>
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm">
                <h2 className="mb-4 font-semibold">Nova regra automática</h2>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                    <input
                        className="rounded-lg border px-3 py-2"
                        placeholder="Palavra-chave. Ex: POSTO"
                        value={palavra}
                        onChange={(e) => setPalavra(e.target.value)}
                    />

                    <select
                        className="rounded-lg border px-3 py-2"
                        value={caminhaoId}
                        onChange={(e) => setCaminhaoId(e.target.value)}
                    >
                        <option value="">Sem caminhão</option>
                        {caminhoes.map((caminhao) => (
                            <option key={caminhao.id} value={caminhao.id}>
                                {caminhao.placa}
                            </option>
                        ))}
                    </select>

                    <select
                        className="rounded-lg border px-3 py-2"
                        value={categoriaId}
                        onChange={(e) => setCategoriaId(e.target.value)}
                    >
                        <option value="">Sem categoria</option>
                        {categorias.map((categoria) => (
                            <option key={categoria.id} value={categoria.id}>
                                {categoria.nome}
                            </option>
                        ))}
                    </select>

                    <input
                        type="number"
                        className="rounded-lg border px-3 py-2"
                        placeholder="Prioridade"
                        value={prioridade}
                        onChange={(e) => setPrioridade(Number(e.target.value))}
                    />

                    <button
                        onClick={handleCriarRegra}
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-white"
                    >
                        Salvar regra
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
                <div>
                    <strong>Reprocessar pendentes</strong>
                    <p className="text-sm text-zinc-500">
                        Aplica as regras atuais nas transações ainda sem classificação.
                    </p>
                </div>

                <button
                    onClick={handleReprocessar}
                    disabled={loading}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
                >
                    {loading ? 'Processando...' : 'Reprocessar'}
                </button>
            </div>

            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-100 text-left">
                        <tr>
                            <th className="p-3">Palavra</th>
                            <th className="p-3">Caminhão</th>
                            <th className="p-3">Categoria</th>
                            <th className="p-3">Prioridade</th>
                        </tr>
                    </thead>

                    <tbody>
                        {regras.map((regra) => (
                            <tr key={regra.id} className="border-t">
                                <td className="p-3 font-medium">{regra.palavra}</td>
                                <td className="p-3">{regra.caminhao?.placa || '-'}</td>
                                <td className="p-3">{regra.categoria?.nome || '-'}</td>
                                <td className="p-3">{regra.prioridade}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}