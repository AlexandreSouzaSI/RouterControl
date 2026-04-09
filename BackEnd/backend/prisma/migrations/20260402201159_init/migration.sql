-- CreateTable
CREATE TABLE "Caminhao" (
    "id" SERIAL NOT NULL,
    "placa" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Caminhao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumoOperacao" (
    "id" SERIAL NOT NULL,
    "placa" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "numeroViagens" INTEGER NOT NULL,
    "diasParados" INTEGER NOT NULL,
    "diasRodando" INTEGER NOT NULL,
    "caminhaoId" INTEGER NOT NULL,

    CONSTRAINT "ResumoOperacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motorista" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Motorista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Caminhao_placa_key" ON "Caminhao"("placa");

-- AddForeignKey
ALTER TABLE "ResumoOperacao" ADD CONSTRAINT "ResumoOperacao_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
