import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { dentroDaFaixa, faixaDoMes } from '../../common/mes.util';

// Data que decide em qual mês uma conta a pagar cai: paga = quando foi paga
// (sem data, vencimento); em aberto = vencimento.
const dataRefPagar = (c: { status: string; pagoEm: Date | null; vencimento: Date }) =>
    c.status === 'PAGA' ? c.pagoEm ?? c.vencimento : c.vencimento;

@Injectable()
export class CaminhaoService {
    constructor(private prisma: PrismaService) { }

    // Filtro usado em toda leitura: mostra os caminhões da empresa logada
    // e, transitoriamente, os que ainda não têm empresa definida (registros
    // de antes do retrofit multi-empresa). Isso evita que a lista suma pra
    // quem ainda não rodou o backfill de empresaId — depois que todo
    // caminhão tiver empresa, a segunda condição nunca mais bate.
    private filtroEmpresa(empresaId: string) {
        return { OR: [{ empresaId }, { empresaId: null }] };
    }

    async create(data: { placa: string }, empresaId: string) {
        const placa = data.placa.toUpperCase();

        const existe = await this.prisma.caminhao.findUnique({
            where: { placa },
        });

        if (existe) {
            throw new BadRequestException('Caminhão já cadastrado');
        }

        return this.prisma.caminhao.create({
            data: { placa, empresaId },
        });
    }

    findAll(empresaId: string) {
        return this.prisma.caminhao.findMany({
            where: this.filtroEmpresa(empresaId),
            orderBy: { placa: 'asc' },
        });
    }

    private async encontrarOuFalhar(id: string, empresaId: string) {
        const caminhao = await this.prisma.caminhao.findFirst({
            where: { id, ...this.filtroEmpresa(empresaId) },
        });

        if (!caminhao) {
            throw new NotFoundException('Caminhão não encontrado');
        }

        // Grandfathering: se o caminhão ainda não tem empresa, a primeira
        // empresa que mexer nele "adota" (evita ficar solto pra sempre).
        if (!caminhao.empresaId) {
            return this.prisma.caminhao.update({
                where: { id },
                data: { empresaId },
            });
        }

        return caminhao;
    }

    async findOne(id: string, empresaId: string) {
        return this.encontrarOuFalhar(id, empresaId);
    }

    async update(
        id: string,
        data: {
            placa?: string;
            ativo?: boolean;
            capacidadeTanqueLitros?: number | null;
        },
        empresaId: string,
    ) {
        await this.encontrarOuFalhar(id, empresaId);

        return this.prisma.caminhao.update({
            where: { id },
            data: {
                placa: data.placa
                    ? data.placa.toUpperCase()
                    : undefined,
                ativo: data.ativo,
                capacidadeTanqueLitros:
                    data.capacidadeTanqueLitros !== undefined
                        ? data.capacidadeTanqueLitros
                        : undefined,
            },
        });
    }

    async removePeriodo(caminhaoId: string, mes: string, empresaId: string) {
        await this.encontrarOuFalhar(caminhaoId, empresaId);

        const periodo = await this.prisma.uploadPeriod.findFirst({
            where: { caminhaoId, periodo: mes },
        });

        // Apaga o resumo do mês. TripRecord/StopRecord são apagados
        // automaticamente junto com o UploadPeriod (cascade no schema).
        await this.prisma.resumoOperacao.deleteMany({
            where: { caminhaoId, mes },
        });

        if (periodo) {
            await this.prisma.uploadPeriod.delete({
                where: { id: periodo.id },
            });
        }

        return { ok: true };
    }

    async remove(id: string, empresaId: string) {
        await this.encontrarOuFalhar(id, empresaId);

        await this.prisma.tripRecord.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.stopRecord.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.resumoOperacao.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.uploadPeriod.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.truckStatus.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.truckRule.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.upload.deleteMany({
            where: { caminhaoId: id },
        });

        await this.prisma.relatorioPagamento.deleteMany({
            where: { caminhaoId: id },
        });

        return this.prisma.caminhao.delete({
            where: { id },
        });
    }

    // Detalhe da página de Caminhão, buscado pela PLACA (não pelo id) —
    // assim funciona tanto pra caminhão cadastrado (frota própria) quanto
    // pra placa de terceiro que só existe em ViagemGps, sem registro em
    // Caminhao. É o que alimenta o cabeçalho da tela (nome, badge
    // "Terceiro", se está cadastrado) e o comparativo de Receita x Despesa.
    async getDetalhePorPlaca(placaRaw: string, empresaId: string, mes?: string) {
        const placa = placaRaw.toUpperCase();
        // Filtro de mês opcional (AAAA-MM): só entra o que é daquele mês.
        const faixa = faixaDoMes(mes);

        const caminhao = await this.prisma.caminhao.findFirst({
            where: { placa, ...this.filtroEmpresa(empresaId) },
        });

        const viagemTerceiro = await this.prisma.viagemGps.findFirst({
            where: { placa, empresaId, terceiro: true },
            select: { id: true },
        });

        const lancamentos = (await this.prisma.lancamentoCaminhao.findMany({
            where: { placa, empresaId },
        })).filter((l) => dentroDaFaixa(l.data, faixa));

        const totalReceita = lancamentos
            .filter((l) => l.tipo === 'RECEITA')
            .reduce((acc, l) => acc + Number(l.valor), 0);

        let totalReceitaFinal = totalReceita;
        let totalDespesa = lancamentos
            .filter((l) => l.tipo === 'DESPESA')
            .reduce((acc, l) => acc + Number(l.valor), 0);

        // Contas a pagar vinculadas ao caminhão (Financeiro → Contas a
        // Pagar, campo "Caminhão") também contam como despesa dele — só é
        // possível pra caminhão cadastrado, já que o vínculo é por
        // caminhaoId (placa de terceiro não tem Caminhao pra vincular).
        // Conta cancelada não conta.
        if (caminhao) {
            const contasPagar = (await this.prisma.contaPagar.findMany({
                where: { caminhaoId: caminhao.id, empresaId, status: { not: 'CANCELADA' } },
            })).filter((c) => dentroDaFaixa(dataRefPagar(c), faixa));
            totalDespesa += contasPagar.reduce((acc, c) => acc + c.valor + (c.status === 'PAGA' ? c.juros ?? 0 : 0), 0);

            // Parcelas de contas pagas/recebidas divididas entre mais de uma carreta.
            const rateiosPagar = (await this.prisma.contaPagarRateio.findMany({
                where: { caminhaoId: caminhao.id, contaPagar: { empresaId, status: { not: 'CANCELADA' } } },
                select: { valor: true, contaPagar: { select: { status: true, pagoEm: true, vencimento: true } } },
            })).filter((r) => dentroDaFaixa(dataRefPagar(r.contaPagar), faixa));
            totalDespesa += rateiosPagar.reduce((acc, r) => acc + r.valor, 0);

            // Contas a Receber já recebidas (conciliadas) viram receita do caminhão.
            const recebidas = (await this.prisma.contaReceber.findMany({
                where: { caminhaoId: caminhao.id, empresaId, status: 'RECEBIDA' },
                select: { valor: true, valorRecebido: true, recebidoEm: true, vencimento: true },
            })).filter((c) => dentroDaFaixa(c.recebidoEm ?? c.vencimento, faixa));
            totalReceitaFinal += recebidas.reduce((acc, c) => acc + (c.valorRecebido ?? c.valor), 0);
            const rateiosReceber = (await this.prisma.contaReceberRateio.findMany({
                where: { caminhaoId: caminhao.id, contaReceber: { empresaId, status: 'RECEBIDA' } },
                select: { valor: true, contaReceber: { select: { recebidoEm: true, vencimento: true } } },
            })).filter((r) => dentroDaFaixa(r.contaReceber.recebidoEm ?? r.contaReceber.vencimento, faixa));
            totalReceitaFinal += rateiosReceber.reduce((acc, r) => acc + r.valor, 0);
        }

        return {
            placa,
            cadastrado: !!caminhao,
            id: caminhao?.id ?? null,
            ativo: caminhao?.ativo ?? null,
            capacidadeTanqueLitros: caminhao?.capacidadeTanqueLitros ?? null,
            terceiro: !!viagemTerceiro,
            totalReceita: totalReceitaFinal,
            totalDespesa,
            diferenca: totalReceitaFinal - totalDespesa,
        };
    }

    // Mescla os lançamentos manuais (Receita/Despesa) com as Contas a Pagar
    // vinculadas a esse caminhão, pra aparecerem juntas na lista de despesa
    // da tela do caminhão. Cada item carrega "origem" pra o frontend saber
    // que conta a pagar não pode ser excluída por aqui (só em Contas a Pagar).
    async listarLancamentos(placaRaw: string, empresaId: string, mes?: string) {
        const placa = placaRaw.toUpperCase();
        const faixa = faixaDoMes(mes);

        const [lancamentos, caminhao] = await Promise.all([
            this.prisma.lancamentoCaminhao.findMany({
                where: { placa, empresaId },
                orderBy: { data: 'desc' },
            }),
            this.prisma.caminhao.findFirst({ where: { placa, ...this.filtroEmpresa(empresaId) } }),
        ]);

        const manuais = lancamentos.map((l) => ({
            id: l.id,
            tipo: l.tipo,
            descricao: l.descricao,
            valor: Number(l.valor),
            data: l.data,
            origem: 'MANUAL' as const,
        }));

        if (!caminhao) return manuais.filter((l) => dentroDaFaixa(l.data, faixa));

        const contasPagar = await this.prisma.contaPagar.findMany({
            where: { caminhaoId: caminhao.id, empresaId, status: { not: 'CANCELADA' } },
            orderBy: { vencimento: 'desc' },
        });

        const daContasPagar = contasPagar.map((c) => ({
            id: c.id,
            tipo: 'DESPESA' as const,
            descricao: `${c.descricao} (Conta a Pagar)`,
            valor: c.valor,
            data: dataRefPagar(c),
            origem: 'CONTA_PAGAR' as const,
            status: c.status,
        }));

        const rateiosPagar = await this.prisma.contaPagarRateio.findMany({
            where: { caminhaoId: caminhao.id, contaPagar: { empresaId, status: { not: 'CANCELADA' } } },
            include: { contaPagar: { include: { rateios: { select: { id: true } } } } },
        });
        const daRateioPagar = rateiosPagar.map((r) => ({
            id: `rateio-${r.id}`,
            tipo: 'DESPESA' as const,
            descricao: `${r.contaPagar.descricao} (Conta a Pagar · dividida em ${r.contaPagar.rateios.length} carretas)`,
            valor: r.valor,
            data: dataRefPagar(r.contaPagar),
            origem: 'CONTA_PAGAR' as const,
            status: r.contaPagar.status,
        }));

        const recebidas = await this.prisma.contaReceber.findMany({
            where: { caminhaoId: caminhao.id, empresaId, status: 'RECEBIDA' },
        });
        const daContasReceber = recebidas.map((c) => ({
            id: `receber-${c.id}`,
            tipo: 'RECEITA' as const,
            descricao: `${c.descricao}${c.cliente ? ` — ${c.cliente}` : ''} (Conta a Receber)`,
            valor: c.valorRecebido ?? c.valor,
            data: c.recebidoEm ?? c.vencimento,
            origem: 'CONTA_RECEBER' as const,
        }));
        const rateiosReceber = await this.prisma.contaReceberRateio.findMany({
            where: { caminhaoId: caminhao.id, contaReceber: { empresaId, status: 'RECEBIDA' } },
            include: { contaReceber: { include: { rateios: { select: { id: true } } } } },
        });
        const daRateioReceber = rateiosReceber.map((r) => ({
            id: `rateio-receber-${r.id}`,
            tipo: 'RECEITA' as const,
            descricao: `${r.contaReceber.descricao} (Conta a Receber · dividida em ${r.contaReceber.rateios.length} carretas)`,
            valor: r.valor,
            data: r.contaReceber.recebidoEm ?? r.contaReceber.vencimento,
            origem: 'CONTA_RECEBER' as const,
        }));

        return [...manuais, ...daContasPagar, ...daRateioPagar, ...daContasReceber, ...daRateioReceber]
            .filter((l) => dentroDaFaixa(l.data, faixa))
            .sort(
            (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
        );
    }

    async criarLancamento(
        data: {
            placa: string;
            tipo: 'RECEITA' | 'DESPESA';
            descricao: string;
            valor: number;
            data?: string;
        },
        empresaId: string,
    ) {
        if (!data.placa?.trim()) {
            throw new BadRequestException('Informe a placa do caminhão.');
        }

        if (data.tipo !== 'RECEITA' && data.tipo !== 'DESPESA') {
            throw new BadRequestException('Tipo inválido (use RECEITA ou DESPESA).');
        }

        if (!data.descricao?.trim()) {
            throw new BadRequestException('Informe a descrição do lançamento.');
        }

        if (!data.valor || data.valor <= 0) {
            throw new BadRequestException('Informe um valor maior que zero.');
        }

        return this.prisma.lancamentoCaminhao.create({
            data: {
                empresaId,
                placa: data.placa.toUpperCase(),
                tipo: data.tipo,
                descricao: data.descricao.trim(),
                valor: data.valor,
                data: data.data ? new Date(`${data.data}T12:00:00`) : undefined,
            },
        });
    }

    async excluirLancamento(lancamentoId: string, empresaId: string) {
        const lancamento = await this.prisma.lancamentoCaminhao.findFirst({
            where: { id: lancamentoId, empresaId },
        });

        if (!lancamento) {
            throw new NotFoundException('Lançamento não encontrado.');
        }

        await this.prisma.lancamentoCaminhao.delete({ where: { id: lancamentoId } });

        return { ok: true };
    }

    async getTimeline(id: string, empresaId: string) {
        await this.encontrarOuFalhar(id, empresaId);

        const caminhao = await this.prisma.caminhao.findUnique({
            where: { id },
            include: {
                tripRecords: { orderBy: { dataHoraChegada: 'asc' } },
                stopRecords: { orderBy: { dataHoraEntrada: 'asc' } },
            },
        });

        if (!caminhao) {
            throw new BadRequestException('Caminhão não encontrado');
        }

        let contadorViagem = 0;
        let acumuladoDiasParados = 0;

        const totalDiasParados = caminhao.stopRecords.reduce(
            (acc, stop) => acc + stop.diasParados,
            0,
        );

        const timeline = [
            ...caminhao.stopRecords.flatMap((stop) => {
                const eventos: any[] = [
                    {
                        date: stop.dataHoraEntrada,
                        label: `Chegou em ${stop.cidadeEntrada}`,
                        type: 'arrival',
                        extra: null,
                    },
                ];

                if (stop.dataHoraSaida) {
                    acumuladoDiasParados += stop.diasParados;

                    eventos.push({
                        date: stop.dataHoraSaida,
                        label: `Saiu de ${stop.cidadeEntrada}`,
                        type: 'departure',
                        extra:
                            stop.diasParados > 0
                                ? `${stop.diasParados} ${stop.diasParados > 1
                                    ? 'dias parados'
                                    : 'dia parado'
                                } — acumulado ${acumuladoDiasParados}/${totalDiasParados}`
                                : '0 dia parado',
                    });
                }

                return eventos;
            }),

            ...caminhao.tripRecords.map((trip) => {
                contadorViagem++;

                return {
                    date: trip.dataHoraChegada,
                    label: `Chegou em ${trip.cidade}`,
                    type: 'arrival',
                    extra: `Viagem #${contadorViagem}`,
                };
            }),
        ];

        return timeline.sort(
            (a, b) =>
                new Date(a.date).getTime() -
                new Date(b.date).getTime(),
        );
    }
}
