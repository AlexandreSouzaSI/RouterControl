-- CreateEnum
CREATE TYPE "TipoContaPagar" AS ENUM ('BOLETO', 'PIX', 'CARTAO', 'SEM_BOLETO');

-- CreateEnum
CREATE TYPE "StatusContaPagar" AS ENUM ('ABERTA', 'PAGA', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "FormaPagamentoContaPagar" AS ENUM ('BOLETO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'DINHEIRO', 'TRANSFERENCIA', 'CONTA_EMPRESA');

-- CreateEnum
CREATE TYPE "TipoChavePix" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA');

-- CreateEnum
CREATE TYPE "OrigemNf" AS ENUM ('SEFAZ', 'XML_UPLOAD');

-- AlterTable
ALTER TABLE "Caminhao" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "cnpj" TEXT;

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "cnpj" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaContaPagar" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "empresaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "tipo" "TipoContaPagar" NOT NULL DEFAULT 'BOLETO',
    "formaPagamento" "FormaPagamentoContaPagar" NOT NULL DEFAULT 'BOLETO',
    "vencimento" TIMESTAMP(3) NOT NULL,
    "pagoEm" TIMESTAMP(3),
    "status" "StatusContaPagar" NOT NULL DEFAULT 'ABERTA',
    "codigoBarras" TEXT,
    "pixChave" TEXT,
    "pixTipoChave" "TipoChavePix",
    "pixQrCode" TEXT,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "favorecido" TEXT,
    "empresaId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "categoriaId" TEXT,
    "caminhaoId" TEXT,
    "arquivoUrl" TEXT,
    "comprovantePagamentoUrl" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificadoDigitalEmpresa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "caminhoArquivo" TEXT NOT NULL,
    "senhaCifrada" TEXT NOT NULL,
    "senhaIv" TEXT NOT NULL,
    "senhaAuthTag" TEXT NOT NULL,
    "ultimoNsu" BIGINT NOT NULL DEFAULT 0,
    "ultimoNsuNfe" BIGINT NOT NULL DEFAULT 0,
    "nfeBloqueadoAte" TIMESTAMP(3),
    "nfseBloqueadoAte" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificadoDigitalEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SefazSincronizacaoLog" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "mensagem" TEXT NOT NULL,
    "totalBuscado" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SefazSincronizacaoLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfEntrada" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nsu" BIGINT NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "emitenteCnpj" TEXT,
    "emitenteNome" TEXT,
    "valor" DOUBLE PRECISION,
    "dataEmissao" TIMESTAMP(3),
    "situacao" TEXT,
    "arquivoUrl" TEXT,
    "buscadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manifestadoEm" TIMESTAMP(3),
    "statusManifestacao" TEXT,
    "origem" "OrigemNf" NOT NULL DEFAULT 'SEFAZ',
    "caminhaoId" TEXT,
    "ignorado" BOOLEAN NOT NULL DEFAULT false,
    "aceita" BOOLEAN NOT NULL DEFAULT false,
    "contaPagarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfEntrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NfServico" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nsu" BIGINT NOT NULL,
    "chaveAcesso" TEXT NOT NULL,
    "tipoDocumento" TEXT NOT NULL,
    "tipoEvento" TEXT,
    "numeroNf" TEXT,
    "prestadorNome" TEXT,
    "prestadorDoc" TEXT,
    "valor" DOUBLE PRECISION,
    "dataEmissao" TIMESTAMP(3),
    "arquivoUrl" TEXT,
    "geradoEm" TIMESTAMP(3),
    "buscadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caminhaoId" TEXT,
    "ignorado" BOOLEAN NOT NULL DEFAULT false,
    "aceita" BOOLEAN NOT NULL DEFAULT false,
    "contaPagarId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfServico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fornecedor_empresaId_idx" ON "Fornecedor"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_empresaId_nomeNormalizado_key" ON "Fornecedor"("empresaId", "nomeNormalizado");

-- CreateIndex
CREATE INDEX "CategoriaContaPagar_empresaId_idx" ON "CategoriaContaPagar"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaContaPagar_empresaId_nomeNormalizado_key" ON "CategoriaContaPagar"("empresaId", "nomeNormalizado");

-- CreateIndex
CREATE INDEX "ContaPagar_empresaId_idx" ON "ContaPagar"("empresaId");

-- CreateIndex
CREATE INDEX "ContaPagar_fornecedorId_idx" ON "ContaPagar"("fornecedorId");

-- CreateIndex
CREATE INDEX "ContaPagar_categoriaId_idx" ON "ContaPagar"("categoriaId");

-- CreateIndex
CREATE INDEX "ContaPagar_caminhaoId_idx" ON "ContaPagar"("caminhaoId");

-- CreateIndex
CREATE INDEX "ContaPagar_status_idx" ON "ContaPagar"("status");

-- CreateIndex
CREATE INDEX "ContaPagar_vencimento_idx" ON "ContaPagar"("vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoDigitalEmpresa_empresaId_key" ON "CertificadoDigitalEmpresa"("empresaId");

-- CreateIndex
CREATE INDEX "SefazSincronizacaoLog_empresaId_origem_createdAt_idx" ON "SefazSincronizacaoLog"("empresaId", "origem", "createdAt");

-- CreateIndex
CREATE INDEX "NfEntrada_empresaId_idx" ON "NfEntrada"("empresaId");

-- CreateIndex
CREATE INDEX "NfEntrada_caminhaoId_idx" ON "NfEntrada"("caminhaoId");

-- CreateIndex
CREATE INDEX "NfEntrada_tipoDocumento_idx" ON "NfEntrada"("tipoDocumento");

-- CreateIndex
CREATE INDEX "NfEntrada_contaPagarId_idx" ON "NfEntrada"("contaPagarId");

-- CreateIndex
CREATE UNIQUE INDEX "NfEntrada_empresaId_chaveAcesso_key" ON "NfEntrada"("empresaId", "chaveAcesso");

-- CreateIndex
CREATE INDEX "NfServico_empresaId_idx" ON "NfServico"("empresaId");

-- CreateIndex
CREATE INDEX "NfServico_caminhaoId_idx" ON "NfServico"("caminhaoId");

-- CreateIndex
CREATE INDEX "NfServico_tipoDocumento_idx" ON "NfServico"("tipoDocumento");

-- CreateIndex
CREATE INDEX "NfServico_contaPagarId_idx" ON "NfServico"("contaPagarId");

-- CreateIndex
CREATE UNIQUE INDEX "NfServico_empresaId_chaveAcesso_key" ON "NfServico"("empresaId", "chaveAcesso");

-- CreateIndex
CREATE INDEX "Caminhao_empresaId_idx" ON "Caminhao"("empresaId");

-- AddForeignKey
ALTER TABLE "Caminhao" ADD CONSTRAINT "Caminhao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaContaPagar" ADD CONSTRAINT "CategoriaContaPagar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoDigitalEmpresa" ADD CONSTRAINT "CertificadoDigitalEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SefazSincronizacaoLog" ADD CONSTRAINT "SefazSincronizacaoLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfEntrada" ADD CONSTRAINT "NfEntrada_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfEntrada" ADD CONSTRAINT "NfEntrada_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfEntrada" ADD CONSTRAINT "NfEntrada_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfServico" ADD CONSTRAINT "NfServico_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfServico" ADD CONSTRAINT "NfServico_caminhaoId_fkey" FOREIGN KEY ("caminhaoId") REFERENCES "Caminhao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfServico" ADD CONSTRAINT "NfServico_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
