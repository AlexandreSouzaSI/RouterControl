import { useEffect, useState } from 'react';
import { api } from '../services/api';

export function TableResumo() {
    const [data, setData] = useState<any[]>([]);
    const [filtro, setFiltro] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true); // 👈 NOVO

    async function fetchData() {
        setLoading(true);

        const response = await api.get('/relatorio', {
            params: {
                placa: filtro,
                page,
                limit: 10,
            },
        });

        setData(response.data.data);
        setTotalPages(response.data.lastPage);
        setLoading(false);
    }

    useEffect(() => {
        fetchData();
    }, [filtro, page]);

    // 👇 LOADING CORRETO
    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-10 bg-gray-300 dark:bg-gray-700 rounded"></div>
                <div className="h-40 bg-gray-300 dark:bg-gray-700 rounded"></div>
            </div>
        );
    }

    return (
        <div>
            <input
                className="border p-2 rounded mb-4 w-full dark:bg-gray-800 dark:border-gray-700"
                placeholder="Filtrar por placa"
                value={filtro}
                onChange={(e) => {
                    setFiltro(e.target.value);
                    setPage(1);
                }}
            />

            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left border-b dark:border-gray-700">
                        <th className="py-2">Placa</th>
                        <th>Viagens</th>
                        <th>Dias Parados</th>
                        <th>Dias Rodando</th>
                    </tr>
                </thead>

                <tbody>
                    {data.map((item) => (
                        <tr
                            key={item.id}
                            className="border-b hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700 transition"
                        >
                            <td className="py-2">{item.placa}</td>
                            <td>{item.numeroViagens}</td>
                            <td>{item.diasParados}</td>
                            <td>{item.diasRodando}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="flex justify-between mt-4">
                <button
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                >
                    Anterior
                </button>

                <span> {page} / {totalPages} </span>

                <button
                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded disabled:opacity-50"
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                >
                    Próxima
                </button>
            </div>
        </div>
    );
}