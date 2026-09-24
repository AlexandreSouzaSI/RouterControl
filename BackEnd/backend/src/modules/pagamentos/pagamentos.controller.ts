import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Query,
} from '@nestjs/common';
import { PagamentosService } from './pagamentos.service';
import { EmpresaAtual } from '../../auth/empresa-atual.decorator';

@Controller('pagamentos')
export class PagamentosController {
    constructor(private service: PagamentosService) { }

    @Get('config')
    getConfig(@EmpresaAtual() empresaId: string) {
        return this.service.getConfig(empresaId);
    }

    @Patch('config')
    updateConfig(
        @EmpresaAtual() empresaId: string,
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
        return this.service.updateConfig(empresaId, body);
    }

    @Get('config-caminhoes')
    getConfigCaminhoes(@EmpresaAtual() empresaId: string) {
        return this.service.getConfigCaminhoes(empresaId);
    }

    @Patch('config-caminhoes/:caminhaoId')
    updateConfigCaminhao(
        @EmpresaAtual() empresaId: string,
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
            empresaId,
            caminhaoId,
            body,
        );
    }

    @Get('calcular')
    calcular(
        @EmpresaAtual() empresaId: string,
        @Query('placa') placa?: string,
        @Query('mes') mes?: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
        @Query('adiantamento') adiantamento?: string,
        @Query('faturamentoBruto') faturamentoBruto?: string,
    ) {
        return this.service.calcular(empresaId, {
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
