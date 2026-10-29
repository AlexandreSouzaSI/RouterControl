import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { EmpresaModulo } from '@prisma/client';
import { ConciliacaoExtratoService } from './conciliacao-extrato.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { RequiresModulo } from '../auth/requires-modulo.decorator';
import { Public } from '../auth/public.decorator';

const uploadExtratos = FilesInterceptor('files', 2, {
    storage: memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /\.(xls|xlsx)$/i.test(file.originalname || '');
        cb(ok ? null : new Error('Envie o extrato em Excel (.xls ou .xlsx).'), ok);
    },
});

// Tela "Conciliação do Extrato" (Financeiro).
@Controller('financeiro-nf/conciliacao-extrato')
@RequiresModulo(EmpresaModulo.FINANCEIRO_NF)
export class ConciliacaoExtratoController {
    constructor(private readonly service: ConciliacaoExtratoService) { }

    @Get()
    listar(@EmpresaAtual() empresaId: string) {
        return this.service.listar(empresaId);
    }

    @Post('importar')
    @UseInterceptors(uploadExtratos)
    importar(@EmpresaAtual() empresaId: string, @Req() req: any, @UploadedFiles() files: Express.Multer.File[]) {
        return this.service.importar(empresaId, req.user?.email ?? null, files);
    }

    // Vínculos (antes de ':id' pra não confundir a rota).
    @Get('vinculos/lista')
    vinculos(@EmpresaAtual() empresaId: string) {
        return this.service.listarVinculos(empresaId);
    }

    @Post('vinculos')
    salvarVinculo(@EmpresaAtual() empresaId: string, @Body() body: any) {
        return this.service.salvarVinculo(empresaId, body);
    }

    @Post('vinculos/lote')
    salvarVinculosLote(@EmpresaAtual() empresaId: string, @Body() body: { texto?: string }) {
        return this.service.salvarVinculosLote(empresaId, body?.texto ?? '');
    }

    @Delete('vinculos/:vid')
    excluirVinculo(@EmpresaAtual() empresaId: string, @Param('vid') vid: string) {
        return this.service.excluirVinculo(empresaId, vid);
    }

    @Get(':id')
    obter(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.obter(id, empresaId);
    }

    @Patch(':id/itens')
    salvar(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Body() body: { itens: any[] }) {
        return this.service.salvarInterno(id, empresaId, body?.itens ?? []);
    }

    @Post(':id/reclassificar')
    reclassificar(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.reclassificar(id, empresaId);
    }

    @Post(':id/link')
    gerarLink(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.gerarLink(id, empresaId);
    }

    @Delete(':id/link')
    revogarLink(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.revogarLink(id, empresaId);
    }

    @Post(':id/aplicar')
    aplicar(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Req() req: any) {
        return this.service.aplicar(id, empresaId, req.user?.email ?? null);
    }

    @Post(':id/desfazer')
    desfazer(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.desfazer(id, empresaId);
    }

    @Delete(':id')
    excluir(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.excluir(id, empresaId);
    }
}

// Link SEM login — protegido só pelo token secreto da conciliação.
@Controller('conciliar-extrato')
export class ConciliacaoExtratoPublicController {
    constructor(private readonly service: ConciliacaoExtratoService) { }

    @Public()
    @Get(':token')
    obter(@Param('token') token: string) {
        return this.service.obterPublico(token);
    }

    @Public()
    @Put(':token')
    salvar(@Param('token') token: string, @Body() body: any) {
        return this.service.salvarPublico(token, body);
    }
}
