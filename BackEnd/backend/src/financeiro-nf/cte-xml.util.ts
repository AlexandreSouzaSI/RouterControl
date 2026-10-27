import { XMLParser } from 'fast-xml-parser';

// =============================================================================
// Leitura de XML de CT-e (cteProc autorizado) e de evento de cancelamento
// (procEventoCTe, tpEvento 110111) — usado na importação em massa de Contas
// a Receber. Só extrai o essencial pra cobrança; não valida assinatura.
// =============================================================================

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    removeNSPrefix: true,
    // Chave de acesso tem 44 dígitos: não pode virar number.
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name) => ['infNFe', 'Comp', 'ObsCont', 'dup', 'idDocAntEle'].includes(name),
});

export type CteLido = {
    tipo: 'CTE';
    chave: string;
    numero: string;
    serie: string;
    dataEmissao: Date | null;
    tpCTe: string; // 0 normal, 1 complemento, 2 anulação, 3 substituto
    tpAmb: string; // 1 produção, 2 homologação
    cStat: string; // 100 = autorizado
    xMotivo: string;
    emitenteCnpj: string;
    emitenteNome: string;
    tomadorNome: string;
    tomadorDoc: string;
    origem: string; // "Guarujá/SP"
    destino: string; // "Pouso Alegre/MG"
    valor: number; // vRec (valor a receber), cai pro vTPrest
    vencimentos: { data: Date; valor: number }[]; // duplicatas do CT-e, quando houver
    placaCavalo: string | null; // 1ª placa da lista "VEÍCULOS" da observação
    placas: string[]; // todas as placas citadas, na ordem
    motoristaNome: string | null;
    motoristaCpf: string | null;
    referencia: string | null; // ex: SJ1363/26
    container: string | null; // ex: OOCU8211905
};

export type CancelamentoLido = { tipo: 'CANCELAMENTO'; chave: string };

export type ResultadoLeitura = CteLido | CancelamentoLido | { tipo: 'INVALIDO'; motivo: string };

const txt = (v: any): string => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return String(v['#text'] ?? '').trim();
    return String(v).trim();
};

const num = (v: any): number => {
    const n = Number(txt(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

const data = (v: any): Date | null => {
    const s = txt(v);
    if (!s) return null;
    const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
    return Number.isNaN(d.getTime()) ? null : d;
};

// Placa antiga (ABC-1234) ou Mercosul (ABC1D23), com ou sem hífen.
const RE_PLACA = /\b([A-Z]{3})-?(\d[A-Z0-9]\d{2})\b/g;
export const normalizarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatarPlaca = (p: string) => { const n = normalizarPlaca(p); return `${n.slice(0, 3)}-${n.slice(3)}`; };

function placasDoTexto(texto: string): string[] {
    const vistas = new Set<string>();
    const out: string[] = [];
    for (const m of texto.toUpperCase().matchAll(RE_PLACA)) {
        const p = `${m[1]}-${m[2]}`;
        if (!vistas.has(p)) { vistas.add(p); out.push(p); }
    }
    return out;
}

function nomeTomador(ide: any, inf: any): { nome: string; doc: string } {
    const doc = (o: any) => txt(o?.CNPJ) || txt(o?.CPF);
    if (ide?.toma4) return { nome: txt(ide.toma4.xNome), doc: doc(ide.toma4) };
    const t = txt(ide?.toma3?.toma ?? ide?.toma03?.toma);
    const alvo = t === '0' ? inf.rem : t === '1' ? inf.exped : t === '2' ? inf.receb : t === '3' ? inf.dest : null;
    return { nome: txt(alvo?.xNome), doc: doc(alvo) };
}

export function lerXmlCte(xml: string): ResultadoLeitura {
    let raiz: any;
    try {
        raiz = parser.parse(xml);
    } catch {
        return { tipo: 'INVALIDO', motivo: 'XML ilegível.' };
    }

    // Evento de cancelamento
    const proc = raiz?.procEventoCTe;
    if (proc) {
        const inf = proc.eventoCTe?.infEvento;
        const ret = proc.retEventoCTe?.infEvento;
        const chave = txt(inf?.chCTe) || txt(ret?.chCTe);
        const cStat = txt(ret?.cStat);
        if (txt(inf?.tpEvento) === '110111' && chave && (!cStat || cStat === '135' || cStat === '136')) {
            return { tipo: 'CANCELAMENTO', chave };
        }
        return { tipo: 'INVALIDO', motivo: 'Evento de CT-e que não é cancelamento — ignorado.' };
    }

    const cte = raiz?.cteProc?.CTe ?? raiz?.CTe;
    const inf = cte?.infCte;
    if (!inf) return { tipo: 'INVALIDO', motivo: 'Não é um XML de CT-e.' };

    const prot = raiz?.cteProc?.protCTe?.infProt;
    const ide = inf.ide ?? {};
    const compl = inf.compl ?? {};
    const xObs = txt(compl.xObs);
    const obsCont = (compl.ObsCont ?? []).map((o: any) => txt(o?.xTexto)).join(' ');

    // "VEÍCULOS RME-9B20/MG , EVU-9E78/RS..." — a 1ª é o cavalo.
    const trechoVeiculos = /VE[IÍ]CULOS?\s+([^;]+)/i.exec(xObs)?.[1] ?? '';
    const placasVeiculos = placasDoTexto(trechoVeiculos);
    const placas = placasDoTexto(`${trechoVeiculos} ${xObs} ${obsCont}`);

    const mot = /MOTORISTA\s+([^,;]+?)\s*,\s*CPF:?\s*([\d.\-]+)/i.exec(xObs);
    const chave = txt(prot?.chCTe) || txt(inf['@_Id']).replace(/^CTe/i, '');
    const tomador = nomeTomador(ide, inf);

    const dups = (inf.infCTeNorm?.cobr?.dup ?? [])
        .map((d: any) => ({ data: data(d?.dVenc), valor: num(d?.vDup) }))
        .filter((d: any) => d.data && d.valor > 0) as { data: Date; valor: number }[];

    return {
        tipo: 'CTE',
        chave,
        numero: txt(ide.nCT),
        serie: txt(ide.serie),
        dataEmissao: data(ide.dhEmi),
        tpCTe: txt(ide.tpCTe),
        tpAmb: txt(ide.tpAmb),
        cStat: txt(prot?.cStat),
        xMotivo: txt(prot?.xMotivo),
        emitenteCnpj: txt(inf.emit?.CNPJ) || txt(inf.emit?.CPF),
        emitenteNome: txt(inf.emit?.xNome),
        tomadorNome: tomador.nome,
        tomadorDoc: tomador.doc,
        origem: `${txt(ide.xMunIni)}/${txt(ide.UFIni)}`,
        destino: `${txt(ide.xMunFim)}/${txt(ide.UFFim)}`,
        valor: num(inf.vPrest?.vRec) || num(inf.vPrest?.vTPrest),
        vencimentos: dups,
        placaCavalo: placasVeiculos[0] ? formatarPlaca(placasVeiculos[0]) : placas[0] ? formatarPlaca(placas[0]) : null,
        placas,
        motoristaNome: mot ? mot[1].trim() : null,
        motoristaCpf: mot ? mot[2].replace(/\D/g, '') : null,
        referencia: /\b([A-Z]{1,3}\d{3,6}\/\d{2})\b/.exec(xObs)?.[1] ?? null,
        container: /\b([A-Z]{4}\d{7})\b/.exec(xObs)?.[1] ?? null,
    };
}
