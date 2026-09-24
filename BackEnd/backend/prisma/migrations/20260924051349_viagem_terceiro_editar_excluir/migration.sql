-- AlterTable
ALTER TABLE "ViagemGps" ADD COLUMN     "terceiro" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "veiId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ViagemGps_empresaId_terceiro_idx" ON "ViagemGps"("empresaId", "terceiro");
