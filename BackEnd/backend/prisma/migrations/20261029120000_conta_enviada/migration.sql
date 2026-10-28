-- "Lançar contas": boletos/notas enviados pelo link aguardando conferência.
-- Só ADICIONA (tabela nova + coluna opcional); não altera nenhum dado existente.

-- CreateEnum
CREATE TYPE "StatusContaEnviada" AS ENUM ('PENDENTE', 'LANCADA', 'DESCARTADA');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN "tokenEnvioContas" TEXT;

-- CreateTable
CREATE TABLE "ContaEnviada" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "arquivo" BYTEA,
    "arquivoNome" TEXT,
    "arquivoMime" TEXT,
    "tipoDocumento" TEXT,
    "fornecedor" TEXT,
    "fornecedorDoc" TEXT,
    "valor" DOUBLE PRECISION,
    "vencimento" TIMESTAMP(3),
    "emissao" TIMESTAMP(3),
    "numeroDocumento" TEXT,
    "codigoBarras" TEXT,
    "chaveNfe" TEXT,
    "descricao" TEXT,
    "parcelas" JSONB,
    "caminhaoId" TEXT,
    "categoriaId" TEXT,
    "observacaoEnvio" TEXT,
    "enviadoPorNome" TEXT,
    "status" "StatusContaEnviada" NOT NULL DEFAULT 'PENDENTE',
    "contaPagarIds" TEXT[],
    "lancadoEm" TIMESTAMP(3),
    "lancadoPor" TEXT,
    "motivoDescarte" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaEnviada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_tokenEnvioContas_key" ON "Empresa"("tokenEnvioContas");
CREATE INDEX "ContaEnviada_empresaId_status_idx" ON "ContaEnviada"("empresaId", "status");
CREATE INDEX "ContaEnviada_empresaId_codigoBarras_idx" ON "ContaEnviada"("empresaId", "codigoBarras");

-- AddForeignKey
ALTER TABLE "ContaEnviada" ADD CONSTRAINT "ContaEnviada_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
