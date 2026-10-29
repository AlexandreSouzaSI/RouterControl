import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';
import { FinanceiroNfService } from './financeiro-nf.service';
import { DadosComprovante, parseTextoComprovante } from './comprovante-parser';

// "Conta paga": quem pagou (ex: proprietário) avisa o pagamento com valor +
// fornecedor e/ou comprovante; o financeiro concilia depois (vincula a uma
// conta a pagar, ou só marca como lançado na planilha).
@Injectable()
export class PagamentosAvisadosService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly financeiro: FinanceiroNfService,
    ) { }

    // Lê o texto do PDF (quando for PDF). Se falhar ou for imagem, devolve vazio.
    private async lerComprovante(file?: Express.Multer.File): Promise<DadosComprovante | null> {
        if (!file || file.mimetype !== 'application/pdf') return null;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require('pdf-parse/lib/pdf-parse.js');
            const r = await pdfParse(file.buffer);
            return parseTextoComprovante(r.text ?? '');
        } catch {
            return null;
        }
    }

    async criar(
        empresaId: string,
        usuario: { id?: string; nome?: string },
        body: { fornecedor?: string; valor?: string | number; data?: string; descricao?: string; caminhaoId?: string; categoriaId?: string },
        file?: Express.Multer.File,
    ) {
        const lido = await this.lerComprovante(file);

        // O que a pessoa digitou manda; o que veio do PDF só completa.
        const valorDigitado = Number(String(body.valor ?? '').replace(',', '.'));
        const valor = valorDigitado > 0 ? valorDigitado : (lido?.valor ?? 0);
        const fornecedor = body.fornecedor?.trim() || lido?.destinatario || '';
        const descricao = body.descricao?.trim() || lido?.descricao || null;
        const dataISO = body.data || lido?.data || null;

        if (!file && (!fornecedor || !valor || valor <= 0)) {
            throw new BadRequestException('Envie o comprovante ou informe fornecedor e valor.');
        }

        if (lido?.idTransacao) {
            const repetido = await this.prisma.pagamentoAvisado.findFirst({
                where: { empresaId, idTransacao: lido.idTransacao },
                select: { id: true },
            });
            if (repetido) throw new BadRequestException('Este comprovante já foi enviado antes.');
        }

        // Só aceita caminhão/categoria que sejam desta empresa.
        const caminhao = body.caminhaoId
            ? await this.prisma.caminhao.findFirst({ where: { id: body.caminhaoId, empresaId }, select: { id: true } })
            : null;
        const categoria = body.categoriaId
            ? await this.prisma.categoriaContaPagar.findFirst({ where: { id: body.categoriaId, empresaId }, select: { id: true } })
            : null;

        return this.prisma.pagamentoAvisado.create({
            data: {
                empresaId,
                caminhaoId: caminhao?.id ?? null,
                categoriaId: categoria?.id ?? null,
                fornecedor: fornecedor || 'Não informado (ver comprovante)',
                valor: valor > 0 ? valor : 0,
                dataPagamento: dataISO ? new Date(`${dataISO}T12:00:00`) : new Date(),
                descricao,
                comprovante: file ? file.buffer : null,
                comprovanteNome: file?.originalname ?? null,
                comprovanteMime: file?.mimetype ?? null,
                avisadoPorId: usuario.id ?? null,
                avisadoPorNome: usuario.nome ?? null,
                idTransacao: lido?.idTransacao ?? null,
            },
            select: this.selectSemArquivo(),
        });
    }

    // ---------- Link secreto (sem login) ----------

    async obterLink(empresaId: string) {
        const e = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { tokenAvisoPagamento: true } });
        return { token: e?.tokenAvisoPagamento ?? null };
    }

    // Gera (ou troca, invalidando o anterior) o token do link.
    async gerarLink(empresaId: string) {
        const token = randomBytes(24).toString('hex');
        await this.prisma.empresa.update({ where: { id: empresaId }, data: { tokenAvisoPagamento: token } });
        return { token };
    }

    async revogarLink(empresaId: string) {
        await this.prisma.empresa.update({ where: { id: empresaId }, data: { tokenAvisoPagamento: null } });
        return { token: null };
    }

    private tentativas = new Map<string, number[]>();

    // Valida o token público + limita 30 envios/hora por link.
    async empresaDoToken(token: string, contar = false) {
        if (!token || token.length < 20) throw new NotFoundException('Link inválido.');
        const empresa = await this.prisma.empresa.findUnique({
            where: { tokenAvisoPagamento: token },
            select: { id: true, nome: true, ativo: true },
        });
        if (!empresa || !empresa.ativo) throw new NotFoundException('Link inválido ou desativado.');

        if (contar) {
            const agora = Date.now();
            const recentes = (this.tentativas.get(token) ?? []).filter((t) => agora - t < 3600_000);
            if (recentes.length >= 30) throw new BadRequestException('Muitos envios em pouco tempo. Tente mais tarde.');
            recentes.push(agora);
            this.tentativas.set(token, recentes);
        }
        return empresa;
    }

    // Listas para os selects do aviso (placa e categoria).
    async opcoes(empresaId: string) {
        const [caminhoes, categorias] = await Promise.all([
            this.prisma.caminhao.findMany({ where: { empresaId, ativo: true }, select: { id: true, placa: true }, orderBy: { placa: 'asc' } }),
            this.prisma.categoriaContaPagar.findMany({ where: { empresaId, ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
        ]);
        return { caminhoes, categorias };
    }

    async listar(empresaId: string, status?: string) {
        const where: any = { empresaId };
        if (status === 'PENDENTE' || status === 'CONCILIADO' || status === 'DESCARTADO') where.status = status;

        const itens = await this.prisma.pagamentoAvisado.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: { ...this.selectSemArquivo(), comprovanteNome: true, comprovanteMime: true },
        });

        const op = await this.opcoes(empresaId);
        return itens.map((i) => ({
            ...i,
            temComprovante: !!i.comprovanteNome,
            placa: op.caminhoes.find((c) => c.id === i.caminhaoId)?.placa ?? null,
            categoriaNome: op.categorias.find((c) => c.id === i.categoriaId)?.nome ?? null,
        }));
    }

    async comprovante(id: string, empresaId: string) {
        const item = await this.prisma.pagamentoAvisado.findFirst({
            where: { id, empresaId },
            select: { comprovante: true, comprovanteNome: true, comprovanteMime: true },
        });
        if (!item?.comprovante) throw new NotFoundException('Comprovante não encontrado.');
        return item;
    }

    // Sugere contas em aberto parecidas (mesmo valor ou fornecedor parecido).
    async sugestoes(id: string, empresaId: string) {
        const aviso = await this.prisma.pagamentoAvisado.findFirst({ where: { id, empresaId } });
        if (!aviso) throw new NotFoundException('Aviso não encontrado.');

        const contas = await this.financeiro.listarContasPendentes(empresaId);
        const termo = aviso.fornecedor.toLowerCase();

        return contas
            .map((c: any) => {
                const nome = `${c.fornecedor?.nome ?? ''} ${c.descricao}`.toLowerCase();
                const palavras = termo.split(/\s+/).filter((p) => p.length > 2);
                const texto = palavras.filter((p) => nome.includes(p)).length;
                const dif = Math.abs((c.saldoDevedor ?? c.valor) - aviso.valor);
                const valorIgual = aviso.valor > 0 && dif < 0.01;
                const valorPerto = aviso.valor > 0 && dif / aviso.valor < 0.1;
                const pontos = (valorIgual ? 60 : valorPerto ? 25 : 0) + Math.min(texto, 3) * 12;
                return { conta: c, pontos };
            })
            .filter((x) => x.pontos >= 12)
            .sort((a, b) => b.pontos - a.pontos)
            .slice(0, 6);
    }

    // Vincula a uma conta a pagar (dá baixa), CRIA a conta já paga (quando não
    // existe na planilha) OU só marca como conciliado.
    // Se o valor pago for maior que o saldo da conta, a diferença vira juros.
    async conciliar(
        id: string,
        empresaId: string,
        usuario: { nome?: string },
        body: {
            contaPagarId?: string;
            criarConta?: boolean;
            valorPago?: number | string;
            caminhaoIds?: string[];
            valores?: (number | string)[];
            grupo?: string;
            observacao?: string;
        },
    ) {
        const aviso = await this.prisma.pagamentoAvisado.findFirst({ where: { id, empresaId } });
        if (!aviso) throw new NotFoundException('Aviso não encontrado.');
        if (aviso.status !== 'PENDENTE') throw new BadRequestException('Esse aviso já foi tratado.');

        const digitado = Number(String(body.valorPago ?? '').replace(',', '.'));
        const valorPago = digitado > 0 ? digitado : aviso.valor;
        const dataISO = aviso.dataPagamento.toISOString().slice(0, 10);
        const obs = `Aviso de pagamento: ${aviso.fornecedor}${aviso.descricao ? ` — ${aviso.descricao}` : ''}`;
        let contaPagarId: string | null = null;

        if (body.contaPagarId) {
            if (!valorPago || valorPago <= 0) {
                throw new BadRequestException('Informe o valor pago antes de vincular a uma conta.');
            }
            const conta = await this.prisma.contaPagar.findFirst({
                where: { id: body.contaPagarId, empresaId },
                include: { pagamentos: { select: { valor: true } } },
            });
            if (!conta) throw new NotFoundException('Conta a pagar não encontrada.');
            const saldo = Math.max(0, conta.valor - conta.pagamentos.reduce((s, p) => s + p.valor, 0));
            const principal = Math.min(valorPago, saldo);
            const juros = valorPago > saldo + 0.01 ? Number((valorPago - saldo).toFixed(2)) : 0;

            await this.financeiro.registrarPagamento(body.contaPagarId, empresaId, {
                valor: Number(principal.toFixed(2)),
                data: dataISO,
                observacao: juros > 0 ? `${obs} (inclui R$ ${juros.toFixed(2)} de juros)` : obs,
                juros,
            });
            contaPagarId = body.contaPagarId;
        } else if (body.criarConta) {
            if (!valorPago || valorPago <= 0) {
                throw new BadRequestException('Informe o valor pago para criar a conta.');
            }
            const grupo = body.grupo === 'IMPOSTOS' || body.grupo === 'SOCIOS' ? body.grupo : 'FORNECEDORES';
            const nome = aviso.fornecedor.startsWith('Não informado') ? null : aviso.fornecedor;
            const fornecedor = nome
                ? await this.prisma.fornecedor.findFirst({ where: { empresaId, nome: { equals: nome, mode: 'insensitive' } }, select: { id: true } })
                : null;
            const data = new Date(`${dataISO}T12:00:00`);

            const criada = await this.prisma.contaPagar.create({
                data: {
                    empresaId,
                    descricao: aviso.descricao || nome || 'Pagamento avisado',
                    valor: valorPago,
                    vencimento: data,
                    pagoEm: data,
                    status: 'PAGA',
                    grupo: grupo as any,
                    fornecedorId: fornecedor?.id ?? null,
                    caminhaoId: aviso.caminhaoId,
                    categoriaId: aviso.categoriaId,
                    pagamentos: { create: { valor: valorPago, data, observacao: obs } },
                },
                select: { id: true },
            });
            contaPagarId = criada.id;
        }

        // Pagamento para 2+ carretas: divide o valor e grava a parcela de cada uma.
        if (contaPagarId && Array.isArray(body.caminhaoIds) && body.caminhaoIds.length > 0) {
            await this.financeiro.ratearContasPagar(empresaId, [contaPagarId], body.caminhaoIds, body.valores, true);
        }

        return this.prisma.pagamentoAvisado.update({
            where: { id },
            data: {
                status: 'CONCILIADO',
                conciliadoEm: new Date(),
                conciliadoPor: usuario.nome ?? null,
                contaPagarId,
                observacaoFinanceiro: body.observacao?.trim() || null,
            },
            select: this.selectSemArquivo(),
        });
    }

    async descartar(id: string, empresaId: string, usuario: { nome?: string }) {
        const aviso = await this.prisma.pagamentoAvisado.findFirst({ where: { id, empresaId } });
        if (!aviso) throw new NotFoundException('Aviso não encontrado.');
        return this.prisma.pagamentoAvisado.update({
            where: { id },
            data: { status: 'DESCARTADO', conciliadoEm: new Date(), conciliadoPor: usuario.nome ?? null },
            select: this.selectSemArquivo(),
        });
    }

    private selectSemArquivo() {
        return {
            id: true, fornecedor: true, valor: true, dataPagamento: true, descricao: true,
            avisadoPorNome: true, status: true, conciliadoEm: true, conciliadoPor: true,
            contaPagarId: true, observacaoFinanceiro: true, createdAt: true, caminhaoId: true, categoriaId: true,
        } as const;
    }
}
