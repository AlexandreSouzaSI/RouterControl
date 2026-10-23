/*
  Warnings:

  - A unique constraint covering the columns `[recorrenciaId,vencimento]` on the table `ContaPagar` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "TipoPessoaEmpresa" AS ENUM ('JURIDICA', 'FISICA');

-- CreateEnum
CREATE TYPE "TipoRecorrenciaContaPagar" AS ENUM ('MENSAL', 'SEMANAL');

-- CreateEnum
CREATE TYPE "DiaSemanaUtil" AS ENUM ('SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA');

-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "queuedForPaymentAt" TIMESTAMP(3),
ADD COLUMN     "recorrenciaId" TEXT;

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "telefoneAvisoDiario" TEXT,
ADD COLUMN     "tipoPessoa" "TipoPessoaEmpresa" NOT NULL DEFAULT 'JURIDICA';

-- CreateTable
CREATE TABLE "ContaPagarRecorrencia" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "formaPagamento" "FormaPagamentoContaPagar" NOT NULL DEFAULT 'BOLETO',
    "observacao" TEXT,
    "tipoRecorrencia" "TipoRecorrenciaContaPagar" NOT NULL,
    "diaMes" INTEGER,
    "diaSemana" "DiaSemanaUtil",
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "geradoAte" TIMESTAMP(3),
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaPagarRecorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContaPagarRecorrencia_empresaId_idx" ON "ContaPagarRecorrencia"("empresaId");

-- CreateIndex
CREATE INDEX "ContaPagar_recorrenciaId_idx" ON "ContaPagar"("recorrenciaId");

-- CreateIndex
CREATE INDEX "ContaPagar_queuedForPaymentAt_idx" ON "ContaPagar"("queuedForPaymentAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_recorrenciaId_vencimento_key" ON "ContaPagar"("recorrenciaId", "vencimento");

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "ContaPagarRecorrencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagarRecorrencia" ADD CONSTRAINT "ContaPagarRecorrencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
