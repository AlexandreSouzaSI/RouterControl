import axios from 'axios';
import toast from 'react-hot-toast';
import { useState } from 'react';
import ConfigurarRegraModal from './RegraModal';

interface ModalData {
    caminhaoId: string;
    placa: string;
}

interface UploadBoxProps {
    onUploadSuccess: () => void;
}

export function UploadBox({ onUploadSuccess }: UploadBoxProps) {
    const [modal, setModal] = useState<ModalData | null>(null);

    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        const mes = '2024-03';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('mes', mes);

        try {
            await axios.post('http://localhost:3000/upload', formData);

            // Upload processado com sucesso
            toast.success('Arquivo processado com sucesso 🚀');
            onUploadSuccess();

        } catch (err: any) {
            const data = err.response?.data;

            // 🚛 Caminhão sem regra → abrir modal
            if (data?.caminhaoId && data?.placa) {
                setModal({
                    caminhaoId: data.caminhaoId,
                    placa: data.placa,
                });
                return;
            }

            toast.error(data?.message || 'Erro ao processar arquivo');
        }
    }

    return (
        <>
            <div className="mb-6 p-4 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111827]">
                <label className="cursor-pointer">
                    <span className="text-sm">📤 Enviar arquivo</span>
                    <input type="file" className="hidden" onChange={handleUpload} />
                </label>
            </div>

            {modal && (
                <ConfigurarRegraModal
                    placa={modal.placa}
                    caminhaoId={modal.caminhaoId}
                    onSuccess={() => {
                        toast.success('Regra criada! Agora pode reenviar o arquivo 🚀');
                        setModal(null);
                    }}
                    onClose={() => setModal(null)}
                />
            )}
        </>
    );
}