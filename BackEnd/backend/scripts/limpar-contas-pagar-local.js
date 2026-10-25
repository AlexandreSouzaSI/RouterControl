/**
 * Apaga as contas a pagar de UMA empresa no banco LOCAL (para reimportar a planilha).
 * Só roda se DATABASE_URL apontar para localhost/127.0.0.1. Nunca use na VPS.
 *
 * Uso (dentro de BackEnd/backend):
 *   node scripts/limpar-contas-pagar-local.js --empresa controlerota@sistema.local            (só mostra)
 *   node scripts/limpar-contas-pagar-local.js --empresa controlerota@sistema.local --confirmar (apaga)
 */

const { PrismaClient } = require('@prisma/client');

(async () => {
    const url = process.env.DATABASE_URL || '';
    if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
        console.log('RECUSADO: DATABASE_URL não é local. Nada foi apagado.');
        process.exit(1);
    }
    const args = process.argv.slice(2);
    const i = args.indexOf('--empresa');
    const email = i >= 0 ? args[i + 1] : null;
    const confirmar = args.includes('--confirmar');
    const prisma = new PrismaClient();
    try {
        const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true, email: true } });
        const alvo = empresas.find((e) => e.email === email);
        if (!alvo) {
            console.log('Informe --empresa <email>. Opções:');
            for (const e of empresas) console.log(` - ${e.email}  (${e.nome})`);
            return;
        }
        const total = await prisma.contaPagar.count({ where: { empresaId: alvo.id } });
        const pags = await prisma.pagamentoContaPagar.count({ where: { contaPagar: { empresaId: alvo.id } } });
        console.log(`Empresa: ${alvo.nome} — ${total} contas e ${pags} baixas parciais.`);
        if (!confirmar) {
            console.log('Nada apagado. Rode de novo com --confirmar para apagar.');
            return;
        }
        await prisma.pagamentoContaPagar.deleteMany({ where: { contaPagar: { empresaId: alvo.id } } });
        const r = await prisma.contaPagar.deleteMany({ where: { empresaId: alvo.id } });
        console.log(`Apagadas ${r.count} contas. Agora rode o importador.`);
    } finally {
        await prisma.$disconnect();
    }
})();
