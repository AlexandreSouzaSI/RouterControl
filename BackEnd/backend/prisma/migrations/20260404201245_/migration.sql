/*
  Warnings:

  - The primary key for the `Caminhao` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `ConfiguracaoPagamento` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Motorista` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `RelatorioPagamento` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `bonificacao` on the `RelatorioPagamento` table. All the data in the column will be lost.
  - You are about to drop the column `bonus7Viagens` on the `RelatorioPagamento` table. All the data in the column will be lost.
  - You are about to drop the column `diaria` on the `RelatorioPagamento` table. All the data in the column will be lost.
  - You are about to drop the column `empresaId` on the `RelatorioPagamento` table. All the data in the column will be lost.
  - You are about to drop the column `placa` on the `RelatorioPagamento` table. All the data in the column will be lost.
  - You are about to drop the column `salario` on the `RelatorioPagamento` table. All the data in the column will be lost.
  - The primary key for the `ResumoOperacao` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[caminhaoId,mes]` on the table `RelatorioPagamento` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `caminhaoId` to the `RelatorioPagamento` table without a default value. This is not possible if the table is not empty.
  - Added the required column `descontoParado` to the `RelatorioPagamento` table without a default value. This is not possible if the table is not empty.
  - Added the required column `valorDias` to the `RelatorioPagamento` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ResumoOperacao" DROP CONSTRAINT "ResumoOperacao_caminhaoId_fkey";

-- AlterTable
ALTER TABLE "Caminhao" DROP CONSTRAINT "Caminhao_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Caminhao_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Caminhao_id_seq";

-- AlterTable
ALTER TABLE "ConfiguracaoPagamento" DROP CONSTRAINT "ConfiguracaoPagamento_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "ConfiguracaoPagamento_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "ConfiguracaoPagamento_id_seq";

-- AlterTable
ALTER TABLE "Motorista" DROP CONSTRAINT "Motorista_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Motorista_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Motorista_id_seq";

-- AlterTable
ALTER TABLE "RelatorioPagamento" DROP CONSTRAINT "RelatorioPagamento_pkey",
DROP COLUMN "bonificacao",
DROP COLUMN "bonus7Viagens",
DROP COLUMN "diaria",
DROP COLUMN "empresaId",
DROP COLUMN "placa",
DROP COLUMN "salario",
ADD COLUMN     "caminhaoId" TEXT NOT NULL,
ADD COLUMN     "descontoParado" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "valorDias" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "RelatorioPagamento_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "RelatorioPagamento_id_seq";

-- AlterTable
ALTER TABLE "ResumoOperacao" DROP CONSTRAINT "ResumoOperacao_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "caminhaoId" SET DATA TYPE TEXT,
ADD CONSTRAINT "ResumoOperacao_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "ResumoOperacao_id_seq";

-- CreateIndex
CREATE UNIQUE INDEX "RelatorioPagamento_caminhaoId_mes_key" ON "RelatorioPagamento"("caminhaoId", "mes");

-- AddForeignKey
ALTER TABLE "ResumoOperacao" ADD CONSTRAINT "ResumoOperacao_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatorioPagamento" ADD CONSTRAINT "RelatorioPagamento_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
