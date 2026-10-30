import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { EmpresaModulo } from '@prisma/client';
import { AntecipacoesService } from './antecipacoes.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { RequiresModulo } from '../auth/requires-modulo.decorator';

// Contas a Receber → Antecipação de recebíveis.
@Controller('financeiro-nf/antecipacoes')
@RequiresModulo(EmpresaModulo.FINANCEIRO_NF)
export class AntecipacoesController {
    constructor(private readonly service: AntecipacoesService) { }

    @Get()
    listar(@EmpresaAtual() empresaId: string) {
        return this.service.listar(empresaId);
    }

    @Post()
    criar(@EmpresaAtual() empresaId: string, @Req() req: any, @Body() body: any) {
        return this.service.criar(empresaId, req.user?.email ?? null, body);
    }

    @Delete(':id')
    excluir(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.excluir(id, empresaId);
    }
}
