import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import * as XLSX from 'xlsx'

type Evento = {
    data: Date
    cidade: string
}

@Injectable()
export class UploadService {
    constructor(private prisma: PrismaService) { }

    async processarUpload(file: Express.Multer.File, mes: string) {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const json: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

        const placa = (json[4]?.[22] || '').substring(0, 3)

        if (!placa) throw new BadRequestException('Placa inválida')

        const caminhao = await this.prisma.caminhao.findFirst({
            where: { placa: { startsWith: placa } },
            include: { truckStatus: true },
        })

        if (!caminhao) throw new BadRequestException('Caminhão não encontrado')

        const regra = await this.prisma.truckRule.findFirst({
            where: { caminhaoId: caminhao.id },
        })

        if (!regra) throw new BadRequestException('Sem regra')

        await this.prisma.resumoOperacao.deleteMany({
            where: { caminhaoId: caminhao.id, mes },
        })

        const origem = this.normalizar(regra.origemViagem || '')
        const destino = this.normalizar(regra.destinoViagem || '')
        const parada = this.normalizar(regra.cidadeParado || '')

        const eventos: Evento[] = []

        for (let i = 15; i < json.length; i++) {
            const data = json[i][0]
            const local = json[i][10]

            if (!data || !local) continue

            const dataConvertida =
                typeof data === 'number'
                    ? XLSX.SSF.parse_date_code(data)
                    : new Date(data)

            const dataFinal =
                typeof data === 'number'
                    ? new Date(
                        dataConvertida.y,
                        dataConvertida.m - 1,
                        dataConvertida.d,
                        dataConvertida.H,
                        dataConvertida.M,
                    )
                    : new Date(data)

            if (isNaN(dataFinal.getTime())) continue

            eventos.push({
                data: dataFinal,
                cidade: this.normalizar(this.extrairCidade(local)),
            })
        }

        eventos.sort((a, b) => a.data.getTime() - b.data.getTime())

        // =========================
        // 🧠 ESTADO INICIAL (BANCO)
        // =========================
        let chegadaOrigem: Date | null = null
        let saiuOrigem: Date | null = null
        let chegadaParada: Date | null = null

        const status = caminhao.truckStatus

        if (status) {
            if (status.estado === 'em_viagem') {
                chegadaOrigem = status.ultimaData
                saiuOrigem = status.ultimaData
            }

            if (status.estado === 'parado') {
                chegadaParada = status.ultimaData
            }
        }

        // =========================
        // 🚚 VIAGENS
        // =========================
        let numeroViagens = 0

        for (const evento of eventos) {
            if (evento.cidade === origem) {
                chegadaOrigem = evento.data
                saiuOrigem = null
                continue
            }

            if (chegadaOrigem && !saiuOrigem && evento.cidade !== origem) {
                saiuOrigem = evento.data
                continue
            }

            if (
                evento.cidade === destino &&
                chegadaOrigem &&
                saiuOrigem
            ) {
                numeroViagens++
                chegadaOrigem = null
                saiuOrigem = null
            }
        }

        // =========================
        // 🅿️ PARADO
        // =========================
        let totalDiasParado = 0

        for (const evento of eventos) {
            if (evento.cidade === parada) {
                if (!chegadaParada) chegadaParada = evento.data
                continue
            }

            if (chegadaParada && evento.cidade !== parada) {
                const diffHoras =
                    (evento.data.getTime() - chegadaParada.getTime()) /
                    (1000 * 60 * 60)

                if (diffHoras >= 6) {
                    const diffDias =
                        (evento.data.getTime() - chegadaParada.getTime()) /
                        (1000 * 60 * 60 * 24)

                    totalDiasParado += Math.floor(diffDias)
                }

                chegadaParada = null
            }
        }

        // =========================
        // 📅 FINAL DO MÊS (SALVAR ESTADO)
        // =========================
        const ultimoEvento = eventos[eventos.length - 1]

        let estadoFinal = 'livre'

        if (ultimoEvento.cidade === parada) {
            estadoFinal = 'parado'
        } else if (ultimoEvento.cidade !== origem) {
            estadoFinal = 'em_viagem'
        }

        await this.prisma.truckStatus.upsert({
            where: { caminhaoId: caminhao.id },
            update: {
                ultimaCidade: ultimoEvento.cidade,
                ultimaData: ultimoEvento.data,
                estado: estadoFinal,
            },
            create: {
                caminhaoId: caminhao.id,
                ultimaCidade: ultimoEvento.cidade,
                ultimaData: ultimoEvento.data,
                estado: estadoFinal,
            },
        })

        const diasRodando = this.diasNoMes(mes) - totalDiasParado

        await this.prisma.resumoOperacao.create({
            data: {
                caminhaoId: caminhao.id,
                mes,
                numeroViagens,
                diasParados: totalDiasParado,
                diasRodando,
            },
        })

        return {
            numeroViagens,
            diasParados: totalDiasParado,
            diasRodando,
        }
    }

    extrairCidade(local: string): string {
        const partes = local.split(' - ')
        return partes[1] || local
    }

    normalizar(texto: string): string {
        return (texto || '')
            .toUpperCase()
            .replace('/MG', '')
            .replace('- MG', '')
            .replace('-', '')
            .trim()
    }

    diasNoMes(mes: string) {
        const [ano, mesNum] = mes.split('-').map(Number)
        return new Date(ano, mesNum, 0).getDate()
    }
}