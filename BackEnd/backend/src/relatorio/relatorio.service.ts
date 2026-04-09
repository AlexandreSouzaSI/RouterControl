import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RelatorioService {
    constructor(private prisma: PrismaService) { }

    async findAll(params: {
        placa?: string;
        page?: number;
        limit?: number;
    }) {
        const { placa, page = 1, limit = 10 } = params;

        const skip = (page - 1) * limit;

        const where = placa
            ? {
                caminhao: {
                    is: {
                        placa: {
                            contains: placa.toUpperCase(),
                        },
                    },
                },
            }
            : {};

        const [data, total] = await Promise.all([
            this.prisma.resumoOperacao.findMany({
                where,
                include: {
                    caminhao: true,
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),

            this.prisma.resumoOperacao.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            lastPage: Math.ceil(total / limit),
        };
    }

    async getDashboard() {
        type RankingItem = {
            placa: string;
            total: number;
            diasParados: number;
            diasRodando: number;
        };

        const registros = await this.prisma.resumoOperacao.findMany({
            include: {
                caminhao: true,
            },
        });

        const dadosPorMes: any = {};

        registros.forEach((r) => {
            const mes = r.mes;

            if (!dadosPorMes[mes]) {
                dadosPorMes[mes] = {
                    totalCaminhoes: new Set(),
                    totalViagens: 0,
                    diasParados: 0,
                    diasRodando: 0,
                    rankingMap: new Map<string, RankingItem>(),
                };
            }

            const mesData = dadosPorMes[mes];

            mesData.totalCaminhoes.add(r.caminhao.placa);
            mesData.totalViagens += r.numeroViagens;
            mesData.diasParados += r.diasParados;
            mesData.diasRodando += r.diasRodando;

            if (!mesData.rankingMap.has(r.caminhao.placa)) {
                mesData.rankingMap.set(r.caminhao.placa, {
                    placa: r.caminhao.placa,
                    total: 0,
                    diasParados: 0,
                    diasRodando: 0,
                });
            }

            const item = mesData.rankingMap.get(r.caminhao.placa);

            item.total += r.numeroViagens;
            item.diasParados += r.diasParados;
            item.diasRodando += r.diasRodando;
        });

        // ✅ ORDENAÇÃO CORRETA DE MÊS (ANO + MÊS)
        const meses = Object.keys(dadosPorMes).sort((a, b) => {
            const [mesA, anoA] = a.split('/').map(Number);
            const [mesB, anoB] = b.split('/').map(Number);

            if (anoA !== anoB) return anoA - anoB;
            return mesA - mesB;
        });

        const dadosFormatados: any = {};

        meses.forEach((mes) => {
            const mesData = dadosPorMes[mes];

            const rankingArray: RankingItem[] = Array.from(
                mesData.rankingMap.values()
            );

            dadosFormatados[mes] = {
                totalCaminhoes: mesData.totalCaminhoes.size,
                totalViagens: mesData.totalViagens,
                diasParados: mesData.diasParados,
                diasRodando: mesData.diasRodando,
                ranking: rankingArray
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 5),
            };
        });

        return {
            meses,
            dadosPorMes: dadosFormatados,
        };
    }
}