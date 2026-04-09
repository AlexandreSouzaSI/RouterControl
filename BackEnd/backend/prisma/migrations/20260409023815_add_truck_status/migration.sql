-- CreateTable
CREATE TABLE "TruckStatus" (
    "id" TEXT NOT NULL,
    "caminhaoId" TEXT NOT NULL,
    "ultimaCidade" TEXT NOT NULL,
    "ultimaData" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TruckStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TruckStatus_caminhaoId_key" ON "TruckStatus"("caminhaoId");

-- AddForeignKey
ALTER TABLE "TruckStatus" ADD CONSTRAINT "TruckStatus_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
