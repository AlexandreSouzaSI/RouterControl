import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
    imports: [PrismaModule],
    controllers: [UsuariosController],
    providers: [UsuariosService],
})
export class UsuariosModule { }
