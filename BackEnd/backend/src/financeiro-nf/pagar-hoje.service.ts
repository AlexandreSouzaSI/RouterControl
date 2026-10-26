import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// Link secreto (sem login) em que o proprietário marca nas caixinhas o que
// quer pagar hoje. As marcadas viram "Hoje" (queuedForPaymentAt); as demais
// voltam ao que eram: Vencidas ou A pagar, conforme o vencimento.
@Injectable()
export class PagarHojeService {
    constructor(private readonly prisma: PrismaService) { }

    async obterLink(empresaId: string) {
        const e = await this.prisma.empresa.findUnique({ where: { id: empresaId }, select: { tokenPagarHoje: true } });
        return { token: e?.tokenPagarHoje ?? null };
    }

    async gerarLink(empresaId: string) {
        const token = randomBytes(24).toString('hex');
        await this.prisma.empresa.update({ where: { id: empresaId }, data: { tokenPagarHoje: token } });
        return { token };
    }

    async revogarLink(empresaId: string) {
        await this.prisma.empresa.update({ where: { id: empresaId }, data: { tokenPagarHoje: null } });
        return { token: null };
    }

    private tentativas = new Map<string, number[]>();

    async empresaDoToken(token: string, contar = false) {
        if (!token || token.length < 20) throw new NotFoundException('Link inválido.');
        const empresa = await this.prisma.empresa.findUnique({
            where: { tokenPagarHoje: token },
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

    private pendentes(empresaId: string) {
        return this.prisma.contaPagar.findMany({
            where: { empresaId, grupo: 'FORNECEDORES', status: { in: ['ABERTA', 'VENCIDA', 'PARCIAL'] } },
            include: { fornecedor: { select: { nome: true } }, pagamentos: { select: { valor: true } } },
            orderBy: [{ vencimento: 'asc' }, { valor: 'desc' }],
            take: 500,
        });
    }

    async listar(empresaId: string) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        const contas = await this.pendentes(empresaId);
        return contas.map((c) => {
            const pago = c.pagamentos.reduce((s, p) => s + p.valor, 0);
            const venc = new Date(c.vencimento);
            return {
                id: c.id,
                descricao: c.descricao,
                fornecedor: c.fornecedor?.nome ?? null,
                vencimento: c.vencimento,
                saldo: Math.max(0, c.valor - pago),
                vencida: venc < hoje,
                venceHoje: venc >= hoje && venc < amanha,
                selecionada: !!c.queuedForPaymentAt || (venc >= hoje && venc < amanha),
            };
        });
    }

    async enviar(empresaId: string, ids: string[]) {
        if (!Array.isArray(ids)) throw new BadRequestException('Seleção inválida.');
        const escolhidas = new Set(ids);
        const contas = await this.pendentes(empresaId);

        const marcar: string[] = [];
        const desmarcar: string[] = [];
        for (const c of contas) {
            if (escolhidas.has(c.id)) {
                if (!c.queuedForPaymentAt) marcar.push(c.id);
            } else if (c.queuedForPaymentAt) {
                desmarcar.push(c.id);
            }
        }

        if (marcar.length) {
            await this.prisma.contaPagar.updateMany({ where: { empresaId, id: { in: marcar } }, data: { queuedForPaymentAt: new Date() } });
        }
        if (desmarcar.length) {
            await this.prisma.contaPagar.updateMany({ where: { empresaId, id: { in: desmarcar } }, data: { queuedForPaymentAt: null } });
        }

        const selecionadas = contas.filter((c) => escolhidas.has(c.id));
        const total = selecionadas.reduce((s, c) => s + Math.max(0, c.valor - c.pagamentos.reduce((a, p) => a + p.valor, 0)), 0);
        return { ok: true, quantidade: selecionadas.length, total };
    }
}
