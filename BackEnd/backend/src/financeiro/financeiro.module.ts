import { Module } from '@nestjs/common';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [FinanceiroController],
  providers: [FinanceiroService, PrismaService],
})
export class FinanceiroModule { }