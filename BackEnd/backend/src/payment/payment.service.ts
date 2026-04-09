import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentService {
    constructor(private prisma: PrismaService) { }

    async gerarPagamento(caminhaoId: string, mes: string) {
        const resumo = await this.prisma.resumoOperacao.findFirst({
            where: {
                caminhaoId,
                mes,
            },
        });

        if (!resumo) {
            throw new Error('Resumo não encontrado');
        }

        const VALOR_POR_VIAGEM = 150;
        const VALOR_POR_DIA = 200;
        const DESCONTO_PARADO = 50;

        const valorViagens = resumo.numeroViagens * VALOR_POR_VIAGEM;
        const valorDias = resumo.diasRodando * VALOR_POR_DIA;
        const descontoParado = resumo.diasParados * DESCONTO_PARADO;

        const total = valorViagens + valorDias - descontoParado;

        const pagamento = await this.prisma.relatorioPagamento.upsert({
            where: {
                caminhaoId_mes: {
                    caminhaoId,
                    mes,
                },
            },
            update: {
                valorViagens,
                valorDias,
                descontoParado,
                total,
            },
            create: {
                caminhaoId,
                mes,
                valorViagens,
                valorDias,
                descontoParado,
                total,
            },
        });

        return pagamento;
    }
}