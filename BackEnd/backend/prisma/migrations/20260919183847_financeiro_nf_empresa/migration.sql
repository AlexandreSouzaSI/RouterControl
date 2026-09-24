-- AlterTable
ALTER TABLE "CiotRegistro" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "RpaRecibo" ADD COLUMN     "empresaId" TEXT;

-- CreateIndex
CREATE INDEX "CiotRegistro_empresaId_idx" ON "CiotRegistro"("empresaId");

-- CreateIndex
CREATE INDEX "RpaRecibo_empresaId_idx" ON "RpaRecibo"("empresaId");

-- AddForeignKey
ALTER TABLE "RpaRecibo" ADD CONSTRAINT "RpaRecibo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CiotRegistro" ADD CONSTRAINT "CiotRegistro_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
