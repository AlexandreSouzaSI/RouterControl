import { useEffect, useState } from 'react';
import { api } from '../services/api';

type ResultadoPagamento = {
    caminhaoId: string;
    placa: string;
    periodo: {
        tipo: string;
        mes: string | null;
        dataInicio: string;
        dataFim: string;
        diasPeriodo: number;
    };
    operacional: {
        numeroViagens: number;
        diasParados: number;
        diasRodando: number;
    };
    calculo: {
        salario: number;
        valorDiaria: number;
        diariaUtilizada?: number;
        valorDiarias: number;
        valorPorViagem: number;
        valorViagens: number;
        metaViagens: number;
        adiantamento: number;
        bonusMetaViagens: number;
        ganhouBonusMeta: boolean;
        valorBonusMeta: number;
        tipoCalculo: 'TRADICIONAL' | 'FATURAMENTO';
        faturamentoBruto: number;
        percentualFaturamento: number;
    };
    cenarios: {
        bonusManual: number;
        total: number;
    }[];
};

type Caminhao = {
    id: string;
    placa: string;
};

export function Pagamentos() {
    const [loading, setLoading] = useState(false);
    const [placa, setPlaca] = useState('');
    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);
    const [mes, setMes] = useState('');
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [faturamentoBruto, setFaturamentoBruto] = useState('');

    const [resultados, setResultados] = useState<ResultadoPagamento[]>([]);

    function moeda(valor: number) {
        return Number(valor || 0).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    }

    async function carregarCaminhoes() {
        const res = await api.get('/caminhoes');

        const lista = Array.isArray(res.data)
            ? res.data
            : res.data.data || [];

        setCaminhoes(lista);
    }

    async function calcular() {
        try {
            setLoading(true);

            const params: any = {};

            if (placa) params.placa = placa;
            if (mes) params.mes = mes;
            if (dataInicio) params.dataInicio = dataInicio;
            if (dataFim) params.dataFim = dataFim;

            if (faturamentoBruto.trim() !== '') {
                params.faturamentoBruto = Number(faturamentoBruto);
            }

            const res = await api.get('/pagamentos/calcular', {
                params,
            });

            setResultados(res.data.resultados || []);
        } catch (error) {
            console.error(error);
            alert('Erro ao calcular pagamento');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        carregarCaminhoes();
    }, []);

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Pagamentos</h1>

                <button
                    onClick={calcular}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                >
                    Calcular
                </button>
            </div>

            <div className="bg-white dark:bg-[#111827] p-5 rounded-2xl shadow border border-gray-200 dark:border-gray-800 mb-6">
                <h2 className="font-semibold mb-4">Filtros</h2>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                    <div>
                        <label className="text-sm text-gray-500 block mb-1">
                            Caminhão
                        </label>

                        <select
                            value={placa}
                            onChange={(e) => setPlaca(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                        >
                            <option value="">Todos</option>

                            {caminhoes.map((c) => (
                                <option key={c.id} value={c.placa}>
                                    {c.placa}
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
                            onChange={(e) => {
                                setMes(e.target.value);
                                setDataInicio('');
                                setDataFim('');
                            }}
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
                            onChange={(e) => {
                                setDataInicio(e.target.value);
                                setMes('');
                            }}
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
                            onChange={(e) => {
                                setDataFim(e.target.value);
                                setMes('');
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-gray-500 block mb-1">
                            Faturamento Bruto
                        </label>

                        <input
                            type="text"
                            inputMode="decimal"
                            value={faturamentoBruto}
                            onChange={(e) =>
                                setFaturamentoBruto(e.target.value)
                            }
                            placeholder="Ex: 79500"
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                        />
                    </div>

                    <button
                        onClick={calcular}
                        className="w-full px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                    >
                        {loading ? 'Calculando...' : 'Filtrar'}
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                {resultados.map((item) => {
                    const diaria =
                        item.calculo.diariaUtilizada ??
                        item.calculo.valorDiaria;

                    const isFaturamento =
                        item.calculo.tipoCalculo === 'FATURAMENTO';

                    return (
                        <div
                            key={item.caminhaoId}
                            className="bg-white dark:bg-[#111827] rounded-2xl shadow border border-gray-200 dark:border-gray-800 overflow-hidden"
                        >
                            <div className="p-5 flex justify-between items-start border-b border-gray-200 dark:border-gray-800">
                                <div>
                                    <h2 className="text-xl font-bold">
                                        🚚 {item.placa}
                                    </h2>

                                    <p className="text-sm text-gray-500">
                                        {new Date(
                                            item.periodo.dataInicio,
                                        ).toLocaleDateString('pt-BR')}{' '}
                                        até{' '}
                                        {new Date(
                                            item.periodo.dataFim,
                                        ).toLocaleDateString('pt-BR')}
                                    </p>

                                    <span
                                        className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold ${isFaturamento
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-blue-100 text-blue-700'
                                            }`}
                                    >
                                        {isFaturamento
                                            ? 'Por faturamento'
                                            : 'Tradicional'}
                                    </span>
                                </div>

                                <div className="flex gap-6 text-right">
                                    <MiniInfo
                                        label="Viagens"
                                        value={
                                            item.operacional.numeroViagens
                                        }
                                    />
                                    <MiniInfo
                                        label="Dias Rodando"
                                        value={item.operacional.diasRodando}
                                    />
                                    <MiniInfo
                                        label="Dias Parados"
                                        value={item.operacional.diasParados}
                                    />
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-100 dark:bg-[#0B1120] text-left">
                                            <th className="p-3">Descrição</th>
                                            <th className="p-3">Base</th>
                                            <th className="p-3 text-right bg-orange-50 text-orange-900">
                                                Sem Bonificação
                                            </th>
                                            <th className="p-3 text-right bg-yellow-50 text-yellow-900">
                                                500 Bonificação
                                            </th>
                                            <th className="p-3 text-right bg-green-50 text-green-900">
                                                1000 Bonificação
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        <Linha
                                            label="Salário"
                                            base={moeda(item.calculo.salario)}
                                            valores={[
                                                item.calculo.salario,
                                                item.calculo.salario,
                                                item.calculo.salario,
                                            ]}
                                        />

                                        <Linha
                                            label={`Diária (${item.operacional.diasRodando} x ${moeda(diaria)})`}
                                            base={moeda(diaria)}
                                            valores={[
                                                item.calculo.valorDiarias,
                                                item.calculo.valorDiarias,
                                                item.calculo.valorDiarias,
                                            ]}
                                        />

                                        <Linha
                                            label="Bonificação"
                                            base="Manual"
                                            valores={[0, 500, 1000]}
                                        />

                                        {!isFaturamento && (
                                            <>
                                                <Linha
                                                    label={`Bônus ${item.calculo.metaViagens} viagens`}
                                                    base={
                                                        item.calculo
                                                            .ganhouBonusMeta
                                                            ? 'Ganhou'
                                                            : 'Não ganhou'
                                                    }
                                                    valores={[
                                                        item.calculo
                                                            .valorBonusMeta,
                                                        item.calculo
                                                            .valorBonusMeta,
                                                        item.calculo
                                                            .valorBonusMeta,
                                                    ]}
                                                />

                                                <Linha
                                                    label={`Viagens (${item.operacional.numeroViagens} x ${moeda(item.calculo.valorPorViagem)})`}
                                                    base={moeda(
                                                        item.calculo
                                                            .valorPorViagem,
                                                    )}
                                                    valores={[
                                                        item.calculo
                                                            .valorViagens,
                                                        item.calculo
                                                            .valorViagens,
                                                        item.calculo
                                                            .valorViagens,
                                                    ]}
                                                />
                                            </>
                                        )}

                                        {isFaturamento && (
                                            <Linha
                                                label={`Faturamento (${item.calculo.percentualFaturamento}%)`}
                                                base={moeda(
                                                    item.calculo
                                                        .faturamentoBruto,
                                                )}
                                                valores={[
                                                    item.calculo.valorViagens,
                                                    item.calculo.valorViagens,
                                                    item.calculo.valorViagens,
                                                ]}
                                            />
                                        )}

                                        <Linha
                                            label="Adiantamento"
                                            base="Valor a abater"
                                            danger
                                            valores={[
                                                -(
                                                    Number(
                                                        item.calculo
                                                            .adiantamento,
                                                    ) || 0
                                                ),
                                                -(
                                                    Number(
                                                        item.calculo
                                                            .adiantamento,
                                                    ) || 0
                                                ),
                                                -(
                                                    Number(
                                                        item.calculo
                                                            .adiantamento,
                                                    ) || 0
                                                ),
                                            ]}
                                        />

                                        <tr className="font-bold text-lg border-t border-gray-300 dark:border-gray-700">
                                            <td className="p-3">TOTAL</td>
                                            <td />
                                            {item.cenarios.map((c) => (
                                                <td
                                                    key={c.bonusManual}
                                                    className="p-3 text-right"
                                                >
                                                    {moeda(c.total)}
                                                </td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function MiniInfo({
    label,
    value,
}: {
    label: string;
    value: number;
}) {
    return (
        <div>
            <p className="text-xs text-gray-500">{label}</p>
            <p className="font-bold text-lg">{value}</p>
        </div>
    );
}

function Linha({
    label,
    base,
    valores,
    danger = false,
}: {
    label: string;
    base: string;
    valores: number[];
    danger?: boolean;
}) {
    function moeda(valor: number) {
        return valor.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    }

    return (
        <tr
            className={`border-t border-gray-200 dark:border-gray-800 ${danger ? 'bg-red-50 dark:bg-red-950/20' : ''
                }`}
        >
            <td
                className={`p-3 font-medium ${danger ? 'text-red-700 dark:text-red-300' : ''
                    }`}
            >
                {label}
            </td>

            <td
                className={`p-3 ${danger
                        ? 'text-red-500 dark:text-red-300'
                        : 'text-gray-500'
                    }`}
            >
                {base}
            </td>

            {valores.map((valor, index) => (
                <td
                    key={index}
                    className={`p-3 text-right font-medium ${danger ? 'text-red-700 dark:text-red-300' : ''
                        }`}
                >
                    {moeda(valor)}
                </td>
            ))}
        </tr>
    );
}