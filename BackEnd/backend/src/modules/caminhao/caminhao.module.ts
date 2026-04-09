import { Module } from '@nestjs/common';
import { CaminhaoService } from './caminhao.service';
import { CaminhaoController } from './caminhao.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [CaminhaoController],
    providers: [CaminhaoService],
})
export class CaminhaoModule { }