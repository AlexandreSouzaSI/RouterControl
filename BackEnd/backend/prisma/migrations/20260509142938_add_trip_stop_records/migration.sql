-- CreateTable
CREATE TABLE "UploadPeriod" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caminhaoId" TEXT NOT NULL,
    "uploadId" TEXT,

    CONSTRAINT "UploadPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripRecord" (
    "id" TEXT NOT NULL,
    "dataHoraChegada" TIMESTAMP(3) NOT NULL,
    "cidade" TEXT NOT NULL,
    "latitude" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caminhaoId" TEXT NOT NULL,
    "uploadPeriodId" TEXT NOT NULL,

    CONSTRAINT "TripRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StopRecord" (
    "id" TEXT NOT NULL,
    "dataHoraEntrada" TIMESTAMP(3) NOT NULL,
    "dataHoraSaida" TIMESTAMP(3),
    "diasParados" INTEGER NOT NULL DEFAULT 0,
    "cidadeEntrada" TEXT NOT NULL,
    "latitudeEntrada" TEXT,
    "cidadeSaida" TEXT,
    "latitudeSaida" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caminhaoId" TEXT NOT NULL,
    "uploadPeriodId" TEXT NOT NULL,

    CONSTRAINT "StopRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadPeriod_caminhaoId_periodo_key" ON "UploadPeriod"("caminhaoId", "periodo");

-- AddForeignKey
ALTER TABLE "UploadPeriod" ADD CONSTRAINT "UploadPeriod_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadPeriod" ADD CONSTRAINT "UploadPeriod_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRecord" ADD CONSTRAINT "TripRecord_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRecord" ADD CONSTRAINT "TripRecord_uploadPeriodId_fkey" FOREIGN KEY ("uploadPeriodId") REFERENCES "UploadPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopRecord" ADD CONSTRAINT "StopRecord_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopRecord" ADD CONSTRAINT "StopRecord_uploadPeriodId_fkey" FOREIGN KEY ("uploadPeriodId") REFERENCES "UploadPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
