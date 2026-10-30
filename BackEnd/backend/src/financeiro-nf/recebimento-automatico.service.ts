import { HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContasEnviadasService } from './contas-enviadas.service';
import { PagamentosAvisadosService } from './pagamentos-avisados.service';
import { lerLinhaDigitavel } from './documento-parser';

// =============================================================================
// Núcleo do recebimento automático (WhatsApp e e-mail): recebe UM arquivo,
// decide se é boleto/nota ou comprovante de pagamento e cria a pendência no
// lugar certo — ninguém lança nada sozinho:
//   boleto / nota / cupom  → "Lançar contas"        (ContaEnviada PENDENTE)
//   comprovante de pagamento → "Registrar pagamentos" (PagamentoAvisado)
// Cada mensagem/anexo é registrado em EntradaAutomatica (histórico + não
// processa a mesma coisa duas vezes).
// =============================================================================

export type Canal = 'WHATSAPP' | 'EMAIL';
export type TipoEntrada = 'BOLETO_NOTA' | 'COMPROVANTE';
export type ArquivoRecebido = { buffer: Buffer; nome: string; mime: string };
export type Origem = { externoId: string; remetente?: string | null; nomeRemetente?: string | null; texto?: string | null; assunto?: string | null };
export type Resultado = {
    status: 'OK' | 'DUPLICADO' | 'ERRO' | 'JA_PROCESSADO';
    tipo: TipoEntrada;
    mensagem: string;
    resumo?: string; // "VIVO — R$ 120,00 — vence 10/11/2026"
};

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

// Palavras na legenda/assunto/nome do arquivo que já dizem o que é.
const DICA_COMPROVANTE = /COMPROVANTE|\bPAGO\b|PAGUEI|PAGAMENTO (FEITO|REALIZADO|EFETUADO)|PIX (FEITO|ENVIADO|REALIZADO)|TRANSFERI|\bTED\b|RECIBO DE PAGAMENTO/;
const DICA_DOCUMENTO = /BOLETO|\bNOTA\b|\bNF\b|NF-?E|NFS-?E|DANFE|CUPOM|FATURA|\bCONTA\b|COBRANCA|DUPLICATA/;
// No texto do PDF.
// ("Autenticação mecânica" fica de fora: todo boleto tem esse texto.)
const TEXTO_COMPROVANTE = /COMPROVANTE (DE )?(PAGAMENTO|PIX|TRANSFERENCIA|TRANSACAO)|PIX (ENVIADO|REALIZADO|EFETUADO)|TRANSFERENCIA (REALIZADA|EFETUADA|ENVIADA)|PAGAMENTO (REALIZADO|EFETUADO|AGENDADO) COM SUCESSO|ID DA TRANSACAO|\bE2E\b|END TO END|AUTENTICACAO BANCARIA/;
const TEXTO_DOCUMENTO = /DANFE|NOTA FISCAL|NFS-?E|CUPOM FISCAL|DOCUMENTO AUXILIAR|RECIBO DO PAGADOR|FICHA DE COMPENSACAO|LINHA DIGITAVEL|CEDENTE|BENEFICIARIO.*VENCIMENTO/;

@Injectable()
export class RecebimentoAutomaticoService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly contasEnviadas: ContasEnviadasService,
        private readonly pagamentos: PagamentosAvisadosService,
    ) { }

    private async textoPdf(buffer: Buffer): Promise<string> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require('pdf-parse/lib/pdf-parse.js');
            const r = await pdfParse(buffer);
            return String(r.text ?? '');
        } catch {
            return '';
        }
    }

    // Decide o tipo. Ordem: o que a pessoa escreveu (legenda/assunto/nome do
    // arquivo) → o texto do PDF → padrão do canal (WhatsApp = comprovante,
    // e-mail = boleto/nota, que é o que normalmente chega por cada um).
    async classificar(canal: Canal, arquivo: ArquivoRecebido, origem: Origem): Promise<TipoEntrada> {
        const nome = (arquivo.nome || '').toLowerCase();
        if (/xml/.test(arquivo.mime) || nome.endsWith('.xml')) return 'BOLETO_NOTA';
        const dica = norm(`${origem.texto ?? ''} ${origem.assunto ?? ''} ${arquivo.nome ?? ''}`);
        const temComp = DICA_COMPROVANTE.test(dica);
        const temDoc = DICA_DOCUMENTO.test(dica);
        if (temComp && !temDoc) return 'COMPROVANTE';
        if (temDoc && !temComp) return 'BOLETO_NOTA';
        if (arquivo.mime === 'application/pdf' || nome.endsWith('.pdf')) {
            const t = norm(await this.textoPdf(arquivo.buffer));
            if (TEXTO_COMPROVANTE.test(t)) return 'COMPROVANTE';
            if (TEXTO_DOCUMENTO.test(t) || lerLinhaDigitavel(t)) return 'BOLETO_NOTA';
        }
        return canal === 'WHATSAPP' ? 'COMPROVANTE' : 'BOLETO_NOTA';
    }

    async processar(empresaId: string, canal: Canal, arquivo: ArquivoRecebido, origem: Origem): Promise<Resultado> {
        const ja = await this.prisma.entradaAutomatica.findUnique({ where: { externoId: origem.externoId }, select: { tipo: true } });
        if (ja) return { status: 'JA_PROCESSADO', tipo: ja.tipo as TipoEntrada, mensagem: 'Já processado.' };

        const tipo = await this.classificar(canal, arquivo, origem);
        const quem = [origem.nomeRemetente, origem.remetente].filter(Boolean).join(' · ');
        const enviadoPor = `${canal === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}${quem ? `: ${quem}` : ''}`.slice(0, 190);
        const obs = [origem.assunto, origem.texto].filter(Boolean).join(' — ').slice(0, 500) || undefined;
        const file = {
            buffer: arquivo.buffer, originalname: arquivo.nome, mimetype: arquivo.mime, size: arquivo.buffer.length,
            fieldname: 'file', encoding: '7bit',
        } as Express.Multer.File;

        let resultado: Resultado;
        let destinoId: string | null = null;
        try {
            if (tipo === 'BOLETO_NOTA') {
                const r = await this.contasEnviadas.criar(empresaId, enviadoPor, { observacao: obs }, file);
                destinoId = r.id;
                const partes = [r.fornecedor, r.valor ? brl(r.valor) : null, r.vencimento ? `vence ${dataBR(r.vencimento)}` : null].filter(Boolean);
                resultado = { status: 'OK', tipo, mensagem: 'Registrado em Lançar contas.', resumo: partes.join(' — ') || undefined };
            } else {
                const r: any = await this.pagamentos.criar(empresaId, { nome: enviadoPor }, { descricao: obs }, file);
                destinoId = r.id;
                const partes = [r.fornecedor && !/^Não informado/.test(r.fornecedor) ? r.fornecedor : null, r.valor ? brl(r.valor) : null, r.dataPagamento ? `pago ${dataBR(r.dataPagamento)}` : null].filter(Boolean);
                resultado = { status: 'OK', tipo, mensagem: 'Registrado em Registrar pagamentos.', resumo: partes.join(' — ') || undefined };
            }
        } catch (e: any) {
            const msg = e instanceof HttpException ? String((e.getResponse() as any)?.message ?? e.message) : String(e?.message ?? e);
            resultado = { status: /já foi enviado/i.test(msg) ? 'DUPLICADO' : 'ERRO', tipo, mensagem: msg.slice(0, 300) };
        }

        try {
            await this.prisma.entradaAutomatica.create({
                data: {
                    empresaId, canal, externoId: origem.externoId,
                    remetente: origem.remetente?.slice(0, 120) ?? null,
                    nomeRemetente: origem.nomeRemetente?.slice(0, 120) ?? null,
                    assunto: (origem.assunto ?? origem.texto ?? null)?.slice(0, 300) ?? null,
                    arquivoNome: arquivo.nome?.slice(0, 200) ?? null,
                    tipo, status: resultado.status, mensagem: resultado.resumo ?? resultado.mensagem,
                    destinoTipo: destinoId ? (tipo === 'BOLETO_NOTA' ? 'CONTA_ENVIADA' : 'PAGAMENTO_AVISADO') : null,
                    destinoId,
                },
            });
        } catch {
            // externoId repetido (duas entregas ao mesmo tempo): ignora
        }
        return resultado;
    }

    // ------------------------------------------------------------- configuração
    integracao(canal: Canal) {
        return this.prisma.integracaoEntrada.findUnique({ where: { canal } });
    }

    async marcarEvento(canal: Canal, erro?: string | null) {
        await this.prisma.integracaoEntrada.updateMany({
            where: { canal },
            data: erro === undefined ? { ultimoEvento: new Date(), ultimoErro: null } : { ultimoErro: erro ? erro.slice(0, 300) : null },
        });
    }

    ultimas(empresaId: string) {
        return this.prisma.entradaAutomatica.findMany({ where: { empresaId }, orderBy: { createdAt: 'desc' }, take: 60 });
    }
}
