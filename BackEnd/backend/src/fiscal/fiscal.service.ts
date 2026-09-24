import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatusCiot, StatusRpa, TipoPreparoFiscal } from '@prisma/client';

// Valores de referência (aproximados) pra cálculo automático de INSS/IRRF
// sobre o RPA — o usuário pode sempre editar o valor final. Não substitui
// orientação contábil; a tabela do IR muda com o tempo e deve ser revisada
// periodicamente.
const TETO_INSS_VALOR = 951.63; // teto da contribuição de 11% (referência)

const FAIXAS_IRRF = [
    { ate: 2259.2, aliquota: 0, deduzir: 0 },
    { ate: 2826.65, aliquota: 7.5, deduzir: 169.44 },
    { ate: 3751.05, aliquota: 15, deduzir: 381.44 },
    { ate: 4664.68, aliquota: 22.5, deduzir: 662.77 },
    { ate: Infinity, aliquota: 27.5, deduzir: 896.0 },
];

function calcularIrrf(base: number): { aliquota: number; valor: number } {
    if (base <= 0) return { aliquota: 0, valor: 0 };
    const faixa = FAIXAS_IRRF.find((f) => base <= f.ate) ?? FAIXAS_IRRF[FAIXAS_IRRF.length - 1];
    const valor = Math.max(0, base * (faixa.aliquota / 100) - faixa.deduzir);
    return { aliquota: faixa.aliquota, valor: Number(valor.toFixed(2)) };
}

// Itens padrão do checklist de preparação — criados automaticamente na
// primeira consulta de cada tipo, se ainda não existirem.
const ITENS_PREPARO: Record<TipoPreparoFiscal, Array<{ chave: string; titulo: string; descricao: string }>> = {
    CTE: [
        {
            chave: 'rntrc_ativo',
            titulo: 'RNTRC ativo na ANTT',
            descricao: 'Registro Nacional de Transportadores Rodoviários de Cargas da empresa, categoria "Transportador de Carga Própria" ou "Empresa", em situação regular.',
        },
        {
            chave: 'certificado_digital',
            titulo: 'Certificado digital e-CNPJ (A1 ou A3)',
            descricao: 'Certificado digital da empresa válido, usado tanto pra CT-e quanto pra NF-e/NFS-e — se já usado nas notas fiscais, é o mesmo.',
        },
        {
            chave: 'credenciamento_cte',
            titulo: 'Credenciamento como emissor de CT-e na Sefaz',
            descricao: 'Cadastro específico de CT-e na Sefaz do estado da empresa (é separado do credenciamento de NF-e/NFS-e).',
        },
        {
            chave: 'software_emissor',
            titulo: 'Definir o emissor técnico do CT-e',
            descricao: 'Decidir se o CT-e sai por este sistema (reaproveitando a infra de NF-e já existente) ou por um emissor terceirizado.',
        },
        {
            chave: 'serie_numeracao',
            titulo: 'Série e numeração inicial definidas',
            descricao: 'Combinar com a Sefaz/contador qual série e a partir de que número começar a emitir.',
        },
    ],
    MDFE: [
        {
            chave: 'cte_ativo',
            titulo: 'CT-e já em produção',
            descricao: 'MDF-e agrupa CT-e (e/ou NF-e) já autorizados — não faz sentido preparar o MDF-e antes do CT-e estar rodando.',
        },
        {
            chave: 'credenciamento_mdfe',
            titulo: 'Credenciamento como emissor de MDF-e na Sefaz',
            descricao: 'Cadastro específico de MDF-e — costuma ser liberado junto com o de CT-e, mas confirme com a Sefaz do estado.',
        },
        {
            chave: 'dados_veiculo_motorista',
            titulo: 'Dados de veículo/motorista completos',
            descricao: 'RNTRC do veículo, placa, CPF e CNH do motorista precisam estar corretos — vão direto no XML do MDF-e.',
        },
        {
            chave: 'software_emissor',
            titulo: 'Definir o emissor técnico do MDF-e',
            descricao: 'Mesma decisão do CT-e: emitir por aqui ou por um sistema terceirizado.',
        },
    ],
};

@Injectable()
export class FiscalService {
    constructor(private readonly prisma: PrismaService) { }

    // ---------------------------------------------------------------------
    // RPA
    // ---------------------------------------------------------------------

    // Grandfathering igual ao CaminhaoService: mostra os registros da
    // empresa logada e, transitoriamente, os que ainda não têm empresa
    // definida (de antes do retrofit multi-empresa).
    private filtroEmpresa(empresaId: string) {
        return { OR: [{ empresaId }, { empresaId: null }] };
    }

    async listarRpa(empresaId: string, params: { competencia?: string; status?: StatusRpa; caminhaoId?: string }) {
        return this.prisma.rpaRecibo.findMany({
            where: {
                ...this.filtroEmpresa(empresaId),
                competencia: params.competencia || undefined,
                status: params.status || undefined,
                caminhaoId: params.caminhaoId || undefined,
            },
            include: { caminhao: { select: { placa: true } } },
            orderBy: [{ competencia: 'desc' }, { createdAt: 'desc' }],
        });
    }

    async resumoRpa(empresaId: string, competencia?: string) {
        const recibos = await this.prisma.rpaRecibo.findMany({
            where: { ...this.filtroEmpresa(empresaId), competencia: competencia || undefined },
        });
        const totalBruto = recibos.reduce((s, r) => s + r.valorBruto, 0);
        const totalLiquido = recibos.reduce((s, r) => s + r.valorLiquido, 0);
        const totalInss = recibos.reduce((s, r) => s + r.valorInss, 0);
        const totalIrrf = recibos.reduce((s, r) => s + r.valorIrrf, 0);
        const pendentes = recibos.filter((r) => r.status === 'PENDENTE').length;
        return {
            competencia: competencia ?? null,
            quantidade: recibos.length,
            pendentes,
            totalBruto,
            totalInss,
            totalIrrf,
            totalLiquido,
        };
    }

    // Recalcula INSS/IRRF a partir do valor bruto informado — usado tanto
    // na criação quanto sempre que o usuário mudar o valor bruto. O
    // resultado é só sugestão: todos os campos calculados continuam
    // editáveis manualmente depois.
    calcularValoresRpa(valorBruto: number, aliquotaInssInformada?: number) {
        const aliquotaInss = aliquotaInssInformada ?? 11;
        const valorInss = Number(Math.min(valorBruto * (aliquotaInss / 100), TETO_INSS_VALOR).toFixed(2));
        const baseIrrf = Number(Math.max(0, valorBruto - valorInss).toFixed(2));
        const { aliquota: aliquotaIrrf, valor: valorIrrf } = calcularIrrf(baseIrrf);
        const valorLiquido = Number((valorBruto - valorInss - valorIrrf).toFixed(2));
        return { aliquotaInss, valorInss, baseIrrf, aliquotaIrrf, valorIrrf, valorLiquido };
    }

    async criarRpa(empresaId: string, body: {
        motoristaNome: string;
        motoristaCpf?: string;
        motoristaPix?: string;
        caminhaoId?: string;
        competencia: string;
        descricaoServico?: string;
        valorBruto: number;
        aliquotaInss?: number;
        observacao?: string;
    }) {
        if (!body.motoristaNome?.trim()) throw new BadRequestException('Informe o nome do motorista.');
        if (!body.competencia?.trim()) throw new BadRequestException('Informe a competência (mês).');
        if (!body.valorBruto || body.valorBruto <= 0) throw new BadRequestException('Informe o valor bruto.');

        const calculado = this.calcularValoresRpa(body.valorBruto, body.aliquotaInss);

        return this.prisma.rpaRecibo.create({
            data: {
                empresaId,
                motoristaNome: body.motoristaNome.trim(),
                motoristaCpf: body.motoristaCpf?.trim() || null,
                motoristaPix: body.motoristaPix?.trim() || null,
                caminhaoId: body.caminhaoId || null,
                competencia: body.competencia.trim(),
                descricaoServico: body.descricaoServico?.trim() || null,
                valorBruto: body.valorBruto,
                ...calculado,
                observacao: body.observacao?.trim() || null,
            },
        });
    }

    private async encontrarRpaOuFalhar(id: string, empresaId: string) {
        const existente = await this.prisma.rpaRecibo.findFirst({
            where: { id, ...this.filtroEmpresa(empresaId) },
        });
        if (!existente) throw new NotFoundException('RPA não encontrado.');
        if (!existente.empresaId) {
            return this.prisma.rpaRecibo.update({ where: { id }, data: { empresaId } });
        }
        return existente;
    }

    async atualizarRpa(
        id: string,
        empresaId: string,
        body: Partial<{
            motoristaNome: string;
            motoristaCpf: string;
            motoristaPix: string;
            caminhaoId: string | null;
            competencia: string;
            descricaoServico: string;
            valorBruto: number;
            aliquotaInss: number;
            valorInss: number;
            baseIrrf: number;
            aliquotaIrrf: number;
            valorIrrf: number;
            valorLiquido: number;
            status: StatusRpa;
            dataPagamento: string | null;
            formaPagamento: string;
            observacao: string;
            recalcular: boolean;
        }>,
    ) {
        const existente = await this.encontrarRpaOuFalhar(id, empresaId);

        let camposCalculados = {};
        if (body.recalcular && (body.valorBruto !== undefined || body.aliquotaInss !== undefined)) {
            const valorBruto = body.valorBruto ?? existente.valorBruto;
            const aliquotaInss = body.aliquotaInss ?? existente.aliquotaInss;
            camposCalculados = this.calcularValoresRpa(valorBruto, aliquotaInss);
        }

        return this.prisma.rpaRecibo.update({
            where: { id },
            data: {
                motoristaNome: body.motoristaNome?.trim(),
                motoristaCpf: body.motoristaCpf !== undefined ? body.motoristaCpf?.trim() || null : undefined,
                motoristaPix: body.motoristaPix !== undefined ? body.motoristaPix?.trim() || null : undefined,
                caminhaoId: body.caminhaoId !== undefined ? body.caminhaoId || null : undefined,
                competencia: body.competencia?.trim(),
                descricaoServico: body.descricaoServico !== undefined ? body.descricaoServico?.trim() || null : undefined,
                valorBruto: body.valorBruto,
                aliquotaInss: body.aliquotaInss,
                valorInss: body.valorInss,
                baseIrrf: body.baseIrrf,
                aliquotaIrrf: body.aliquotaIrrf,
                valorIrrf: body.valorIrrf,
                valorLiquido: body.valorLiquido,
                status: body.status,
                dataPagamento: body.dataPagamento !== undefined ? (body.dataPagamento ? new Date(`${body.dataPagamento}T12:00:00`) : null) : undefined,
                formaPagamento: body.formaPagamento !== undefined ? body.formaPagamento?.trim() || null : undefined,
                observacao: body.observacao !== undefined ? body.observacao?.trim() || null : undefined,
                ...camposCalculados,
            },
        });
    }

    async marcarRpaPago(id: string, empresaId: string, body: { dataPagamento?: string; formaPagamento?: string }) {
        const existente = await this.encontrarRpaOuFalhar(id, empresaId);
        return this.prisma.rpaRecibo.update({
            where: { id },
            data: {
                status: StatusRpa.PAGO,
                dataPagamento: body.dataPagamento ? new Date(`${body.dataPagamento}T12:00:00`) : new Date(),
                formaPagamento: body.formaPagamento?.trim() || existente.formaPagamento,
            },
        });
    }

    async removerRpa(id: string, empresaId: string) {
        await this.encontrarRpaOuFalhar(id, empresaId);
        await this.prisma.rpaRecibo.delete({ where: { id } });
        return { ok: true };
    }

    // ---------------------------------------------------------------------
    // CIOT
    // ---------------------------------------------------------------------

    async listarCiot(empresaId: string, params: { status?: StatusCiot; caminhaoId?: string }) {
        return this.prisma.ciotRegistro.findMany({
            where: {
                ...this.filtroEmpresa(empresaId),
                status: params.status || undefined,
                caminhaoId: params.caminhaoId || undefined,
            },
            include: { caminhao: { select: { placa: true } } },
            orderBy: [{ dataViagem: 'desc' }],
        });
    }

    private async encontrarCiotOuFalhar(id: string, empresaId: string) {
        const existente = await this.prisma.ciotRegistro.findFirst({
            where: { id, ...this.filtroEmpresa(empresaId) },
        });
        if (!existente) throw new NotFoundException('Registro de CIOT não encontrado.');
        if (!existente.empresaId) {
            return this.prisma.ciotRegistro.update({ where: { id }, data: { empresaId } });
        }
        return existente;
    }

    async criarCiot(empresaId: string, body: {
        caminhaoId?: string;
        motoristaNome: string;
        motoristaCpf?: string;
        origemMunicipio: string;
        destinoMunicipio: string;
        dataViagem: string;
        valorFrete?: number;
        operadora?: string;
        numeroCiot?: string;
        observacao?: string;
    }) {
        if (!body.motoristaNome?.trim()) throw new BadRequestException('Informe o nome do motorista.');
        if (!body.origemMunicipio?.trim() || !body.destinoMunicipio?.trim()) {
            throw new BadRequestException('Informe origem e destino.');
        }
        if (!body.dataViagem) throw new BadRequestException('Informe a data da viagem.');

        return this.prisma.ciotRegistro.create({
            data: {
                empresaId,
                caminhaoId: body.caminhaoId || null,
                motoristaNome: body.motoristaNome.trim(),
                motoristaCpf: body.motoristaCpf?.trim() || null,
                origemMunicipio: body.origemMunicipio.trim(),
                destinoMunicipio: body.destinoMunicipio.trim(),
                dataViagem: new Date(`${body.dataViagem}T12:00:00`),
                valorFrete: body.valorFrete || null,
                operadora: body.operadora?.trim() || null,
                numeroCiot: body.numeroCiot?.trim() || null,
                status: body.numeroCiot?.trim() ? StatusCiot.EMITIDO : StatusCiot.PENDENTE,
                dataEmissao: body.numeroCiot?.trim() ? new Date() : null,
                observacao: body.observacao?.trim() || null,
            },
        });
    }

    async atualizarCiot(
        id: string,
        empresaId: string,
        body: Partial<{
            caminhaoId: string | null;
            motoristaNome: string;
            motoristaCpf: string;
            origemMunicipio: string;
            destinoMunicipio: string;
            dataViagem: string;
            valorFrete: number;
            operadora: string;
            numeroCiot: string;
            status: StatusCiot;
            observacao: string;
        }>,
    ) {
        const existente = await this.encontrarCiotOuFalhar(id, empresaId);

        const numeroCiotInformado = body.numeroCiot !== undefined ? body.numeroCiot?.trim() || null : undefined;

        return this.prisma.ciotRegistro.update({
            where: { id },
            data: {
                caminhaoId: body.caminhaoId !== undefined ? body.caminhaoId || null : undefined,
                motoristaNome: body.motoristaNome?.trim(),
                motoristaCpf: body.motoristaCpf !== undefined ? body.motoristaCpf?.trim() || null : undefined,
                origemMunicipio: body.origemMunicipio?.trim(),
                destinoMunicipio: body.destinoMunicipio?.trim(),
                dataViagem: body.dataViagem ? new Date(`${body.dataViagem}T12:00:00`) : undefined,
                valorFrete: body.valorFrete,
                operadora: body.operadora !== undefined ? body.operadora?.trim() || null : undefined,
                numeroCiot: numeroCiotInformado,
                status: body.status ?? (numeroCiotInformado ? StatusCiot.EMITIDO : undefined),
                dataEmissao: numeroCiotInformado && !existente.dataEmissao ? new Date() : undefined,
                observacao: body.observacao !== undefined ? body.observacao?.trim() || null : undefined,
            },
        });
    }

    async removerCiot(id: string, empresaId: string) {
        await this.encontrarCiotOuFalhar(id, empresaId);
        await this.prisma.ciotRegistro.delete({ where: { id } });
        return { ok: true };
    }

    // ---------------------------------------------------------------------
    // Preparação CT-e / MDF-e (checklist)
    // ---------------------------------------------------------------------

    async listarPreparo(tipo: TipoPreparoFiscal) {
        await this.garantirItensPreparo(tipo);
        const itens = await this.prisma.fiscalPreparoItem.findMany({
            where: { tipo },
            orderBy: { ordem: 'asc' },
        });
        const concluidos = itens.filter((i) => i.concluido).length;
        return {
            tipo,
            itens,
            totalItens: itens.length,
            concluidos,
            percentual: itens.length ? Math.round((concluidos / itens.length) * 100) : 0,
            pronto: itens.length > 0 && concluidos === itens.length,
        };
    }

    private async garantirItensPreparo(tipo: TipoPreparoFiscal) {
        const existentes = await this.prisma.fiscalPreparoItem.count({ where: { tipo } });
        if (existentes > 0) return;
        const base = ITENS_PREPARO[tipo];
        await this.prisma.fiscalPreparoItem.createMany({
            data: base.map((item, index) => ({
                tipo,
                chave: item.chave,
                titulo: item.titulo,
                descricao: item.descricao,
                ordem: index,
            })),
            skipDuplicates: true,
        });
    }

    async alternarItemPreparo(id: string, concluido: boolean) {
        const existente = await this.prisma.fiscalPreparoItem.findUnique({ where: { id } });
        if (!existente) throw new NotFoundException('Item não encontrado.');
        return this.prisma.fiscalPreparoItem.update({
            where: { id },
            data: { concluido, concluidoEm: concluido ? new Date() : null },
        });
    }
}
