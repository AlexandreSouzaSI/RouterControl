import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EmpresaModulo, PerfilUsuario } from '@prisma/client';
import { AdminMasterGuard } from '../auth/admin-master.guard';
import { AdminService } from './admin.service';

// Quadro do Administrador — só o dono do sistema (isAdminMaster) acessa.
// Não recebe empresaId do token igual o resto do app: aqui é o admin
// escolhendo qual empresa ele quer olhar/editar.
@Controller('admin')
@UseGuards(AdminMasterGuard)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Get('empresas')
    listarEmpresas() {
        return this.adminService.listarEmpresas();
    }

    @Post('empresas')
    criarEmpresa(
        @Body()
        body: {
            nome: string;
            email: string;
            cnpj?: string;
            modulosHabilitados?: EmpresaModulo[];
        },
    ) {
        return this.adminService.criarEmpresa(body);
    }

    @Patch('empresas/:id')
    atualizarEmpresa(
        @Param('id') id: string,
        @Body()
        body: {
            nome?: string;
            cnpj?: string;
            ativo?: boolean;
            pagamentoEmDia?: boolean;
            observacoesAdmin?: string;
            modulosHabilitados?: EmpresaModulo[];
        },
    ) {
        return this.adminService.atualizarEmpresa(id, body);
    }

    @Get('empresas/:id/usuarios')
    listarUsuarios(@Param('id') id: string) {
        return this.adminService.listarUsuarios(id);
    }

    @Post('empresas/:id/usuarios')
    criarUsuario(
        @Param('id') id: string,
        @Body() body: { nome?: string; email: string; senha: string; perfil?: PerfilUsuario },
    ) {
        return this.adminService.criarUsuario(id, body);
    }

    @Patch('usuarios/:id')
    atualizarUsuario(
        @Param('id') id: string,
        @Body() body: { nome?: string; ativo?: boolean; senha?: string },
    ) {
        return this.adminService.atualizarUsuario(id, body);
    }
}
