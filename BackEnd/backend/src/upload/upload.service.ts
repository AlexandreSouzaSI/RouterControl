import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';

type Evento = {
    data: Date;
    cidade: string;
    latitude: string;
};

@Injectable()
export class UploadService {
    constructor(private prisma: PrismaService) { }

    async processarUpload(file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('Arquivo inválido');
        }

        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const placa = String(json[4]?.[22] || '')
            .substring(0, 3)
            .toUpperCase();

        if (!placa) {
            throw new BadRequestException('Placa inválida');
        }

        const caminhao = await this.prisma.caminhao.findFirst({
            where: {
                placa: {
                    startsWith: placa,
                },
            },
        });

        if (!caminhao) {
            throw new BadRequestException(`Caminhão ${placa} não encontrado`);
        }

        const regra = await this.prisma.truckRule.findFirst({
            where: {
                caminhaoId: caminhao.id,
            },
        });

        if (!regra) {
            throw new BadRequestException(
                `Regra do caminhão ${placa} não cadastrada`,
            );
        }

        const origem = this.normalizar(regra.origemViagem || 'BETIM');
        const destino = this.normalizar(regra.destinoViagem || 'SANTOS');
        const cidadeParado = this.normalizar(regra.cidadeParado || origem);

        const eventos: Evento[] = [];

        /**
         * IMPORTANTE:
         * Na planilha enviada, Latitude está na coluna T.
         * Índice da coluna T = 19.
         */
        const colunaData = 0;
        const colunaLocalizacao = 10;
        const colunaLatitude = this.encontrarColuna(json, 'Latitude', 19);

        for (let i = 15; i < json.length; i++) {
            const dataRaw = json[i][colunaData];
            const cidadeRaw = json[i][colunaLocalizacao];
            const latitudeRaw = json[i][colunaLatitude];

            if (!dataRaw || !cidadeRaw) continue;

            const data = this.parseData(dataRaw);

            if (!data) continue;

            eventos.push({
                data,
                cidade: this.normalizar(this.extrairCidade(cidadeRaw)),
                latitude: String(latitudeRaw || '').trim(),
            });
        }

        if (eventos.length === 0) {
            throw new BadRequestException('Nenhum evento válido encontrado');
        }

        eventos.sort((a, b) => a.data.getTime() - b.data.getTime());

        const primeiroEvento = eventos[0];
        const ultimoEvento = eventos[eventos.length - 1];

        const mes = `${primeiroEvento.data.getFullYear()}-${String(
            primeiroEvento.data.getMonth() + 1,
        ).padStart(2, '0')}`;

        const dataInicio = primeiroEvento.data;
        const dataFim = ultimoEvento.data;

        return this.prisma.$transaction(async (tx) => {
            const periodoExistente = await tx.uploadPeriod.findFirst({
                where: {
                    caminhaoId: caminhao.id,
                    periodo: mes,
                },
            });

            if (periodoExistente) {
                await tx.tripRecord.deleteMany({
                    where: { uploadPeriodId: periodoExistente.id },
                });

                await tx.stopRecord.deleteMany({
                    where: { uploadPeriodId: periodoExistente.id },
                });

                await tx.resumoOperacao.deleteMany({
                    where: {
                        caminhaoId: caminhao.id,
                        mes,
                    },
                });

                await tx.uploadPeriod.delete({
                    where: { id: periodoExistente.id },
                });
            }

            const uploadPeriod = await tx.uploadPeriod.create({
                data: {
                    periodo: mes,
                    dataInicio,
                    dataFim,
                    caminhaoId: caminhao.id,
                },
            });

            /**
             * VIAGEM:
             * 1. Caminhão estava parado na origem.
             * 2. Saiu da origem.
             * 3. Chegou no destino.
             */
            let numeroViagens = 0;
            let estavaNaOrigem = false;
            let saiuDaOrigem = false;
            const viagensSalvas: any[] = [];

            for (const evento of eventos) {
                const parado = this.estaParado(
                    evento.cidade,
                    evento.latitude,
                    cidadeParado,
                );

                const eventoNaOrigem =
                    evento.cidade.includes(origem) && parado;

                const eventoNoDestino = evento.cidade.includes(destino);

                if (eventoNaOrigem) {
                    estavaNaOrigem = true;
                    saiuDaOrigem = false;
                    continue;
                }

                if (estavaNaOrigem && !parado && !eventoNoDestino) {
                    saiuDaOrigem = true;
                    continue;
                }

                if (estavaNaOrigem && saiuDaOrigem && eventoNoDestino) {
                    numeroViagens++;

                    const viagem = await tx.tripRecord.create({
                        data: {
                            caminhaoId: caminhao.id,
                            uploadPeriodId: uploadPeriod.id,
                            dataHoraChegada: evento.data,
                            cidade: evento.cidade,
                            latitude: evento.latitude,
                        },
                    });

                    viagensSalvas.push(viagem);

                    estavaNaOrigem = false;
                    saiuDaOrigem = false;
                }
            }

            /**
             * PARADAS:
             * Entrou em Betim/Contagem com latitude -19.
             * Saiu quando deixou essa condição.
             */
            let inicioParada: Evento | null = null;
            let totalDiasParados = 0;
            const paradasSalvas: any[] = [];

            for (const evento of eventos) {
                const parado = this.estaParado(
                    evento.cidade,
                    evento.latitude,
                    cidadeParado,
                );

                if (parado && !inicioParada) {
                    inicioParada = evento;
                    continue;
                }

                if (!parado && inicioParada) {
                    const dias = this.calcularDiasParados(
                        inicioParada.data,
                        evento.data,
                    );

                    totalDiasParados += dias;

                    const parada = await tx.stopRecord.create({
                        data: {
                            caminhaoId: caminhao.id,
                            uploadPeriodId: uploadPeriod.id,
                            dataHoraEntrada: inicioParada.data,
                            dataHoraSaida: evento.data,
                            diasParados: dias,
                            cidadeEntrada: inicioParada.cidade,
                            latitudeEntrada: inicioParada.latitude,
                            cidadeSaida: evento.cidade,
                            latitudeSaida: evento.latitude,
                        },
                    });

                    paradasSalvas.push(parada);
                    inicioParada = null;
                }
            }

            let estado = 'EM_ROTA';

            if (
                this.estaParado(
                    ultimoEvento.cidade,
                    ultimoEvento.latitude,
                    cidadeParado,
                )
            ) {
                estado = `ESTA_EM_${cidadeParado}`;
            } else if (ultimoEvento.cidade.includes(destino)) {
                estado = `CHEGOU_EM_${destino}`;
            } else if (saiuDaOrigem) {
                estado = `SAIU_DE_${origem}`;
            }

            await tx.truckStatus.upsert({
                where: {
                    caminhaoId: caminhao.id,
                },
                update: {
                    ultimaCidade: ultimoEvento.cidade,
                    ultimaData: ultimoEvento.data,
                    estado,
                },
                create: {
                    caminhaoId: caminhao.id,
                    ultimaCidade: ultimoEvento.cidade,
                    ultimaData: ultimoEvento.data,
                    estado,
                },
            });

            const diasRodando = Math.max(
                this.diasNoMes(mes) - totalDiasParados,
                0,
            );

            const resumo = await tx.resumoOperacao.create({
                data: {
                    caminhaoId: caminhao.id,
                    mes,
                    numeroViagens,
                    diasParados: totalDiasParados,
                    diasRodando,
                    uploadId: null,
                },
            });

            return {
                placa,
                mes,
                regraUsada: {
                    origem,
                    destino,
                    cidadeParado,
                },
                periodoId: uploadPeriod.id,
                dataInicio,
                dataFim,
                numeroViagens,
                diasParados: totalDiasParados,
                diasRodando,
                statusFinal: estado,
                totalEventosLidos: eventos.length,
                totalViagensSalvas: viagensSalvas.length,
                totalParadasSalvas: paradasSalvas.length,
                resumo,
                viagens: viagensSalvas,
                paradas: paradasSalvas,
            };
        });
    }

    estaParado(cidade: string, latitude: string, cidadeParado: string) {
        const cidadeNormalizada = this.normalizar(cidade);
        const paradaNormalizada = this.normalizar(cidadeParado);

        const cidadeOk =
            cidadeNormalizada.includes(paradaNormalizada) ||
            cidadeNormalizada.includes('BETIM') ||
            cidadeNormalizada.includes('CONTAGEM');

        const latitudeOk = String(latitude || '').trim().startsWith('-19');

        return cidadeOk && latitudeOk;
    }

    calcularDiasParados(inicio: Date, fim: Date) {
        const inicioDia = new Date(inicio);
        inicioDia.setHours(0, 0, 0, 0);

        const fimDia = new Date(fim);
        fimDia.setHours(0, 0, 0, 0);

        const diferencaDias = Math.floor(
            (fimDia.getTime() - inicioDia.getTime()) /
            (1000 * 60 * 60 * 24),
        );

        if (diferencaDias > 0) {
            return diferencaDias;
        }

        const horasParado =
            (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60);

        /**
         * Para bater com sua análise:
         * paradas no mesmo dia só contam 1 dia se forem relevantes.
         * Ex: 9h parado conta.
         * Ex: 1h parado não conta.
         */
        return horasParado >= 7 ? 1 : 0;
    }

    parseData(valor: any): Date | null {
        if (!valor) return null;

        if (typeof valor === 'number') {
            const d = XLSX.SSF.parse_date_code(valor);

            if (!d) return null;

            return new Date(
                d.y,
                d.m - 1,
                d.d,
                d.H || 0,
                d.M || 0,
                d.S || 0,
            );
        }

        if (typeof valor === 'string') {
            const partesData = valor.split(' ')[0].split('/');
            const partesHora = valor.split(' ')[1]?.split(':');

            if (partesData.length === 3) {
                const [dia, mes, ano] = partesData;

                const hora = Number(partesHora?.[0] || 0);
                const minuto = Number(partesHora?.[1] || 0);
                const segundo = Number(partesHora?.[2] || 0);

                return new Date(
                    Number(ano),
                    Number(mes) - 1,
                    Number(dia),
                    hora,
                    minuto,
                    segundo,
                );
            }
        }

        return null;
    }

    extrairCidade(local: string): string {
        const partes = String(local).split(' - ');
        return partes[1] || local;
    }

    normalizar(texto: string) {
        return String(texto || '')
            .toUpperCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace('/MG', '')
            .replace('- MG', '')
            .replace('-', '')
            .trim();
    }

    diasNoMes(mes: string) {
        const [ano, mesNum] = mes.split('-').map(Number);
        return new Date(ano, mesNum, 0).getDate();
    }

    encontrarColuna(json: any[], nomeColuna: string, fallback: number) {
        for (let i = 0; i < Math.min(json.length, 20); i++) {
            const row = json[i];

            if (!Array.isArray(row)) continue;

            const index = row.findIndex(
                (cell) =>
                    String(cell || '')
                        .toUpperCase()
                        .trim() === nomeColuna.toUpperCase(),
            );

            if (index >= 0) {
                return index;
            }
        }

        return fallback;
    }
}