import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { FormaPagamentoContaPagar, TipoContaPagar } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceiroNfService } from './financeiro-nf.service';
import { DocumentoLido, documentoVazio, lerTextoDocumento, lerXmlDocumento } from './documento-parser';

// =============================================================================
// "Lançar contas": quem tem o link (ou o próprio financeiro) envia um boleto
// ou uma nota, com caminhão e tipo opcionais. O sistema lê o documento e
// deixa PENDENTE; o financeiro confere, corrige, divide em parcelas se for o
// caso e lança — aí sim vira conta(s) a pagar.
// =============================================================================

type ParcelaEntrada = { valor: number | string; vencimento: string; codigoBarras?: string };

const TIPOS: TipoContaPagar[] = ['BOLETO', 'PIX', 'CARTAO', 'SEM_BOLETO'] as TipoContaPagar[];
const FORMAS: FormaPagamentoContaPagar[] = ['BOLETO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'TRANSFERENCIA', 'CONTA_EMPRESA'] as FormaPagamentoContaPagar[];
const dataISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
// Tudo menos o arquivo (bytes) — pra listagens leves.
const SEM_ARQUIVO = {
    id: true, empresaId: true, arquivoNome: true, arquivoMime: true, tipoDocumento: true, fornecedor: true, fornecedorDoc: true,
    valor: true, vencimento: true, emissao: true, numeroDocumento: true, codigoBarras: true, chaveNfe: true, descricao: true,
    parcelas: true, caminhaoId: true, categoriaId: true, observacaoEnvio: true, enviadoPorNome: true, status: true,
    contaPagarIds: true, lancadoEm: true, lancadoPor: true, motivoDescarte: true, createdAt: true,
} as const;
const meioDia = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : null);

@Injectable()
export class ContasEnviadasService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly financeiro: FinanceiroNfService,
    ) { }

    // ---------- Leitura do documento ----------

    private async ler(file: Express.Multer.File): Promise<DocumentoLido> {
        try {
            const nome = (file.originalname || '').toLowerCase();
            if (file.mimetype === 'application/pdf' || nome.endsWith('.pdf')) {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const pdfParse = require('pdf-parse/lib/pdf-parse.js');
                const r = await pdfParse(file.buffer);
                return lerTextoDocumento(r.text ?? '');
            }
            if (/xml/.test(file.mimetype) || nome.endsWith('.xml')) {
                return lerXmlDocumento(file.buffer.toString('utf8').replace(/^﻿/, ''));
            }
        } catch {
            // segue vazio: o financeiro preenche olhando o arquivo
        }
        return documentoVazio();
    }

    async criar(
        empresaId: string,
        enviadoPor: string | null,
        body: { caminhaoId?: string; categoriaId?: string; observacao?: string },
        file?: Express.Multer.File,
    ) {
        if (!file) throw new BadRequestException('Anexe o boleto ou a nota (PDF, XML ou foto).');
        const lido = await this.ler(file);

        // Mesmo boleto/nota enviado de novo?
        if (lido.codigoBarras || lido.chaveNfe) {
            const repetido = await this.prisma.contaEnviada.findFirst({
                where: {
                    empresaId,
                    status: { not: 'DESCARTADA' },
                    OR: [
                        ...(lido.codigoBarras ? [{ codigoBarras: lido.codigoBarras }] : []),
                        ...(lido.chaveNfe ? [{ chaveNfe: lido.chaveNfe }] : []),
                    ],
                },
                select: { status: true },
            });
            if (repetido) {
                throw new BadRequestException(repetido.status === 'LANCADA'
                    ? 'Este documento já foi enviado e lançado em Contas a Pagar.'
                    : 'Este documento já foi enviado e está aguardando conferência.');
            }
        }

        const caminhao = body.caminhaoId
            ? await this.prisma.caminhao.findFirst({ where: { id: body.caminhaoId, OR: [{ empresaId }, { empresaId: null }] }, select: { id: true } })
            : null;
        const categoria = body.categoriaId
            ? await this.prisma.categoriaContaPagar.findFirst({ where: { id: body.categoriaId, empresaId }, select: { id: true } })
            : null;

        const criado = await this.prisma.contaEnviada.create({
            data: {
                empresaId,
                arquivo: file.buffer,
                arquivoNome: file.originalname,
                arquivoMime: file.mimetype,
                tipoDocumento: lido.tipoDocumento,
                fornecedor: lido.fornecedor,
                fornecedorDoc: lido.fornecedorDoc,
                valor: lido.valor,
                vencimento: meioDia(lido.vencimento),
                emissao: meioDia(lido.emissao),
                numeroDocumento: lido.numeroDocumento,
                codigoBarras: lido.codigoBarras,
                chaveNfe: lido.chaveNfe,
                descricao: lido.descricao,
                parcelas: lido.parcelas.length ? (lido.parcelas as any) : undefined,
                caminhaoId: caminhao?.id ?? null,
                categoriaId: categoria?.id ?? null,
                observacaoEnvio: body.observacao?.trim() || null,
                enviadoPorNome: enviadoPor,
            },
            select: { id: true, fornecedor: true, valor: true, vencimento: true, tipoDocumento: true },
        });
        return criado;
    }

    // ---------- Link secreto (sem login) ----------

    async obterLink(empresaId: string) {
        const e = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { tokenEnvioContas: true } });
        return { token: e?.tokenEnvioContas ?? null };
    }

    async gerarLink(empresaId: string) {
        const token = randomBytes(24).toString('hex');
        await this.prisma.empresa.update({ where: { id: empresaId }, data: { tokenEnvioContas: token } });
        return { token };
    }

    async revogarLink(empresaId: string) {
        await this.prisma.empresa.update({ where: { id: empresaId }, data: { tokenEnvioContas: null } });
        return { token: null };
    }

    private tentativas = new Map<string, number[]>();

    // Valida o token público + limita 60 envios/hora por link.
    async empresaDoToken(token: string, contar = false) {
        if (!token || token.length < 20) throw new NotFoundException('Link inválido.');
        const empresa = await this.prisma.empresa.findUnique({
            where: { tokenEnvioContas: token },
            select: { id: true, nome: true, ativo: true },
        });
        if (!empresa || !empresa.ativo) throw new NotFoundException('Link inválido ou desativado.');
        if (contar) {
            const agora = Date.now();
            const recentes = (this.tentativas.get(token) ?? []).filter((t) => agora - t < 3600_000);
            if (recentes.length >= 60) throw new BadRequestException('Muitos envios em pouco tempo. Tente mais tarde.');
            recentes.push(agora);
            this.tentativas.set(token, recentes);
        }
        return empresa;
    }

    async opcoes(empresaId: string) {
        const [caminhoes, categorias] = await Promise.all([
            this.prisma.caminhao.findMany({ where: { OR: [{ empresaId }, { empresaId: null }], ativo: true }, select: { id: true, placa: true }, orderBy: { placa: 'asc' } }),
            this.prisma.categoriaContaPagar.findMany({ where: { empresaId, ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
        ]);
        return { caminhoes, categorias };
    }

    // ---------- Tela do financeiro ----------

    async listar(empresaId: string, status?: string) {
        const st = status === 'LANCADA' || status === 'DESCARTADA' ? status : 'PENDENTE';
        const itens = await this.prisma.contaEnviada.findMany({
            where: { empresaId, status: st },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: SEM_ARQUIVO,
        });
        const op = await this.opcoes(empresaId);
        return itens.map((i) => ({
            ...i,
            vencimento: dataISO(i.vencimento),
            emissao: dataISO(i.emissao),
            temArquivo: !!i.arquivoNome,
            placa: op.caminhoes.find((c) => c.id === i.caminhaoId)?.placa ?? null,
            categoriaNome: op.categorias.find((c) => c.id === i.categoriaId)?.nome ?? null,
        }));
    }

    async arquivo(id: string, empresaId: string) {
        const item = await this.prisma.contaEnviada.findFirst({
            where: { id, empresaId },
            select: { arquivo: true, arquivoNome: true, arquivoMime: true },
        });
        if (!item?.arquivo) throw new NotFoundException('Arquivo não encontrado.');
        return item;
    }

    // Contas a pagar que parecem ser a mesma (pra não lançar duas vezes).
    async parecidas(id: string, empresaId: string) {
        const item = await this.prisma.contaEnviada.findFirst({ where: { id, empresaId }, select: SEM_ARQUIVO });
        if (!item) throw new NotFoundException('Envio não encontrado.');
        const ors: any[] = [];
        if (item.codigoBarras) ors.push({ codigoBarras: item.codigoBarras });
        if (item.valor && item.valor > 0) {
            const venc = item.vencimento ?? item.createdAt;
            ors.push({
                valor: { gte: item.valor - 0.01, lte: item.valor + 0.01 },
                vencimento: { gte: new Date(venc.getTime() - 10 * 86400000), lte: new Date(venc.getTime() + 10 * 86400000) },
            });
        }
        if (!ors.length) return [];
        const contas = await this.prisma.contaPagar.findMany({
            where: { empresaId, status: { not: 'CANCELADA' }, OR: ors },
            select: { id: true, descricao: true, valor: true, vencimento: true, status: true, codigoBarras: true, fornecedor: { select: { nome: true } } },
            orderBy: { vencimento: 'asc' },
            take: 10,
        });
        return contas.map((c) => ({ ...c, mesmoCodigo: !!item.codigoBarras && c.codigoBarras === item.codigoBarras }));
    }

    async descartar(id: string, empresaId: string, motivo?: string) {
        const item = await this.prisma.contaEnviada.findFirst({ where: { id, empresaId }, select: { status: true } });
        if (!item) throw new NotFoundException('Envio não encontrado.');
        if (item.status !== 'PENDENTE') throw new BadRequestException('Esse envio já foi tratado.');
        await this.prisma.contaEnviada.update({ where: { id }, data: { status: 'DESCARTADA', motivoDescarte: motivo?.trim() || null } });
        return { ok: true };
    }

    // Cria a(s) conta(s) a pagar com o que o financeiro conferiu.
    async lancar(
        id: string,
        empresaId: string,
        usuarioNome: string | null,
        body: {
            fornecedor?: string;
            descricao?: string;
            categoriaId?: string;
            caminhaoId?: string;
            grupo?: string;
            tipo?: string;
            formaPagamento?: string;
            codigoBarras?: string;
            observacao?: string;
            parcelas?: ParcelaEntrada[];
        },
    ) {
        const item = await this.prisma.contaEnviada.findFirst({ where: { id, empresaId }, select: SEM_ARQUIVO });
        if (!item) throw new NotFoundException('Envio não encontrado.');
        if (item.status !== 'PENDENTE') throw new BadRequestException('Esse envio já foi tratado.');

        const parcelas = (body.parcelas ?? []).map((p) => ({
            valor: Number(String(p.valor).replace(',', '.')),
            vencimento: String(p.vencimento ?? '').slice(0, 10),
            codigoBarras: p.codigoBarras?.replace(/\D/g, '') || undefined,
        }));
        if (!parcelas.length) throw new BadRequestException('Informe ao menos uma parcela (valor e vencimento).');
        parcelas.forEach((p, i) => {
            if (!(p.valor > 0)) throw new BadRequestException(`Parcela ${i + 1}: valor inválido.`);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento)) throw new BadRequestException(`Parcela ${i + 1}: vencimento inválido.`);
        });

        const descricaoBase = body.descricao?.trim() || item.descricao || item.fornecedor || 'Conta enviada';
        const fornecedorNome = body.fornecedor?.trim();
        const fornecedor = fornecedorNome ? await this.financeiro.encontrarOuCriarFornecedor(empresaId, fornecedorNome) : null;
        const tipo = TIPOS.includes(body.tipo as TipoContaPagar) ? (body.tipo as TipoContaPagar) : (item.tipoDocumento === 'BOLETO' ? 'BOLETO' : 'SEM_BOLETO') as TipoContaPagar;
        const forma = FORMAS.includes(body.formaPagamento as FormaPagamentoContaPagar) ? (body.formaPagamento as FormaPagamentoContaPagar) : undefined;
        const codigoGeral = body.codigoBarras !== undefined ? body.codigoBarras.replace(/\D/g, '') : item.codigoBarras ?? '';
        const obs = [
            body.observacao?.trim(),
            item.observacaoEnvio ? `Enviado com a observação: ${item.observacaoEnvio}` : null,
            `Lançada a partir de ${item.tipoDocumento === 'BOLETO' ? 'boleto' : item.tipoDocumento === 'OUTRO' ? 'documento' : 'nota'} enviado${item.enviadoPorNome ? ` por ${item.enviadoPorNome}` : ''} (${item.arquivoNome ?? 'arquivo'}).`,
            item.chaveNfe ? `Chave NF-e: ${item.chaveNfe}` : null,
        ].filter(Boolean).join('\n');

        const ids: string[] = [];
        for (let i = 0; i < parcelas.length; i++) {
            const p = parcelas[i];
            const conta = await this.financeiro.criarContaPagar(empresaId, {
                descricao: parcelas.length > 1 ? `${descricaoBase} — parcela ${i + 1}/${parcelas.length}` : descricaoBase,
                valor: Number(p.valor.toFixed(2)),
                vencimento: p.vencimento,
                tipo,
                formaPagamento: forma,
                fornecedorId: fornecedor?.id,
                categoriaId: body.categoriaId || undefined,
                caminhaoId: body.caminhaoId || undefined,
                codigoBarras: p.codigoBarras || (parcelas.length === 1 ? codigoGeral || undefined : undefined),
                observacao: obs,
                grupo: body.grupo,
            });
            ids.push(conta.id);
        }

        await this.prisma.contaEnviada.update({
            where: { id },
            data: { status: 'LANCADA', contaPagarIds: ids, lancadoEm: new Date(), lancadoPor: usuarioNome },
        });
        return { criadas: ids.length, contaPagarIds: ids };
    }
}
