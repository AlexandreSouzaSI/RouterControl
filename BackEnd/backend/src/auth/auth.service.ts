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
        const usuario = await this.prisma.usuario.findUnique({
            where: { email },
            include: { empresa: { select: { nome: true, ativo: true, modulosHabilitados: true } } },
        });

        // Mensagem genérica de propósito — não dizer se foi o e-mail ou a
        // senha que errou, pra não ajudar quem estiver tentando adivinhar.
        if (!usuario) {
            throw new UnauthorizedException('E-mail ou senha inválidos');
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        if (!senhaValida) {
            throw new UnauthorizedException('E-mail ou senha inválidos');
        }

        // Login desativado (usuário individual ou empresa inteira) — não dá
        // detalhe do motivo pro usuário final, só quem administra sabe.
        if (!usuario.ativo || !usuario.empresa.ativo) {
            throw new UnauthorizedException('Acesso desativado. Fale com o administrador.');
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
                nome: usuario.nome,
                email: usuario.email,
                isAdminMaster: usuario.isAdminMaster,
                perfil: usuario.perfil,
                modulosHabilitados: usuario.empresa.modulosHabilitados,
                empresaNome: usuario.empresa.nome,
            },
        };
    }

    async me(usuarioId: string) {
        const usuario = await this.prisma.usuario.findUnique({
            where: { id: usuarioId },
            select: {
                id: true,
                nome: true,
                email: true,
                empresaId: true,
                isAdminMaster: true,
                perfil: true,
                empresa: { select: { nome: true, modulosHabilitados: true } },
            },
        });

        if (!usuario) {
            throw new UnauthorizedException();
        }

        const { empresa, ...resto } = usuario;

        return { ...resto, modulosHabilitados: empresa.modulosHabilitados, empresaNome: empresa.nome };
    }
}
