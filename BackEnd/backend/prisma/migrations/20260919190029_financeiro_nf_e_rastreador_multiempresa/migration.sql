/*
  Warnings:

  - A unique constraint covering the columns `[empresaId,tipoRequisicao]` on the table `TrucksControlRateLimit` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[empresaId,veiId]` on the table `VeiculoTrucksControl` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "TrucksControlRateLimit_tipoRequisicao_key";

-- DropIndex
DROP INDEX "VeiculoTrucksControl_veiId_key";

-- AlterTable
ALTER TABLE "PosicaoCaminhao" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "TrucksControlRateLimit" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "VeiculoTrucksControl" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "ViagemGps" ADD COLUMN     "empresaId" TEXT;

-- CreateTable
CREATE TABLE "TrucksControlCredencial" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "senhaCifrada" TEXT NOT NULL,
    "senhaIv" TEXT NOT NULL,
    "senhaAuthTag" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrucksControlCredencial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrucksControlCredencial_empresaId_key" ON "TrucksControlCredencial"("empresaId");

-- CreateIndex
CREATE INDEX "PosicaoCaminhao_empresaId_idx" ON "PosicaoCaminhao"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "TrucksControlRateLimit_empresaId_tipoRequisicao_key" ON "TrucksControlRateLimit"("empresaId", "tipoRequisicao");

-- CreateIndex
CREATE INDEX "VeiculoTrucksControl_empresaId_idx" ON "VeiculoTrucksControl"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "VeiculoTrucksControl_empresaId_veiId_key" ON "VeiculoTrucksControl"("empresaId", "veiId");

-- CreateIndex
CREATE INDEX "ViagemGps_empresaId_idx" ON "ViagemGps"("empresaId");

-- AddForeignKey
ALTER TABLE "TrucksControlCredencial" ADD CONSTRAINT "TrucksControlCredencial_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VeiculoTrucksControl" ADD CONSTRAINT "VeiculoTrucksControl_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrucksControlRateLimit" ADD CONSTRAINT "TrucksControlRateLimit_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosicaoCaminhao" ADD CONSTRAINT "PosicaoCaminhao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViagemGps" ADD CONSTRAINT "ViagemGps_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
