-- AlterTable
ALTER TABLE "ResumoOperacao" ADD COLUMN     "uploadId" TEXT;

-- CreateTable
CREATE TABLE "TruckRule" (
    "id" TEXT NOT NULL,
    "caminhaoId" TEXT NOT NULL,
    "origemViagem" TEXT NOT NULL,
    "destinoViagem" TEXT NOT NULL,
    "cidadeParado" TEXT NOT NULL,

    CONSTRAINT "TruckRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caminhaoId" TEXT NOT NULL,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TruckRule_caminhaoId_key" ON "TruckRule"("caminhaoId");

-- AddForeignKey
ALTER TABLE "TruckRule" ADD CONSTRAINT "TruckRule_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumoOperacao" ADD CONSTRAINT "ResumoOperacao_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
