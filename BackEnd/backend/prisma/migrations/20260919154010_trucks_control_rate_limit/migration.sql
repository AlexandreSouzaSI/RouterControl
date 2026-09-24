-- CreateTable
CREATE TABLE "TrucksControlRateLimit" (
    "id" TEXT NOT NULL,
    "tipoRequisicao" TEXT NOT NULL,
    "ultimaChamadaEm" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrucksControlRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrucksControlRateLimit_tipoRequisicao_key" ON "TrucksControlRateLimit"("tipoRequisicao");
