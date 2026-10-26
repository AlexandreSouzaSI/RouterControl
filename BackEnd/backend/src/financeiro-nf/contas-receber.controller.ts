import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EmpresaModulo } from '@prisma/client';
import { ContasReceberService } from './contas-receber.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { RequiresModulo } from '../auth/requires-modulo.decorator';

@Controller('financeiro-nf/contas-receber')
@RequiresModulo(EmpresaModulo.FINANCEIRO_NF)
export class ContasReceberController {
    constructor(private readonly service: ContasReceberService) { }

    @Get()
    listar(@EmpresaAtual() empresaId: string, @Query() q: any) {
        return this.service.listar(empresaId, q);
    }

    // Rotas fixas antes de ':id'
    @Get('dashboard')
    dashboard(@EmpresaAtual() empresaId: string) {
        return this.service.dashboard(empresaId);
    }

    // Todas em aberto — usado na conciliação bancária.
    @Get('pendentes')
    pendentes(@EmpresaAtual() empresaId: string) {
        return this.service.pendentes(empresaId);
    }

    @Get('por-caminhao')
    porCaminhao(@EmpresaAtual() empresaId: string) {
        return this.service.porCaminhao(empresaId);
    }

    @Patch('ratear')
    ratear(@EmpresaAtual() empresaId: string, @Body() body: { ids: string[]; caminhaoIds: string[] }) {
        return this.service.ratear(empresaId, body.ids, body.caminhaoIds ?? []);
    }

    @Patch('editar-em-massa')
    editarEmMassa(@EmpresaAtual() empresaId: string, @Body() body: { ids: string[]; caminhaoId?: string }) {
        return this.service.editarEmMassa(empresaId, body);
    }

    @Post()
    criar(@EmpresaAtual() empresaId: string, @Body() body: any) {
        return this.service.criar(empresaId, body);
    }

    @Patch(':id')
    atualizar(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Body() body: any) {
        return this.service.atualizar(id, empresaId, body);
    }

    @Post(':id/receber')
    receber(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Body() body: { valor?: number; data?: string }) {
        return this.service.receber(id, empresaId, body);
    }

    @Post(':id/desfazer')
    desfazer(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.desfazerRecebimento(id, empresaId);
    }

    @Delete(':id')
    excluir(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.excluir(id, empresaId);
    }
}
