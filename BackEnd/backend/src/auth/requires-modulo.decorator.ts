import { SetMetadata } from '@nestjs/common';
import { EmpresaModulo } from '@prisma/client';

export const MODULO_KEY = 'modulo';

// Marca um controller/rota como dependente de um módulo específico da
// empresa (ver EmpresaModulo no schema) — checado pelo ModuloAccessGuard.
// Empresa sem esse módulo habilitado (editável só no Quadro do
// Administrador) recebe 403 em vez de ver os dados.
export const RequiresModulo = (modulo: EmpresaModulo) => SetMetadata(MODULO_KEY, modulo);
