/*
  Warnings:

  - A unique constraint covering the columns `[empresaId,nome]` on the table `CategoriaFinanceira` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[empresaId]` on the table `ConfiguracaoPagamentoMotorista` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "CategoriaFinanceira_nome_key";

-- AlterTable
ALTER TABLE "CategoriaFinanceira" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "ConfiguracaoPagamentoMotorista" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "ImportacaoExtrato" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "RegraClassificacaoFinanceira" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "TransacaoFinanceira" ADD COLUMN     "empresaId" TEXT;

-- CreateIndex
CREATE INDEX "CategoriaFinanceira_empresaId_idx" ON "CategoriaFinanceira"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaFinanceira_empresaId_nome_key" ON "CategoriaFinanceira"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoPagamentoMotorista_empresaId_key" ON "ConfiguracaoPagamentoMotorista"("empresaId");

-- CreateIndex
CREATE INDEX "ImportacaoExtrato_empresaId_idx" ON "ImportacaoExtrato"("empresaId");

-- CreateIndex
CREATE INDEX "RegraClassificacaoFinanceira_empresaId_idx" ON "RegraClassificacaoFinanceira"("empresaId");

-- CreateIndex
CREATE INDEX "TransacaoFinanceira_empresaId_idx" ON "TransacaoFinanceira"("empresaId");

-- AddForeignKey
ALTER TABLE "ConfiguracaoPagamentoMotorista" ADD CONSTRAINT "ConfiguracaoPagamentoMotorista_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaFinanceira" ADD CONSTRAINT "CategoriaFinanceira_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacaoExtrato" ADD CONSTRAINT "ImportacaoExtrato_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransacaoFinanceira" ADD CONSTRAINT "TransacaoFinanceira_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraClassificacaoFinanceira" ADD CONSTRAINT "RegraClassificacaoFinanceira_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
