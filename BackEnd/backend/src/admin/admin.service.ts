import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmpresaModulo, PerfilUsuario } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

// Serve só o Quadro do Administrador (dono do sistema) — nada aqui é
// filtrado por empresaId de propósito, é o único lugar que enxerga todas
// as empresas de uma vez. Protegido pelo AdminMasterGuard no controller.
@Injectable()
export class AdminService {
    constructor(private readonly prisma: PrismaService) { }

    async listarEmpresas() {
        const empresas = await this.prisma.empresa.findMany({
            orderBy: { nome: 'asc' },
            select: {
                id: true,
                nome: true,
                email: true,
                cnpj: true,
                ativo: true,
                pagamentoEmDia: true,
                observacoesAdmin: true,
                modulosHabilitados: true,
                createdAt: true,
                _count: { select: { usuarios: true } },
            },
        });

        return empresas.map((e) => ({
            ...e,
            totalUsuarios: e._count.usuarios,
            _count: undefined,
        }));
    }

    async criarEmpresa(dto: {
        nome: string;
        email: string;
        cnpj?: string;
        modulosHabilitados?: EmpresaModulo[];
    }) {
        const nome = dto.nome?.trim();
        const email = dto.email?.trim().toLowerCase();

        if (!nome || !email) {
            throw new ConflictException('Informe nome e e-mail da empresa.');
        }

        const existente = await this.prisma.empresa.findUnique({ where: { email } });

        if (existente) {
            throw new ConflictException('Já existe uma empresa com esse e-mail.');
        }

        return this.prisma.empresa.create({
            data: {
                nome,
                email,
                cnpj: dto.cnpj?.trim() || null,
                modulosHabilitados: dto.modulosHabilitados?.length
                    ? dto.modulosHabilitados
                    : [EmpresaModulo.RASTREADOR, EmpresaModulo.FISCAL, EmpresaModulo.FINANCEIRO_NF],
            },
        });
    }

    async atualizarEmpresa(id: string, dto: {
        nome?: string;
        cnpj?: string;
        ativo?: boolean;
        pagamentoEmDia?: boolean;
        observacoesAdmin?: string;
        modulosHabilitados?: EmpresaModulo[];
    }) {
        const empresa = await this.prisma.empresa.findUnique({ where: { id } });

        if (!empresa) {
            throw new NotFoundException('Empresa não encontrada.');
        }

        const data: any = {};

        if (dto.nome !== undefined) data.nome = dto.nome.trim();
        if (dto.cnpj !== undefined) data.cnpj = dto.cnpj.trim() || null;
        if (dto.ativo !== undefined) data.ativo = dto.ativo;
        if (dto.pagamentoEmDia !== undefined) data.pagamentoEmDia = dto.pagamentoEmDia;
        if (dto.observacoesAdmin !== undefined) data.observacoesAdmin = dto.observacoesAdmin.trim() || null;
        if (dto.modulosHabilitados !== undefined) data.modulosHabilitados = dto.modulosHabilitados;

        return this.prisma.empresa.update({ where: { id }, data });
    }

    async listarUsuarios(empresaId: string) {
        const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId } });

        if (!empresa) {
            throw new NotFoundException('Empresa não encontrada.');
        }

        return this.prisma.usuario.findMany({
            where: { empresaId },
            orderBy: { email: 'asc' },
            select: {
                id: true,
                nome: true,
                email: true,
                ativo: true,
                isAdminMaster: true,
                perfil: true,
            },
        });
    }

    async criarUsuario(empresaId: string, dto: {
        nome?: string;
        email: string;
        senha: string;
        perfil?: PerfilUsuario;
    }) {
        const empresa = await this.prisma.empresa.findUnique({ where: { id: empresaId } });

        if (!empresa) {
            throw new NotFoundException('Empresa não encontrada.');
        }

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

        // Sem perfil escolhido, assume ADMIN — o Quadro do Administrador
        // normalmente cria o primeiro login de uma empresa nova, que vira
        // quem gerencia o resto do time dela na aba Colaboradores.
        const usuario = await this.prisma.usuario.create({
            data: {
                nome: dto.nome?.trim() || null,
                email,
                senha: senhaHash,
                empresaId,
                perfil: dto.perfil ?? PerfilUsuario.ADMIN,
            },
        });

        return {
            id: usuario.id,
            nome: usuario.nome,
            email: usuario.email,
            ativo: usuario.ativo,
            isAdminMaster: usuario.isAdminMaster,
            perfil: usuario.perfil,
        };
    }

    async atualizarUsuario(id: string, dto: { nome?: string; ativo?: boolean; senha?: string }) {
        const usuario = await this.prisma.usuario.findUnique({ where: { id } });

        if (!usuario) {
            throw new NotFoundException('Usuário não encontrado.');
        }

        const data: any = {};

        if (dto.nome !== undefined) data.nome = dto.nome.trim() || null;
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
            ativo: atualizado.ativo,
            isAdminMaster: atualizado.isAdminMaster,
            perfil: atualizado.perfil,
        };
    }
}
