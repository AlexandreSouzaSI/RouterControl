import toast from 'react-hot-toast';
import { api } from '../services/api';

interface UploadBoxProps {
    onUploadSuccess: () => void;
}

export function UploadBox({ onUploadSuccess }: UploadBoxProps) {
    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.post('/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            toast.success('Arquivo processado com sucesso 🚀');
            onUploadSuccess();
        } catch (err: any) {
            const data = err.response?.data;
            toast.error(data?.message || 'Erro ao processar arquivo');
        }
    }

    return (
        <div className="mb-6 p-4 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111827]">
            <label className="cursor-pointer">
                <span className="text-sm">📤 Enviar arquivo</span>
                <input type="file" className="hidden" onChange={handleUpload} />
            </label>
        </div>
    );
}