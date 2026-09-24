import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Extrai o empresaId do usuário autenticado (JWT) — usado em todo
// controller que precisa filtrar/gravar dados por empresa (multi-tenant).
// Só funciona atrás do JwtAuthGuard (global — ver AuthModule), que é quem
// preenche req.user a partir do token.
export const EmpresaAtual = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): string => {
        const req = ctx.switchToHttp().getRequest();
        return req.user?.empresaId;
    },
);
