import { Module } from '@nestjs/common';
import { FinanceiroNfController } from './financeiro-nf.controller';
import { FinanceiroNfService } from './financeiro-nf.service';
import { CertificadoDigitalService } from './certificado-digital.service';
import { PagamentosAvisadosController, PagamentosAvisadosPublicController } from './pagamentos-avisados.controller';
import { PagamentosAvisadosService } from './pagamentos-avisados.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    controllers: [FinanceiroNfController, PagamentosAvisadosController, PagamentosAvisadosPublicController],
    providers: [FinanceiroNfService, PagamentosAvisadosService, CertificadoDigitalService, PrismaService],
    exports: [FinanceiroNfService, CertificadoDigitalService],
})
export class FinanceiroNfModule { }
