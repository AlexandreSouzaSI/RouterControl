import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { EmpresaModulo } from '@prisma/client';
import { PagarHojeService } from './pagar-hoje.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { RequiresModulo } from '../auth/requires-modulo.decorator';
import { Public } from '../auth/public.decorator';

@Controller('financeiro-nf/pagar-hoje')
@RequiresModulo(EmpresaModulo.FINANCEIRO_NF)
export class PagarHojeController {
    constructor(private readonly service: PagarHojeService) { }

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
}

// Rotas SEM login — protegidas só pelo token secreto do link.
@Controller('pagar-hoje')
export class PagarHojePublicController {
    constructor(private readonly service: PagarHojeService) { }

    @Public()
    @Get(':token')
    async listar(@Param('token') token: string) {
        const e = await this.service.empresaDoToken(token);
        return { empresa: e.nome, contas: await this.service.listar(e.id) };
    }

    @Public()
    @Post(':token')
    async enviar(@Param('token') token: string, @Body() body: { ids: string[] }) {
        const e = await this.service.empresaDoToken(token, true);
        return this.service.enviar(e.id, body?.ids ?? []);
    }
}
