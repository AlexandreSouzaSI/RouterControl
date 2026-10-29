import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
    dashboard(@EmpresaAtual() empresaId: string, @Query('mes') mes?: string) {
        return this.service.dashboard(empresaId, mes);
    }

    // Todas em aberto — usado na conciliação bancária.
    @Get('pendentes')
    pendentes(@EmpresaAtual() empresaId: string) {
        return this.service.pendentes(empresaId);
    }

    @Get('por-caminhao')
    porCaminhao(@EmpresaAtual() empresaId: string, @Query('mes') mes?: string) {
        return this.service.porCaminhao(empresaId, mes);
    }

    @Patch('ratear')
    ratear(@EmpresaAtual() empresaId: string, @Body() body: { ids: string[]; caminhaoIds: string[]; valores?: (number | string)[]; proporcional?: boolean }) {
        return this.service.ratear(empresaId, body.ids, body.caminhaoIds ?? [], body.valores, !!body.proporcional);
    }

    @Patch('editar-em-massa')
    editarEmMassa(@EmpresaAtual() empresaId: string, @Body() body: { ids: string[]; caminhaoId?: string }) {
        return this.service.editarEmMassa(empresaId, body);
    }

    // Importação em massa de XML de CT-e (até 200 arquivos por envio; o
    // frontend manda em lotes menores).
    @Post('importar-cte')
    @UseInterceptors(
        FilesInterceptor('arquivos', 200, {
            storage: memoryStorage(),
            limits: { fileSize: 5 * 1024 * 1024 },
            fileFilter: (_req, file, cb) => {
                if (!/\.xml$/i.test(file.originalname || '')) return cb(new BadRequestException(`"${file.originalname}" não é .xml`), false);
                cb(null, true);
            },
        }),
    )
    importarCte(
        @EmpresaAtual() empresaId: string,
        @UploadedFiles() arquivos: Express.Multer.File[],
        @Body('prazoDias') prazoDias?: string,
    ) {
        return this.service.importarCte(
            empresaId,
            (arquivos ?? []).map((f) => ({ nome: f.originalname, conteudo: f.buffer.toString('utf8').replace(/^\uFEFF/, '') })),
            prazoDias,
        );
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
