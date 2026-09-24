import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

// Protege a gestão de colaboradores (aba Colaboradores em Cadastros) —
// só quem é ADMIN dentro da própria empresa mexe, ou o isAdminMaster (dono
// do sistema), que passa por cima de qualquer perfil.
@Injectable()
export class CompanyAdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest();

        if (req.user?.isAdminMaster) return true;

        if (req.user?.perfil !== 'ADMIN') {
            throw new ForbiddenException(
                'Só quem tem perfil Admin na empresa pode gerenciar colaboradores.',
            );
        }

        return true;
    }
}
