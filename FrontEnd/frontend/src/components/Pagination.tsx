import { ChevronLeft, ChevronRight } from 'lucide-react';

// =============================================================================
// Paginação reutilizável — rodapé de tabela com "Página X de Y", navegação
// e escolha de quantos itens mostrar por página (20 ou 50). Usada nas listas
// que passaram a paginar no backend (NF de Entrada, NF de Serviço, Contas a
// Pagar) — o componente só controla a UI, quem chama decide o que fazer
// com onPageChange/onPageSizeChange (normalmente refazer o fetch).
// =============================================================================

type PaginationProps = {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
};

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    if (total === 0) return null;

    const inicio = (page - 1) * pageSize + 1;
    const fim = Math.min(page * pageSize, total);

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-800 text-sm">
            <p className="text-gray-500 dark:text-gray-400">
                Mostrando {inicio}–{fim} de {total}
            </p>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Por página</label>
                    <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        className="px-2 py-1 rounded-lg text-sm bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onPageChange(Math.max(1, page - 1))}
                        disabled={page <= 1}
                        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-400 px-2">
                        Página {page} de {totalPages}
                    </span>
                    <button
                        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                        className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent transition"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
