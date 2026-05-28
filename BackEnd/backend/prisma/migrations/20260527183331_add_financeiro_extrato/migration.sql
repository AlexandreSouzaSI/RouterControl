-- CreateEnum
CREATE TYPE "DirecaoTransacaoFinanceira" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StatusTransacaoFinanceira" AS ENUM ('PENDENTE_CLASSIFICACAO', 'CLASSIFICADA', 'IGNORADA');

-- CreateTable
CREATE TABLE "CategoriaFinanceira" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacaoExtrato" (
    "id" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "totalLinhas" INTEGER NOT NULL DEFAULT 0,
    "linhasImportadas" INTEGER NOT NULL DEFAULT 0,
    "linhasIgnoradas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportacaoExtrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransacaoFinanceira" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "lancamento" TEXT NOT NULL,
    "razaoSocial" TEXT,
    "documento" TEXT,
    "descricao" TEXT,
    "valor" DECIMAL(10,2) NOT NULL,
    "direcao" "DirecaoTransacaoFinanceira" NOT NULL,
    "status" "StatusTransacaoFinanceira" NOT NULL DEFAULT 'PENDENTE_CLASSIFICACAO',
    "caminhaoId" TEXT,
    "categoriaId" TEXT,
    "importacaoId" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransacaoFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegraClassificacaoFinanceira" (
    "id" TEXT NOT NULL,
    "palavra" TEXT NOT NULL,
    "categoriaId" TEXT,
    "caminhaoId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraClassificacaoFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaFinanceira_nome_key" ON "CategoriaFinanceira"("nome");

-- CreateIndex
CREATE INDEX "TransacaoFinanceira_data_idx" ON "TransacaoFinanceira"("data");

-- CreateIndex
CREATE INDEX "TransacaoFinanceira_direcao_idx" ON "TransacaoFinanceira"("direcao");

-- CreateIndex
CREATE INDEX "TransacaoFinanceira_caminhaoId_idx" ON "TransacaoFinanceira"("caminhaoId");

-- CreateIndex
CREATE INDEX "TransacaoFinanceira_categoriaId_idx" ON "TransacaoFinanceira"("categoriaId");

-- CreateIndex
CREATE INDEX "RegraClassificacaoFinanceira_palavra_idx" ON "RegraClassificacaoFinanceira"("palavra");

-- AddForeignKey
ALTER TABLE "TransacaoFinanceira" ADD CONSTRAINT "TransacaoFinanceira_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransacaoFinanceira" ADD CONSTRAINT "TransacaoFinanceira_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransacaoFinanceira" ADD CONSTRAINT "TransacaoFinanceira_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ImportacaoExtrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraClassificacaoFinanceira" ADD CONSTRAINT "RegraClassificacaoFinanceira_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraClassificacaoFinanceira" ADD CONSTRAINT "RegraClassificacaoFinanceira_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
