import { Controller, Get, Query } from '@nestjs/common';
import { TrucksControlService } from './trucks-control.service';

@Controller('trucks-control')
export class TrucksControlController {
    constructor(private readonly service: TrucksControlService) { }

    @Get('veiculos')
    listarVeiculos() {
        return this.service.listarVeiculosComCache(true);
    }

    @Get('mensagens')
    buscarMensagens(@Query('lastMid') lastMid?: string) {
        return this.service.buscarMensagens(lastMid ? Number(lastMid) : undefined);
    }

    @Get('tracking')
    buscarUltimasPosicoes() {
        return this.service.buscarUltimasPosicoes();
    }

    @Get('caminhoes-localizacao')
    buscarCaminhoesComLocalizacao(@Query('forcar') forcar?: string) {
        return this.service.buscarCaminhoesComLocalizacao({
            forcar: forcar === 'true',
        });
    }

    @Get('historico')
    buscarHistorico(
        @Query('placa') placa?: string,
        @Query('veiId') veiId?: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
    ) {
        return this.service.buscarHistorico({
            placa,
            veiId: veiId ? Number(veiId) : undefined,
            dataInicio,
            dataFim,
        });
    }

    // Viagens detectadas automaticamente por GPS (saiu da região do porto
    // de Santos = iniciou; chegou em Betim ou Pouso Alegre = concluiu).
    @Get('viagens')
    listarViagensGps(
        @Query('status') status?: 'EM_ANDAMENTO' | 'CONCLUIDA',
        @Query('placa') placa?: string,
        @Query('limit') limit?: string,
    ) {
        return this.service.listarViagensGps({
            status,
            placa,
            limit: limit ? Number(limit) : undefined,
        });
    }
}