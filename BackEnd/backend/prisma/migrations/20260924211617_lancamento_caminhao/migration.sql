-- CreateEnum
CREATE TYPE "TipoLancamentoCaminhao" AS ENUM ('RECEITA', 'DESPESA');

-- CreateTable
CREATE TABLE "LancamentoCaminhao" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "tipo" "TipoLancamentoCaminhao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LancamentoCaminhao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LancamentoCaminhao_empresaId_placa_idx" ON "LancamentoCaminhao"("empresaId", "placa");

-- CreateIndex
CREATE INDEX "LancamentoCaminhao_tipo_idx" ON "LancamentoCaminhao"("tipo");

-- AddForeignKey
ALTER TABLE "LancamentoCaminhao" ADD CONSTRAINT "LancamentoCaminhao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
