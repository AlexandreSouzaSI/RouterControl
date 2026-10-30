-- Antecipação de recebíveis. Só ADICIONA 2 tabelas novas; não altera nem apaga
-- nenhum dado existente.

-- CreateTable
CREATE TABLE "AntecipacaoRecebivel" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "credor" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "taxa" DOUBLE PRECISION NOT NULL,
    "taxaPercentual" DOUBLE PRECISION,
    "dataRecebimento" TIMESTAMP(3) NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "contaPagarId" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AntecipacaoRecebivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntecipacaoRecebivelParte" (
    "id" TEXT NOT NULL,
    "antecipacaoId" TEXT NOT NULL,
    "caminhaoId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "taxa" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AntecipacaoRecebivelParte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AntecipacaoRecebivel_contaPagarId_key" ON "AntecipacaoRecebivel"("contaPagarId");
CREATE INDEX "AntecipacaoRecebivel_empresaId_idx" ON "AntecipacaoRecebivel"("empresaId");
CREATE INDEX "AntecipacaoRecebivelParte_caminhaoId_idx" ON "AntecipacaoRecebivelParte"("caminhaoId");
CREATE INDEX "AntecipacaoRecebivelParte_antecipacaoId_idx" ON "AntecipacaoRecebivelParte"("antecipacaoId");

-- AddForeignKey
ALTER TABLE "AntecipacaoRecebivel" ADD CONSTRAINT "AntecipacaoRecebivel_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AntecipacaoRecebivelParte" ADD CONSTRAINT "AntecipacaoRecebivelParte_antecipacaoId_fkey" FOREIGN KEY ("antecipacaoId") REFERENCES "AntecipacaoRecebivel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AntecipacaoRecebivelParte" ADD CONSTRAINT "AntecipacaoRecebivelParte_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
