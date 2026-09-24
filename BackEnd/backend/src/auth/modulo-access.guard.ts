import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { MODULO_KEY } from './requires-modulo.decorator';

// Roda depois do JwtAuthGuard (global). Se a rota/controller não tiver
// @RequiresModulo, libera igual antes — só passa a exigir o módulo onde
// foi explicitamente marcado. isAdminMaster sempre passa, independente de
// módulo (o dono do sistema não fica travado pelos próprios toggles).
@Injectable()
export class ModuloAccessGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly prisma: PrismaService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const modulo = this.reflector.getAllAndOverride<string>(MODULO_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!modulo) return true;

        const req = context.switchToHttp().getRequest();

        if (req.user?.isAdminMaster) return true;

        const empresaId = req.user?.empresaId;

        if (!empresaId) {
            throw new ForbiddenException('Empresa não identificada.');
        }

        const empresa = await this.prisma.empresa.findUnique({
            where: { id: empresaId },
            select: { modulosHabilitados: true },
        });

        if (!empresa || !empresa.modulosHabilitados.includes(modulo as any)) {
            throw new ForbiddenException(
                'Esse módulo não está habilitado pra sua empresa. Fale com o administrador.',
            );
        }

        return true;
    }
}
