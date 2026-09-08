-- CreateEnum
CREATE TYPE "StatusViagemGps" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "ViagemGps" (
    "id" TEXT NOT NULL,
    "veiId" INTEGER NOT NULL,
    "placa" TEXT,
    "origemMunicipio" TEXT NOT NULL,
    "origemUf" TEXT,
    "dataHoraInicio" TIMESTAMP(3) NOT NULL,
    "destinoMunicipio" TEXT,
    "destinoUf" TEXT,
    "dataHoraFim" TIMESTAMP(3),
    "status" "StatusViagemGps" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViagemGps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViagemGps_veiId_status_idx" ON "ViagemGps"("veiId", "status");

-- CreateIndex
CREATE INDEX "ViagemGps_placa_idx" ON "ViagemGps"("placa");
