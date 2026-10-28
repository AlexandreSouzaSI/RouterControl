import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { EmpresaModulo } from '@prisma/client';
import { ContasEnviadasService } from './contas-enviadas.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { RequiresModulo } from '../auth/requires-modulo.decorator';
import { Public } from '../auth/public.decorator';

const uploadDocumento = FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ok = /^(image\/|application\/pdf|application\/xml|text\/xml)/.test(file.mimetype) || /\.(pdf|xml)$/i.test(file.originalname || '');
        cb(ok ? null : new Error('Envie PDF, XML ou foto do boleto/nota.'), ok);
    },
});

// Tela do financeiro: "Lançar contas" (aba de Contas a Pagar).
@Controller('financeiro-nf/contas-enviadas')
@RequiresModulo(EmpresaModulo.FINANCEIRO_NF)
export class ContasEnviadasController {
    constructor(private readonly service: ContasEnviadasService) { }

    @Post()
    @UseInterceptors(uploadDocumento)
    criar(@EmpresaAtual() empresaId: string, @Req() req: any, @Body() body: any, @UploadedFile() file?: Express.Multer.File) {
        return this.service.criar(empresaId, req.user?.email ?? null, body, file);
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

    @Get(':id/arquivo')
    async arquivo(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Res() res: Response) {
        const a = await this.service.arquivo(id, empresaId);
        res.setHeader('Content-Type', a.arquivoMime ?? 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.arquivoNome ?? 'documento')}"`);
        res.send(Buffer.from(a.arquivo as Uint8Array));
    }

    @Get(':id/parecidas')
    parecidas(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.parecidas(id, empresaId);
    }

    @Patch(':id/lancar')
    lancar(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Req() req: any, @Body() body: any) {
        return this.service.lancar(id, empresaId, req.user?.email ?? null, body);
    }

    @Patch(':id/descartar')
    descartar(@Param('id') id: string, @EmpresaAtual() empresaId: string, @Body() body: { motivo?: string }) {
        return this.service.descartar(id, empresaId, body?.motivo);
    }
}

// Rotas SEM login — protegidas só pelo token secreto do link.
@Controller('enviar-conta')
export class ContasEnviadasPublicController {
    constructor(private readonly service: ContasEnviadasService) { }

    @Public()
    @Get(':token')
    async validar(@Param('token') token: string) {
        const e = await this.service.empresaDoToken(token);
        return { empresa: e.nome, ...(await this.service.opcoes(e.id)) };
    }

    @Public()
    @Post(':token')
    @UseInterceptors(uploadDocumento)
    async enviar(@Param('token') token: string, @Body() body: any, @UploadedFile() file?: Express.Multer.File) {
        const e = await this.service.empresaDoToken(token, true);
        const r = await this.service.criar(e.id, (body?.nome as string)?.trim() || 'Link de envio', body, file);
        return { ok: true, fornecedor: r.fornecedor, valor: r.valor, vencimento: r.vencimento, tipoDocumento: r.tipoDocumento };
    }
}
