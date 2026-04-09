import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegraCaminhaoController } from './regra-caminhao.controller';
import { RegraCaminhaoService } from './regra-caminhao.service';

@Module({
    controllers: [RegraCaminhaoController],
    providers: [RegraCaminhaoService, PrismaService],
})
export class RegraCaminhaoModule { }