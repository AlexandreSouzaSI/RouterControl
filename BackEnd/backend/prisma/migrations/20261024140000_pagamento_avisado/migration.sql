-- CreateEnum
CREATE TYPE "StatusPagamentoAvisado" AS ENUM ('PENDENTE', 'CONCILIADO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "PagamentoAvisado" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "dataPagamento" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT,
    "comprovante" BYTEA,
    "comprovanteNome" TEXT,
    "comprovanteMime" TEXT,
    "avisadoPorId" TEXT,
    "avisadoPorNome" TEXT,
    "status" "StatusPagamentoAvisado" NOT NULL DEFAULT 'PENDENTE',
    "conciliadoEm" TIMESTAMP(3),
    "conciliadoPor" TEXT,
    "contaPagarId" TEXT,
    "observacaoFinanceiro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagamentoAvisado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagamentoAvisado_empresaId_status_idx" ON "PagamentoAvisado"("empresaId", "status");

-- AddForeignKey
ALTER TABLE "PagamentoAvisado" ADD CONSTRAINT "PagamentoAvisado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
