import { Controller, Get, Query } from '@nestjs/common';
import { RelatorioService } from './relatorio.service';

@Controller('relatorio')
export class RelatorioController {
    constructor(private relatorioService: RelatorioService) { }

    @Get()
    findAll(
        @Query('placa') placa?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.relatorioService.findAll({
            placa,
            page: Number(page) || 1,
            limit: Number(limit) || 10,
        });
    }

    @Get('dashboard')
    getDashboard() {
        return this.relatorioService.getDashboard();
    }
}