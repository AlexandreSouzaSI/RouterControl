import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PagamentosService } from './pagamentos.service';
import { PagamentosController } from './pagamentos.controller';

@Module({
    controllers: [PagamentosController],
    providers: [PagamentosService, PrismaService],
})
export class PagamentosModule { }