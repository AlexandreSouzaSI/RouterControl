-- CreateTable
CREATE TABLE "VeiculoTrucksControl" (
    "id" TEXT NOT NULL,
    "veiId" INTEGER NOT NULL,
    "placa" TEXT,
    "equipamento" INTEGER,
    "motorista" TEXT,
    "proprietario" TEXT,
    "identificacao" TEXT,
    "chassi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VeiculoTrucksControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VeiculoTrucksControl_veiId_key" ON "VeiculoTrucksControl"("veiId");
