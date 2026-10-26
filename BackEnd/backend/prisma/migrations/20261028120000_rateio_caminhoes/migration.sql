-- CreateTable
CREATE TABLE "ContaPagarRateio" (
    "id" TEXT NOT NULL,
    "contaPagarId" TEXT NOT NULL,
    "caminhaoId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ContaPagarRateio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaReceberRateio" (
    "id" TEXT NOT NULL,
    "contaReceberId" TEXT NOT NULL,
    "caminhaoId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ContaReceberRateio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagarRateio_contaPagarId_caminhaoId_key" ON "ContaPagarRateio"("contaPagarId", "caminhaoId");
CREATE INDEX "ContaPagarRateio_caminhaoId_idx" ON "ContaPagarRateio"("caminhaoId");
CREATE UNIQUE INDEX "ContaReceberRateio_contaReceberId_caminhaoId_key" ON "ContaReceberRateio"("contaReceberId", "caminhaoId");
CREATE INDEX "ContaReceberRateio_caminhaoId_idx" ON "ContaReceberRateio"("caminhaoId");

-- AddForeignKey
ALTER TABLE "ContaPagarRateio" ADD CONSTRAINT "ContaPagarRateio_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContaPagarRateio" ADD CONSTRAINT "ContaPagarRateio_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContaReceberRateio" ADD CONSTRAINT "ContaReceberRateio_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "ContaReceber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContaReceberRateio" ADD CONSTRAINT "ContaReceberRateio_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
