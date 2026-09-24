import { Controller, Get, Param, Query } from '@nestjs/common';
import { RelatorioService } from './relatorio.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';

@Controller('relatorio')
export class RelatorioController {
    constructor(private relatorioService: RelatorioService) { }

    @Get()
    findAll(
        @EmpresaAtual() empresaId: string,
        @Query('placa') placa?: string,
        @Query('mes') mes?: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.relatorioService.findAll(empresaId, {
            placa,
            mes,
            dataInicio,
            dataFim,
            page: Number(page) || 1,
            limit: Number(limit) || 10,
        });
    }

    @Get('dashboard')
    getDashboard(
        @EmpresaAtual() empresaId: string,
        @Query('placa') placa?: string,
        @Query('mes') mes?: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
    ) {
        return this.relatorioService.getDashboard(empresaId, {
            placa,
            mes,
            dataInicio,
            dataFim,
        });
    }

    @Get(':periodoId')
    findOne(@EmpresaAtual() empresaId: string, @Param('periodoId') periodoId: string) {
        return this.relatorioService.findOne(empresaId, periodoId);
    }
}
