import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

// Self-service de colaboradores — cada empresa gerencia só o próprio
// time (aba Colaboradores em Cadastros). Restrito a perfil ADMIN da
// empresa (ou isAdminMaster) pelo CompanyAdminGuard no controller; aqui
// dentro sempre filtra por empresaId, nunca deixa mexer em usuário de
// fora da própria empresa mesmo sabendo o id.
@Injectable()
export class UsuariosService {
    constructor(private readonly prisma: PrismaService) { }

    async listar(empresaId: string) {
        return this.prisma.usuario.findMany({
            where: { empresaId },
            orderBy: { email: 'asc' },
            select: {
                id: true,
                nome: true,
                email: true,
                perfil: true,
                ativo: true,
                isAdminMaster: true,
            },
        });
    }

    async criar(empresaId: string, dto: {
        nome?: string;
        email: string;
        senha: string;
        perfil?: PerfilUsuario;
    }) {
        const email = dto.email?.trim().toLowerCase();
        const senha = dto.senha;

        if (!email || !senha || senha.length < 6) {
            throw new ConflictException('Informe e-mail e uma senha com pelo menos 6 caracteres.');
        }

        const existente = await this.prisma.usuario.findUnique({ where: { email } });

        if (existente) {
            throw new ConflictException('Já existe um login com esse e-mail.');
        }

        const senhaHash = await bcrypt.hash(senha, 10);

        const usuario = await this.prisma.usuario.create({
            data: {
                nome: dto.nome?.trim() || null,
                email,
                senha: senhaHash,
                empresaId,
                perfil: dto.perfil ?? PerfilUsuario.FUNCIONARIO,
            },
        });

        return {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            perfil: usuario.perfil,
            ativo: usuario.ativo,
            isAdminMaster: usuario.isAdminMaster,
        };
    }

    async atualizar(empresaId: string, id: string, dto: {
        nome?: string;
        perfil?: PerfilUsuario;
        ativo?: boolean;
        senha?: string;
    }) {
        const usuario = await this.prisma.usuario.findUnique({ where: { id } });

        if (!usuario || usuario.empresaId !== empresaId) {
            throw new NotFoundException('Colaborador não encontrado.');
        }

        // isAdminMaster nunca é tocável por aqui — só pelo Quadro do
        // Administrador (rota /admin), pra não abrir brecha de alguém se
        // promover a dono do sistema editando o próprio perfil por engano.
        if (usuario.isAdminMaster) {
            throw new ForbiddenException('Esse login é gerenciado pelo administrador do sistema.');
        }

        const data: any = {};

        if (dto.nome !== undefined) data.nome = dto.nome.trim() || null;
        if (dto.perfil !== undefined) data.perfil = dto.perfil;
        if (dto.ativo !== undefined) data.ativo = dto.ativo;

        if (dto.senha) {
            if (dto.senha.length < 6) {
                throw new ConflictException('A senha precisa ter pelo menos 6 caracteres.');
            }
            data.senha = await bcrypt.hash(dto.senha, 10);
        }

        const atualizado = await this.prisma.usuario.update({ where: { id }, data });

        return {
            id: atualizado.id,
            nome: atualizado.nome,
            email: atualizado.email,
            perfil: atualizado.perfil,
            ativo: atualizado.ativo,
            isAdminMaster: atualizado.isAdminMaster,
        };
    }
}
