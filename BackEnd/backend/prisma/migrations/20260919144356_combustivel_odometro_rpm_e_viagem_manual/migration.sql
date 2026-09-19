-- AlterTable
ALTER TABLE "PosicaoCaminhao" ADD COLUMN     "litrosTanque" DOUBLE PRECISION,
ADD COLUMN     "odometro" DOUBLE PRECISION,
ADD COLUMN     "rpm" INTEGER;

-- AlterTable
ALTER TABLE "ViagemGps" ADD COLUMN     "criadaManualmente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "destinoLatitude" DOUBLE PRECISION,
ADD COLUMN     "destinoLongitude" DOUBLE PRECISION,
ADD COLUMN     "origemLatitude" DOUBLE PRECISION,
ADD COLUMN     "origemLongitude" DOUBLE PRECISION;
