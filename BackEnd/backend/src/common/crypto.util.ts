import * as crypto from 'crypto';

// Criptografia simétrica (AES-256-GCM) usada pra guardar segredos de
// terceiros no banco (senha da conta na Trucks Control, senha do
// certificado digital A1...) sem nunca gravar texto puro. Mesma técnica
// usada no Controle NF pro certificado digital das lojas.
//
// A chave vem de CERT_ENCRYPTION_KEY (32 bytes) — se não tiver 32 bytes
// exatos, deriva uma chave de 32 bytes a partir do que foi informado via
// SHA-256, pra não travar o boot só por causa disso (mas o ideal é
// configurar já com 32 bytes/64 caracteres hex).
function obterChave(): Buffer {
    const chaveEnv = process.env.CERT_ENCRYPTION_KEY;

    if (!chaveEnv) {
        throw new Error(
            'CERT_ENCRYPTION_KEY não configurada — necessária pra cifrar segredos (senha do rastreador, certificado digital etc.).',
        );
    }

    const buffer = Buffer.from(chaveEnv, 'utf8');

    if (buffer.length === 32) return buffer;

    // Deriva 32 bytes de qualquer tamanho de entrada.
    return crypto.createHash('sha256').update(chaveEnv).digest();
}

export interface SegredoCifrado {
    cifrado: string;
    iv: string;
    authTag: string;
}

export function cifrar(textoPuro: string): SegredoCifrado {
    const chave = obterChave();
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', chave, iv);

    const cifrado = Buffer.concat([
        cipher.update(textoPuro, 'utf8'),
        cipher.final(),
    ]);

    return {
        cifrado: cifrado.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
    };
}

export function decifrar(segredo: SegredoCifrado): string {
    const chave = obterChave();

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        chave,
        Buffer.from(segredo.iv, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(segredo.authTag, 'base64'));

    const textoPuro = Buffer.concat([
        decipher.update(Buffer.from(segredo.cifrado, 'base64')),
        decipher.final(),
    ]);

    return textoPuro.toString('utf8');
}
