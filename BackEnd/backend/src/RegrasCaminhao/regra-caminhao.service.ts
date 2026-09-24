import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegraCaminhaoService {
    constructor(private prisma: PrismaService) { }

    async criar(empresaId: string, data: {
        caminhaoId: string;
        origemViagem?: string;
        origemViagem2?: string;
        destinoViagem?: string;
        cidadeParado?: string;
    }) {
        const {
            caminhaoId,
            origemViagem,
            origemViagem2,
            destinoViagem,
            cidadeParado,
        } = data;

        if (!caminhaoId) {
            throw new BadRequestException('caminhaoId é obrigatório');
        }

        // 🔍 valida se o caminhão existe E pertence à empresa de quem tá
        // chamando — sem isso, dava pra reescrever a regra de rota de
        // outro caminhão (de outra empresa) só sabendo o id dele.
        const caminhao = await this.prisma.caminhao.findFirst({
            where: { id: caminhaoId, empresaId },
        });

        if (!caminhao) {
            throw new NotFoundException('Caminhão não encontrado nessa empresa');
        }

        return this.prisma.truckRule.upsert({
            where: {
                caminhaoId,
            },
            update: {
                origemViagem: origemViagem || null,
                origemViagem2: origemViagem2 || null,
                destinoViagem: destinoViagem || null,
                cidadeParado: cidadeParado || null,
            },
            create: {
                caminhaoId,
                origemViagem: origemViagem || null,
                origemViagem2: origemViagem2 || null,
                destinoViagem: destinoViagem || null,
                cidadeParado: cidadeParado || null,
            },
        });
    }

    async buscarPorCaminhao(empresaId: string, caminhaoId: string) {
        const caminhao = await this.prisma.caminhao.findFirst({
            where: { id: caminhaoId, empresaId },
        });

        if (!caminhao) {
            throw new NotFoundException('Caminhão não encontrado nessa empresa');
        }

        return this.prisma.truckRule.findUnique({
            where: { caminhaoId },
        });
    }
}
