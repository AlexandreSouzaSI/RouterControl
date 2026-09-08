import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { TruckTimeline } from '../components/TruckTimeline';

type Caminhao = {
    id: string;
    placa: string;
};

type Regra = {
    id?: string;
    caminhaoId: string;
    origemViagem?: string;
    origemViagem2?: string;
    destinoViagem?: string;
    cidadeParado?: string;
};

export function Caminhoes() {
    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);
    const [selected, setSelected] = useState<string>('');
    const [regra, setRegra] = useState<Regra | null>(null);
    const [loading, setLoading] = useState(false);
    const [novaPlaca, setNovaPlaca] = useState('');

    async function fetchCaminhoes() {
        const res = await api.get('/caminhoes');

        const lista = Array.isArray(res.data)
            ? res.data
            : res.data.data || [];

        setCaminhoes(lista);
    }

    async function criarCaminhao() {
        if (!novaPlaca) {
            alert('Digite a placa');
            return;
        }

        await api.post('/caminhoes', {
            placa: novaPlaca,
        });

        setNovaPlaca('');
        fetchCaminhoes();
    }

    useEffect(() => {
        fetchCaminhoes();
    }, []);

    useEffect(() => {
        if (!selected) return;

        async function fetchRegra() {
            setLoading(true);

            try {
                const res = await api.get(`/regra-caminhao/${selected}`);

                if (!res.data) {
                    setRegra({
                        caminhaoId: selected,
                        origemViagem: '',
                        origemViagem2: '',
                        destinoViagem: '',
                        cidadeParado: '',
                    });
                } else {
                    setRegra(res.data);
                }
            } catch {
                setRegra({
                    caminhaoId: selected,
                    origemViagem: '',
                    origemViagem2: '',
                    destinoViagem: '',
                    cidadeParado: '',
                });
            }

            setLoading(false);
        }

        fetchRegra();
    }, [selected]);

    async function salvar() {
        if (!regra) return;

        await api.post('/regra-caminhao', regra);
        alert('Regra salva!');
    }

    async function editarCaminhao(c: Caminhao) {
        const novaPlaca = prompt('Nova placa:', c.placa);

        if (!novaPlaca) return;

        await api.patch(`/caminhoes/${c.id}`, {
            placa: novaPlaca.toUpperCase(),
        });

        await fetchCaminhoes();
    }

    async function deletarCaminhao(c: Caminhao) {
        const confirmar = confirm(
            `Tem certeza que deseja excluir o caminhão ${c.placa}? Isso também remove relatórios, viagens e paradas dele.`,
        );

        if (!confirmar) return;

        await api.delete(`/caminhoes/${c.id}`);

        if (selected === c.id) {
            setSelected('');
            setRegra(null);
        }

        await fetchCaminhoes();
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Configuração de Caminhões
            </h1>

            <div className="flex flex-wrap gap-2">
                <input
                    type="text"
                    placeholder="Placa (ex: QPM1234)"
                    className="border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111827] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={novaPlaca}
                    onChange={(e) =>
                        setNovaPlaca(e.target.value.toUpperCase())
                    }
                />

                <button
                    onClick={criarCaminhao}
                    className="bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition"
                >
                    Criar
                </button>
            </div>

            <div>
                <h2 className="font-semibold mb-2 text-gray-800 dark:text-gray-200">
                    Caminhões
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {caminhoes.map((c) => (
                        <div
                            key={c.id}
                            className={`border rounded-2xl p-4 shadow-sm transition-all ${selected === c.id
                                    ? 'bg-blue-600 text-white border-blue-400 shadow-blue-500/20'
                                    : 'bg-white dark:bg-[#111827] text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-[#1E293B]'
                                }`}
                        >
                            <div
                                onClick={() => setSelected(c.id)}
                                className="cursor-pointer text-center font-semibold mb-3"
                            >
                                🚚 {c.placa}
                            </div>

                            <div className="flex gap-2 justify-center">
                                <button
                                    onClick={() => editarCaminhao(c)}
                                    className="text-xs px-3 py-1 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition"
                                >
                                    Editar
                                </button>

                                <button
                                    onClick={() => deletarCaminhao(c)}
                                    className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
                                >
                                    Excluir
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {regra && !loading && (
                <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl shadow p-6 max-w-xl space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Editar Regra
                    </h2>

                    <div>
                        <label className="block mb-1 font-medium text-gray-700 dark:text-gray-300">
                            Origem da Viagem
                        </label>

                        <input
                            type="text"
                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Ex: BETIM"
                            value={regra.origemViagem || ''}
                            onChange={(e) =>
                                setRegra({
                                    ...regra,
                                    origemViagem:
                                        e.target.value.toUpperCase(),
                                })
                            }
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium text-gray-700 dark:text-gray-300">
                            Segunda origem (opcional)
                        </label>

                        <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                            Se o caminhão também baseia em outra cidade além da
                            origem acima (ex: Pouso Alegre), chegar nela não
                            fecha viagem nem conta como parada — só conta 1
                            viagem quando chega no destino.
                        </p>

                        <input
                            type="text"
                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Ex: POUSO ALEGRE"
                            value={regra.origemViagem2 || ''}
                            onChange={(e) =>
                                setRegra({
                                    ...regra,
                                    origemViagem2:
                                        e.target.value.toUpperCase(),
                                })
                            }
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium text-gray-700 dark:text-gray-300">
                            Destino da Viagem
                        </label>

                        <input
                            type="text"
                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Ex: SANTOS"
                            value={regra.destinoViagem || ''}
                            onChange={(e) =>
                                setRegra({
                                    ...regra,
                                    destinoViagem:
                                        e.target.value.toUpperCase(),
                                })
                            }
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium text-gray-700 dark:text-gray-300">
                            Cidade considerada parada (pra desconto de diária)
                        </label>

                        <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                            Só o tempo parado nessa cidade conta como "dia
                            parado" no pagamento. Tempo na segunda origem ou
                            no destino conta como serviço, não como parada.
                            Se deixar em branco, usa a origem principal.
                        </p>

                        <input
                            type="text"
                            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0B1120] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Ex: BETIM"
                            value={regra.cidadeParado || ''}
                            onChange={(e) =>
                                setRegra({
                                    ...regra,
                                    cidadeParado:
                                        e.target.value.toUpperCase(),
                                })
                            }
                        />
                    </div>

                    <button
                        onClick={salvar}
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition"
                    >
                        Salvar Regra
                    </button>
                </div>
            )}

            {loading && (
                <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 text-gray-500 dark:text-gray-400">
                    Carregando regra...
                </div>
            )}

            <TruckTimeline caminhaoId={selected} />
        </div>
    );
}