-- CreateTable
CREATE TABLE "ConfiguracaoPagamentoMotorista" (
    "id" TEXT NOT NULL,
    "salarioBase" DOUBLE PRECISION NOT NULL DEFAULT 3352,
    "valorDiaria" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "valorPorViagem" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "bonusMetaViagens" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "metaViagens" INTEGER NOT NULL DEFAULT 7,
    "diasBaseSalario" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoPagamentoMotorista_pkey" PRIMARY KEY ("id")
);
