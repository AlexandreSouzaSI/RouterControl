-- CreateEnum
CREATE TYPE "StatusRpa" AS ENUM ('PENDENTE', 'PAGO');

-- CreateEnum
CREATE TYPE "StatusCiot" AS ENUM ('PENDENTE', 'EMITIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoPreparoFiscal" AS ENUM ('CTE', 'MDFE');

-- CreateTable
CREATE TABLE "RpaRecibo" (
    "id" TEXT NOT NULL,
    "motoristaNome" TEXT NOT NULL,
    "motoristaCpf" TEXT,
    "motoristaPix" TEXT,
    "caminhaoId" TEXT,
    "competencia" TEXT NOT NULL,
    "descricaoServico" TEXT,
    "valorBruto" DOUBLE PRECISION NOT NULL,
    "aliquotaInss" DOUBLE PRECISION NOT NULL DEFAULT 11,
    "valorInss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseIrrf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aliquotaIrrf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorIrrf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorLiquido" DOUBLE PRECISION NOT NULL,
    "status" "StatusRpa" NOT NULL DEFAULT 'PENDENTE',
    "dataPagamento" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RpaRecibo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CiotRegistro" (
    "id" TEXT NOT NULL,
    "numeroCiot" TEXT,
    "operadora" TEXT,
    "caminhaoId" TEXT,
    "motoristaNome" TEXT NOT NULL,
    "motoristaCpf" TEXT,
    "origemMunicipio" TEXT NOT NULL,
    "destinoMunicipio" TEXT NOT NULL,
    "dataViagem" TIMESTAMP(3) NOT NULL,
    "valorFrete" DOUBLE PRECISION,
    "status" "StatusCiot" NOT NULL DEFAULT 'PENDENTE',
    "dataEmissao" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CiotRegistro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalPreparoItem" (
    "id" TEXT NOT NULL,
    "tipo" "TipoPreparoFiscal" NOT NULL,
    "chave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalPreparoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RpaRecibo_competencia_idx" ON "RpaRecibo"("competencia");

-- CreateIndex
CREATE INDEX "RpaRecibo_status_idx" ON "RpaRecibo"("status");

-- CreateIndex
CREATE INDEX "RpaRecibo_caminhaoId_idx" ON "RpaRecibo"("caminhaoId");

-- CreateIndex
CREATE INDEX "CiotRegistro_status_idx" ON "CiotRegistro"("status");

-- CreateIndex
CREATE INDEX "CiotRegistro_caminhaoId_idx" ON "CiotRegistro"("caminhaoId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPreparoItem_tipo_chave_key" ON "FiscalPreparoItem"("tipo", "chave");

-- AddForeignKey
ALTER TABLE "RpaRecibo" ADD CONSTRAINT "RpaRecibo_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CiotRegistro" ADD CONSTRAINT "CiotRegistro_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
