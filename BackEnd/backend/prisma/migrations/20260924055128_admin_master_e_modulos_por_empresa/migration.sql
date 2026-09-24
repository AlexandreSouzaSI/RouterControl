-- CreateEnum
CREATE TYPE "EmpresaModulo" AS ENUM ('RASTREADOR', 'FISCAL', 'FINANCEIRO_NF');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "modulosHabilitados" "EmpresaModulo"[] DEFAULT ARRAY['RASTREADOR', 'FISCAL', 'FINANCEIRO_NF']::"EmpresaModulo"[],
ADD COLUMN     "observacoesAdmin" TEXT,
ADD COLUMN     "pagamentoEmDia" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isAdminMaster" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nome" TEXT;
