import { Module } from '@nestjs/common';
import { RelatorioController } from './relatorio.controller';
import { RelatorioService } from './relatorio.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [RelatorioController],
  providers: [RelatorioService, PrismaService]
})
export class RelatorioModule { }
