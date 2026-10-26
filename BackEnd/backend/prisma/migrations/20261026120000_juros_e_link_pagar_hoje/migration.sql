-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN "juros" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN "tokenPagarHoje" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_tokenPagarHoje_key" ON "Empresa"("tokenPagarHoje");
