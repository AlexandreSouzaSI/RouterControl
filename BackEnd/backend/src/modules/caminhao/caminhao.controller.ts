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
        @Body() body: { placa?: string; ativo?: boolean },
        @EmpresaAtual() empresaId: string,
    ) {
        return this.service.update(id, body, empresaId);
    }

    @Patch(':id')
    patch(
        @Param('id') id: string,
        @Body() body: { placa?: string; ativo?: boolean },
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
