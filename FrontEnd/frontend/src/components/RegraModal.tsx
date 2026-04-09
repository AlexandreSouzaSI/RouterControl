import { useState } from 'react';
import axios from 'axios';

export default function ConfigurarRegraModal({
    placa,
    onSuccess,
}: any) {
    const [origemViagem, setOrigemViagem] = useState('');
    const [destinoViagem, setDestinoViagem] = useState('');
    const [cidadeParado, setCidadeParado] = useState('');
    const [loading, setLoading] = useState(false);

    async function salvarRegra() {
        try {
            setLoading(true);

            await axios.post('http://localhost:3000/regra-caminhao', {
                placa,
                origemViagem,
                destinoViagem,
                cidadeParado,
            });

            onSuccess();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Erro ao salvar regra');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
            <div className="w-full max-w-md bg-white dark:bg-[#111827] rounded-2xl shadow-xl p-6 space-y-4">

                <h2 className="text-xl font-bold">
                    🚛 Caminhão sem regra
                </h2>

                <p className="text-sm text-gray-500">
                    O caminhão <strong>{placa}</strong> foi criado automaticamente, mas ainda não possui regra.
                </p>

                <input
                    placeholder="Cidade Origem Viagem"
                    className="w-full border p-2 rounded-lg bg-transparent"
                    value={origemViagem}
                    onChange={(e) => setOrigemViagem(e.target.value)}
                />

                <input
                    placeholder="Cidade Destino Viagem"
                    className="w-full border p-2 rounded-lg bg-transparent"
                    value={destinoViagem}
                    onChange={(e) => setDestinoViagem(e.target.value)}
                />

                <input
                    placeholder="Cidade Parado"
                    className="w-full border p-2 rounded-lg bg-transparent"
                    value={cidadeParado}
                    onChange={(e) => setCidadeParado(e.target.value)}
                />

                <button
                    onClick={salvarRegra}
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition disabled:opacity-50"
                >
                    {loading ? 'Salvando...' : 'Salvar Regra'}
                </button>
            </div>
        </div>
    );
}