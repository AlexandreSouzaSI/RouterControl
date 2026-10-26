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
import { PrismaService } from '../prisma/prisma.service';

@Module({
    controllers: [FinanceiroNfController, PagamentosAvisadosController, PagamentosAvisadosPublicController, PagarHojeController, PagarHojePublicController, ContasReceberController],
    providers: [FinanceiroNfService, PagamentosAvisadosService, PagarHojeService, ContasReceberService, CertificadoDigitalService, PrismaService],
    exports: [FinanceiroNfService, CertificadoDigitalService],
})
export class FinanceiroNfModule { }
