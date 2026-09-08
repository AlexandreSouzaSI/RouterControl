import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
    const { autenticado, carregando } = useAuth();

    if (carregando) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0B1120]">
                <LoaderCircle className="animate-spin text-gray-400" size={28} />
            </div>
        );
    }

    if (!autenticado) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}
