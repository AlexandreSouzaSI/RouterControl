import { Module } from '@nestjs/common';
import { FinanceiroNfController } from './financeiro-nf.controller';
import { FinanceiroNfService } from './financeiro-nf.service';
import { CertificadoDigitalService } from './certificado-digital.service';
import { PagamentosAvisadosController, PagamentosAvisadosPublicController } from './pagamentos-avisados.controller';
import { PagamentosAvisadosService } from './pagamentos-avisados.service';
import { PagarHojeController, PagarHojePublicController } from './pagar-hoje.controller';
import { PagarHojeService } from './pagar-hoje.service';
import { ContasReceberController } from './contas-receber.controller';
import { ContasReceberService } from './contas-receber.service';
import { ContasEnviadasController, ContasEnviadasPublicController } from './contas-enviadas.controller';
import { ContasEnviadasService } from './contas-enviadas.service';
import { ConciliacaoExtratoController, ConciliacaoExtratoPublicController } from './conciliacao-extrato.controller';
import { ConciliacaoExtratoService } from './conciliacao-extrato.service';
import { AntecipacoesController } from './antecipacoes.controller';
import { AntecipacoesService } from './antecipacoes.service';
import { RecebimentoAutomaticoController, WhatsappWebhookController } from './recebimento-automatico.controller';
import { RecebimentoAutomaticoService } from './recebimento-automatico.service';
import { WhatsappService } from './whatsapp.service';
import { EmailBoletosService } from './email-boletos.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    controllers: [FinanceiroNfController, PagamentosAvisadosController, PagamentosAvisadosPublicController, PagarHojeController, PagarHojePublicController, ContasReceberController, ContasEnviadasController, ContasEnviadasPublicController, ConciliacaoExtratoController, ConciliacaoExtratoPublicController, AntecipacoesController, RecebimentoAutomaticoController, WhatsappWebhookController],
    providers: [FinanceiroNfService, PagamentosAvisadosService, PagarHojeService, ContasReceberService, ContasEnviadasService, ConciliacaoExtratoService, AntecipacoesService, RecebimentoAutomaticoService, WhatsappService, EmailBoletosService, CertificadoDigitalService, PrismaService],
    exports: [FinanceiroNfService, CertificadoDigitalService],
})
export class FinanceiroNfModule { }
