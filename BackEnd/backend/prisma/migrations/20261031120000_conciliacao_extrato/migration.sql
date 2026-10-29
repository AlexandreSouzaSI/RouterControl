-- Conciliação do Extrato. Só ADICIONA (tabelas novas + 1 coluna opcional em
-- LancamentoCaminhao); não altera nem apaga nenhum dado existente.

-- CreateEnum
CREATE TYPE "StatusConciliacaoExtrato" AS ENUM ('ABERTA', 'APLICADA');

-- AlterTable
ALTER TABLE "LancamentoCaminhao" ADD COLUMN "conciliacaoExtratoId" TEXT;

-- CreateTable
CREATE TABLE "ConciliacaoExtrato" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "banco" TEXT,
    "arquivos" TEXT[],
    "totalPagamentos" DOUBLE PRECISION NOT NULL,
    "totalRecebimentos" DOUBLE PRECISION NOT NULL,
    "nPagamentos" INTEGER NOT NULL,
    "nRecebimentos" INTEGER NOT NULL,
    "saldoAnterior" DOUBLE PRECISION,
    "saldoFinal" DOUBLE PRECISION,
    "status" "StatusConciliacaoExtrato" NOT NULL DEFAULT 'ABERTA',
    "pendenteReaplicar" BOOLEAN NOT NULL DEFAULT false,
    "aplicadoEm" TIMESTAMP(3),
    "aplicadoPor" TEXT,
    "token" TEXT,
    "linkEnviadoEm" TIMESTAMP(3),
    "linkEnviadoPor" TEXT,
    "criadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConciliacaoExtrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacaoExtratoItem" (
    "id" TEXT NOT NULL,
    "conciliacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "hora" TEXT,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "partes" JSONB NOT NULL DEFAULT '[]',
    "origem" TEXT,
    "motivo" TEXT,
    "sugestao" TEXT,
    "nota" TEXT,
    "contaPagar" TEXT,

    CONSTRAINT "ConciliacaoExtratoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacaoVinculo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "termo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConciliacaoVinculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LancamentoCaminhao_conciliacaoExtratoId_idx" ON "LancamentoCaminhao"("conciliacaoExtratoId");
CREATE UNIQUE INDEX "ConciliacaoExtrato_token_key" ON "ConciliacaoExtrato"("token");
CREATE INDEX "ConciliacaoExtrato_empresaId_mes_idx" ON "ConciliacaoExtrato"("empresaId", "mes");
CREATE INDEX "ConciliacaoExtratoItem_conciliacaoId_idx" ON "ConciliacaoExtratoItem"("conciliacaoId");
CREATE UNIQUE INDEX "ConciliacaoVinculo_empresaId_termo_key" ON "ConciliacaoVinculo"("empresaId", "termo");

-- AddForeignKey
ALTER TABLE "LancamentoCaminhao" ADD CONSTRAINT "LancamentoCaminhao_conciliacaoExtratoId_fkey" FOREIGN KEY ("conciliacaoExtratoId") REFERENCES "ConciliacaoExtrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConciliacaoExtrato" ADD CONSTRAINT "ConciliacaoExtrato_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConciliacaoExtratoItem" ADD CONSTRAINT "ConciliacaoExtratoItem_conciliacaoId_fkey" FOREIGN KEY ("conciliacaoId") REFERENCES "ConciliacaoExtrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConciliacaoVinculo" ADD CONSTRAINT "ConciliacaoVinculo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
