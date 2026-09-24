import { request } from 'https';
import { gunzipSync } from 'zlib';
import { XMLParser } from 'fast-xml-parser';

import type { CertificadoCarregado } from './certificado-digital.service';

// Cliente da distribuição de NF-e de mercadoria (webservice clássico
// NFeDistribuicaoDFe da Receita) — portado do Controle NF
// (src/stores/sefaz-nfe-client.ts), simplificado pro Controle Rota: só o
// que é necessário pra Fase 4 (buscar e listar NF-e de compra recebidas
// pelo CNPJ da empresa). Não porta manifestação do destinatário nem
// emissão/cancelamento de NF-e (exigem assinatura XML com node-forge +
// xml-crypto, que não estão instalados neste projeto — ver relatório da
// tarefa que criou este arquivo).
//
// Só existe endereço de produção nacional único pra esse método — não é
// por UF, ao contrário dos webservices de emissão de NF-e.
const PRODUCTION_URL =
    'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const HOMOLOGACAO_URL =
    'https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';

const SOAP_ACTION =
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse';

// Código do "autor" (cUFAutor) exigido no pedido. O Controle Rota não tem
// (ainda) um cadastro de UF por empresa — em vez de bloquear a
// funcionalidade nisso, usamos 91 (Ambiente Nacional/SVAN), código
// documentado pela Receita como válido pra quem consulta através do
// Ambiente Nacional em vez de uma UF específica. Se no futuro a empresa
// tiver um campo de UF cadastrado, dá pra trocar por ufToCode(empresa.uf).
const CUF_AUTOR_AMBIENTE_NACIONAL = 91;

type RawResponse = { status: number; body: string };

function soapPost(
    url: string,
    xmlBody: string,
    cert: CertificadoCarregado,
    soapAction: string = SOAP_ACTION,
): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(xmlBody, 'utf-8');

        let req: ReturnType<typeof request>;

        try {
            req = request(
                url,
                {
                    method: 'POST',
                    pfx: cert.pfx,
                    passphrase: cert.senha,
                    timeout: 20000,
                    headers: {
                        'Content-Type': `application/soap+xml; charset=utf-8; action="${soapAction}"`,
                        // Alguns webservices .asmx só despacham o método
                        // olhando o header clássico SOAPAction (SOAP 1.1),
                        // mesmo recebendo um envelope SOAP 1.2 — mandar os
                        // dois não quebra quem já funcionava só com o
                        // action no Content-Type.
                        SOAPAction: `"${soapAction}"`,
                        'Content-Length': payload.length,
                    },
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        resolve({
                            status: res.statusCode || 0,
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
        req.write(payload);
        req.end();
    });
}

// ultNSU precisa vir com 15 dígitos, zero-padded à esquerda (padrão do
// schema distDFeInt da Receita).
function padNsu(nsu: number | bigint): string {
    return String(nsu).padStart(15, '0');
}

function buildEnvelope(params: {
    tpAmb: 1 | 2;
    cnpj: string;
    ultNsu: number | bigint;
}): string {
    const cnpjDigits = params.cnpj.replace(/\D/g, '');

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${params.tpAmb}</tpAmb>
          <cUFAutor>${CUF_AUTOR_AMBIENTE_NACIONAL}</cUFAutor>
          <CNPJ>${cnpjDigits}</CNPJ>
          <distNSU>
            <ultNSU>${padNsu(params.ultNsu)}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => name === 'docZip',
    // Sem isso, a chave de acesso (44 dígitos) pode ser convertida pra JS
    // number e perder precisão (vira notação científica). Os poucos
    // valores numéricos que a gente precisa (vNF, datas) já passam por
    // Number(extractText(...)) explicitamente.
    parseTagValue: false,
});

// Alguns webservices .asmx devolvem o XML de retorno "cru", outros devolvem
// como texto com entidades escapadas dentro de nfeDistDFeInteresseResult.
// Tenta os dois caminhos em vez de assumir um só.
function findRetDistDFeInt(parsed: any): any | null {
    const stack = [parsed];

    while (stack.length > 0) {
        const node = stack.pop();

        if (!node || typeof node !== 'object') continue;

        if (node.retDistDFeInt) {
            return node.retDistDFeInt;
        }

        for (const key of Object.keys(node)) {
            const value = node[key];

            if (key === '#text' && typeof value === 'string' && value.includes('<retDistDFeInt')) {
                const reparsed = parser.parse(value);
                if (reparsed?.retDistDFeInt) return reparsed.retDistDFeInt;
            }

            if (typeof value === 'object') {
                stack.push(value);
            }
        }
    }

    return null;
}

export type DocZipItem = {
    nsu: string;
    schema: string;
    xml: string;
};

export type DistDFeIntResult = {
    cStat: string;
    xMotivo: string;
    ultNSU: string;
    maxNSU: string;
    docs: DocZipItem[];
};

function extractText(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object' && '#text' in value) return String(value['#text']);
    return '';
}

function truncate(text: string, max = 500) {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
}

// Idêntico ao decodeArquivoXml do sefaz-nfse-client.ts (ADN) — o ArquivoXml
// do docZip também vem em base64 (aqui, adicionalmente comprimido em GZip
// na distribuição de NF-e).
export function decodeArquivoXml(base64Content: string): string {
    const buffer = Buffer.from(base64Content, 'base64');
    try {
        return gunzipSync(buffer).toString('utf-8');
    } catch {
        return buffer.toString('utf-8');
    }
}

export async function fetchGoodsDistribution(
    cert: CertificadoCarregado,
    params: { cnpj: string; ultNsu: number | bigint; tpAmb?: 1 | 2 },
): Promise<DistDFeIntResult> {
    const envelope = buildEnvelope({
        tpAmb: params.tpAmb || 1,
        cnpj: params.cnpj,
        ultNsu: params.ultNsu,
    });

    const url = params.tpAmb === 2 ? HOMOLOGACAO_URL : PRODUCTION_URL;
    const response = await soapPost(url, envelope, cert);

    let parsed: any;

    try {
        parsed = parser.parse(response.body);
    } catch {
        throw new Error(
            `Resposta da Sefaz não é um XML válido (HTTP ${response.status}): ${truncate(response.body)}`,
        );
    }

    const ret = findRetDistDFeInt(parsed);

    if (!ret) {
        throw new Error(
            `Resposta inesperada da Sefaz (HTTP ${response.status}): ${truncate(response.body)}`,
        );
    }

    const cStat = extractText(ret.cStat);
    const xMotivo = extractText(ret.xMotivo);
    const ultNSU = extractText(ret.ultNSU);
    const maxNSU = extractText(ret.maxNSU);

    const loteRaw = ret.loteDistDFeInt?.docZip;
    const docZipList: any[] = Array.isArray(loteRaw) ? loteRaw : loteRaw ? [loteRaw] : [];

    const docs: DocZipItem[] = docZipList
        .filter((item) => item && item['#text'])
        .map((item) => ({
            nsu: String(item['@_NSU'] || ''),
            schema: String(item['@_schema'] || ''),
            xml: decodeArquivoXml(String(item['#text'])),
        }));

    return { cStat, xMotivo, ultNSU, maxNSU, docs };
}

// Acha o primeiro nó com esse nome em qualquer profundidade — o XML
// completo de uma NF-e pode vir "cru" (<NFe>...</NFe>) ou embrulhado no
// protocolo de autorização (<nfeProc><NFe>...<protNFe>...).
function findNode(parsed: any, key: string): any | null {
    const stack = [parsed];

    while (stack.length > 0) {
        const node = stack.pop();

        if (!node || typeof node !== 'object') continue;
        if (node[key] !== undefined) return node[key];

        for (const nodeKey of Object.keys(node)) {
            const value = node[nodeKey];

            if (typeof value === 'string' && /^\s*<\w/.test(value)) {
                try {
                    const reparsed = parser.parse(value);
                    if (reparsed && typeof reparsed === 'object') {
                        stack.push(reparsed);
                    }
                } catch {
                    // não era XML de verdade — ignora e segue a busca
                }

                continue;
            }

            if (value && typeof value === 'object') stack.push(value);
        }
    }

    return null;
}

export type ParsedResNFe = {
    chaveAcesso: string;
    issuerCnpj?: string;
    issuerName?: string;
    value?: number;
    issueDate?: string;
    situacao?: string;
};

// resNFe (ou o resumo dentro de procNFe) traz só os campos essenciais — não
// é a NF-e inteira, mas já é o bastante pra mostrar na lista de
// conciliação (fornecedor, valor, data).
export function parseResNFe(xml: string): ParsedResNFe | null {
    let parsed: any;

    try {
        parsed = parser.parse(xml);
    } catch {
        return null;
    }

    const res = parsed.resNFe || parsed.resEvento || null;

    if (!res) return null;

    const situacaoMap: Record<string, string> = {
        '1': 'Autorizada',
        '2': 'Cancelada',
        '3': 'Denegada',
    };

    const cSit = extractText(res.cSitNFe);

    return {
        chaveAcesso: extractText(res.chNFe),
        issuerCnpj: extractText(res.CNPJ) || undefined,
        issuerName: extractText(res.xNome) || undefined,
        value: res.vNF != null ? Number(extractText(res.vNF)) : undefined,
        issueDate: extractText(res.dhEmi) || undefined,
        situacao: situacaoMap[cSit] || cSit || undefined,
    };
}

export type ParsedFullNfe = {
    chaveAcesso: string;
    tipoDocumento?: string; // mod do XML: 55 = NF-e, 65 = NFC-e
    issuerCnpj?: string;
    issuerName?: string;
    recipientCnpj?: string;
    recipientName?: string;
    value?: number;
    issueDate?: string;
    situacao?: string;
};

// Diferente de parseResNFe (que só entende o resumo devolvido pela
// distribuição automática), essa função lê o XML completo da NF-e — usado
// quando a Sefaz já devolve procNFe (nota já manifestada por outro meio,
// ou reenviada com o XML completo).
export function parseFullNfeXml(xml: string): ParsedFullNfe | null {
    let parsed: any;

    try {
        parsed = parser.parse(xml);
    } catch {
        return null;
    }

    const infNFe = findNode(parsed, 'infNFe');

    if (!infNFe) return null;

    const idAttr = extractText(infNFe['@_Id']) || String(infNFe['@_Id'] || '');
    const chaveFromId = idAttr.replace(/^NFe/i, '').replace(/\D/g, '');

    const ide = infNFe.ide || {};
    const emit = infNFe.emit || {};
    const dest = infNFe.dest || {};
    const total = infNFe.total?.ICMSTot || {};

    const chNFeExplicit = extractText(ide.chNFe) || extractText(infNFe.chNFe);
    const chaveAcesso = chaveFromId.length === 44 ? chaveFromId : chNFeExplicit;

    if (!chaveAcesso || chaveAcesso.length !== 44) return null;

    const infProt = findNode(parsed, 'infProt');
    const cStat = infProt ? extractText(infProt.cStat) : '';
    const xMotivo = infProt ? extractText(infProt.xMotivo) : '';

    return {
        chaveAcesso,
        tipoDocumento: extractText(ide.mod) || undefined,
        issuerCnpj: extractText(emit.CNPJ) || undefined,
        issuerName: extractText(emit.xNome) || undefined,
        recipientCnpj: extractText(dest.CNPJ) || undefined,
        recipientName: extractText(dest.xNome) || undefined,
        value: total.vNF != null ? Number(extractText(total.vNF)) : undefined,
        issueDate: extractText(ide.dhEmi) || extractText(ide.dEmi) || undefined,
        situacao: cStat
            ? cStat === '100'
                ? 'Autorizada'
                : `${cStat} - ${xMotivo}`
            : undefined,
    };
}
