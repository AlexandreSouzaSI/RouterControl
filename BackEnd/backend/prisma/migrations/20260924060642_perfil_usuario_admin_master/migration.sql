-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('ADMIN', 'PROPRIETARIO', 'FUNCIONARIO');

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "perfil" "PerfilUsuario" NOT NULL DEFAULT 'ADMIN';
