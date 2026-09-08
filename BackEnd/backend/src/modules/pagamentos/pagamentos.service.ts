import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PagamentosService {
    constructor(private prisma: PrismaService) { }

    async getConfig() {
        const config =
            await this.prisma.configuracaoPagamentoMotorista.findFirst();

        if (config) return config;

        return this.prisma.configuracaoPagamentoMotorista.create({
            data: {
                salarioBase: 3352,
                valorDiaria: 200,
                valorPorViagem: 150,
                bonusMetaViagens: 1500,
                metaViagens: 7,
                diasBaseSalario: 30,
                adiantamento: 3000,
            },
        });
    }

    async updateConfig(data: {
        salarioBase?: number;
        valorDiaria?: number;
        valorPorViagem?: number;
        bonusMetaViagens?: number;
        metaViagens?: number;
        diasBaseSalario?: number;
        adiantamento?: number;
    }) {
        const config = await this.getConfig();

        return this.prisma.configuracaoPagamentoMotorista.update({
            where: {
                id: config.id,
            },
            data: {
                salarioBase: data.salarioBase,
                valorDiaria: data.valorDiaria,
                valorPorViagem: data.valorPorViagem,
                bonusMetaViagens: data.bonusMetaViagens,
                metaViagens: data.metaViagens,
                diasBaseSalario: data.diasBaseSalario,
                adiantamento: data.adiantamento,
            },
        });
    }

    async getConfigCaminhoes() {
        const caminhoes =
            await this.prisma.caminhao.findMany({
                include: {
                    configPagamento: true,
                },
                orderBy: {
                    placa: 'asc',
                },
            });

        return caminhoes.map((caminhao) => ({
            id: caminhao.id,
            placa: caminhao.placa,
            ativo: caminhao.ativo,

            config:
                caminhao.configPagamento || {
                    tipoCalculo: 'TRADICIONAL',
                    percentualFaturamento: 2,
                    valorDiariaOverride: null,
                    ativo: true,
                },
        }));
    }

    async updateConfigCaminhao(
        caminhaoId: string,
        data: {
            tipoCalculo?:
            | 'TRADICIONAL'
            | 'FATURAMENTO';

            percentualFaturamento?: number;

            valorDiariaOverride?: number | null;

            ativo?: boolean;
        },
    ) {
        const existente =
            await this.prisma.configuracaoPagamentoCaminhao.findUnique(
                {
                    where: {
                        caminhaoId,
                    },
                },
            );

        if (!existente) {
            return this.prisma.configuracaoPagamentoCaminhao.create(
                {
                    data: {
                        caminhaoId,

                        tipoCalculo:
                            data.tipoCalculo ||
                            'TRADICIONAL',

                        percentualFaturamento:
                            data.percentualFaturamento ??
                            2,

                        valorDiariaOverride:
                            data.valorDiariaOverride,

                        ativo:
                            data.ativo ?? true,
                    },
                },
            );
        }

        return this.prisma.configuracaoPagamentoCaminhao.update(
            {
                where: {
                    caminhaoId,
                },
                data,
            },
        );
    }

    async calcular(params: {
        placa?: string;
        mes?: string;
        dataInicio?: string;
        dataFim?: string;
        adiantamento?: number;
        faturamentoBruto?: number;
    }) {
        const config = await this.getConfig();

        const periodo = this.definirPeriodo(params);

        const caminhoes = await this.prisma.caminhao.findMany({
            where: params.placa
                ? {
                    placa: {
                        contains: params.placa.toUpperCase(),
                    },
                }
                : {},
            orderBy: {
                placa: 'asc',
            },
        });

        const resultados: any[] = [];

        for (const caminhao of caminhoes) {
            const configCaminhao =
                await this.prisma.configuracaoPagamentoCaminhao.findUnique(
                    {
                        where: {
                            caminhaoId: caminhao.id,
                        },
                    },
                );

            const viagens = await this.prisma.tripRecord.findMany({
                where: {
                    caminhaoId: caminhao.id,
                    dataHoraChegada: {
                        gte: periodo.inicio,
                        lte: periodo.fim,
                    },
                },
                orderBy: {
                    dataHoraChegada: 'asc',
                },
            });

            const paradas = await this.prisma.stopRecord.findMany({
                where: {
                    caminhaoId: caminhao.id,
                    OR: [
                        {
                            dataHoraEntrada: {
                                gte: periodo.inicio,
                                lte: periodo.fim,
                            },
                        },
                        {
                            dataHoraSaida: {
                                gte: periodo.inicio,
                                lte: periodo.fim,
                            },
                        },
                        {
                            AND: [
                                {
                                    dataHoraEntrada: {
                                        lte: periodo.inicio,
                                    },
                                },
                                {
                                    dataHoraSaida: {
                                        gte: periodo.fim,
                                    },
                                },
                            ],
                        },
                    ],
                },
                orderBy: {
                    dataHoraEntrada: 'asc',
                },
            });

            const numeroViagens = viagens.length;

            const diasParados = paradas.reduce((acc, parada) => {
                return (
                    acc +
                    this.calcularDiasParadosDentroDoFiltro(
                        parada.dataHoraEntrada,
                        parada.dataHoraSaida,
                        periodo.inicio,
                        periodo.fim,
                    )
                );
            }, 0);

            const diasPeriodo = this.diasDoPeriodo(
                periodo.inicio,
                periodo.fim,
            );

            const diasRodando = Math.max(diasPeriodo - diasParados, 0);

            const salario =
                periodo.tipo === 'MES_COMPLETO'
                    ? config.salarioBase
                    : (config.salarioBase / config.diasBaseSalario) *
                    diasPeriodo;

            const diariaUtilizada =
                configCaminhao?.valorDiariaOverride ??
                config.valorDiaria;

            const valorDiarias =
                diasRodando * diariaUtilizada;

            let valorViagens = 0;

            const tipoCalculo =
                configCaminhao?.tipoCalculo ||
                'TRADICIONAL';

            if (tipoCalculo === 'TRADICIONAL') {
                valorViagens =
                    numeroViagens *
                    config.valorPorViagem;
            }

            if (
                tipoCalculo === 'FATURAMENTO'
            ) {
                const percentual =
                    configCaminhao?.percentualFaturamento ||
                    2;

                valorViagens =
                    ((params.faturamentoBruto || 0) *
                        percentual) /
                    100;
            }

            const ganhouBonusMeta =
                numeroViagens >= config.metaViagens;

            const valorBonusMeta = ganhouBonusMeta
                ? config.bonusMetaViagens
                : 0;

            // ADIANTAMENTO
            const adiantamento =
                params.adiantamento !== undefined
                    ? Number(params.adiantamento)
                    : Number(config.adiantamento || 0);

            const cenarios = [0, 500, 1000].map(
                (bonusManual) => {
                    const subtotal =
                        salario +
                        valorDiarias +
                        valorViagens +
                        valorBonusMeta +
                        bonusManual;

                    const total =
                        subtotal - adiantamento;

                    return {
                        bonusManual,
                        subtotal,
                        adiantamento,
                        total,
                    };
                },
            );

            resultados.push({
                caminhaoId: caminhao.id,
                placa: caminhao.placa,

                periodo: {
                    tipo: periodo.tipo,
                    mes: params.mes || null,
                    dataInicio: periodo.inicio,
                    dataFim: periodo.fim,
                    diasPeriodo,
                },

                operacional: {
                    numeroViagens,
                    diasParados,
                    diasRodando,
                },

                calculo: {
                    salario,
                    salarioBase: config.salarioBase,

                    valorDiaria: config.valorDiaria,
                    diariaUtilizada,
                    valorDiarias,

                    valorPorViagem:
                        config.valorPorViagem,

                    valorViagens,
                    tipoCalculo,

                    faturamentoBruto:
                        params.faturamentoBruto || 0,

                    percentualFaturamento:
                        configCaminhao?.percentualFaturamento ||
                        0,

                    metaViagens:
                        config.metaViagens,

                    bonusMetaViagens:
                        config.bonusMetaViagens,

                    ganhouBonusMeta,

                    valorBonusMeta,

                    adiantamento,
                },

                cenarios,
            });
        }

        return {
            config,
            resultados,
        };
    }

    private definirPeriodo(params: {
        mes?: string;
        dataInicio?: string;
        dataFim?: string;
    }) {
        if (params.dataInicio && params.dataFim) {
            return {
                tipo: 'PERIODO_ESPECIFICO',
                inicio: new Date(`${params.dataInicio}T00:00:00`),
                fim: new Date(`${params.dataFim}T23:59:59`),
            };
        }

        if (params.mes) {
            const [ano, mes] = params.mes.split('-').map(Number);

            const inicio = new Date(
                ano,
                mes - 1,
                1,
                0,
                0,
                0,
            );

            const fim = new Date(
                ano,
                mes,
                0,
                23,
                59,
                59,
            );

            return {
                tipo: 'MES_COMPLETO',
                inicio,
                fim,
            };
        }

        throw new BadRequestException(
            'Informe um mês ou dataInicio/dataFim',
        );
    }

    private calcularDiasParadosDentroDoFiltro(
        entrada: Date,
        saida: Date | null,
        filtroInicio: Date,
        filtroFim: Date,
    ) {
        const inicioReal = new Date(entrada);

        const fimReal = saida
            ? new Date(saida)
            : filtroFim;

        const inicio =
            inicioReal > filtroInicio
                ? inicioReal
                : filtroInicio;

        const fim =
            fimReal < filtroFim
                ? fimReal
                : filtroFim;

        if (fim < inicio) return 0;

        const inicioDia = new Date(inicio);
        inicioDia.setHours(0, 0, 0, 0);

        const fimDia = new Date(fim);
        fimDia.setHours(0, 0, 0, 0);

        const diff = Math.floor(
            (fimDia.getTime() -
                inicioDia.getTime()) /
            (1000 * 60 * 60 * 24),
        );

        if (diff > 0) return diff;

        const horas =
            (fim.getTime() - inicio.getTime()) /
            (1000 * 60 * 60);

        return horas >= 7 ? 1 : 0;
    }

    private diasDoPeriodo(
        inicio: Date,
        fim: Date,
    ) {
        const dataInicio = new Date(inicio);

        dataInicio.setHours(0, 0, 0, 0);

        const dataFim = new Date(fim);

        dataFim.setHours(0, 0, 0, 0);

        const diff =
            dataFim.getTime() -
            dataInicio.getTime();

        return (
            Math.floor(
                diff / (1000 * 60 * 60 * 24),
            ) + 1
        );
    }
}