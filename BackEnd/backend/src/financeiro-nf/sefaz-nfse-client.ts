import { request } from 'https';
import { gunzipSync } from 'zlib';
import { XMLParser } from 'fast-xml-parser';

import type { CertificadoCarregado } from './certificado-digital.service';

// Cliente do ADN (Ambiente de Dados Nacional) de NFS-e — portado do
// Controle NF (src/stores/sefaz-nfse-client.ts). Autentica por mTLS
// (certificado cliente) e consulta a distribuição de documentos por NSU.
//
// A API de produção do ADN só foi liberada em 01/10/2025 — antes disso só
// existia o ambiente de homologação (chamado de "produção restrita" pela
// Sefaz). Confirmado em gov.br/nfse que o endereço de produção é o abaixo.
const PRODUCAO_BASE_URL = 'https://adn.nfse.gov.br';
const HOMOLOGACAO_BASE_URL = 'https://adn.producaorestrita.nfse.gov.br';

export type Ambiente = 'PRODUCAO' | 'HOMOLOGACAO';

function baseUrlFor(ambiente: Ambiente = 'PRODUCAO'): string {
    return ambiente === 'HOMOLOGACAO' ? HOMOLOGACAO_BASE_URL : PRODUCAO_BASE_URL;
}

type RawResponse = {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
};

// Faz um GET autenticado por mTLS (certificado cliente) e devolve o status
// + corpo cru. Só o módulo https nativo, sem lib de HTTP externa.
function mtlsGet(url: string, cert: CertificadoCarregado): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        let req: ReturnType<typeof request>;

        try {
            req = request(
                url,
                {
                    method: 'GET',
                    pfx: cert.pfx,
                    passphrase: cert.senha,
                    timeout: 15000,
                    headers: {
                        Accept: 'application/json, text/html, */*',
                    },
                },
                (res) => {
                    const chunks: Buffer[] = [];

                    res.on('data', (chunk) => chunks.push(chunk));

                    res.on('end', () => {
                        resolve({
                            status: res.statusCode || 0,
                            headers: res.headers as Record<string, string | string[] | undefined>,
                            body: Buffer.concat(chunks).toString('utf-8'),
                        });
                    });
                },
            );
        } catch (error) {
            reject(error);
            return;
        }

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('TIMEOUT'));
        });

        req.on('error', (error) => reject(error));

        req.end();
    });
}

// Tipos alinhados ao swagger real da API (LoteDistribuicaoNSUResponse).
// TipoDocumento pode ser NENHUM | DPS | PEDIDO_REGISTRO_EVENTO | NFSE |
// EVENTO | CNC.
export type DistribuicaoNSU = {
    NSU: number;
    ChaveAcesso?: string | null;
    TipoDocumento: string;
    TipoEvento?: string | null;
    ArquivoXml?: string | null;
    DataHoraGeracao?: string | null;
};

export type MensagemProcessamento = {
    Codigo?: string | null;
    Descricao?: string | null;
    Complemento?: string | null;
};

export type LoteDistribuicaoNSUResponse = {
    StatusProcessamento: 'REJEICAO' | 'NENHUM_DOCUMENTO_LOCALIZADO' | 'DOCUMENTOS_LOCALIZADOS';
    LoteDFe?: DistribuicaoNSU[] | null;
    Alertas?: MensagemProcessamento[] | null;
    Erros?: MensagemProcessamento[] | null;
    TipoAmbiente: 'PRODUCAO' | 'HOMOLOGACAO';
    VersaoAplicativo?: string | null;
    DataHoraProcessamento: string;
};

// Busca um "lote" de documentos a partir de um NSU.
export async function fetchDistribution(
    cert: CertificadoCarregado,
    nsu: number | bigint,
    ambiente: Ambiente = 'PRODUCAO',
): Promise<LoteDistribuicaoNSUResponse> {
    const response = await mtlsGet(`${baseUrlFor(ambiente)}/contribuintes/DFe/${nsu}?lote=true`, cert);

    let parsed: LoteDistribuicaoNSUResponse | undefined;

    try {
        parsed = JSON.parse(response.body);
    } catch {
        // segue undefined, tratado abaixo
    }

    if (!parsed || !parsed.StatusProcessamento) {
        throw new Error(
            `Resposta inesperada do ADN (HTTP ${response.status}): ${truncate(response.body, 300)}`,
        );
    }

    if (parsed.StatusProcessamento === 'REJEICAO') {
        const motivos = (parsed.Erros || [])
            .map((erro) => erro.Descricao)
            .filter(Boolean)
            .join('; ');

        throw new Error(`ADN rejeitou a consulta${motivos ? `: ${motivos}` : '.'}`);
    }

    return parsed;
}

// O ArquivoXml vem comprimido em GZip e codificado em base64 (documentado
// pela própria API). Se não vier comprimido, cai pro texto puro em vez de
// derrubar o processamento do lote inteiro.
export function decodeArquivoXml(base64Content: string): string {
    const buffer = Buffer.from(base64Content, 'base64');

    try {
        return gunzipSync(buffer).toString('utf-8');
    } catch {
        return buffer.toString('utf-8');
    }
}

const nfseXmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
});

export type ParsedNfse = {
    numeroNf?: string;
    issuerName?: string;
    issuerDoc?: string;
    value?: number;
    issueDate?: string;
};

function extractText(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object' && '#text' in value) return String(value['#text']);
    return '';
}

// Acha o primeiro nó com esse nome em qualquer profundidade da árvore —
// necessário porque o schema do NFS-e nacional não tem documentação
// pública campo-a-campo. Procurar por nome em vez de caminho fixo é
// tolerante a isso.
function findNodeByName(parsed: any, key: string): any | null {
    const stack = [parsed];

    while (stack.length > 0) {
        const node = stack.pop();

        if (!node || typeof node !== 'object') continue;
        if (node[key] !== undefined) return node[key];

        for (const nodeKey of Object.keys(node)) {
            const value = node[nodeKey];
            if (value && typeof value === 'object') stack.push(value);
        }
    }

    return null;
}

// Extrai os dados que aparecem no card de conciliação (número, prestador,
// valor, data) do XML completo da NFS-e. Tolerante a schema — se algum
// campo não for encontrado, fica undefined em vez de derrubar a captura.
export function parseNfseXml(xml: string): ParsedNfse | null {
    let parsed: any;

    try {
        parsed = nfseXmlParser.parse(xml);
    } catch {
        return null;
    }

    const numeroNfRaw =
        extractText(findNodeByName(parsed, 'nDFSe')) || extractText(findNodeByName(parsed, 'nNFSe'));

    const prestNode = findNodeByName(parsed, 'prest');
    const emitNode = findNodeByName(parsed, 'emit');

    const issuerName = extractText(prestNode?.xNome) || extractText(emitNode?.xNome);
    const issuerDoc =
        extractText(prestNode?.CNPJ) ||
        extractText(prestNode?.CPF) ||
        extractText(emitNode?.CNPJ) ||
        extractText(emitNode?.CPF);

    const vServPrest = findNodeByName(parsed, 'vServPrest');
    const vServRaw =
        typeof vServPrest === 'object' ? extractText(vServPrest?.vServ) : extractText(vServPrest);
    const valueRaw = vServRaw || extractText(findNodeByName(parsed, 'vLiq'));

    const issueDateRaw =
        extractText(findNodeByName(parsed, 'dhEmi')) ||
        extractText(findNodeByName(parsed, 'dhProc')) ||
        extractText(findNodeByName(parsed, 'dCompet'));

    return {
        numeroNf: numeroNfRaw || undefined,
        issuerName: issuerName || undefined,
        issuerDoc: issuerDoc || undefined,
        value: valueRaw ? Number(valueRaw) : undefined,
        issueDate: issueDateRaw || undefined,
    };
}

function truncate(text: string, max = 500) {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
}
