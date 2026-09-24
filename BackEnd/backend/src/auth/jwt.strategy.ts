import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: process.env.JWT_SECRET || 'segredo_rota',
        });
    }

    async validate(payload: { sub: string; email: string; empresaId: string }) {
        // Confere a cada requisição (não só no login) se o login e a
        // empresa ainda estão ativos — assim, desativar alguém pelo Quadro
        // do Administrador corta o acesso na hora, sem esperar o token
        // expirar. isAdminMaster também vem fresco do banco a cada request,
        // nunca confiando só no que estava no token quando foi emitido.
        const usuario = await this.prisma.usuario.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                empresaId: true,
                ativo: true,
                isAdminMaster: true,
                perfil: true,
                empresa: { select: { ativo: true } },
            },
        });

        if (!usuario || !usuario.ativo || !usuario.empresa.ativo) {
            throw new UnauthorizedException('Acesso desativado. Fale com o administrador.');
        }

        // O que essa função devolve vira `req.user` em toda rota protegida.
        return {
            sub: usuario.id,
            email: usuario.email,
            empresaId: usuario.empresaId,
            isAdminMaster: usuario.isAdminMaster,
            perfil: usuario.perfil,
        };
    }
}
