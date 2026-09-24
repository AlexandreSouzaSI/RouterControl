import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { FiscalService } from './fiscal.service';
import { EmpresaModulo, StatusCiot, StatusRpa, TipoPreparoFiscal } from '@prisma/client';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { RequiresModulo } from '../auth/requires-modulo.decorator';

@Controller('fiscal')
@RequiresModulo(EmpresaModulo.FISCAL)
export class FiscalController {
    constructor(private readonly service: FiscalService) { }

    // ---------------- RPA ----------------

    @Get('rpa')
    listarRpa(
        @EmpresaAtual() empresaId: string,
        @Query('competencia') competencia?: string,
        @Query('status') status?: StatusRpa,
        @Query('caminhaoId') caminhaoId?: string,
    ) {
        return this.service.listarRpa(empresaId, { competencia, status, caminhaoId });
    }

    @Get('rpa/resumo')
    resumoRpa(@EmpresaAtual() empresaId: string, @Query('competencia') competencia?: string) {
        return this.service.resumoRpa(empresaId, competencia);
    }

    @Post('rpa/calcular')
    calcularRpa(@Body() body: { valorBruto: number; aliquotaInss?: number }) {
        return this.service.calcularValoresRpa(Number(body.valorBruto), body.aliquotaInss ? Number(body.aliquotaInss) : undefined);
    }

    @Post('rpa')
    criarRpa(
        @EmpresaAtual() empresaId: string,
        @Body()
        body: {
            motoristaNome: string;
            motoristaCpf?: string;
            motoristaPix?: string;
            caminhaoId?: string;
            competencia: string;
            descricaoServico?: string;
            valorBruto: number;
            aliquotaInss?: number;
            observacao?: string;
        },
    ) {
        return this.service.criarRpa(empresaId, {
            ...body,
            valorBruto: Number(body.valorBruto),
            aliquotaInss: body.aliquotaInss ? Number(body.aliquotaInss) : undefined,
        });
    }

    @Patch('rpa/:id')
    atualizarRpa(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Body() body: Record<string, unknown>) {
        return this.service.atualizarRpa(id, empresaId, body as any);
    }

    @Patch('rpa/:id/pagar')
    marcarRpaPago(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Body() body: { dataPagamento?: string; formaPagamento?: string },
    ) {
        return this.service.marcarRpaPago(id, empresaId, body);
    }

    @Delete('rpa/:id')
    removerRpa(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.removerRpa(id, empresaId);
    }

    // ---------------- CIOT ----------------

    @Get('ciot')
    listarCiot(
        @EmpresaAtual() empresaId: string,
        @Query('status') status?: StatusCiot,
        @Query('caminhaoId') caminhaoId?: string,
    ) {
        return this.service.listarCiot(empresaId, { status, caminhaoId });
    }

    @Post('ciot')
    criarCiot(
        @EmpresaAtual() empresaId: string,
        @Body()
        body: {
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
        },
    ) {
        return this.service.criarCiot(empresaId, {
            ...body,
            valorFrete: body.valorFrete ? Number(body.valorFrete) : undefined,
        });
    }

    @Patch('ciot/:id')
    atualizarCiot(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Body() body: Record<string, unknown>) {
        return this.service.atualizarCiot(id, empresaId, body as any);
    }

    @Delete('ciot/:id')
    removerCiot(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.removerCiot(id, empresaId);
    }

    // ---------------- Preparação CT-e / MDF-e ----------------

    @Get('preparo')
    listarPreparo(@Query('tipo') tipo: TipoPreparoFiscal) {
        return this.service.listarPreparo(tipo);
    }

    @Patch('preparo/:id')
    alternarItemPreparo(@Param('id') id: string, @Body() body: { concluido: boolean }) {
        return this.service.alternarItemPreparo(id, !!body.concluido);
    }
}
