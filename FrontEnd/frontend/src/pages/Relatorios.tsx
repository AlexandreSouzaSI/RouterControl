import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

type Caminhao = {
    id: string;
    placa: string;
};

export function Relatorios() {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any[]>([]);

    const [placa, setPlaca] = useState('');
    const [mes, setMes] = useState('');
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);

    async function fetchCaminhoes() {
        try {
            const res = await api.get('/caminhoes');

            const lista = Array.isArray(res.data)
                ? res.data
                : res.data.data || [];

            setCaminhoes(lista);
        } catch (error) {
            console.error(error);
        }
    }

    async function fetchRelatorios() {
        try {
            setLoading(true);

            const params: any = {};

            if (placa) params.placa = placa;
            if (mes) params.mes = mes;
            if (dataInicio) params.dataInicio = dataInicio;
            if (dataFim) params.dataFim = dataFim;

            const res = await api.get('/relatorio', {
                params,
            });

            setData(res.data.data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchRelatorios();
        fetchCaminhoes();
    }, []);

    const totalizadores = useMemo(() => {
        return data.reduce(
            (acc, item) => {
                acc.viagens += item.numeroViagens || 0;
                acc.parados += item.diasParados || 0;
                acc.rodando += item.diasRodando || 0;

                return acc;
            },
            {
                viagens: 0,
                parados: 0,
                rodando: 0,
            },
        );
    }, [data]);

    function limparFiltros() {
        setPlaca('');
        setMes('');
        setDataInicio('');
        setDataFim('');
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Relatórios</h1>

                <button
                    onClick={fetchRelatorios}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                >
                    Atualizar
                </button>
            </div>

            <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div>
                        <label className="text-sm text-gray-500 block mb-1">
                            Placa
                        </label>

                        <select
                            value={placa}
                            onChange={(e) => setPlaca(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                        >
                            <option value="">Todos</option>

                            {caminhoes.map((caminhao) => (
                                <option key={caminhao.id} value={caminhao.placa}>
                                    {caminhao.placa}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-sm text-gray-500 block mb-1">
                            Mês
                        </label>

                        <input
                            type="month"
                            value={mes}
                            onChange={(e) => setMes(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-gray-500 block mb-1">
                            Data Inicial
                        </label>

                        <input
                            type="date"
                            value={dataInicio}
                            onChange={(e) => setDataInicio(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-gray-500 block mb-1">
                            Data Final
                        </label>

                        <input
                            type="date"
                            value={dataFim}
                            onChange={(e) => setDataFim(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                        />
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={fetchRelatorios}
                            className="w-full px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                        >
                            Filtrar
                        </button>
                    </div>

                    <div className="flex items-end">
                        <button
                            onClick={() => {
                                limparFiltros();
                                setTimeout(fetchRelatorios, 0);
                            }}
                            className="w-full px-4 py-2 rounded-xl bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                            Limpar
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800">
                    <p className="text-sm text-gray-500">Total Viagens</p>
                    <h2 className="text-3xl font-bold mt-2">
                        {totalizadores.viagens}
                    </h2>
                </div>

                <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800">
                    <p className="text-sm text-gray-500">Dias Parados</p>
                    <h2 className="text-3xl font-bold mt-2">
                        {totalizadores.parados}
                    </h2>
                </div>

                <div className="bg-white dark:bg-[#111827] p-4 rounded-2xl shadow border border-gray-200 dark:border-gray-800">
                    <p className="text-sm text-gray-500">Dias Rodando</p>
                    <h2 className="text-3xl font-bold mt-2">
                        {totalizadores.rodando}
                    </h2>
                </div>
            </div>

            {loading && (
                <div className="bg-white dark:bg-[#111827] p-6 rounded-2xl shadow">
                    Carregando relatórios...
                </div>
            )}

            {!loading && data.length === 0 && (
                <div className="bg-white dark:bg-[#111827] p-6 rounded-2xl shadow text-gray-500">
                    Nenhum relatório encontrado.
                </div>
            )}

            <div className="space-y-6">
                {data.map((item, index) => (
                    <div
                        key={index}
                        className="bg-white dark:bg-[#111827] p-6 rounded-2xl shadow border border-gray-200 dark:border-gray-800"
                    >
                        <div className="flex flex-wrap justify-between gap-4 mb-6">
                            <div>
                                <h2 className="text-xl font-bold">
                                    🚚 {item.caminhao?.placa}
                                </h2>

                                <p className="text-sm text-gray-500">
                                    Período: {item.periodo}
                                </p>

                                <p className="text-sm text-gray-500">
                                    De{' '}
                                    {new Date(
                                        item.dataInicioFiltro || item.dataInicio,
                                    ).toLocaleDateString('pt-BR')}{' '}
                                    até{' '}
                                    {new Date(
                                        item.dataFimFiltro || item.dataFim,
                                    ).toLocaleDateString('pt-BR')}
                                </p>
                            </div>

                            <div className="flex gap-6">
                                <div>
                                    <p className="text-xs text-gray-500">
                                        Viagens
                                    </p>
                                    <p className="font-bold text-lg">
                                        {item.numeroViagens}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500">
                                        Dias Parados
                                    </p>
                                    <p className="font-bold text-lg">
                                        {item.diasParados}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500">
                                        Dias Rodando
                                    </p>
                                    <p className="font-bold text-lg">
                                        {item.diasRodando}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mb-6">
                            <h3 className="font-semibold mb-3">Viagens</h3>

                            <div className="space-y-2">
                                {(item.viagens || []).map(
                                    (viagem: any, i: number) => (
                                        <div
                                            key={i}
                                            className="bg-gray-100 dark:bg-[#0B1120] p-3 rounded-xl"
                                        >
                                            <div className="font-medium">
                                                Viagem #{i + 1}
                                            </div>

                                            <div className="text-sm text-gray-500">
                                                {new Date(
                                                    viagem.dataHoraChegada,
                                                ).toLocaleString('pt-BR')}
                                            </div>

                                            <div className="text-sm mt-1">
                                                {viagem.cidade}
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-3">Paradas</h3>

                            <div className="space-y-2">
                                {(item.paradas || []).map(
                                    (parada: any, i: number) => (
                                        <div
                                            key={i}
                                            className="bg-gray-100 dark:bg-[#0B1120] p-3 rounded-xl"
                                        >
                                            <div className="font-medium">
                                                Parada #{i + 1} —{' '}
                                                {parada.cidadeEntrada}
                                            </div>

                                            <div className="text-sm text-gray-500">
                                                Entrada:{' '}
                                                {new Date(
                                                    parada.dataHoraEntrada,
                                                ).toLocaleString('pt-BR')}
                                            </div>

                                            <div className="text-sm text-gray-500">
                                                Saída:{' '}
                                                {parada.dataHoraSaida
                                                    ? new Date(
                                                        parada.dataHoraSaida,
                                                    ).toLocaleString('pt-BR')
                                                    : 'Em aberto'}
                                            </div>

                                            <div className="mt-2 inline-block px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
                                                {parada.diasParados} dia(s)
                                                parado(s)
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}