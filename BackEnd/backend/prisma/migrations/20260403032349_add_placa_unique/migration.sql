/*
  Warnings:

  - A unique constraint covering the columns `[placa]` on the table `Caminhao` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Caminhao_placa_key" ON "Caminhao"("placa");
