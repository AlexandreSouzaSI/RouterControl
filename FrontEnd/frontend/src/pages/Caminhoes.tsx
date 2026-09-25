import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Pencil, Trash2, Settings2, ChevronRight, Plus } from 'lucide-react';
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

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClasse = 'text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1';

export function Caminhoes() {
    const navigate = useNavigate();
    const [caminhoes, setCaminhoes] = useState<Caminhao[]>([]);
    const [selected, setSelected] = useState<string>('');
    const [regra, setRegra] = useState<Regra | null>(null);
    const [loading, setLoading] = useState(false);
    const [novaPlaca, setNovaPlaca] = useState('');
    const [criando, setCriando] = useState(false);

    async function fetchCaminhoes() {
        const res = await api.get('/caminhoes');

        const lista = Array.isArray(res.data)
            ? res.data
            : res.data.data || [];

        setCaminhoes(lista);
    }

    async function criarCaminhao() {
        if (!novaPlaca.trim()) return;

        setCriando(true);
        try {
            await api.post('/caminhoes', { placa: novaPlaca });
            setNovaPlaca('');
            await fetchCaminhoes();
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Não foi possível cadastrar o caminhão.');
        } finally {
            setCriando(false);
        }
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

    function alternarConfig(id: string) {
        setSelected((atual) => (atual === id ? '' : id));
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
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Caminhões</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Frota cadastrada. Clique em um caminhão para ver receitas, despesas e histórico.
                </p>
            </div>

            <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800">
                <div className="flex-1 min-w-[220px]">
                    <label className={labelClasse}>Nova placa</label>
                    <input
                        type="text"
                        placeholder="Ex: QPM1234"
                        className={campoClasse}
                        value={novaPlaca}
                        onChange={(e) => setNovaPlaca(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && criarCaminhao()}
                    />
                </div>
                <button
                    onClick={criarCaminhao}
                    disabled={criando || !novaPlaca.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                >
                    <Plus size={16} />
                    Cadastrar
                </button>
            </div>

            {caminhoes.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Nenhum caminhão cadastrado ainda.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {caminhoes.map((c) => (
                        <div
                            key={c.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/caminhoes/${encodeURIComponent(c.placa)}`)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') navigate(`/caminhoes/${encodeURIComponent(c.placa)}`);
                            }}
                            className="group relative cursor-pointer rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827] hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-sm transition"
                        >
                            <div className="flex items-center gap-3 px-4 py-3.5">
                                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 flex items-center justify-center shrink-0 transition">
                                    <Truck size={17} className="text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-sm text-gray-900 dark:text-white tracking-wide truncate">{c.placa}</p>
                                    <p className="text-xs text-gray-400">Ver detalhes</p>
                                </div>
                                <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 shrink-0" />
                            </div>

                            <div className="flex items-center gap-1 px-3 py-1.5 border-t border-gray-100 dark:border-gray-800">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        alternarConfig(c.id);
                                    }}
                                    title="Regra de viagem"
                                    className={`p-1.5 rounded-md transition ${selected === c.id
                                        ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10'
                                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <Settings2 size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        editarCaminhao(c);
                                    }}
                                    title="Editar placa"
                                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                                >
                                    <Pencil size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deletarCaminhao(c);
                                    }}
                                    title="Excluir"
                                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition ml-auto"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selected && (
                <div className="space-y-6">
                    {regra && !loading && (
                        <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-xl space-y-4">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                                Regra de viagem
                            </h2>

                            <div>
                                <label className={labelClasse}>Origem da viagem</label>
                                <input
                                    type="text"
                                    className={campoClasse}
                                    placeholder="Ex: BETIM"
                                    value={regra.origemViagem || ''}
                                    onChange={(e) =>
                                        setRegra({ ...regra, origemViagem: e.target.value.toUpperCase() })
                                    }
                                />
                            </div>

                            <div>
                                <label className={labelClasse}>Segunda origem (opcional)</label>
                                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                                    Se o caminhão também baseia em outra cidade além da origem acima (ex:
                                    Pouso Alegre), chegar nela não fecha viagem nem conta como parada — só
                                    conta 1 viagem quando chega no destino.
                                </p>
                                <input
                                    type="text"
                                    className={campoClasse}
                                    placeholder="Ex: POUSO ALEGRE"
                                    value={regra.origemViagem2 || ''}
                                    onChange={(e) =>
                                        setRegra({ ...regra, origemViagem2: e.target.value.toUpperCase() })
                                    }
                                />
                            </div>

                            <div>
                                <label className={labelClasse}>Destino da viagem</label>
                                <input
                                    type="text"
                                    className={campoClasse}
                                    placeholder="Ex: SANTOS"
                                    value={regra.destinoViagem || ''}
                                    onChange={(e) =>
                                        setRegra({ ...regra, destinoViagem: e.target.value.toUpperCase() })
                                    }
                                />
                            </div>

                            <div>
                                <label className={labelClasse}>
                                    Cidade considerada parada (pra desconto de diária)
                                </label>
                                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                                    Só o tempo parado nessa cidade conta como "dia parado" no pagamento.
                                    Tempo na segunda origem ou no destino conta como serviço, não como
                                    parada. Se deixar em branco, usa a origem principal.
                                </p>
                                <input
                                    type="text"
                                    className={campoClasse}
                                    placeholder="Ex: BETIM"
                                    value={regra.cidadeParado || ''}
                                    onChange={(e) =>
                                        setRegra({ ...regra, cidadeParado: e.target.value.toUpperCase() })
                                    }
                                />
                            </div>

                            <button
                                onClick={salvar}
                                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
                            >
                                Salvar regra
                            </button>
                        </div>
                    )}

                    {loading && (
                        <div className="bg-white dark:bg-[#111827] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 text-sm text-gray-500 dark:text-gray-400">
                            Carregando regra...
                        </div>
                    )}

                    <TruckTimeline caminhaoId={selected} />
                </div>
            )}
        </div>
    );
}
