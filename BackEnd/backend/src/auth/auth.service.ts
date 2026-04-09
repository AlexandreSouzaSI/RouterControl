/* import { Prisma } from "@prisma/client";

const user = await Prisma.usuario.findUnique({
    where: { email }
});

if (!user) throw new Error('Usuário não encontrado');

const valid = await bcrypt.compare(senha, user.senha);

if (!valid) throw new Error('Senha inválida');

return jwt.sign(
    { userId: user.id, empresaId: user.empresaId },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
); */