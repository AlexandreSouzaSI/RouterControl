import { Module } from '@nestjs/common';
import { FinanceiroNfController } from './financeiro-nf.controller';
import { FinanceiroNfService } from './financeiro-nf.service';
import { CertificadoDigitalService } from './certificado-digital.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    controllers: [FinanceiroNfController],
    providers: [FinanceiroNfService, CertificadoDigitalService, PrismaService],
    exports: [FinanceiroNfService, CertificadoDigitalService],
})
export class FinanceiroNfModule { }
