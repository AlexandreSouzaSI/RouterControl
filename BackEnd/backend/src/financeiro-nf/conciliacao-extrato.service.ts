import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { juntarExtratos, lerExtrato, ExtratoLido } from './extrato-parser';

// =============================================================================
// Conciliação do Extrato: importa o extrato do mês, sugere o caminhão de cada
// pagamento (placa na descrição, vínculos cadastrados, "dividir em todos"),
// deixa classificar na tela ou por link público e, no "Aplicar", grava as
// partes de caminhão como despesa (LancamentoCaminhao) do mês.
// =============================================================================

export type Parte = { k: string; v: number };
export const FIXOS = ['GERAL', 'SOCIO', 'NAO', 'JA_LANCADO'] as const;

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const placaLimpa = (p: string) => norm(p).replace(/[^A-Z0-9]/g, '');
const cent = (v: number) => Math.round(v * 100);
const DIVIDIR = /TODAS? (AS )?PLACAS|TODOS (OS )?(CAVALOS|CAMINHOES|CARROS|VEICULOS)|DIVIDIR (EM|PARA|ENTRE) TOD/;

function dividirIgual(valor: number, ks: string[]): Parte[] {
    const t = cent(valor);
    const b = Math.floor(t / ks.length);
    return ks.map((k, i) => ({ k, v: (i === ks.length - 1 ? t - b * (ks.length - 1) : b) / 100 }));
}

@Injectable()
export class ConciliacaoExtratoService {
    constructor(private readonly prisma: PrismaService) { }

    private caminhoes(empresaId: string) {
        return this.prisma.caminhao.findMany({
            where: { OR: [{ empresaId }, { empresaId: null }], ativo: true },
            select: { id: true, placa: true },
            orderBy: { placa: 'asc' },
        });
    }

    private async daEmpresa(id: string, empresaId: string) {
        const c = await this.prisma.conciliacaoExtrato.findFirst({ where: { id, empresaId } });
        if (!c) throw new NotFoundException('Conciliação não encontrada.');
        return c;
    }

    // ---------------------------------------------------------------- importar
    async importar(empresaId: string, usuario: string | null, arquivos: Express.Multer.File[]) {
        if (!arquivos?.length) throw new BadRequestException('Envie o extrato do mês.');
        const lidos: ExtratoLido[] = [];
        for (const a of arquivos) {
            try {
                lidos.push(lerExtrato(a.buffer));
            } catch (e: any) {
                throw new BadRequestException(`${a.originalname}: ${e?.message ?? 'não consegui ler o arquivo.'}`);
            }
        }
        if (lidos.filter((l) => l.formato === 'COMPLETO').length > 1 || lidos.filter((l) => l.formato === 'PIX').length > 1) {
            throw new BadRequestException('Mande no máximo 1 extrato completo e 1 relatório de Pix.');
        }
        const j = juntarExtratos(lidos);
        const mes = j.mes;
        if (!mes) throw new BadRequestException('O extrato não tem movimentações.');
        const pagamentos = j.movimentos.filter((m) => m.valor < 0);
        const recebimentos = j.movimentos.filter((m) => m.valor > 0);
        const soma = (l: typeof pagamentos) => Math.round(l.reduce((s, m) => s + Math.abs(m.valor), 0) * 100) / 100;

        const conc = await this.prisma.conciliacaoExtrato.create({
            data: {
                empresaId,
                mes,
                banco: j.banco,
                arquivos: arquivos.map((a) => a.originalname),
                totalPagamentos: soma(pagamentos),
                totalRecebimentos: soma(recebimentos),
                nPagamentos: pagamentos.length,
                nRecebimentos: recebimentos.length,
                saldoAnterior: j.saldoAnterior,
                saldoFinal: j.saldoFinal,
                criadoPor: usuario,
                itens: {
                    create: pagamentos.map((m, i) => ({
                        ordem: i + 1,
                        // Meio-dia em Brasília: não escorrega de mês por fuso.
                        data: new Date(`${m.data}T15:00:00.000Z`),
                        hora: m.hora,
                        tipo: m.tipo,
                        nome: m.nome.slice(0, 200),
                        documento: m.documento,
                        descricao: (m.descricao === m.linha && m.tipo === 'PIX' ? '' : m.descricao).slice(0, 500),
                        valor: Math.abs(m.valor),
                    })),
                },
            },
        });
        const auto = await this.classificarAuto(conc.id, empresaId);
        const avisos: string[] = [];
        if (!lidos.some((l) => l.formato === 'PIX')) avisos.push('Sem o relatório de Pix, os pagamentos Pix vêm sem a descrição (onde costumam estar as placas).');
        if (!lidos.some((l) => l.formato === 'COMPLETO')) avisos.push('Sem o extrato completo, boletos, tarifas e débitos automáticos ficam de fora — o total é só dos Pix.');
        if (j.pixSobrando > 0) avisos.push(`${j.pixSobrando} Pix do relatório não foram achados no extrato completo (data ou valor diferentes).`);
        return { id: conc.id, mes, pagamentos: pagamentos.length, classificados: auto, avisos };
    }

    // ------------------------------------------------- classificação automática
    // Só mexe nos pendentes (o que já foi classificado à mão ou pelo link fica).
    async classificarAuto(conciliacaoId: string, empresaId: string) {
        const conc = await this.daEmpresa(conciliacaoId, empresaId);
        const [itens, caminhoes, vinculos] = await Promise.all([
            this.prisma.conciliacaoExtratoItem.findMany({ where: { conciliacaoId }, orderBy: { ordem: 'asc' } }),
            this.caminhoes(empresaId),
            this.prisma.conciliacaoVinculo.findMany({ where: { empresaId } }),
        ]);
        const ids = new Set(caminhoes.map((c) => c.id));
        const validos = (k: string) => ids.has(k) || (FIXOS as readonly string[]).includes(k);

        // Termos de placa: placa completa, 3 letras (se só um caminhão tem) e vínculos PLACA.
        const termosPlaca = new Map<string, string>();
        const porPrefixo = new Map<string, string[]>();
        for (const c of caminhoes) {
            const p = placaLimpa(c.placa);
            termosPlaca.set(p, c.id);
            const pre = p.slice(0, 3);
            porPrefixo.set(pre, [...(porPrefixo.get(pre) ?? []), c.id]);
        }
        for (const [pre, l] of porPrefixo) if (l.length === 1 && !termosPlaca.has(pre)) termosPlaca.set(pre, l[0]);
        for (const v of vinculos) if (v.tipo === 'PLACA' && validos(v.destino)) termosPlaca.set(placaLimpa(v.termo), v.destino);
        const termosNome = vinculos.filter((v) => v.tipo === 'NOME' && validos(v.destino)).map((v) => ({ termo: norm(v.termo).trim(), destino: v.destino }));

        // Contas a Pagar já pagas perto da data, pra não contar a despesa duas vezes.
        const [y, m] = conc.mes.split('-').map(Number);
        const contas = await this.prisma.contaPagar.findMany({
            where: {
                empresaId,
                status: 'PAGA',
                pagoEm: { gte: new Date(Date.UTC(y, m - 1, 1) - 7 * 86400000), lt: new Date(Date.UTC(y, m, 1) + 7 * 86400000) },
            },
            select: { id: true, descricao: true, valor: true, juros: true, pagoEm: true, caminhaoId: true, caminhao: { select: { placa: true } }, rateios: { select: { id: true } } },
        });
        const usadas = new Set(itens.map((i) => i.contaPagar).filter(Boolean) as string[]);

        let n = 0;
        const updates: Prisma.PrismaPromise<unknown>[] = [];
        for (const it of itens) {
            if ((it.partes as Parte[] | null)?.length) continue;
            const texto = norm(`${it.nome} ${it.descricao}`);
            const palavras = texto.split(/[^A-Z0-9]+/).filter(Boolean);
            let partes: Parte[] = [];
            let motivo: string | null = null;
            let contaPagar: string | null = it.contaPagar;

            // 1) Já está em Contas a Pagar (paga) com caminhão → não lança de novo.
            const conta = contas.find((c) => !usadas.has(c.id)
                && Math.abs(cent(c.valor + (c.juros ?? 0)) - cent(it.valor)) <= 1
                && c.pagoEm && Math.abs(c.pagoEm.getTime() - it.data.getTime()) <= 5 * 86400000);
            if (conta) {
                usadas.add(conta.id);
                contaPagar = conta.id;
                if (conta.caminhaoId || conta.rateios.length) {
                    partes = [{ k: 'JA_LANCADO', v: it.valor }];
                    motivo = `já está em Contas a Pagar: ${conta.descricao}${conta.caminhao ? ` (${conta.caminhao.placa})` : conta.rateios.length ? ' (dividida entre caminhões)' : ''}`;
                }
            }

            // 2) Placas citadas ("RME", "FQL0363", "SEV E RME"...).
            if (!partes.length) {
                const achados: string[] = [];
                const citadas: string[] = [];
                for (const w of palavras) {
                    let dest = termosPlaca.get(w);
                    let termo = w;
                    if (!dest && /^[A-Z]{3}\d/.test(w)) { dest = termosPlaca.get(w.slice(0, 3)); termo = w.slice(0, 3); }
                    if (dest) { citadas.push(termo); if (!achados.includes(dest)) achados.push(dest); }
                }
                if (achados.length) {
                    partes = dividirIgual(it.valor, achados);
                    motivo = `placa ${[...new Set(citadas)].join('/')}${achados.length > 1 ? ' → dividido igual' : ''}`;
                }
            }

            // 3) "dividir em todas as placas" → todos os caminhões ativos.
            if (!partes.length && DIVIDIR.test(texto) && caminhoes.length) {
                partes = dividirIgual(it.valor, caminhoes.map((c) => c.id));
                motivo = `pediu pra dividir entre todos (${caminhoes.length})`;
            }

            // 4) Vínculo por nome (motorista, sócio, fornecedor fixo).
            let sugestao: string | null = null;
            if (!partes.length && termosNome.length) {
                const alvo = ` ${texto.replace(/[^A-Z0-9]+/g, ' ')} `;
                const hits = termosNome.filter((t) => alvo.includes(` ${t.termo.replace(/[^A-Z0-9]+/g, ' ').trim()} `));
                const dest = [...new Set(hits.map((h) => h.destino))];
                if (dest.length === 1) {
                    partes = [{ k: dest[0], v: it.valor }];
                    motivo = `nome ${hits.map((h) => h.termo).join('/')}`;
                } else if (dest.length > 1) {
                    sugestao = dest[0]; // cita mais de um: só sugere
                }
            }

            if (partes.length) n++;
            if (partes.length || contaPagar !== it.contaPagar || sugestao !== it.sugestao) {
                updates.push(this.prisma.conciliacaoExtratoItem.update({
                    where: { id: it.id },
                    data: { partes: partes as unknown as Prisma.InputJsonValue, origem: partes.length ? 'AUTO' : null, motivo, contaPagar, sugestao },
                }));
            }
        }
        if (updates.length) await this.prisma.$transaction(updates);
        return n;
    }

    // ------------------------------------------------------------ tela interna
    async listar(empresaId: string) {
        const lista = await this.prisma.conciliacaoExtrato.findMany({
            where: { empresaId },
            orderBy: [{ mes: 'desc' }, { createdAt: 'desc' }],
            select: { id: true, mes: true, banco: true, arquivos: true, totalPagamentos: true, nPagamentos: true, status: true, pendenteReaplicar: true, aplicadoEm: true, linkEnviadoEm: true, linkEnviadoPor: true, createdAt: true, itens: { select: { partes: true, valor: true } } },
        });
        return lista.map(({ itens, ...c }) => {
            const pend = itens.filter((i) => !(i.partes as Parte[] | null)?.length);
            return { ...c, pendentes: pend.length, valorPendente: Math.round(pend.reduce((s, i) => s + i.valor, 0) * 100) / 100 };
        });
    }

    async obter(id: string, empresaId: string) {
        const c = await this.prisma.conciliacaoExtrato.findFirst({
            where: { id, empresaId },
            include: { itens: { orderBy: { ordem: 'asc' } } },
        });
        if (!c) throw new NotFoundException('Conciliação não encontrada.');
        const [caminhoes, vinculos, lancados] = await Promise.all([
            this.caminhoes(empresaId),
            this.prisma.conciliacaoVinculo.findMany({ where: { empresaId }, orderBy: { termo: 'asc' } }),
            this.prisma.lancamentoCaminhao.aggregate({ where: { conciliacaoExtratoId: id }, _count: true, _sum: { valor: true } }),
        ]);
        return { ...c, caminhoes, vinculos, lancados: { quantidade: lancados._count, total: Number(lancados._sum.valor ?? 0) } };
    }

    // Valida e grava a classificação de vários itens (tela ou link).
    async salvarItens(conciliacaoId: string, itensBody: { id: string; partes?: Parte[]; nota?: string | null }[], origem: 'MANUAL' | 'LINK', empresaId: string) {
        if (!Array.isArray(itensBody)) throw new BadRequestException('Nada pra salvar.');
        const [atuais, caminhoes] = await Promise.all([
            this.prisma.conciliacaoExtratoItem.findMany({ where: { conciliacaoId } }),
            this.caminhoes(empresaId),
        ]);
        const porId = new Map(atuais.map((i) => [i.id, i]));
        const ids = new Set(caminhoes.map((c) => c.id));
        const updates: Prisma.PrismaPromise<unknown>[] = [];
        for (const b of itensBody.slice(0, 5000)) {
            const it = porId.get(b?.id);
            if (!it) continue;
            const data: Prisma.ConciliacaoExtratoItemUpdateInput = {};
            if (b.partes !== undefined) {
                const partes = (Array.isArray(b.partes) ? b.partes : [])
                    .map((p) => ({ k: String(p?.k ?? ''), v: Math.round(Number(p?.v) * 100) / 100 }))
                    .filter((p) => p.v > 0);
                for (const p of partes) {
                    if (!ids.has(p.k) && !(FIXOS as readonly string[]).includes(p.k)) throw new BadRequestException(`Destino inválido no pagamento ${it.ordem}.`);
                }
                const dup = new Set(partes.map((p) => p.k)).size !== partes.length;
                if (dup) throw new BadRequestException(`Destino repetido no pagamento ${it.ordem}.`);
                if (partes.length && Math.abs(cent(partes.reduce((s, p) => s + p.v, 0)) - cent(it.valor)) > 1) {
                    throw new BadRequestException(`Pagamento ${it.ordem} (${it.nome}): a soma das partes não bate com o valor.`);
                }
                const antes = JSON.stringify(it.partes ?? []);
                if (antes !== JSON.stringify(partes)) {
                    data.partes = partes as unknown as Prisma.InputJsonValue;
                    data.origem = partes.length ? origem : null;
                    data.motivo = null;
                }
            }
            if (b.nota !== undefined && (b.nota ?? '') !== (it.nota ?? '')) data.nota = (b.nota ?? '').slice(0, 300) || null;
            if (Object.keys(data).length) updates.push(this.prisma.conciliacaoExtratoItem.update({ where: { id: it.id }, data }));
        }
        if (updates.length) {
            await this.prisma.$transaction(updates);
            await this.prisma.conciliacaoExtrato.updateMany({ where: { id: conciliacaoId, status: 'APLICADA' }, data: { pendenteReaplicar: true } });
        }
        return { alterados: updates.length };
    }

    async salvarInterno(id: string, empresaId: string, itens: any[]) {
        await this.daEmpresa(id, empresaId);
        return this.salvarItens(id, itens, 'MANUAL', empresaId);
    }

    async reclassificar(id: string, empresaId: string) {
        const n = await this.classificarAuto(id, empresaId);
        return { classificados: n };
    }

    async gerarLink(id: string, empresaId: string) {
        await this.daEmpresa(id, empresaId);
        const token = randomBytes(24).toString('hex');
        await this.prisma.conciliacaoExtrato.update({ where: { id }, data: { token } });
        return { token };
    }

    async revogarLink(id: string, empresaId: string) {
        await this.daEmpresa(id, empresaId);
        await this.prisma.conciliacaoExtrato.update({ where: { id }, data: { token: null } });
        return { token: null };
    }

    // "OK": grava as partes de caminhão como despesa do mês na tela de Caminhões.
    async aplicar(id: string, empresaId: string, usuario: string | null) {
        const c = await this.prisma.conciliacaoExtrato.findFirst({ where: { id, empresaId }, include: { itens: { orderBy: { ordem: 'asc' } } } });
        if (!c) throw new NotFoundException('Conciliação não encontrada.');
        const caminhoes = await this.caminhoes(empresaId);
        const placa = new Map(caminhoes.map((x) => [x.id, x.placa]));
        const [y, m] = c.mes.split('-');
        const novos: Prisma.LancamentoCaminhaoCreateManyInput[] = [];
        for (const it of c.itens) {
            for (const p of (it.partes as Parte[] | null) ?? []) {
                const pl = placa.get(p.k);
                if (!pl) continue;
                const dividido = ((it.partes as Parte[]).length > 1) ? ` (parte de ${it.valor.toFixed(2).replace('.', ',')})` : '';
                novos.push({
                    empresaId,
                    placa: pl.toUpperCase(),
                    tipo: 'DESPESA',
                    descricao: `Extrato ${m}/${y}: ${it.nome}${it.descricao ? ` — ${it.descricao}` : ''}${dividido}`.slice(0, 250),
                    valor: new Prisma.Decimal(p.v.toFixed(2)),
                    data: it.data,
                    conciliacaoExtratoId: id,
                });
            }
        }
        await this.prisma.$transaction([
            this.prisma.lancamentoCaminhao.deleteMany({ where: { conciliacaoExtratoId: id } }),
            this.prisma.lancamentoCaminhao.createMany({ data: novos }),
            this.prisma.conciliacaoExtrato.update({ where: { id }, data: { status: 'APLICADA', aplicadoEm: new Date(), aplicadoPor: usuario, pendenteReaplicar: false } }),
        ]);
        const total = Math.round(novos.reduce((s, n) => s + Number(n.valor), 0) * 100) / 100;
        return { lancamentos: novos.length, total };
    }

    async desfazer(id: string, empresaId: string) {
        await this.daEmpresa(id, empresaId);
        const [r] = await this.prisma.$transaction([
            this.prisma.lancamentoCaminhao.deleteMany({ where: { conciliacaoExtratoId: id } }),
            this.prisma.conciliacaoExtrato.update({ where: { id }, data: { status: 'ABERTA', aplicadoEm: null, aplicadoPor: null, pendenteReaplicar: false } }),
        ]);
        return { removidos: r.count };
    }

    async excluir(id: string, empresaId: string) {
        await this.daEmpresa(id, empresaId);
        await this.prisma.conciliacaoExtrato.delete({ where: { id } }); // cascade: itens + despesas lançadas
        return { ok: true };
    }

    // ---------------------------------------------------------------- vínculos
    listarVinculos(empresaId: string) {
        return this.prisma.conciliacaoVinculo.findMany({ where: { empresaId }, orderBy: { termo: 'asc' } });
    }

    async salvarVinculo(empresaId: string, body: { termo?: string; tipo?: string; destino?: string }) {
        const termo = norm(body?.termo ?? '').replace(/\s+/g, ' ').trim();
        const tipo = body?.tipo === 'PLACA' ? 'PLACA' : 'NOME';
        const destino = String(body?.destino ?? '');
        if (termo.length < 3) throw new BadRequestException('Termo muito curto (mínimo 3 letras).');
        const ids = new Set((await this.caminhoes(empresaId)).map((c) => c.id));
        if (!ids.has(destino) && !['GERAL', 'SOCIO', 'NAO'].includes(destino)) throw new BadRequestException('Escolha o destino.');
        const t = tipo === 'PLACA' ? placaLimpa(termo) : termo;
        return this.prisma.conciliacaoVinculo.upsert({
            where: { empresaId_termo: { empresaId, termo: t } },
            create: { empresaId, termo: t, tipo, destino },
            update: { tipo, destino },
        });
    }

    // Vários de uma vez, um por linha: "FQA → POZ", "GIOVANNI = POZ", "NU GALHO ; SOCIOS".
    // Destino: placa (completa ou as 3 letras) de um caminhão cadastrado, ou GERAL / SOCIOS / NAO.
    async salvarVinculosLote(empresaId: string, texto: string) {
        const caminhoes = await this.caminhoes(empresaId);
        const destinoDe = (bruto: string): string | null => {
            const d = placaLimpa(bruto);
            if (/^GERA/.test(d) || d === 'EMPRESA') return 'GERAL';
            if (/^SOCIO|^PROPRIET/.test(d)) return 'SOCIO';
            if (/^NAO|^NAOEDESPESA/.test(d)) return 'NAO';
            const exata = caminhoes.find((c) => placaLimpa(c.placa) === d);
            if (exata) return exata.id;
            const pre = caminhoes.filter((c) => placaLimpa(c.placa).startsWith(d.slice(0, 3)));
            return d.length >= 3 && pre.length === 1 ? pre[0].id : null;
        };
        let salvos = 0;
        const erros: string[] = [];
        for (const linhaBruta of String(texto ?? '').split(/\r?\n/).slice(0, 500)) {
            const linha = linhaBruta.trim();
            if (!linha || linha.startsWith('#')) continue;
            const m = /^(.+?)\s*(?:→|->|=>|=|;|\t|:)\s*(.+)$/.exec(linha);
            if (!m) { erros.push(`"${linha}": use TERMO → DESTINO`); continue; }
            const termoTxt = norm(m[1]).replace(/\s+/g, ' ').trim();
            const destino = destinoDe(m[2]);
            if (!destino) { erros.push(`"${linha}": ${m[2].trim()} não está cadastrado em Caminhões`); continue; }
            const ehPlaca = /^[A-Z]{3}(-?\d[A-Z0-9]\d{2})?$/.test(termoTxt);
            try {
                await this.salvarVinculo(empresaId, { termo: termoTxt, tipo: ehPlaca ? 'PLACA' : 'NOME', destino });
                salvos++;
            } catch (e: any) {
                erros.push(`"${linha}": ${e?.message ?? 'erro'}`);
            }
        }
        return { salvos, erros };
    }

    async excluirVinculo(empresaId: string, id: string) {
        await this.prisma.conciliacaoVinculo.deleteMany({ where: { id, empresaId } });
        return { ok: true };
    }

    // ------------------------------------------------------------- link público
    private tentativas = new Map<string, number[]>();

    private async doToken(token: string, contar = false) {
        if (!token || token.length < 20) throw new NotFoundException('Link inválido.');
        const c = await this.prisma.conciliacaoExtrato.findUnique({ where: { token }, include: { empresa: { select: { nome: true, ativo: true } } } });
        if (!c || !c.empresa.ativo) throw new NotFoundException('Link inválido ou desativado.');
        if (contar) {
            const agora = Date.now();
            const r = (this.tentativas.get(token) ?? []).filter((t) => agora - t < 3600_000);
            if (r.length >= 120) throw new BadRequestException('Muitos envios em pouco tempo. Tente mais tarde.');
            r.push(agora);
            this.tentativas.set(token, r);
        }
        return c;
    }

    async obterPublico(token: string) {
        const c = await this.doToken(token);
        const [itens, caminhoes] = await Promise.all([
            this.prisma.conciliacaoExtratoItem.findMany({
                where: { conciliacaoId: c.id },
                orderBy: { ordem: 'asc' },
                select: { id: true, ordem: true, data: true, hora: true, tipo: true, nome: true, descricao: true, valor: true, partes: true, origem: true, motivo: true, sugestao: true, nota: true },
            }),
            this.caminhoes(c.empresaId),
        ]);
        return {
            empresa: c.empresa.nome, mes: c.mes, banco: c.banco,
            totalPagamentos: c.totalPagamentos, nPagamentos: c.nPagamentos, totalRecebimentos: c.totalRecebimentos,
            saldoAnterior: c.saldoAnterior, saldoFinal: c.saldoFinal,
            linkEnviadoEm: c.linkEnviadoEm, linkEnviadoPor: c.linkEnviadoPor,
            caminhoes, itens,
        };
    }

    async salvarPublico(token: string, body: { nome?: string; itens?: any[] }) {
        const c = await this.doToken(token, true);
        const r = await this.salvarItens(c.id, body?.itens ?? [], 'LINK', c.empresaId);
        await this.prisma.conciliacaoExtrato.update({
            where: { id: c.id },
            data: { linkEnviadoEm: new Date(), linkEnviadoPor: (body?.nome ?? '').trim().slice(0, 80) || 'Link' },
        });
        return { ok: true, ...r };
    }
}
