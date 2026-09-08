import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca uma rota como acessível sem token — hoje só usada em /auth/login,
// já que o guard de JWT abaixo é global (protege tudo por padrão).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
