import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PerfilUsuario } from '@prisma/client';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { CompanyAdminGuard } from '../auth/company-admin.guard';
import { UsuariosService } from './usuarios.service';

// Aba Colaboradores (Cadastros) — cada empresa gerencia o próprio time.
// Sem @RequiresModulo de propósito: gestão de gente não depende de
// nenhum módulo operacional estar ligado/desligado.
@Controller('usuarios')
@UseGuards(CompanyAdminGuard)
export class UsuariosController {
    constructor(private readonly usuariosService: UsuariosService) { }

    @Get()
    listar(@EmpresaAtual() empresaId: string) {
        return this.usuariosService.listar(empresaId);
    }

    @Post()
    criar(
        @EmpresaAtual() empresaId: string,
        @Body() body: { nome?: string; email: string; senha: string; perfil?: PerfilUsuario },
    ) {
        return this.usuariosService.criar(empresaId, body);
    }

    @Patch(':id')
    atualizar(
        @EmpresaAtual() empresaId: string,
        @Param('id') id: string,
        @Body() body: { nome?: string; perfil?: PerfilUsuario; ativo?: boolean; senha?: string },
    ) {
        return this.usuariosService.atualizar(empresaId, id, body);
    }
}
