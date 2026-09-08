-- CreateTable
CREATE TABLE "PosicaoCaminhao" (
    "id" TEXT NOT NULL,
    "mId" INTEGER NOT NULL,
    "veiId" INTEGER NOT NULL,
    "placa" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "municipio" TEXT,
    "uf" TEXT,
    "rua" TEXT,
    "rodovia" TEXT,
    "velocidade" DOUBLE PRECISION,
    "motorista" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosicaoCaminhao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PosicaoCaminhao_mId_key" ON "PosicaoCaminhao"("mId");

-- CreateIndex
CREATE INDEX "PosicaoCaminhao_placa_dataHora_idx" ON "PosicaoCaminhao"("placa", "dataHora");

-- CreateIndex
CREATE INDEX "PosicaoCaminhao_veiId_dataHora_idx" ON "PosicaoCaminhao"("veiId", "dataHora");
