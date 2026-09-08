import { Injectable, NotFoundException } from '@nestjs/common';
import {
    DirecaoTransacaoFinanceira,
    Prisma,
    StatusTransacaoFinanceira,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceiroFiltrosDto } from './dto/financeiro-filtros.dto';
import { CreateCategoriaFinanceiraDto } from './dto/create-categoria-financeira.dto';
import { ClassificarTransacaoDto } from './dto/classificar-transacao.dto';
import * as XLSX from 'xlsx';
import { CreateRegraClassificacaoDto } from './dto/create-regra-classificacao.dto';

@Injectable()
export class FinanceiroService {
    constructor(private readonly prisma: PrismaService) { }

    private montarWhere(filtros: FinanceiroFiltrosDto): Prisma.TransacaoFinanceiraWhereInput {
        const where: Prisma.TransacaoFinanceiraWhereInput = {};

        if (filtros.caminhaoId) {
            where.caminhaoId = filtros.caminhaoId;
        }

        if (filtros.categoriaId) {
            where.categoriaId = filtros.categoriaId;
        }

        if (filtros.direcao) {
            where.direcao = filtros.direcao;
        }

        if (filtros.dataInicio || filtros.dataFim) {
            where.data = {};

            if (filtros.dataInicio) {
                where.data.gte = new Date(filtros.dataInicio);
            }

            if (filtros.dataFim) {
                const dataFim = new Date(filtros.dataFim);
                dataFim.setHours(23, 59, 59, 999);
                where.data.lte = dataFim;
            }
        }

        return where;
    }

    async listarTransacoes(filtros: FinanceiroFiltrosDto) {
        const where = this.montarWhere(filtros);

        return this.prisma.transacaoFinanceira.findMany({
            where,
            include: {
                caminhao: true,
                categoria: true,
                importacao: true,
            },
            orderBy: {
                data: 'desc',
            },
        });
    }

    async resumo(filtros: FinanceiroFiltrosDto) {
        const where = this.montarWhere(filtros);

        const transacoes = await this.prisma.transacaoFinanceira.findMany({
            where,
            include: {
                caminhao: true,
                categoria: true,
            },
            orderBy: {
                data: 'desc',
            },
        });

        const totalEntradas = transacoes
            .filter((item) => item.direcao === DirecaoTransacaoFinanceira.ENTRADA)
            .reduce((acc, item) => acc + Number(item.valor), 0);

        const totalSaidas = transacoes
            .filter((item) => item.direcao === DirecaoTransacaoFinanceira.SAIDA)
            .reduce((acc, item) => acc + Number(item.valor), 0);

        const saldo = totalEntradas - totalSaidas;

        const porCaminhao = new Map<string, {
            caminhaoId: string | null;
            placa: string;
            entradas: number;
            saidas: number;
            saldo: number;
        }>();

        const porCategoria = new Map<string, {
            categoriaId: string | null;
            nome: string;
            entradas: number;
            saidas: number;
            saldo: number;
        }>();

        for (const item of transacoes) {
            const valor = Number(item.valor);
            const isEntrada = item.direcao === DirecaoTransacaoFinanceira.ENTRADA;

            const caminhaoKey = item.caminhaoId ?? 'SEM_CAMINHAO';
            if (!porCaminhao.has(caminhaoKey)) {
                porCaminhao.set(caminhaoKey, {
                    caminhaoId: item.caminhaoId,
                    placa: item.caminhao?.placa ?? 'Sem caminhão',
                    entradas: 0,
                    saidas: 0,
                    saldo: 0,
                });
            }

            const caminhaoResumo = porCaminhao.get(caminhaoKey)!;
            if (isEntrada) caminhaoResumo.entradas += valor;
            else caminhaoResumo.saidas += valor;
            caminhaoResumo.saldo = caminhaoResumo.entradas - caminhaoResumo.saidas;

            const categoriaKey = item.categoriaId ?? 'SEM_CATEGORIA';
            if (!porCategoria.has(categoriaKey)) {
                porCategoria.set(categoriaKey, {
                    categoriaId: item.categoriaId,
                    nome: item.categoria?.nome ?? 'Sem categoria',
                    entradas: 0,
                    saidas: 0,
                    saldo: 0,
                });
            }

            const categoriaResumo = porCategoria.get(categoriaKey)!;
            if (isEntrada) categoriaResumo.entradas += valor;
            else categoriaResumo.saidas += valor;
            categoriaResumo.saldo = categoriaResumo.entradas - categoriaResumo.saidas;
        }

        return {
            totalEntradas,
            totalSaidas,
            saldo,
            quantidadeTransacoes: transacoes.length,
            porCaminhao: Array.from(porCaminhao.values()),
            porCategoria: Array.from(porCategoria.values()),
        };
    }

    async criarCategoria(dto: CreateCategoriaFinanceiraDto) {
        return this.prisma.categoriaFinanceira.create({
            data: {
                nome: dto.nome.trim(),
            },
        });
    }

    async listarCategorias() {
        return this.prisma.categoriaFinanceira.findMany({
            where: {
                ativo: true,
            },
            orderBy: {
                nome: 'asc',
            },
        });
    }

    async classificarTransacao(id: string, dto: ClassificarTransacaoDto) {
        const transacao = await this.prisma.transacaoFinanceira.findUnique({
            where: { id },
        });

        if (!transacao) {
            throw new NotFoundException('Transação financeira não encontrada.');
        }

        return this.prisma.transacaoFinanceira.update({
            where: { id },
            data: {
                caminhaoId: dto.caminhaoId || null,
                categoriaId: dto.categoriaId || null,
                observacao: dto.observacao,
                status: StatusTransacaoFinanceira.CLASSIFICADA,
            },
            include: {
                caminhao: true,
                categoria: true,
            },
        });
    }

    private converterDataExcel(valor: unknown): Date | null {
        if (!valor) return null;

        if (valor instanceof Date) {
            return valor;
        }

        if (typeof valor === 'number') {
            const data = XLSX.SSF.parse_date_code(valor);

            if (!data) return null;

            return new Date(data.y, data.m - 1, data.d);
        }

        if (typeof valor === 'string') {
            const partes = valor.split('/');

            if (partes.length === 3) {
                const [dia, mes, ano] = partes.map(Number);
                return new Date(ano, mes - 1, dia);
            }

            const data = new Date(valor);
            return isNaN(data.getTime()) ? null : data;
        }

        return null;
    }

    private converterValor(valor: unknown): number {
        if (typeof valor === 'number') return valor;

        if (!valor) return 0;

        const texto = String(valor)
            .replace('R$', '')
            .replace(/\./g, '')
            .replace(',', '.')
            .trim();

        const numero = Number(texto);

        return isNaN(numero) ? 0 : numero;
    }

    private definirDirecao(valor: number) {
        return valor >= 0
            ? DirecaoTransacaoFinanceira.ENTRADA
            : DirecaoTransacaoFinanceira.SAIDA;
    }

    async importarExtrato(file: Express.Multer.File) {
        if (!file) {
            throw new Error('Arquivo não enviado.');
        }

        const workbook = XLSX.read(file.buffer, {
            type: 'buffer',
            cellDates: true,
        });

        const primeiraAba = workbook.SheetNames[0];
        const sheet = workbook.Sheets[primeiraAba];

        if (!sheet['!ref']) {
            throw new Error('Planilha vazia ou inválida.');
        }

        const linhas = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: null,
            blankrows: false,
        });

        console.log('TOTAL LINHAS SHEET_TO_JSON:', linhas.length);
        console.log('LINHA 10:', linhas[9]);
        console.log('LINHA 11:', linhas[10]);
        console.log('LINHA 14:', linhas[13]);
        console.log('ÚLTIMA LINHA:', linhas[linhas.length - 1]);

        const importacao = await this.prisma.importacaoExtrato.create({
            data: {
                nomeArquivo: file.originalname,
                totalLinhas: Math.max(linhas.length - 10, 0),
            },
        });

        let linhasImportadas = 0;
        let linhasIgnoradas = 0;
        let linhasClassificadas = 0;
        let linhasComErro = 0;

        // Excel:
        // Linha 10 = cabeçalho
        // Linha 11 = primeira transação
        for (let index = 10; index < linhas.length; index++) {
            const linha = linhas[index];

            const excelRow = index + 1;

            const dataRaw = linha[0];
            const lancamentoRaw = linha[1];
            const razaoRaw = linha[2];
            const documentoRaw = linha[3];
            const valorRaw = linha[4];

            console.log('LINHA LIDA:', {
                excelRow,
                dataRaw,
                lancamentoRaw,
                razaoRaw,
                documentoRaw,
                valorRaw,
            });

            const data = this.converterDataExcel(dataRaw);
            const lancamento = String(lancamentoRaw ?? '').trim();
            const razaoSocial = String(razaoRaw ?? '').trim();
            const documento = String(documentoRaw ?? '').trim();
            const valorOriginal = this.converterValor(valorRaw);

            const deveIgnorar =
                !data ||
                !lancamento ||
                valorOriginal === 0 ||
                lancamento.toUpperCase().includes('SALDO TOTAL') ||
                lancamento.toUpperCase().includes('SALDO ANTERIOR');

            if (deveIgnorar) {
                console.log('LINHA IGNORADA:', {
                    excelRow,
                    motivo: {
                        semData: !data,
                        semLancamento: !lancamento,
                        valorZero: valorOriginal === 0,
                        saldoTotal: lancamento.toUpperCase().includes('SALDO TOTAL'),
                        saldoAnterior: lancamento.toUpperCase().includes('SALDO ANTERIOR'),
                    },
                    dataRaw,
                    lancamento,
                    valorOriginal,
                });

                linhasIgnoradas++;
                continue;
            }

            const regra = await this.aplicarRegraAutomatica({
                lancamento,
                razaoSocial,
                descricao: null,
            });

            const foiClassificada = Boolean(regra.categoriaId || regra.caminhaoId);

            try {
                await this.prisma.transacaoFinanceira.create({
                    data: {
                        data,
                        lancamento,
                        razaoSocial: razaoSocial || null,
                        documento: documento || null,
                        valor: Math.abs(valorOriginal),
                        direcao: this.definirDirecao(valorOriginal),
                        importacaoId: importacao.id,
                        categoriaId: regra.categoriaId,
                        caminhaoId: regra.caminhaoId,
                        status: foiClassificada
                            ? StatusTransacaoFinanceira.CLASSIFICADA
                            : StatusTransacaoFinanceira.PENDENTE_CLASSIFICACAO,
                    },
                });

                linhasImportadas++;

                if (foiClassificada) {
                    linhasClassificadas++;
                }

                console.log('LINHA IMPORTADA:', {
                    excelRow,
                    lancamento,
                    razaoSocial,
                    valorOriginal,
                });
            } catch (error) {
                linhasComErro++;

                console.error('ERRO AO SALVAR LINHA:', {
                    excelRow,
                    data,
                    lancamento,
                    razaoSocial,
                    documento,
                    valorOriginal,
                    regra,
                    error,
                });
            }
        }

        await this.prisma.importacaoExtrato.update({
            where: {
                id: importacao.id,
            },
            data: {
                linhasImportadas,
                linhasIgnoradas: linhasIgnoradas + linhasComErro,
            },
        });

        return {
            message: 'Extrato importado com sucesso.',
            totalLinhas: Math.max(linhas.length - 10, 0),
            linhasImportadas,
            linhasIgnoradas,
            linhasComErro,
            linhasClassificadas,
            linhasPendentesClassificacao: linhasImportadas - linhasClassificadas,
        };
    }

    private normalizarTexto(texto: string): string {
        return texto
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .trim();
    }

    private async aplicarRegraAutomatica(transacao: {
        lancamento: string;
        razaoSocial?: string | null;
        descricao?: string | null;
    }) {
        const regras = await this.prisma.regraClassificacaoFinanceira.findMany({
            where: {
                ativo: true,
            },
            orderBy: [
                {
                    prioridade: 'desc',
                },
                {
                    createdAt: 'asc',
                },
            ],
        });

        const textoBusca = this.normalizarTexto(
            `${transacao.lancamento ?? ''} ${transacao.razaoSocial ?? ''} ${transacao.descricao ?? ''}`,
        );

        let categoriaId: string | null = null;
        let caminhaoId: string | null = null;

        for (const regra of regras) {
            const palavra = this.normalizarTexto(regra.palavra);

            if (!textoBusca.includes(palavra)) {
                continue;
            }

            if (!categoriaId && regra.categoriaId) {
                categoriaId = regra.categoriaId;
            }

            if (!caminhaoId && regra.caminhaoId) {
                caminhaoId = regra.caminhaoId;
            }

            if (categoriaId && caminhaoId) {
                break;
            }
        }

        return {
            categoriaId,
            caminhaoId,
        };
    }

    async criarRegra(dto: CreateRegraClassificacaoDto) {
        return this.prisma.regraClassificacaoFinanceira.create({
            data: {
                palavra: dto.palavra.trim(),
                categoriaId: dto.categoriaId || null,
                caminhaoId: dto.caminhaoId || null,
                prioridade: dto.prioridade ?? 0,
            },
            include: {
                categoria: true,
                caminhao: true,
            },
        });
    }

    async listarRegras() {
        return this.prisma.regraClassificacaoFinanceira.findMany({
            where: {
                ativo: true,
            },
            include: {
                categoria: true,
                caminhao: true,
            },
            orderBy: [
                {
                    prioridade: 'desc',
                },
                {
                    palavra: 'asc',
                },
            ],
        });
    }

    async reprocessarClassificacao() {
        const transacoes = await this.prisma.transacaoFinanceira.findMany({
            where: {
                status: StatusTransacaoFinanceira.PENDENTE_CLASSIFICACAO,
            },
        });

        let classificadas = 0;

        for (const transacao of transacoes) {
            const regra = await this.aplicarRegraAutomatica(transacao);

            if (regra.categoriaId || regra.caminhaoId) {
                await this.prisma.transacaoFinanceira.update({
                    where: {
                        id: transacao.id,
                    },
                    data: {
                        categoriaId: regra.categoriaId,
                        caminhaoId: regra.caminhaoId,
                        status: StatusTransacaoFinanceira.CLASSIFICADA,
                    },
                });

                classificadas++;
            }
        }

        return {
            totalAnalisadas: transacoes.length,
            classificadas,
            pendentes: transacoes.length - classificadas,
        };
    }

    async listarCaminhoes() {
        return this.prisma.caminhao.findMany({
            where: {
                ativo: true,
            },
            orderBy: {
                placa: 'asc',
            },
        });
    }
}