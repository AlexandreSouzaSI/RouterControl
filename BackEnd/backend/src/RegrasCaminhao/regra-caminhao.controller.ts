import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { RegraCaminhaoService } from './regra-caminhao.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';

@Controller('regra-caminhao')
export class RegraCaminhaoController {
    constructor(private readonly regraCaminhaoService: RegraCaminhaoService) { }

    @Post()
    async criar(@EmpresaAtual() empresaId: string, @Body() body: any) {
        return this.regraCaminhaoService.criar(empresaId, body);
    }

    @Get(':caminhaoId')
    buscar(@EmpresaAtual() empresaId: string, @Param('caminhaoId') caminhaoId: string) {
        return this.regraCaminhaoService.buscarPorCaminhao(empresaId, caminhaoId);
    }
}
