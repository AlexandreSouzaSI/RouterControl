// Envio simples de WhatsApp via Evolution API (self-hosted,
// github.com/evolution-foundation/evolution-api) — mesma instância já
// configurada pro Controle NF (Galho Hub), reaproveitando as mesmas
// variáveis de ambiente (EVOLUTION_API_URL/EVOLUTION_API_KEY/
// EVOLUTION_INSTANCE). Diferente do Controle NF, aqui não existe (ainda)
// um módulo WhatsApp completo com provider plugável/webhook — só o envio
// direto usado pelo aviso diário de Conta a Pagar. Se faltar alguma env
// var, loga e não lança erro (não deve travar o cron).
//
// Chamada real: POST {EVOLUTION_API_URL}/message/sendText/{instance}
// com header "apikey" e body { number, text }.
export async function sendWhatsappText(toPhone: string, text: string): Promise<void> {
    const baseUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
    const apiKey = process.env.EVOLUTION_API_KEY || '';
    const instance = process.env.EVOLUTION_INSTANCE || '';

    if (!baseUrl || !apiKey || !instance) {
        console.log(
            `[whatsapp-sender] Evolution API não configurada (EVOLUTION_API_URL/API_KEY/INSTANCE) — mensagem não enviada pra ${toPhone}:\n${text}`,
        );
        return;
    }

    const url = `${baseUrl}/message/sendText/${instance}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
        },
        body: JSON.stringify({ number: normalizePhone(toPhone), text }),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Evolution API respondeu ${response.status}: ${body || 'sem corpo'}`);
    }
}

// Normaliza pra só dígitos com DDI 55 na frente — mesma regra do
// Controle NF (src/common/phone.util.ts), cobre formatos comuns como
// "(31) 99999-8888", "31999998888", "5531999998888".
function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');

    if (digits.startsWith('55') && digits.length >= 12) {
        return digits;
    }

    return `55${digits}`;
}
