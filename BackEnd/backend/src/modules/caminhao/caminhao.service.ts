import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CaminhaoService {
    constructor(private prisma: PrismaService) { }

    async create(data: { placa: string }) {
        const placa = data.placa.toUpperCase();

        const existe = await this.prisma.caminhao.findUnique({
            where: { placa },
        });

        if (existe) {
            throw new BadRequestException('Caminhão já cadastrado');
        }

        return this.prisma.caminhao.create({
            data: { placa },
        });
    }

    findAll() {
        return this.prisma.caminhao.findMany({
            orderBy: { placa: 'asc' },
        });
    }

    findOne(id: string) {
        return this.prisma.caminhao.findUnique({
            where: { id },
        });
    }

    update(id: string, data: { placa?: string; ativo?: boolean }) {
        return this.prisma.caminhao.update({
            where: { id },
            data,
        });
    }

    remove(id: string) {
        return this.prisma.caminhao.delete({
            where: { id },
        });
    }
}