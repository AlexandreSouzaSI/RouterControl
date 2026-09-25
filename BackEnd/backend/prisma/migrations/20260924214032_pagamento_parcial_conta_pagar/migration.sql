-- AlterEnum
-- 'PARCIAL' já foi adicionada manualmente ao enum StatusContaPagar (rodada
-- em separado antes desta migração, já que ADD VALUE não pode rodar dentro
-- da mesma transação que outros comandos) — deixando comentado aqui só pra
-- histórico; não repetir, senão trava com "enum label already exists".
-- ALTER TYPE "StatusContaPagar" ADD VALUE 'PARCIAL';

-- CreateTable
CREATE TABLE "PagamentoContaPagar" (
    "id" TEXT NOT NULL,
    "contaPagarId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "formaPagamento" "FormaPagamentoContaPagar",
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagamentoContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagamentoContaPagar_contaPagarId_idx" ON "PagamentoContaPagar"("contaPagarId");

-- AddForeignKey
ALTER TABLE "PagamentoContaPagar" ADD CONSTRAINT "PagamentoContaPagar_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
