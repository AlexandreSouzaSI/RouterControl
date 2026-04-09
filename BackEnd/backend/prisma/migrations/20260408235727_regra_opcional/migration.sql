-- AlterTable
ALTER TABLE "TruckRule" ALTER COLUMN "origemViagem" DROP NOT NULL,
ALTER COLUMN "destinoViagem" DROP NOT NULL,
ALTER COLUMN "cidadeParado" DROP NOT NULL;
