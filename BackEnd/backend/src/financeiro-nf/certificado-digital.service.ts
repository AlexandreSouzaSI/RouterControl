import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createSecureContext } from 'tls';
import { PrismaService } from '../prisma/prisma.service';
import { cifrar, decifrar, type SegredoCifrado } from '../common/crypto.util';

// Fica fora de qualquer pasta servida como estática (o backend do Controle
// Rota nem serve nenhuma hoje, mas mesmo assim) — um certificado digital
// nunca pode ficar acessível por URL.
const certificadosPath = join(process.cwd(), 'storage', 'certificados-empresa');

if (!existsSync(certificadosPath)) {
    mkdirSync(certificadosPath, { recursive: true });
}

export type CertificadoCarregado = {
    pfx: Buffer;
    senha: string;
};

@Injectable()
export class CertificadoDigitalService {
    constructor(private readonly prisma: PrismaService) { }

    async obterStatus(empresaId: string) {
        const registro = await this.prisma.certificadoDigitalEmpresa.findUnique({
            where: { empresaId },
            select: {
                nomeArquivo: true,
                createdAt: true,
                updatedAt: true,
                nfeBloqueadoAte: true,
                nfseBloqueadoAte: true,
            },
        });

        return {
            possuiCertificado: !!registro,
            nomeArquivo: registro?.nomeArquivo ?? null,
            atualizadoEm: registro?.updatedAt ?? null,
            nfeBloqueadoAte: registro?.nfeBloqueadoAte ?? null,
            nfseBloqueadoAte: registro?.nfseBloqueadoAte ?? null,
        };
    }

    async salvar(empresaId: string, file: Express.Multer.File | undefined, senha: string) {
        if (!file) {
            throw new BadRequestException('Envie o arquivo do certificado (.pfx ou .p12).');
        }

        if (!senha || !senha.trim()) {
            throw new BadRequestException('Informe a senha do certificado.');
        }

        // Confere se o arquivo é mesmo um PKCS#12 válido e se a senha
        // informada abre ele — sem isso, só descobriríamos o erro na
        // primeira tentativa de sincronizar com a Sefaz/ADN (Fase 4/5),
        // bem depois do upload. createSecureContext lança erro na hora se
        // o par certificado+senha não for válido.
        try {
            createSecureContext({ pfx: file.buffer, passphrase: senha });
        } catch (error: any) {
            throw new BadRequestException(
                'Não foi possível abrir o certificado com essa senha. Confira o arquivo (.pfx/.p12) e a senha e tente de novo.',
            );
        }

        const caminhoArquivo = join(certificadosPath, `${empresaId}.pfx`);
        writeFileSync(caminhoArquivo, file.buffer);

        const { cifrado, iv, authTag } = cifrar(senha);

        await this.prisma.certificadoDigitalEmpresa.upsert({
            where: { empresaId },
            update: {
                nomeArquivo: file.originalname,
                caminhoArquivo,
                senhaCifrada: cifrado,
                senhaIv: iv,
                senhaAuthTag: authTag,
            },
            create: {
                empresaId,
                nomeArquivo: file.originalname,
                caminhoArquivo,
                senhaCifrada: cifrado,
                senhaIv: iv,
                senhaAuthTag: authTag,
            },
        });

        return this.obterStatus(empresaId);
    }

    async remover(empresaId: string) {
        const registro = await this.prisma.certificadoDigitalEmpresa.findUnique({
            where: { empresaId },
        });

        if (!registro) {
            throw new NotFoundException('Nenhum certificado cadastrado pra essa empresa.');
        }

        if (existsSync(registro.caminhoArquivo)) {
            unlinkSync(registro.caminhoArquivo);
        }

        await this.prisma.certificadoDigitalEmpresa.delete({ where: { empresaId } });

        return { ok: true };
    }

    // Usado pelas Fases 4/5 (clientes Sefaz/ADN) pra montar a chamada mTLS —
    // devolve o .pfx em memória e a senha já decifrada, ou null se a
    // empresa ainda não cadastrou certificado.
    async carregar(empresaId: string): Promise<CertificadoCarregado | null> {
        const registro = await this.prisma.certificadoDigitalEmpresa.findUnique({
            where: { empresaId },
        });

        if (!registro) return null;

        if (!existsSync(registro.caminhoArquivo)) {
            throw new NotFoundException(
                'O arquivo do certificado não foi encontrado no servidor — cadastre de novo em Cadastros → Certificado Digital.',
            );
        }

        const segredo: SegredoCifrado = {
            cifrado: registro.senhaCifrada,
            iv: registro.senhaIv,
            authTag: registro.senhaAuthTag,
        };

        return {
            pfx: readFileSync(registro.caminhoArquivo),
            senha: decifrar(segredo),
        };
    }
}
