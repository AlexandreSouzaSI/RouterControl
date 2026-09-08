/*
  Warnings:

  - The `proprietario` column on the `VeiculoTrucksControl` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "VeiculoTrucksControl" DROP COLUMN "proprietario",
ADD COLUMN     "proprietario" BOOLEAN;
