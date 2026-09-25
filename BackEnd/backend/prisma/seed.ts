import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { cifrar } from '../src/common/crypto.util';

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

    // Credencial da Trucks Control já pré-cadastrada pra essa empresa, lida
    // de TRUCKS_LOGIN/TRUCKS_SENHA no .env (nunca do código-fonte) e
    // gravada cifrada — igual ao fluxo normal de Cadastros → Rastreador.
    // Existe só pra evitar ter que digitar a credencial de novo toda vez
    // que o banco de dev/teste é resetado (ex.: `prisma migrate dev`
    // pedindo confirmação de drift). upsert por empresaId: rodar o seed de
    // novo não sobrescreve uma credencial que você já trocou pelo próprio
    // app.
    const trucksLogin = process.env.TRUCKS_LOGIN?.trim();
    const trucksSenha = process.env.TRUCKS_SENHA?.trim();

    if (trucksLogin && trucksSenha) {
        const credencialExistente = await prisma.trucksControlCredencial.findUnique({
            where: { empresaId: empresa.id },
        });

        if (!credencialExistente) {
            const { cifrado, iv, authTag } = cifrar(trucksSenha);

            await prisma.trucksControlCredencial.create({
                data: {
                    empresaId: empresa.id,
                    login: trucksLogin,
                    senhaCifrada: cifrado,
                    senhaIv: iv,
                    senhaAuthTag: authTag,
                    ativo: true,
                },
            });

            console.log('Credencial da Trucks Control pré-cadastrada a partir do .env.');
        } else {
            console.log('Credencial da Trucks Control já existia — nada foi alterado.');
        }
    } else {
        console.log(
            'TRUCKS_LOGIN/TRUCKS_SENHA não configurados no .env — credencial da Trucks Control não foi pré-cadastrada (cadastre pelo app em Cadastros → Rastreador).',
        );
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
