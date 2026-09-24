import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CaminhaoService {
    constructor(private prisma: PrismaService) { }

    // Filtro usado em toda leitura: mostra os caminhões da empresa logada
    // e, transitoriamente, os que ainda não têm empresa definida (registros
    // de antes do retrofit multi-empresa). Isso evita que a lista suma pra
    // quem ainda não rodou o backfill de empresaId — depois que todo
    // caminhão tiver empresa, a segunda condição nunca mais bate.
    private filtroEmpresa(empresaId: string) {
        return { OR: [{ empresaId }, { empresaId: null }] };
    }

    async create(data: { placa: string }, empresaId: string) {
        const placa = data.placa.toUpperCase();

        const existe = await this.prisma.caminhao.findUnique({
            where: { placa },
        });

        if (existe) {
            throw new BadRequestException('Caminhão já cadastrado');
        }

        return this.prisma.caminhao.create({
            data: { placa, empresaId },
        });
    }

    findAll(empresaId: string) {
        return this.prisma.caminhao.findMany({
            where: this.filtroEmpresa(empresaId),
            orderBy: { placa: 'asc' },
        });
    }

    private async encontrarOuFalhar(id: string, empresaId: string) {
        const caminhao = await this.prisma.caminhao.findFirst({
            where: { id, ...this.filtroEmpresa(empresaId) },
        });

        if (!caminhao) {
            throw new NotFoundException('Caminhão não encontrado');
        }

        // Grandfathering: se o caminhão ainda não tem empresa, a primeira
        // empresa que mexer nele "adota" (evita ficar solto pra sempre).
        if (!caminhao.empresaId) {
            return this.prisma.caminhao.update({
                where: { id },
                data: { empresaId },
            });
        }

        return caminhao;
    }

    async findOne(id: string, empresaId: string) {
        return this.encontrarOuFalhar(id, empresaId);
    }

    async update(
        id: string,
        data: {
            placa?: string;
            ativo?: boolean;
        },
        empresaId: string,
    ) {
        await this.encontrarOuFalhar(id, empresaId);

        return this.prisma.caminhao.update({
            where: { id },
            data: {
                placa: data.placa
                    ? data.placa.toUpperCase()
                    : undefined,
                ativo: data.ativo,
            },
        });
    }

    async removePeriodo(caminhaoId: string, mes: string, empresaId: string) {
        await this.encontrarOuFalhar(caminhaoId, empresaId);

        const periodo = await this.prisma.uploadPeriod.findFirst({
            where: { caminhaoId, periodo: mes },
        });

        // Apaga o resumo do mês. TripRecord/StopRecord são apagados
        // automaticamente junto com o UploadPeriod (cascade no schema).
        await this.prisma.resumoOperacao.deleteMany({
            where: { caminhaoId, mes },
        });

        if (periodo) {
            await this.prisma.uploadPeriod.delete({
                where: { id: periodo.id },
            });
        }

        return { ok: true };
    }

    async remove(id: string, empresaId: string) {
        await this.encontrarOuFalhar(id, empresaId);

        await this.prisma.tripRecord.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.stopRecord.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.resumoOperacao.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.uploadPeriod.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.truckStatus.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.truckRule.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.upload.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.relatorioPagamento.deleteMany({
            where: { caminhaoId: id },
        });

        return this.prisma.caminhao.delete({
            where: { id },
        });
    }

    async getTimeline(id: string, empresaId: string) {
        await this.encontrarOuFalhar(id, empresaId);

        const caminhao = await this.prisma.caminhao.findUnique({
            where: { id },
            include: {
                tripRecords: { orderBy: { dataHoraChegada: 'asc' } },
                stopRecords: { orderBy: { dataHoraEntrada: 'asc' } },
            },
        });

        if (!caminhao) {
            throw new BadRequestException('Caminhão não encontrado');
        }

        let contadorViagem = 0;
        let acumuladoDiasParados = 0;

        const totalDiasParados = caminhao.stopRecords.reduce(
            (acc, stop) => acc + stop.diasParados,
            0,
        );

        const timeline = [
            ...caminhao.stopRecords.flatMap((stop) => {
                const eventos: any[] = [
                    {
                        date: stop.dataHoraEntrada,
                        label: `Chegou em ${stop.cidadeEntrada}`,
                        type: 'arrival',
                        extra: null,
                    },
                ];

                if (stop.dataHoraSaida) {
                    acumuladoDiasParados += stop.diasParados;

                    eventos.push({
                        date: stop.dataHoraSaida,
                        label: `Saiu de ${stop.cidadeEntrada}`,
                        type: 'departure',
                        extra:
                            stop.diasParados > 0
                                ? `${stop.diasParados} ${stop.diasParados > 1
                                    ? 'dias parados'
                                    : 'dia parado'
                                } — acumulado ${acumuladoDiasParados}/${totalDiasParados}`
                                : '0 dia parado',
                    });
                }

                return eventos;
            }),

            ...caminhao.tripRecords.map((trip) => {
                contadorViagem++;

                return {
                    date: trip.dataHoraChegada,
                    label: `Chegou em ${trip.cidade}`,
                    type: 'arrival',
                    extra: `Viagem #${contadorViagem}`,
                };
            }),
        ];

        return timeline.sort(
            (a, b) =>
                new Date(a.date).getTime() -
                new Date(b.date).getTime(),
        );
    }
}
