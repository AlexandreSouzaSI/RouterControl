-- CreateEnum
CREATE TYPE "StatusContaReceber" AS ENUM ('ABERTA', 'RECEBIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "ContaReceber" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "cliente" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "motorista" TEXT,
    "cte" TEXT,
    "banco" TEXT,
    "dataEmissao" TIMESTAMP(3),
    "referencia" TEXT,
    "comercial" TEXT,
    "status" "StatusContaReceber" NOT NULL DEFAULT 'ABERTA',
    "recebidoEm" TIMESTAMP(3),
    "valorRecebido" DOUBLE PRECISION,
    "caminhaoId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaReceber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContaReceber_empresaId_status_vencimento_idx" ON "ContaReceber"("empresaId", "status", "vencimento");

-- CreateIndex
CREATE INDEX "ContaReceber_empresaId_caminhaoId_idx" ON "ContaReceber"("empresaId", "caminhaoId");

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaReceber" ADD CONSTRAINT "ContaReceber_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
