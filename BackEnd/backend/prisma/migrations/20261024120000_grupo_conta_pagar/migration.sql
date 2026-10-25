-- CreateEnum
CREATE TYPE "GrupoContaPagar" AS ENUM ('FORNECEDORES', 'IMPOSTOS', 'SOCIOS');

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "grupo" "GrupoContaPagar" NOT NULL DEFAULT 'FORNECEDORES';

-- CreateIndex
CREATE INDEX "ContaPagar_empresaId_grupo_idx" ON "ContaPagar"("empresaId", "grupo");
