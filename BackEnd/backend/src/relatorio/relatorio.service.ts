import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RelatorioService {
    constructor(private prisma: PrismaService) { }

    async findAll(params: {
        placa?: string;
        mes?: string;
        dataInicio?: string;
        dataFim?: string;
        page?: number;
        limit?: number;
    }) {
        const { placa, mes, dataInicio, dataFim, page = 1, limit = 10 } = params;

        const skip = (page - 1) * limit;
        const where: any = {};

        if (placa) {
            where.caminhao = {
                placa: {
                    contains: placa.toUpperCase(),
                },
            };
        }

        if (mes) {
            where.periodo = mes;
        }

        const filtroData = this.criarFiltroData(dataInicio, dataFim);

        if (filtroData) {
            where.AND = [
                { dataFim: { gte: filtroData.inicio } },
                { dataInicio: { lte: filtroData.fim } },
            ];
        }

        const [periodos, total] = await Promise.all([
            this.prisma.uploadPeriod.findMany({
                where,
                include: {
                    caminhao: true,
                    trips: {
                        where: filtroData
                            ? {
                                dataHoraChegada: {
                                    gte: filtroData.inicio,
                                    lte: filtroData.fim,
                                },
                            }
                            : undefined,
                        orderBy: { dataHoraChegada: 'asc' },
                    },
                    stops: {
                        where: filtroData
                            ? {
                                OR: [
                                    {
                                        dataHoraEntrada: {
                                            gte: filtroData.inicio,
                                            lte: filtroData.fim,
                                        },
                                    },
                                    {
                                        dataHoraSaida: {
                                            gte: filtroData.inicio,
                                            lte: filtroData.fim,
                                        },
                                    },
                                    {
                                        AND: [
                                            {
                                                dataHoraEntrada: {
                                                    lte: filtroData.inicio,
                                                },
                                            },
                                            {
                                                dataHoraSaida: {
                                                    gte: filtroData.fim,
                                                },
                                            },
                                        ],
                                    },
                                ],
                            }
                            : undefined,
                        orderBy: { dataHoraEntrada: 'asc' },
                    },
                },
                skip,
                take: limit,
                orderBy: { dataInicio: 'desc' },
            }),
            this.prisma.uploadPeriod.count({ where }),
        ]);

        const data = periodos.map((periodo) => {
            const numeroViagens = periodo.trips.length;

            const diasParados = periodo.stops.reduce((acc, stop) => {
                if (!filtroData) return acc + stop.diasParados;

                return (
                    acc +
                    this.calcularDiasParadosDentroDoFiltro(
                        stop.dataHoraEntrada,
                        stop.dataHoraSaida,
                        filtroData.inicio,
                        filtroData.fim,
                    )
                );
            }, 0);

            const inicioCalculo = filtroData
                ? this.maiorData(periodo.dataInicio, filtroData.inicio)
                : periodo.dataInicio;

            const fimCalculo = filtroData
                ? this.menorData(periodo.dataFim, filtroData.fim)
                : periodo.dataFim;

            const diasRodando = Math.max(
                this.diasDoPeriodo(inicioCalculo, fimCalculo) - diasParados,
                0,
            );

            return {
                id: periodo.id,
                periodo: periodo.periodo,
                mes: periodo.periodo,
                dataInicio: periodo.dataInicio,
                dataFim: periodo.dataFim,

                dataInicioFiltro: inicioCalculo,
                dataFimFiltro: fimCalculo,

                caminhaoId: periodo.caminhaoId,
                caminhao: periodo.caminhao,

                numeroViagens,
                diasParados,
                diasRodando,

                viagens: periodo.trips,
                paradas: periodo.stops.map((stop) => ({
                    ...stop,
                    diasParadosFiltro: filtroData
                        ? this.calcularDiasParadosDentroDoFiltro(
                            stop.dataHoraEntrada,
                            stop.dataHoraSaida,
                            inicioCalculo,
                            fimCalculo,
                        )
                        : stop.diasParados,
                })),
            };
        });

        if (filtroData) {
            const agrupadoPorCaminhao = new Map<string, any>();

            for (const item of data) {
                const placa = item.caminhao.placa;

                if (!agrupadoPorCaminhao.has(placa)) {
                    agrupadoPorCaminhao.set(placa, {
                        id: item.caminhaoId,
                        periodo: 'PERIODO_ESPECIFICO',
                        mes: 'PERIODO_ESPECIFICO',
                        dataInicio: filtroData.inicio,
                        dataFim: filtroData.fim,
                        dataInicioFiltro: filtroData.inicio,
                        dataFimFiltro: filtroData.fim,
                        caminhaoId: item.caminhaoId,
                        caminhao: item.caminhao,
                        numeroViagens: 0,
                        diasParados: 0,
                        diasRodando: 0,
                        viagens: [],
                        paradas: [],
                    });
                }

                const atual = agrupadoPorCaminhao.get(placa);

                atual.numeroViagens += item.numeroViagens;
                atual.diasParados += item.diasParados;
                atual.viagens.push(...item.viagens);
                atual.paradas.push(...item.paradas);
            }

            const agrupados = Array.from(agrupadoPorCaminhao.values()).map(
                (item) => ({
                    ...item,
                    diasRodando: Math.max(
                        this.diasDoPeriodo(filtroData.inicio, filtroData.fim) -
                        item.diasParados,
                        0,
                    ),
                    viagens: item.viagens.sort(
                        (a: any, b: any) =>
                            new Date(a.dataHoraChegada).getTime() -
                            new Date(b.dataHoraChegada).getTime(),
                    ),
                    paradas: item.paradas.sort(
                        (a: any, b: any) =>
                            new Date(a.dataHoraEntrada).getTime() -
                            new Date(b.dataHoraEntrada).getTime(),
                    ),
                }),
            );

            return {
                data: agrupados,
                total: agrupados.length,
                page,
                lastPage: 1,
            };
        }

        return {
            data,
            total,
            page,
            lastPage: Math.ceil(total / limit),
        };
    }

    async getDashboard(params?: {
        placa?: string;
        mes?: string;
        dataInicio?: string;
        dataFim?: string;
    }) {
        const result = await this.findAll({
            placa: params?.placa,
            mes: params?.mes,
            dataInicio: params?.dataInicio,
            dataFim: params?.dataFim,
            page: 1,
            limit: 9999,
        });

        const dadosPorMes: any = {};

        const resumoOrdenado: any[] = [];

        for (const item of result.data) {
            const mes = item.periodo;

            resumoOrdenado.push({
                placa: item.caminhao.placa,
                mes: item.periodo,
                viagens: item.numeroViagens,
                diasParados: item.diasParados,
                diasRodando: item.diasRodando,
            });

            if (!dadosPorMes[mes]) {
                dadosPorMes[mes] = {
                    totalCaminhoes: new Set<string>(),
                    totalViagens: 0,
                    diasParados: 0,
                    diasRodando: 0,
                    rankingMap: new Map(),
                };
            }

            const mesData = dadosPorMes[mes];

            mesData.totalCaminhoes.add(item.caminhao.placa);

            mesData.totalViagens += item.numeroViagens;
            mesData.diasParados += item.diasParados;
            mesData.diasRodando += item.diasRodando;

            if (!mesData.rankingMap.has(item.caminhao.placa)) {
                mesData.rankingMap.set(item.caminhao.placa, {
                    placa: item.caminhao.placa,
                    caminhaoId: item.caminhaoId,
                    totalViagens: 0,
                    diasParados: 0,
                    diasRodando: 0,
                });
            }

            const ranking = mesData.rankingMap.get(
                item.caminhao.placa,
            );

            ranking.totalViagens += item.numeroViagens;
            ranking.diasParados += item.diasParados;
            ranking.diasRodando += item.diasRodando;
        }

        const meses = Object.keys(dadosPorMes).sort((a, b) =>
            a.localeCompare(b),
        );

        const dadosFormatados: any = {};

        for (const mes of meses) {
            const mesData = dadosPorMes[mes];

            const rankingArray = Array.from(
                mesData.rankingMap.values(),
            ).sort(
                (a: any, b: any) =>
                    b.totalViagens - a.totalViagens,
            );

            dadosFormatados[mes] = {
                totalCaminhoes:
                    mesData.totalCaminhoes.size,

                totalViagens:
                    mesData.totalViagens,

                diasParados:
                    mesData.diasParados,

                diasRodando:
                    mesData.diasRodando,

                ranking: rankingArray,
            };
        }

        // Ordena resumo por PLACA e depois por MÊS
        // Resumo: agrupa visualmente por placa e depois ordena os meses
        resumoOrdenado.sort((a, b) => {
            const placaCompare = a.placa.localeCompare(b.placa);

            if (placaCompare !== 0) return placaCompare;

            return a.mes.localeCompare(b.mes);
        });

        // Top Caminhões: usa somente o mês selecionado.
        // Se não tiver mês selecionado, usa o último mês disponível.
        const mesReferencia = params?.mes || meses[meses.length - 1];

        const topCaminhoes = Object.values(
            dadosFormatados[mesReferencia]?.ranking || [],
        )
            .map((item: any) => ({
                placa: item.placa,
                viagens: item.totalViagens,
                diasParados: item.diasParados,
                diasRodando: item.diasRodando,
            }))
            .sort((a: any, b: any) => b.viagens - a.viagens)
            .slice(0, 5);

        const ultimoMes =
            meses[meses.length - 1];

        const penultimoMes =
            meses[meses.length - 2];

        function crescimento(
            campo: string,
        ) {
            if (
                !ultimoMes ||
                !penultimoMes
            ) {
                return 0;
            }

            const atual =
                dadosFormatados[ultimoMes]?.[
                campo
                ] || 0;

            const anterior =
                dadosFormatados[penultimoMes]?.[
                campo
                ] || 0;

            if (anterior === 0) {
                if (atual === 0) return 0;
                return 100;
            }

            return (
                ((atual - anterior) /
                    anterior) *
                100
            );
        }

        return {
            meses,

            cards: {
                totalCaminhoes:
                    dadosFormatados[ultimoMes]
                        ?.totalCaminhoes || 0,

                totalViagens:
                    dadosFormatados[ultimoMes]
                        ?.totalViagens || 0,

                diasParados:
                    dadosFormatados[ultimoMes]
                        ?.diasParados || 0,

                diasRodando:
                    dadosFormatados[ultimoMes]
                        ?.diasRodando || 0,

                crescimento: {
                    totalCaminhoes:
                        crescimento(
                            'totalCaminhoes',
                        ),

                    totalViagens:
                        crescimento(
                            'totalViagens',
                        ),

                    diasParados:
                        crescimento(
                            'diasParados',
                        ),

                    diasRodando:
                        crescimento(
                            'diasRodando',
                        ),
                },
            },

            resumoOrdenado,

            topCaminhoes,

            dadosPorMes:
                dadosFormatados,
        };
    }

    async findOne(periodoId: string) {
        return this.prisma.uploadPeriod.findUnique({
            where: { id: periodoId },
            include: {
                caminhao: true,
                trips: {
                    orderBy: { dataHoraChegada: 'asc' },
                },
                stops: {
                    orderBy: { dataHoraEntrada: 'asc' },
                },
            },
        });
    }

    private criarFiltroData(dataInicio?: string, dataFim?: string) {
        if (!dataInicio || !dataFim) return null;

        const inicio = new Date(`${dataInicio}T00:00:00`);
        const fim = new Date(`${dataFim}T23:59:59`);

        return { inicio, fim };
    }

    private calcularDiasParadosDentroDoFiltro(
        entrada: Date,
        saida: Date | null,
        filtroInicio: Date,
        filtroFim: Date,
    ) {
        const inicioReal = new Date(entrada);
        const fimReal = saida ? new Date(saida) : filtroFim;

        const inicio = inicioReal > filtroInicio ? inicioReal : filtroInicio;
        const fim = fimReal < filtroFim ? fimReal : filtroFim;

        if (fim < inicio) return 0;

        const inicioDia = new Date(inicio);
        inicioDia.setHours(0, 0, 0, 0);

        const fimDia = new Date(fim);
        fimDia.setHours(0, 0, 0, 0);

        const diff = Math.floor(
            (fimDia.getTime() - inicioDia.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diff > 0) return diff;

        const horas = (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);

        return horas >= 7 ? 1 : 0;
    }

    private diasDoPeriodo(inicio: Date, fim: Date) {
        const dataInicio = new Date(inicio);
        dataInicio.setHours(0, 0, 0, 0);

        const dataFim = new Date(fim);
        dataFim.setHours(0, 0, 0, 0);

        const diff = dataFim.getTime() - dataInicio.getTime();

        return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
    }

    private maiorData(a: Date, b: Date) {
        return new Date(a).getTime() > new Date(b).getTime()
            ? new Date(a)
            : new Date(b);
    }

    private menorData(a: Date, b: Date) {
        return new Date(a).getTime() < new Date(b).getTime()
            ? new Date(a)
            : new Date(b);
    }
}