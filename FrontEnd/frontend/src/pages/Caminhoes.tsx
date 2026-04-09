import { useEffect, useState } from 'react';
import { api } from '../services/api';

type Caminhao = {
    id: string;
    placa: string;
};

type Regra = {
    id?: string;
    caminhaoId: string;
    origemViagem?: string;
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

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-bold">
                Configuração de Caminhões
            </h1>

            {/* CRIAR CAMINHÃO */}
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Placa (ex: QPM1234)"
                    className="border rounded px-3 py-2"
                    value={novaPlaca}
                    onChange={(e) =>
                        setNovaPlaca(e.target.value.toUpperCase())
                    }
                />

                <button
                    onClick={criarCaminhao}
                    className="bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700"
                >
                    Criar
                </button>
            </div>

            {/* CARDS CAMINHÕES */}
            <div>
                <h2 className="font-semibold mb-2">Caminhões</h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {caminhoes.map((c) => (
                        <div
                            key={c.id}
                            onClick={() => setSelected(c.id)}
                            className={`cursor-pointer border rounded-xl p-4 text-center shadow-sm transition 
                            ${selected === c.id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white hover:bg-gray-100'
                                }`}
                        >
                            🚚 {c.placa}
                        </div>
                    ))}
                </div>
            </div>

            {/* FORM REGRA */}
            {regra && !loading && (
                <div className="bg-white rounded-2xl shadow p-6 max-w-xl space-y-4">
                    <h2 className="text-lg font-semibold">
                        Editar Regra
                    </h2>

                    <div>
                        <label className="block mb-1 font-medium">
                            Origem da Viagem
                        </label>
                        <input
                            type="text"
                            className="border rounded px-3 py-2 w-full"
                            placeholder="Ex: BETIM"
                            value={regra.origemViagem || ''}
                            onChange={(e) =>
                                setRegra({
                                    ...regra,
                                    origemViagem: e.target.value.toUpperCase(),
                                })
                            }
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium">
                            Destino da Viagem
                        </label>
                        <input
                            type="text"
                            className="border rounded px-3 py-2 w-full"
                            placeholder="Ex: SANTOS"
                            value={regra.destinoViagem || ''}
                            onChange={(e) =>
                                setRegra({
                                    ...regra,
                                    destinoViagem: e.target.value.toUpperCase(),
                                })
                            }
                        />
                    </div>

                    <div>
                        <label className="block mb-1 font-medium">
                            Cidade considerada parada
                        </label>
                        <input
                            type="text"
                            className="border rounded px-3 py-2 w-full"
                            placeholder="Ex: GOIAS"
                            value={regra.cidadeParado || ''}
                            onChange={(e) =>
                                setRegra({
                                    ...regra,
                                    cidadeParado: e.target.value.toUpperCase(),
                                })
                            }
                        />
                    </div>

                    <button
                        onClick={salvar}
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700"
                    >
                        Salvar Regra
                    </button>
                </div>
            )}
        </div>
    );
}