import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    Delete,
    Patch,
} from '@nestjs/common';
import { CaminhaoService } from './caminhao.service';
import { EmpresaAtual } from '../../auth/empresa-atual.decorator';

@Controller('caminhoes')
export class CaminhaoController {
    constructor(private service: CaminhaoService) { }

    @Post()
    create(@Body() body: { placa: string }, @EmpresaAtual() empresaId: string) {
        return this.service.create(body, empresaId);
    }

    @Get()
    findAll(@EmpresaAtual() empresaId: string) {
        return this.service.findAll(empresaId);
    }

    // Rotas estáticas ('detalhe', 'lancamentos') precisam vir ANTES de
    // ':id' — senão o Nest casa 'detalhe'/'lancamentos' como se fossem o
    // parâmetro :id.
    @Get('detalhe/:placa')
    getDetalhePorPlaca(
        @Param('placa') placa: string,
        @EmpresaAtual() empresaId: string,
    ) {
        return this.service.getDetalhePorPlaca(placa, empresaId);
    }

    @Get('lancamentos/:placa')
    listarLancamentos(
        @Param('placa') placa: string,
        @EmpresaAtual() empresaId: string,
    ) {
        return this.service.listarLancamentos(placa, empresaId);
    }

    @Post('lancamentos')
    criarLancamento(
        @Body()
        body: {
            placa: string;
            tipo: 'RECEITA' | 'DESPESA';
            descricao: string;
            valor: number;
            data?: string;
        },
        @EmpresaAtual() empresaId: string,
    ) {
        return this.service.criarLancamento(body, empresaId);
    }

    @Delete('lancamentos/:lancamentoId')
    excluirLancamento(
        @Param('lancamentoId') lancamentoId: string,
        @EmpresaAtual() empresaId: string,
    ) {
        return this.service.excluirLancamento(lancamentoId, empresaId);
    }

    @Get(':id/timeline')
    getTimeline(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.getTimeline(id, empresaId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.findOne(id, empresaId);
    }

    @Put(':id')
    update(
        @Param('id') id: string,
        @Body() body: { placa?: string; ativo?: boolean; capacidadeTanqueLitros?: number | null },
        @EmpresaAtual() empresaId: string,
    ) {
        return this.service.update(id, body, empresaId);
    }

    @Patch(':id')
    patch(
        @Param('id') id: string,
        @Body() body: { placa?: string; ativo?: boolean; capacidadeTanqueLitros?: number | null },
        @EmpresaAtual() empresaId: string,
    ) {
        return this.service.update(id, body, empresaId);
    }

    @Delete(':id/periodos/:mes')
    removePeriodo(
        @Param('id') id: string,
        @Param('mes') mes: string,
        @EmpresaAtual() empresaId: string,
    ) {
        return this.service.removePeriodo(id, mes, empresaId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.remove(id, empresaId);
    }
}
