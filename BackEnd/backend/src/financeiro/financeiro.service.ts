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

        const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: null,
            range: 10, // Cabeçalho começa na linha 11 do Excel
        });

        const importacao = await this.prisma.importacaoExtrato.create({
            data: {
                nomeArquivo: file.originalname,
                totalLinhas: linhas.length,
            },
        });

        let linhasImportadas = 0;
        let linhasIgnoradas = 0;
        let linhasClassificadas = 0;

        for (const linha of linhas) {
            const data = this.converterDataExcel(linha['Data']);
            const lancamento = String(linha['Lançamento'] ?? '').trim();
            const razaoSocial = String(linha['Razão Social'] ?? '').trim();
            const documento = String(linha['CPF/CNPJ'] ?? '').trim();

            const valorOriginal = this.converterValor(
                linha['Valor (R$)'] ?? linha['Valor'],
            );

            if (!data || !lancamento || valorOriginal === 0) {
                linhasIgnoradas++;
                continue;
            }

            const regra = await this.aplicarRegraAutomatica({
                lancamento,
                razaoSocial,
                descricao: null,
            });

            const foiClassificada = Boolean(regra.categoriaId || regra.caminhaoId);

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
        }

        await this.prisma.importacaoExtrato.update({
            where: {
                id: importacao.id,
            },
            data: {
                linhasImportadas,
                linhasIgnoradas,
            },
        });

        return {
            message: 'Extrato importado com sucesso.',
            totalLinhas: linhas.length,
            linhasImportadas,
            linhasIgnoradas,
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