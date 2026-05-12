import { useEffect, useState } from 'react';
import { api } from '../services/api';

type ConfigPagamento = {
    salarioBase: number;
    valorDiaria: number;
    valorPorViagem: number;
    bonusMetaViagens: number;
    metaViagens: number;
    diasBaseSalario: number;
    adiantamento: number;
};

type CaminhaoConfig = {
    id: string;
    placa: string;
    ativo: boolean;
    config: {
        tipoCalculo:
        | 'TRADICIONAL'
        | 'FATURAMENTO';

        percentualFaturamento: number;

        valorDiariaOverride:
        | number
        | null;

        ativo: boolean;
    };
};

export function Config() {
    const [loading, setLoading] =
        useState(false);

    const [config, setConfig] =
        useState<ConfigPagamento | null>(
            null,
        );

    const [caminhoes, setCaminhoes] =
        useState<CaminhaoConfig[]>([]);

    async function carregar() {
        try {
            setLoading(true);

            const [configRes, caminhoesRes] =
                await Promise.all([
                    api.get('/pagamentos/config'),

                    api.get(
                        '/pagamentos/config-caminhoes',
                    ),
                ]);

            setConfig(configRes.data);

            setCaminhoes(
                caminhoesRes.data || [],
            );
        } finally {
            setLoading(false);
        }
    }

    async function salvar() {
        if (!config) return;

        try {
            setLoading(true);

            await api.patch(
                '/pagamentos/config',
                config,
            );

            alert(
                'Configurações gerais salvas!',
            );
        } catch (error) {
            console.error(error);

            alert(
                'Erro ao salvar configurações',
            );
        } finally {
            setLoading(false);
        }
    }

    async function salvarCaminhao(
        caminhao: CaminhaoConfig,
    ) {
        try {
            await api.patch(
                `/pagamentos/config-caminhoes/${caminhao.id}`,
                {
                    tipoCalculo:
                        caminhao.config
                            .tipoCalculo,

                    percentualFaturamento:
                        caminhao.config
                            .percentualFaturamento,

                    valorDiariaOverride:
                        caminhao.config
                            .valorDiariaOverride,

                    ativo:
                        caminhao.config.ativo,
                },
            );

            alert(
                `Configuração do caminhão ${caminhao.placa} salva`,
            );
        } catch (error) {
            console.error(error);

            alert(
                'Erro ao salvar caminhão',
            );
        }
    }

    function atualizarCaminhao(
        id: string,
        campo: string,
        valor: any,
    ) {
        setCaminhoes((old) =>
            old.map((item) => {
                if (item.id !== id)
                    return item;

                return {
                    ...item,
                    config: {
                        ...item.config,
                        [campo]: valor,
                    },
                };
            }),
        );
    }

    useEffect(() => {
        carregar();
    }, []);

    if (!config) {
        return (
            <div className="p-6">
                Carregando...
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">
                    Configurações
                </h1>

                <button
                    onClick={salvar}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700"
                >
                    {loading
                        ? 'Salvando...'
                        : 'Salvar'}
                </button>
            </div>

            {/* CONFIG GERAL */}
            <div className="bg-white dark:bg-[#111827] rounded-2xl shadow border border-gray-200 dark:border-gray-800 p-6 mb-6">
                <h2 className="font-semibold mb-6">
                    Configurações Gerais
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <Campo
                        label="Salário Base"
                        value={config.salarioBase}
                        onChange={(v) =>
                            setConfig({
                                ...config,
                                salarioBase: v,
                            })
                        }
                    />

                    <Campo
                        label="Valor Diária"
                        value={config.valorDiaria}
                        onChange={(v) =>
                            setConfig({
                                ...config,
                                valorDiaria: v,
                            })
                        }
                    />

                    <Campo
                        label="Valor por Viagem"
                        value={
                            config.valorPorViagem
                        }
                        onChange={(v) =>
                            setConfig({
                                ...config,
                                valorPorViagem: v,
                            })
                        }
                    />

                    <Campo
                        label="Bônus Meta"
                        value={
                            config.bonusMetaViagens
                        }
                        onChange={(v) =>
                            setConfig({
                                ...config,
                                bonusMetaViagens: v,
                            })
                        }
                    />

                    <Campo
                        label="Meta Viagens"
                        value={
                            config.metaViagens
                        }
                        onChange={(v) =>
                            setConfig({
                                ...config,
                                metaViagens: v,
                            })
                        }
                    />

                    <Campo
                        label="Dias Base"
                        value={
                            config.diasBaseSalario
                        }
                        onChange={(v) =>
                            setConfig({
                                ...config,
                                diasBaseSalario: v,
                            })
                        }
                    />

                    <Campo
                        label="Adiantamento"
                        value={
                            config.adiantamento
                        }
                        onChange={(v) =>
                            setConfig({
                                ...config,
                                adiantamento: v,
                            })
                        }
                    />
                </div>
            </div>

            {/* CAMINHÕES */}
            <div>
                <h2 className="text-xl font-bold mb-4">
                    Configuração por Caminhão
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {caminhoes.map(
                        (caminhao) => (
                            <div
                                key={caminhao.id}
                                className="bg-white dark:bg-[#111827] rounded-2xl shadow border border-gray-200 dark:border-gray-800 p-5"
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-xl font-bold">
                                            🚚{' '}
                                            {
                                                caminhao.placa
                                            }
                                        </h3>

                                        <p className="text-sm text-gray-500">
                                            {
                                                caminhao.config
                                                    .tipoCalculo
                                            }
                                        </p>
                                    </div>

                                    <span
                                        className={`px-3 py-1 rounded-full text-xs font-medium ${caminhao.config.tipoCalculo ===
                                            'TRADICIONAL'
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-green-100 text-green-700'
                                            }`}
                                    >
                                        {
                                            caminhao
                                                .config
                                                .tipoCalculo
                                        }
                                    </span>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm text-gray-500 block mb-2">
                                            Tipo de
                                            cálculo
                                        </label>

                                        <select
                                            value={
                                                caminhao
                                                    .config
                                                    .tipoCalculo
                                            }
                                            onChange={(
                                                e,
                                            ) =>
                                                atualizarCaminhao(
                                                    caminhao.id,
                                                    'tipoCalculo',
                                                    e
                                                        .target
                                                        .value,
                                                )
                                            }
                                            className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
                                        >
                                            <option value="TRADICIONAL">
                                                Tradicional
                                            </option>

                                            <option value="FATURAMENTO">
                                                Faturamento
                                            </option>
                                        </select>
                                    </div>

                                    {caminhao
                                        .config
                                        .tipoCalculo ===
                                        'FATURAMENTO' && (
                                            <Campo
                                                label="% Faturamento"
                                                value={
                                                    caminhao
                                                        .config
                                                        .percentualFaturamento
                                                }
                                                onChange={(
                                                    v,
                                                ) =>
                                                    atualizarCaminhao(
                                                        caminhao.id,
                                                        'percentualFaturamento',
                                                        v,
                                                    )
                                                }
                                            />
                                        )}

                                    <Campo
                                        label="Diária específica (opcional)"
                                        value={
                                            caminhao
                                                .config
                                                .valorDiariaOverride ||
                                            0
                                        }
                                        onChange={(
                                            v,
                                        ) =>
                                            atualizarCaminhao(
                                                caminhao.id,
                                                'valorDiariaOverride',
                                                v ===
                                                    0
                                                    ? null
                                                    : v,
                                            )
                                        }
                                    />

                                    <button
                                        onClick={() =>
                                            salvarCaminhao(
                                                caminhao,
                                            )
                                        }
                                        className="w-full py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                                    >
                                        Salvar
                                        Caminhão
                                    </button>
                                </div>
                            </div>
                        ),
                    )}
                </div>
            </div>
        </div>
    );
}

function Campo({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (
        value: number,
    ) => void;
}) {
    return (
        <div>
            <label className="text-sm text-gray-500 block mb-2">
                {label}
            </label>

            <input
                type="number"
                value={value}
                onChange={(e) =>
                    onChange(
                        Number(
                            e.target.value,
                        ),
                    )
                }
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700"
            />
        </div>
    );
}