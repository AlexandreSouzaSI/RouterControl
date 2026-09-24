import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

// Protege o Quadro do Administrador — só quem tem isAdminMaster=true no
// banco (checado a cada request pelo JwtStrategy, ver jwt.strategy.ts)
// passa. Roda depois do JwtAuthGuard global, então req.user já existe.
@Injectable()
export class AdminMasterGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest();

        if (!req.user?.isAdminMaster) {
            throw new ForbiddenException('Acesso restrito ao administrador do sistema.');
        }

        return true;
    }
}
