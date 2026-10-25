import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { EmpresaModulo } from '@prisma/client';
import { PagamentosAvisadosService } from './pagamentos-avisados.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { RequiresModulo } from '../auth/requires-modulo.decorator';
import { Public } from '../auth/public.decorator';

@Controller('financeiro-nf/pagamentos-avisados')
@RequiresModulo(EmpresaModulo.FINANCEIRO_NF)
export class PagamentosAvisadosController {
    constructor(private readonly service: PagamentosAvisadosService) { }

    @Post()
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: { fileSize: 8 * 1024 * 1024 },
            fileFilter: (_req, file, cb) => {
                const ok = /^(image\/|application\/pdf)/.test(file.mimetype);
                cb(ok ? null : new Error('Envie uma imagem ou PDF.'), ok);
            },
        }),
    )
    criar(
        @EmpresaAtual() empresaId: string,
        @Req() req: any,
        @Body() body: any,
        @UploadedFile() file?: Express.Multer.File,
    ) {
        return this.service.criar(empresaId, { id: req.user?.sub, nome: req.user?.email }, body, file);
    }

    @Get('link')
    obterLink(@EmpresaAtual() empresaId: string) {
        return this.service.obterLink(empresaId);
    }

    @Post('link')
    gerarLink(@EmpresaAtual() empresaId: string, @Req() req: any) {
        this.somenteAdmin(req);
        return this.service.gerarLink(empresaId);
    }

    @Delete('link')
    revogarLink(@EmpresaAtual() empresaId: string, @Req() req: any) {
        this.somenteAdmin(req);
        return this.service.revogarLink(empresaId);
    }

    private somenteAdmin(req: any) {
        if (!req.user?.isAdminMaster && req.user?.perfil !== 'ADMIN') {
            throw new ForbiddenException('Só o administrador pode gerar o link.');
        }
    }

    @Get()
    listar(@EmpresaAtual() empresaId: string, @Query('status') status?: string) {
        return this.service.listar(empresaId, status);
    }

    @Get(':id/comprovante')
    async comprovante(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Res() res: Response) {
        const c = await this.service.comprovante(id, empresaId);
        res.setHeader('Content-Type', c.comprovanteMime || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(c.comprovanteNome || 'comprovante')}"`);
        res.send(Buffer.from(c.comprovante as Uint8Array));
    }

    @Get(':id/sugestoes')
    sugestoes(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.sugestoes(id, empresaId);
    }

    @Patch(':id/conciliar')
    conciliar(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Req() req: any, @Body() body: any) {
        return this.service.conciliar(id, empresaId, { nome: req.user?.email }, body);
    }

    @Patch(':id/descartar')
    descartar(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Req() req: any) {
        return this.service.descartar(id, empresaId, { nome: req.user?.email });
    }
}


const uploadComprovante = FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /^(image\/|application\/pdf)/.test(file.mimetype);
        cb(ok ? null : new Error('Envie uma imagem ou PDF.'), ok);
    },
});

// Rotas SEM login — protegidas só pelo token secreto do link.
@Controller('avisar')
export class PagamentosAvisadosPublicController {
    constructor(private readonly service: PagamentosAvisadosService) { }

    @Public()
    @Get(':token')
    async validar(@Param('token') token: string) {
        const e = await this.service.empresaDoToken(token);
        return { empresa: e.nome };
    }

    @Public()
    @Post(':token')
    @UseInterceptors(uploadComprovante)
    async enviar(@Param('token') token: string, @Body() body: any, @UploadedFile() file?: Express.Multer.File) {
        const e = await this.service.empresaDoToken(token, true);
        const aviso = await this.service.criar(e.id, { nome: 'Link do proprietário' }, body, file);
        return { ok: true, valor: aviso.valor, fornecedor: aviso.fornecedor };
    }
}
