import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Query,
} from '@nestjs/common';
import { PagamentosService } from './pagamentos.service';

@Controller('pagamentos')
export class PagamentosController {
    constructor(private service: PagamentosService) { }

    @Get('config')
    getConfig() {
        return this.service.getConfig();
    }

    @Patch('config')
    updateConfig(
        @Body()
        body: {
            salarioBase?: number;
            valorDiaria?: number;
            valorPorViagem?: number;
            bonusMetaViagens?: number;
            metaViagens?: number;
            diasBaseSalario?: number;
            adiantamento?: number;
        },
    ) {
        return this.service.updateConfig(body);
    }

    @Get('config-caminhoes')
    getConfigCaminhoes() {
        return this.service.getConfigCaminhoes();
    }

    @Patch('config-caminhoes/:caminhaoId')
    updateConfigCaminhao(
        @Param('caminhaoId') caminhaoId: string,
        @Body()
        body: {
            tipoCalculo?: 'TRADICIONAL' | 'FATURAMENTO';
            percentualFaturamento?: number;
            valorDiariaOverride?: number | null;
            ativo?: boolean;
        },
    ) {
        return this.service.updateConfigCaminhao(
            caminhaoId,
            body,
        );
    }

    @Get('calcular')
    calcular(
        @Query('placa') placa?: string,
        @Query('mes') mes?: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
        @Query('adiantamento') adiantamento?: string,
        @Query('faturamentoBruto') faturamentoBruto?: string,
    ) {
        return this.service.calcular({
            placa,
            mes,
            dataInicio,
            dataFim,
            adiantamento:
                adiantamento !== undefined && adiantamento !== ''
                    ? Number(adiantamento)
                    : undefined,
            faturamentoBruto:
                faturamentoBruto !== undefined &&
                    faturamentoBruto !== ''
                    ? Number(faturamentoBruto)
                    : undefined,
        });
    }
}