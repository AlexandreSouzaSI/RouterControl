import { Controller, Get, Param, Query } from '@nestjs/common';
import { RelatorioService } from './relatorio.service';

@Controller('relatorio')
export class RelatorioController {
    constructor(private relatorioService: RelatorioService) { }

    @Get()
    findAll(
        @Query('placa') placa?: string,
        @Query('mes') mes?: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.relatorioService.findAll({
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
        @Query('placa') placa?: string,
        @Query('mes') mes?: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
    ) {
        return this.relatorioService.getDashboard({
            placa,
            mes,
            dataInicio,
            dataFim,
        });
    }

    @Get(':periodoId')
    findOne(@Param('periodoId') periodoId: string) {
        return this.relatorioService.findOne(periodoId);
    }
}