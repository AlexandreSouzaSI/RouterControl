import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegraCaminhaoService {
    constructor(private prisma: PrismaService) { }

    async criar(data: {
        caminhaoId: string;
        origemViagem?: string;
        destinoViagem?: string;
        cidadeParado?: string;
    }) {
        const { caminhaoId, origemViagem, destinoViagem, cidadeParado } = data;

        if (!caminhaoId) {
            throw new BadRequestException('caminhaoId é obrigatório');
        }

        // 🔍 valida se caminhão existe
        const caminhao = await this.prisma.caminhao.findUnique({
            where: { id: caminhaoId },
        });

        if (!caminhao) {
            throw new BadRequestException('Caminhão não encontrado');
        }

        return this.prisma.truckRule.upsert({
            where: {
                caminhaoId,
            },
            update: {
                origemViagem: origemViagem || null,
                destinoViagem: destinoViagem || null,
                cidadeParado: cidadeParado || null,
            },
            create: {
                caminhaoId,
                origemViagem: origemViagem || null,
                destinoViagem: destinoViagem || null,
                cidadeParado: cidadeParado || null,
            },
        });
    }

    async buscarPorCaminhao(caminhaoId: string) {
        return this.prisma.truckRule.findUnique({
            where: { caminhaoId },
        });
    }


}