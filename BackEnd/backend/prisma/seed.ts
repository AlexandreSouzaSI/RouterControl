import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Login padrão do sistema — mesma ideia do NuGalho Hub: uma conta já
// existe assim que o backend sobe, sem precisar de autocadastro.
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_SENHA = '123456';

// Conta do dono do sistema (Alexandre) — Quadro do Administrador, acesso a
// todas as empresas independente de perfil/módulo. Fica presa à empresa
// interna "Controle Rota" (abaixo), não a nenhum cliente real.
const MASTER_EMAIL = 'alemourasouza33@gmail.com';
const MASTER_SENHA = '92988096';

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
                nome: 'Administrador',
                email: ADMIN_EMAIL,
                senha: senhaHash,
                empresaId: empresa.id,
                // Esse login padrão nasce já como dono do sistema (Quadro do
                // Administrador) — se você usa um login diferente no dia a
                // dia, marque isAdminMaster=true nele também, direto no
                // banco (ver instrução no chat).
                isAdminMaster: true,
            },
        });

        console.log(`Usuário padrão criado: ${ADMIN_EMAIL} / ${ADMIN_SENHA}`);
    } else {
        console.log(`Usuário ${ADMIN_EMAIL} já existe — nada foi alterado.`);
    }

    // Conta master do Alexandre — upsert por e-mail, sempre garante que
    // isAdminMaster fique true mesmo que a conta já exista (ex.: alguém
    // criou ela antes sem a flag).
    const masterExistente = await prisma.usuario.findUnique({
        where: { email: MASTER_EMAIL },
    });

    if (!masterExistente) {
        const masterSenhaHash = await bcrypt.hash(MASTER_SENHA, 10);

        await prisma.usuario.create({
            data: {
                nome: 'Alexandre',
                email: MASTER_EMAIL,
                senha: masterSenhaHash,
                empresaId: empresa.id,
                isAdminMaster: true,
                perfil: 'ADMIN',
            },
        });

        console.log(`Conta master criada: ${MASTER_EMAIL}`);
    } else if (!masterExistente.isAdminMaster) {
        await prisma.usuario.update({
            where: { id: masterExistente.id },
            data: { isAdminMaster: true },
        });

        console.log(`Conta ${MASTER_EMAIL} já existia — marcada como admin master agora.`);
    } else {
        console.log(`Conta master ${MASTER_EMAIL} já existe — nada foi alterado.`);
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
