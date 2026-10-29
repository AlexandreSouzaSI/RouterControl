import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { ControleViagensService } from './controle-viagens.service';

@Controller('controle-viagens')
export class ControleViagensController {
    constructor(private readonly service: ControleViagensService) { }

    @Get('modelos')
    modelos() {
        return this.service.modelos();
    }

    @Post('importar')
    @UseInterceptors(FileInterceptor('file', {
        storage: memoryStorage(),
        limits: { fileSize: 15 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            const ok = /\.(xlsx|xlsm|xls)$/i.test(file.originalname || '');
            cb(ok ? null : new Error('Envie uma planilha .xlsx.'), ok);
        },
    }))
    importar(@EmpresaAtual() empresaId: string, @UploadedFile() file?: Express.Multer.File) {
        return this.service.importar(empresaId, file);
    }

    @Get('abas')
    listarAbas(@EmpresaAtual() empresaId: string) {
        return this.service.listarAbas(empresaId);
    }

    @Post('abas')
    criarAba(@EmpresaAtual() empresaId: string, @Body() body: any) {
        return this.service.criarAba(empresaId, body);
    }

    @Patch('abas/:id')
    atualizarAba(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Body() body: any) {
        return this.service.atualizarAba(id, empresaId, body);
    }

    @Delete('abas/:id')
    excluirAba(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.excluirAba(id, empresaId);
    }

    @Get('abas/:id/linhas')
    listarLinhas(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.listarLinhas(id, empresaId);
    }

    @Post('abas/:id/linhas')
    criarLinha(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Body() body: any) {
        return this.service.criarLinha(id, empresaId, body);
    }

    @Get('abas/:id/exportar')
    async exportar(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Res() res: Response) {
        const { nome, buffer } = await this.service.exportar(id, empresaId);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`Controle de Viagens - ${nome}`)}.xlsx"`);
        res.send(buffer);
    }

    @Patch('linhas/:id')
    atualizarLinha(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Body() body: any) {
        return this.service.atualizarLinha(id, empresaId, body);
    }

    @Delete('linhas/:id')
    excluirLinha(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.excluirLinha(id, empresaId);
    }
}
