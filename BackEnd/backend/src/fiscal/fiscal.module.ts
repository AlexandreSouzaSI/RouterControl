import { Module } from '@nestjs/common';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    controllers: [FiscalController],
    providers: [FiscalService, PrismaService],
})
export class FiscalModule { }
