/*
  Warnings:

  - You are about to drop the column `placa` on the `ResumoOperacao` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ResumoOperacao" DROP COLUMN "placa",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viagem" (
    "id" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Viagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoPagamento" (
    "id" SERIAL NOT NULL,
    "empresaId" TEXT NOT NULL,
    "salarioBase" DOUBLE PRECISION NOT NULL,
    "valorDiaria" DOUBLE PRECISION NOT NULL,
    "valorPorViagem" DOUBLE PRECISION NOT NULL,
    "bonus7Viagens" DOUBLE PRECISION NOT NULL,
    "bonusPadrao" DOUBLE PRECISION,

    CONSTRAINT "ConfiguracaoPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelatorioPagamento" (
    "id" SERIAL NOT NULL,
    "mes" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "salario" DOUBLE PRECISION NOT NULL,
    "diaria" DOUBLE PRECISION NOT NULL,
    "bonificacao" DOUBLE PRECISION NOT NULL,
    "bonus7Viagens" DOUBLE PRECISION NOT NULL,
    "valorViagens" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatorioPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_email_key" ON "Empresa"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viagem" ADD CONSTRAINT "Viagem_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracaoPagamento" ADD CONSTRAINT "ConfiguracaoPagamento_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
