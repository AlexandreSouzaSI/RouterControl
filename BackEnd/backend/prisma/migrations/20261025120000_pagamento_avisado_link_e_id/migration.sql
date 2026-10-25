-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN "tokenAvisoPagamento" TEXT;

-- AlterTable
ALTER TABLE "PagamentoAvisado" ADD COLUMN "idTransacao" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_tokenAvisoPagamento_key" ON "Empresa"("tokenAvisoPagamento");

-- CreateIndex (NULLs não colidem no Postgres)
CREATE UNIQUE INDEX "PagamentoAvisado_empresaId_idTransacao_key" ON "PagamentoAvisado"("empresaId", "idTransacao");
