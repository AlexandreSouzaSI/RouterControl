import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) { }

    async login(email: string, senha: string) {
        const usuario = await this.prisma.usuario.findUnique({ where: { email } });

        // Mensagem genérica de propósito — não dizer se foi o e-mail ou a
        // senha que errou, pra não ajudar quem estiver tentando adivinhar.
        if (!usuario) {
            throw new UnauthorizedException('E-mail ou senha inválidos');
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        if (!senhaValida) {
            throw new UnauthorizedException('E-mail ou senha inválidos');
        }

        const token = await this.jwtService.signAsync({
            sub: usuario.id,
            email: usuario.email,
            empresaId: usuario.empresaId,
        });

        return {
            token,
            usuario: {
                id: usuario.id,
                email: usuario.email,
            },
        };
    }

    async me(usuarioId: string) {
        const usuario = await this.prisma.usuario.findUnique({
            where: { id: usuarioId },
            select: { id: true, email: true, empresaId: true },
        });

        if (!usuario) {
            throw new UnauthorizedException();
        }

        return usuario;
    }
}
