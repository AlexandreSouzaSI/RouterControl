/*
  Warnings:

  - You are about to drop the `ConfiguracaoPagamentoMotorista` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoCalculoPagamento" AS ENUM ('TRADICIONAL', 'FATURAMENTO');

-- DropTable
DROP TABLE "ConfiguracaoPagamentoMotorista";

-- CreateTable
CREATE TABLE "ConfiguracaoPagamentoCaminhao" (
    "id" TEXT NOT NULL,
    "caminhaoId" TEXT NOT NULL,
    "tipoCalculo" "TipoCalculoPagamento" NOT NULL DEFAULT 'TRADICIONAL',
    "percentualFaturamento" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "valorDiariaOverride" DOUBLE PRECISION,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoPagamentoCaminhao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoPagamentoCaminhao_caminhaoId_key" ON "ConfiguracaoPagamentoCaminhao"("caminhaoId");

-- AddForeignKey
ALTER TABLE "ConfiguracaoPagamentoCaminhao" ADD CONSTRAINT "ConfiguracaoPagamentoCaminhao_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
