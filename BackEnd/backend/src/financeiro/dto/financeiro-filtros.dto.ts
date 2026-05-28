import { DirecaoTransacaoFinanceira } from '@prisma/client';

export class FinanceiroFiltrosDto {
    caminhaoId?: string;
    categoriaId?: string;
    direcao?: DirecaoTransacaoFinanceira;
    dataInicio?: string;
    dataFim?: string;
}