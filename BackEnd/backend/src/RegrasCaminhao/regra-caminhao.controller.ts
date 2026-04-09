import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { RegraCaminhaoService } from './regra-caminhao.service';

@Controller('regra-caminhao')
export class RegraCaminhaoController {
    constructor(private readonly regraCaminhaoService: RegraCaminhaoService) { }

    @Post()
    async criar(@Body() body: any) {
        console.log("aqui ", body)
        return this.regraCaminhaoService.criar(body);
    }

    @Get(':caminhaoId')
    buscar(@Param('caminhaoId') caminhaoId: string) {
        return this.regraCaminhaoService.buscarPorCaminhao(caminhaoId);
    }
}