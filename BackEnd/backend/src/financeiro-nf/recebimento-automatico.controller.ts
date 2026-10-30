import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { EmpresaModulo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecebimentoAutomaticoService } from './recebimento-automatico.service';
import { WhatsappService } from './whatsapp.service';
import { EmailBoletosService } from './email-boletos.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { RequiresModulo } from '../auth/requires-modulo.decorator';
import { Public } from '../auth/public.decorator';

const soAdmin = (req: any) => {
    if (!req.user?.isAdminMaster && req.user?.perfil !== 'ADMIN') throw new ForbiddenException('Só administradores podem mexer nas integrações.');
};

// Financeiro → Recebimento automático (WhatsApp + e-mail).
@Controller('financeiro-nf/recebimento-automatico')
@RequiresModulo(EmpresaModulo.FINANCEIRO_NF)
export class RecebimentoAutomaticoController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly recebimento: RecebimentoAutomaticoService,
        private readonly whatsapp: WhatsappService,
        private readonly email: EmailBoletosService,
    ) { }

    @Get()
    async status(@EmpresaAtual() empresaId: string) {
        const [wa, em, ultimas, waEstado] = await Promise.all([
            this.recebimento.integracao('WHATSAPP'),
            this.recebimento.integracao('EMAIL'),
            this.recebimento.ultimas(empresaId),
            this.whatsapp.estado(),
        ]);
        const info = (i: any) => (i ? { ativo: i.ativo, destaEmpresa: i.empresaId === empresaId, ultimoEvento: i.ultimoEvento, ultimoErro: i.ultimoErro } : null);
        return {
            whatsapp: { ...waEstado, integracao: info(wa) },
            email: { configurado: this.email.configurado, caixa: this.email.usuario, integracao: info(em) },
            ultimas,
        };
    }

    @Post('whatsapp/conectar')
    conectar(@EmpresaAtual() empresaId: string, @Req() req: any) {
        soAdmin(req);
        return this.whatsapp.conectar(empresaId);
    }

    @Post('whatsapp/desconectar')
    desconectar(@Req() req: any) {
        soAdmin(req);
        return this.whatsapp.desconectar();
    }

    @Post('whatsapp/pausar')
    async pausarWhatsapp(@Req() req: any, @Body() body: { ativo?: boolean }) {
        soAdmin(req);
        await this.prisma.integracaoEntrada.updateMany({ where: { canal: 'WHATSAPP' }, data: { ativo: !!body?.ativo } });
        return { ok: true };
    }

    @Post('email/ativar')
    async ativarEmail(@EmpresaAtual() empresaId: string, @Req() req: any, @Body() body: { ativo?: boolean }) {
        soAdmin(req);
        const ativo = body?.ativo !== false;
        await this.prisma.integracaoEntrada.upsert({
            where: { canal: 'EMAIL' },
            create: { canal: 'EMAIL', empresaId, ativo },
            update: { empresaId, ativo },
        });
        return { ok: true };
    }

    @Post('email/verificar')
    verificarEmail() {
        return this.email.verificar();
    }
}

// Webhook do Evolution API (sem login; protegido pelo segredo na URL).
@Controller('integracoes/whatsapp')
export class WhatsappWebhookController {
    constructor(private readonly whatsapp: WhatsappService) { }

    @Public()
    @Post('webhook/:segredo')
    @HttpCode(200)
    webhook(@Param('segredo') segredo: string, @Body() body: any) {
        return this.whatsapp.webhook(segredo, body);
    }

    // Alguns envios do Evolution acrescentam o nome do evento no fim da URL.
    @Public()
    @Post('webhook/:segredo/:evento')
    @HttpCode(200)
    webhookEvento(@Param('segredo') segredo: string, @Body() body: any) {
        return this.whatsapp.webhook(segredo, body);
    }
}
