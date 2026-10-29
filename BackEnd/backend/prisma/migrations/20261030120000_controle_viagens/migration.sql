-- Controle de Viagens (planilha por abas).
-- Só ADICIONA duas tabelas novas; não altera nenhum dado existente.

-- CreateTable
CREATE TABLE "ViagemPlanilhaAba" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "titulo" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "colunas" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViagemPlanilhaAba_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViagemPlanilhaLinha" (
    "id" TEXT NOT NULL,
    "abaId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViagemPlanilhaLinha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViagemPlanilhaAba_empresaId_ordem_idx" ON "ViagemPlanilhaAba"("empresaId", "ordem");
CREATE INDEX "ViagemPlanilhaLinha_abaId_ordem_idx" ON "ViagemPlanilhaLinha"("abaId", "ordem");

-- AddForeignKey
ALTER TABLE "ViagemPlanilhaAba" ADD CONSTRAINT "ViagemPlanilhaAba_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ViagemPlanilhaLinha" ADD CONSTRAINT "ViagemPlanilhaLinha_abaId_fkey" FOREIGN KEY ("abaId") REFERENCES "ViagemPlanilhaAba"("id") ON DELETE CASCADE ON UPDATE CASCADE;
