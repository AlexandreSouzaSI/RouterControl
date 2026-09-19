import { Body, Controller, Get, Post, Query } from '@nestjs/common';
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

    // Consumo médio (km/L) e autonomia estimada de um caminhão, calculado
    // a partir do histórico real de litros no tanque + odômetro.
    @Get('consumo')
    calcularConsumo(
        @Query('veiId') veiId: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
    ) {
        return this.service.calcularConsumo({
            veiId: Number(veiId),
            dataInicio,
            dataFim,
        });
    }

    // Criação manual de viagem — botão "Nova Viagem" (alguém do
    // administrativo escolhe o caminhão e digita origem/destino). A
    // conclusão continua automática pelo GPS.
    @Post('viagens/manual')
    criarViagemManual(
        @Body()
        body: {
            veiId: number;
            origemMunicipio: string;
            destinoMunicipio: string;
        },
    ) {
        return this.service.criarViagemManual({
            veiId: Number(body.veiId),
            origemMunicipio: body.origemMunicipio,
            destinoMunicipio: body.destinoMunicipio,
        });
    }

    // Resumo pro Dashboard: total de viagens concluídas + contagem por
    // placa (ex: "QPM - 4 viagens concluídas"). `desde` (ISO) opcional
    // filtra por dataHoraFim, ex: só as concluídas hoje ou no mês.
    @Get('viagens/resumo-concluidas')
    resumoViagensConcluidas(@Query('desde') desde?: string) {
        return this.service.resumoViagensConcluidas({
            desde: desde ? new Date(desde) : undefined,
        });
    }

    // Dias parados (mês) calculados automaticamente a partir do
    // rastreamento GPS — substitui a dependência do upload manual de
    // planilha. `mes` no formato 'YYYY-MM' (padrão: mês atual).
    @Get('dias-parados')
    resumoDiasParados(@Query('mes') mes?: string) {
        return this.service.resumoDiasParados({ mes });
    }
}