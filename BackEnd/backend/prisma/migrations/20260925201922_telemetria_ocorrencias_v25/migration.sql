-- AlterEnum
ALTER TYPE "StatusContaPagar" ADD VALUE 'PARCIAL';

-- AlterTable
ALTER TABLE "NfEntrada" ADD COLUMN     "destinatarioCnpj" TEXT,
ADD COLUMN     "destinatarioNome" TEXT,
ADD COLUMN     "ehCarga" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numeroNf" TEXT;

-- CreateTable
CREATE TABLE "TelemetriaOcorrencia" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "veiId" INTEGER NOT NULL,
    "placa" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "velocidade" DOUBLE PRECISION,
    "velocidadeMax" DOUBLE PRECISION,
    "rpm" INTEGER,
    "percentualTanque" DOUBLE PRECISION,
    "percentualAcelerador" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetriaOcorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetriaBlocoV25" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT,
    "veiId" INTEGER NOT NULL,
    "placa" TEXT,
    "dataHoraInicio" TIMESTAMP(3) NOT NULL,
    "dataHoraFim" TIMESTAMP(3) NOT NULL,
    "hodometroInicial" DOUBLE PRECISION,
    "hodometroTotal" DOUBLE PRECISION,
    "qtdMinutosMotorInicio" INTEGER,
    "qtdMinutosMotorFim" INTEGER,
    "consumoLitrosAnterior" DOUBLE PRECISION,
    "consumoLitros" DOUBLE PRECISION,
    "tempMediaLiqArrefecimento" DOUBLE PRECISION,
    "tempMaximaLiqArrefecimento" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetriaBlocoV25_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelemetriaOcorrencia_placa_dataHora_idx" ON "TelemetriaOcorrencia"("placa", "dataHora");

-- CreateIndex
CREATE INDEX "TelemetriaOcorrencia_empresaId_idx" ON "TelemetriaOcorrencia"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetriaOcorrencia_veiId_dataHora_key" ON "TelemetriaOcorrencia"("veiId", "dataHora");

-- CreateIndex
CREATE INDEX "TelemetriaBlocoV25_placa_dataHoraFim_idx" ON "TelemetriaBlocoV25"("placa", "dataHoraFim");

-- CreateIndex
CREATE INDEX "TelemetriaBlocoV25_empresaId_idx" ON "TelemetriaBlocoV25"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetriaBlocoV25_veiId_dataHoraInicio_dataHoraFim_key" ON "TelemetriaBlocoV25"("veiId", "dataHoraInicio", "dataHoraFim");

-- CreateIndex
CREATE INDEX "NfEntrada_ehCarga_idx" ON "NfEntrada"("ehCarga");

-- AddForeignKey
ALTER TABLE "TelemetriaOcorrencia" ADD CONSTRAINT "TelemetriaOcorrencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetriaBlocoV25" ADD CONSTRAINT "TelemetriaBlocoV25_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
