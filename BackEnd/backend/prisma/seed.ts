import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Login padrão do sistema — mesma ideia do NuGalho Hub: uma conta já
// existe assim que o backend sobe, sem precisar de autocadastro.
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_SENHA = '123456';

async function main() {
    const empresa = await prisma.empresa.upsert({
        where: { email: 'controlerota@sistema.local' },
        update: {},
        create: {
            nome: 'Controle Rota',
            email: 'controlerota@sistema.local',
        },
    });

    const senhaHash = await bcrypt.hash(ADMIN_SENHA, 10);

    // upsert por e-mail: rodar o seed de novo não duplica nem reseta a
    // senha de um usuário que o próprio time já alterou.
    const usuarioExistente = await prisma.usuario.findUnique({
        where: { email: ADMIN_EMAIL },
    });

    if (!usuarioExistente) {
        await prisma.usuario.create({
            data: {
                email: ADMIN_EMAIL,
                senha: senhaHash,
                empresaId: empresa.id,
            },
        });

        console.log(`Usuário padrão criado: ${ADMIN_EMAIL} / ${ADMIN_SENHA}`);
    } else {
        console.log(`Usuário ${ADMIN_EMAIL} já existe — nada foi alterado.`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
