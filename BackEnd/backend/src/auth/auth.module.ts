import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { ModuloAccessGuard } from './modulo-access.guard';

@Module({
    imports: [
        PrismaModule,
        PassportModule,
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'segredo_rota',
            signOptions: { expiresIn: '7d' },
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        JwtStrategy,
        // Global — protege todas as rotas do backend por padrão (ver
        // JwtAuthGuard/@Public). A ordem de declaração importa: esse roda
        // primeiro, preenchendo req.user, e só depois o ModuloAccessGuard
        // (que depende de req.user já existir) roda em cima.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: ModuloAccessGuard },
    ],
    exports: [AuthService],
})
export class AuthModule { }
