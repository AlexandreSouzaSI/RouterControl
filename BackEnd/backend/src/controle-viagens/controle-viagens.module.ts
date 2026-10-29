import { Module } from '@nestjs/common';
import { ControleViagensController } from './controle-viagens.controller';
import { ControleViagensService } from './controle-viagens.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ControleViagensController],
    providers: [ControleViagensService],
})
export class ControleViagensModule { }
