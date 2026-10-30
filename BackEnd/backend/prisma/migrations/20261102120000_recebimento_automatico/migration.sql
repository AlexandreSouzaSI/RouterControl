-- Recebimento automático (WhatsApp + e-mail). Só ADICIONA 2 tabelas novas.

CREATE TABLE "IntegracaoEntrada" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "segredo" TEXT,
    "ultimoEvento" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegracaoEntrada_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EntradaAutomatica" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "externoId" TEXT NOT NULL,
    "remetente" TEXT,
    "nomeRemetente" TEXT,
    "assunto" TEXT,
    "arquivoNome" TEXT,
    "tipo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mensagem" TEXT,
    "destinoTipo" TEXT,
    "destinoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntradaAutomatica_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegracaoEntrada_canal_key" ON "IntegracaoEntrada"("canal");
CREATE UNIQUE INDEX "EntradaAutomatica_externoId_key" ON "EntradaAutomatica"("externoId");
CREATE INDEX "EntradaAutomatica_empresaId_createdAt_idx" ON "EntradaAutomatica"("empresaId", "createdAt");

ALTER TABLE "IntegracaoEntrada" ADD CONSTRAINT "IntegracaoEntrada_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntradaAutomatica" ADD CONSTRAINT "EntradaAutomatica_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
