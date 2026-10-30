import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RecebimentoAutomaticoService, Resultado } from './recebimento-automatico.service';

// =============================================================================
// WhatsApp pelo Evolution API (container "evolution_api" do docker-compose).
// O número é conectado lendo um QR code na tela "Recebimento automático".
// Cada PDF/foto que chega vira pendência (boleto/nota ou comprovante) e o
// remetente recebe UMA resposta curta confirmando. Qualquer outra mensagem
// (texto, áudio, figurinha...) é ignorada — não responde nada.
//
// Variáveis de ambiente (backend):
//   EVOLUTION_URL       ex.: http://evolution_api:8080
//   EVOLUTION_API_KEY   a mesma AUTHENTICATION_API_KEY do Evolution
//   EVOLUTION_INSTANCE  nome da instância (padrão: financeiro)
//   WEBHOOK_BASE_URL    como o Evolution alcança o backend (padrão: http://backend_rota:3000)
// =============================================================================

type Midia = { tipo: 'documento' | 'imagem'; nome: string; mime: string; legenda: string; base64?: string };


@Injectable()
export class WhatsappService {
    private readonly log = new Logger('WhatsApp');

    constructor(
        private readonly prisma: PrismaService,
        private readonly recebimento: RecebimentoAutomaticoService,
    ) { }

    get configurado() { return !!(process.env.EVOLUTION_URL && process.env.EVOLUTION_API_KEY); }
    private get instancia() { return process.env.EVOLUTION_INSTANCE || 'financeiro'; }

    private api(): AxiosInstance {
        if (!this.configurado) throw new BadRequestException('WhatsApp não configurado no servidor (EVOLUTION_URL / EVOLUTION_API_KEY no .env).');
        return axios.create({ baseURL: process.env.EVOLUTION_URL!.replace(/\/$/, ''), headers: { apikey: process.env.EVOLUTION_API_KEY! }, timeout: 30000 });
    }

    private webhookUrl(segredo: string) {
        const base = (process.env.WEBHOOK_BASE_URL || 'http://backend_rota:3000').replace(/\/$/, '');
        return `${base}/integracoes/whatsapp/webhook/${segredo}`;
    }

    // ------------------------------------------------------------ conexão (tela)
    async estado() {
        if (!this.configurado) return { configurado: false, estado: 'sem_configuracao' as const, numero: null };
        try {
            const r = await this.api().get(`/instance/connectionState/${this.instancia}`);
            const estado = r.data?.instance?.state ?? r.data?.state ?? 'close';
            let numero: string | null = null;
            if (estado === 'open') {
                const f = await this.api().get('/instance/fetchInstances', { params: { instanceName: this.instancia } }).catch(() => null);
                const inst = Array.isArray(f?.data) ? f!.data[0] : f?.data;
                numero = String(inst?.ownerJid ?? inst?.instance?.owner ?? inst?.number ?? '').split('@')[0] || null;
            }
            return { configurado: true, estado, numero };
        } catch (e: any) {
            if (e?.response?.status === 404) return { configurado: true, estado: 'nao_criada', numero: null };
            return { configurado: true, estado: 'erro', numero: null, erro: e?.message };
        }
    }

    // Cria a instância (se precisar), aponta o webhook pro backend e devolve o QR code.
    async conectar(empresaId: string) {
        const api = this.api();
        let integ = await this.prisma.integracaoEntrada.findUnique({ where: { canal: 'WHATSAPP' } });
        const segredo = integ?.segredo ?? randomBytes(20).toString('hex');
        integ = await this.prisma.integracaoEntrada.upsert({
            where: { canal: 'WHATSAPP' },
            create: { canal: 'WHATSAPP', empresaId, segredo, ativo: true },
            update: { empresaId, segredo, ativo: true },
        });
        const webhook = { enabled: true, url: this.webhookUrl(segredo), byEvents: false, base64: true, events: ['MESSAGES_UPSERT'] };

        const existe = await api.get(`/instance/connectionState/${this.instancia}`).then(() => true).catch((e) => (e?.response?.status === 404 ? false : Promise.reject(e)));
        if (!existe) {
            const r = await api.post('/instance/create', { instanceName: this.instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true, webhook });
            const qr = r.data?.qrcode?.base64 ?? null;
            if (qr) return { estado: 'connecting', qr };
        } else {
            await api.post(`/webhook/set/${this.instancia}`, { webhook }).catch((e) => this.log.warn(`webhook/set: ${e?.message}`));
        }
        const st = await this.estado();
        if (st.estado === 'open') return { estado: 'open', qr: null, numero: st.numero };
        const c = await api.get(`/instance/connect/${this.instancia}`);
        return { estado: 'connecting', qr: c.data?.base64 ?? null, codigo: c.data?.pairingCode ?? null };
    }

    async desconectar() {
        await this.api().delete(`/instance/logout/${this.instancia}`).catch(() => null);
        return { ok: true };
    }

    async enviarTexto(numero: string, texto: string) {
        try {
            await this.api().post(`/message/sendText/${this.instancia}`, { number: numero, text: texto });
        } catch (e: any) {
            this.log.warn(`Não consegui responder ${numero}: ${e?.message}`);
        }
    }

    // ------------------------------------------------------------------ webhook
    async webhook(segredo: string, payload: any) {
        const integ = await this.prisma.integracaoEntrada.findUnique({ where: { canal: 'WHATSAPP' } });
        if (!integ || !integ.segredo || integ.segredo !== segredo) throw new NotFoundException();
        if (!integ.ativo) return { ok: true, ignorado: 'inativo' };
        const evento = String(payload?.event ?? '').toLowerCase().replace('_', '.');
        if (evento && evento !== 'messages.upsert') return { ok: true, ignorado: evento };

        const lista = Array.isArray(payload?.data) ? payload.data : payload?.data?.messages ?? [payload?.data];
        for (const msg of lista) {
            if (!msg?.key) continue;
            // Processa em segundo plano: o Evolution não precisa esperar a leitura do PDF.
            this.tratarMensagem(integ.empresaId, msg).catch((e) => {
                this.log.error(`Mensagem ${msg?.key?.id}: ${e?.message}`);
                this.recebimento.marcarEvento('WHATSAPP', e?.message ?? 'erro').catch(() => null);
            });
        }
        return { ok: true };
    }

    private extrairMidia(msg: any): Midia | null {
        const m = msg?.message ?? {};
        const doc = m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
        const base64 = m.base64 ?? msg.base64 ?? undefined;
        if (doc) {
            return { tipo: 'documento', nome: doc.fileName || doc.title || 'documento.pdf', mime: doc.mimetype || 'application/pdf', legenda: doc.caption ?? m.documentWithCaptionMessage?.message?.documentMessage?.caption ?? '', base64 };
        }
        if (m.imageMessage) {
            const ext = /png/.test(m.imageMessage.mimetype ?? '') ? 'png' : 'jpg';
            return { tipo: 'imagem', nome: `foto-${msg.key.id}.${ext}`, mime: m.imageMessage.mimetype || 'image/jpeg', legenda: m.imageMessage.caption ?? '', base64 };
        }
        return null;
    }

    private async baixar(msg: any, midia: Midia): Promise<Buffer> {
        if (midia.base64) return Buffer.from(String(midia.base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
        const r = await this.api().post(`/chat/getBase64FromMediaMessage/${this.instancia}`, { message: { key: msg.key }, convertToMp4: false });
        if (!r.data?.base64) throw new Error('O Evolution não devolveu o arquivo.');
        return Buffer.from(r.data.base64, 'base64');
    }

    private async tratarMensagem(empresaId: string, msg: any) {
        const jid: string = msg.key.remoteJid ?? '';
        if (msg.key.fromMe || !jid || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;
        // Contatos novos podem vir com "@lid" (id interno); o número de verdade vem em remoteJidAlt/senderPn.
        const real: string = jid.endsWith('@lid') ? (msg.key.remoteJidAlt ?? msg.key.senderPn ?? jid) : jid;
        const numero = real.endsWith('@lid') ? real : real.split('@')[0];
        const nome: string | null = msg.pushName ?? null;
        const midia = this.extrairMidia(msg);

        // Só reage a arquivo (PDF, XML ou foto). Texto, áudio, figurinha, vídeo
        // etc. são ignorados em silêncio — o número não "conversa" com ninguém.
        if (!midia) return;
        if (!/pdf|image|xml/.test(midia.mime) && !/\.(pdf|xml|jpe?g|png)$/i.test(midia.nome)) return;

        const buffer = await this.baixar(msg, midia);
        const r: Resultado = await this.recebimento.processar(empresaId, 'WHATSAPP',
            { buffer, nome: midia.nome, mime: midia.mime },
            { externoId: `wa:${msg.key.id}`, remetente: numero.includes('@') ? numero : `+${numero}`, nomeRemetente: nome, texto: midia.legenda || null });
        await this.recebimento.marcarEvento('WHATSAPP');

        if (r.status === 'JA_PROCESSADO') return;
        const oque = r.tipo === 'COMPROVANTE' ? 'Comprovante' : 'Boleto/nota';
        const texto =
            r.status === 'OK' ? `✅ ${oque} recebido${r.resumo ? `: ${r.resumo}` : ''}. Já está com o financeiro para conferir.${r.tipo === 'COMPROVANTE' && midia.tipo === 'imagem' && !midia.legenda ? '\n(Se for boleto ou nota, mande de novo escrevendo "boleto" ou "nota" na legenda.)' : ''}`
                : r.status === 'DUPLICADO' ? `⚠️ Esse ${oque.toLowerCase()} já tinha sido enviado antes — não registrei de novo.`
                    : `❌ Não consegui registrar esse arquivo (${r.mensagem}). Pode mandar de novo ou falar com o financeiro?`;
        await this.enviarTexto(numero, texto);
    }
}
