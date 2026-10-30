import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { RecebimentoAutomaticoService } from './recebimento-automatico.service';

// =============================================================================
// Robô de e-mail dos boletos: a cada 5 minutos lê os e-mails NÃO LIDOS da caixa
// (ex.: boletos@viaminaslog.com.br na Hostinger), pega os anexos PDF / XML /
// foto e manda pro recebimento automático (vira pendência em "Lançar contas"
// ou "Registrar pagamentos"). Depois marca o e-mail como lido.
//
// Variáveis de ambiente (backend):
//   IMAP_HOST  ex.: imap.hostinger.com     IMAP_PORT  993 (padrão)
//   IMAP_USER  ex.: boletos@viaminaslog.com.br     IMAP_PASS  senha da caixa
// Só funciona depois de "Ativar" na tela (é lá que diz de qual empresa é).
// =============================================================================

const ANEXO_OK = /pdf|xml|image\/(jpe?g|png)/i;

@Injectable()
export class EmailBoletosService {
    private readonly log = new Logger('EmailBoletos');
    private rodando = false;

    constructor(private readonly recebimento: RecebimentoAutomaticoService) { }

    get configurado() { return !!(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS); }
    get usuario() { return process.env.IMAP_USER ?? null; }

    @Interval('email-boletos', 5 * 60 * 1000)
    async agendado() {
        const integ = await this.recebimento.integracao('EMAIL').catch(() => null);
        if (!this.configurado || !integ?.ativo) return;
        await this.verificar().catch(() => null);
    }

    // Lê a caixa agora. Devolve quantos e-mails e anexos foram tratados.
    async verificar() {
        if (!this.configurado) return { ok: false, erro: 'E-mail não configurado no servidor (IMAP_HOST / IMAP_USER / IMAP_PASS no .env).' };
        const integ = await this.recebimento.integracao('EMAIL');
        if (!integ?.ativo) return { ok: false, erro: 'Recebimento por e-mail desativado.' };
        if (this.rodando) return { ok: false, erro: 'Já está verificando, aguarde.' };
        this.rodando = true;
        const cliente = new ImapFlow({
            host: process.env.IMAP_HOST!,
            port: Number(process.env.IMAP_PORT || 993),
            secure: (process.env.IMAP_SECURE ?? 'true') !== 'false',
            auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASS! },
            logger: false,
        });
        let emails = 0, anexos = 0;
        try {
            await cliente.connect();
            const lock = await cliente.getMailboxLock('INBOX');
            try {
                const ids = (await cliente.search({ seen: false }, { uid: true })) || [];
                for (const uid of ids.slice(0, 50)) {
                    const msg = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
                    if (!msg || !msg.source) continue;
                    const mail = await simpleParser(msg.source);
                    const de = mail.from?.value?.[0];
                    const base = mail.messageId || `uid-${uid}-${mail.date?.getTime() ?? ''}`;
                    const validos = (mail.attachments ?? []).filter((a) =>
                        (ANEXO_OK.test(a.contentType) || /\.(pdf|xml|jpe?g|png)$/i.test(a.filename ?? ''))
                        // logo/assinatura embutida no corpo do e-mail não é documento
                        && !(a.contentDisposition === 'inline' && /image/.test(a.contentType) && a.size < 40_000));
                    for (const [i, a] of validos.entries()) {
                        await this.recebimento.processar(integ.empresaId, 'EMAIL',
                            { buffer: a.content, nome: a.filename || `anexo-${i + 1}`, mime: a.contentType },
                            { externoId: `mail:${base}#${i}:${a.filename ?? ''}`.slice(0, 250), remetente: de?.address ?? null, nomeRemetente: de?.name || null, assunto: mail.subject ?? null });
                        anexos++;
                    }
                    await cliente.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
                    emails++;
                }
            } finally {
                lock.release();
            }
            await cliente.logout();
            await this.recebimento.marcarEvento('EMAIL');
            return { ok: true, emails, anexos };
        } catch (e: any) {
            this.log.warn(`Falha ao ler a caixa: ${e?.message}`);
            await this.recebimento.marcarEvento('EMAIL', e?.message ?? 'erro').catch(() => null);
            try { await cliente.logout(); } catch { /* já caiu */ }
            return { ok: false, erro: e?.message ?? 'Falha ao ler a caixa de e-mail.', emails, anexos };
        } finally {
            this.rodando = false;
        }
    }
}
