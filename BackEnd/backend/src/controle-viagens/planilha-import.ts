import * as XLSX from 'xlsx';

// =============================================================================
// Controle de Viagens — tipos das colunas e importação de planilha Excel.
// Cada aba da planilha vira uma aba do sistema: linha 1 = título (opcional),
// linha com cabeçalhos = colunas, o resto = viagens. O tipo de cada coluna é
// deduzido dos valores (data, hora, número, moeda, texto). A fórmula de
// diárias "=(P3+Q3)-(N3+O3)" vira uma coluna calculada (duração).
// =============================================================================

export type TipoColuna = 'texto' | 'data' | 'hora' | 'numero' | 'moeda' | 'duracao';

export type Coluna = {
    key: string;
    label: string;
    tipo: TipoColuna;
    // Só pra tipo 'duracao': (fimData + fimHora) - (inicioData + inicioHora)
    calculo?: { inicioData: string; inicioHora?: string; fimData: string; fimHora?: string };
    largura?: number;
};

export type AbaImportada = { nome: string; titulo: string | null; colunas: Coluna[]; linhas: Record<string, unknown>[] };

const pad = (n: number) => String(n).padStart(2, '0');

export function slug(t: string): string {
    return (
        t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'coluna'
    );
}

// Serial do Excel -> partes de data/hora (sem fuso: o Excel não tem fuso).
function serialParaData(serial: number): string {
    const dias = Math.floor(serial);
    const d = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function serialParaHora(serial: number): string {
    const frac = serial - Math.floor(serial);
    let min = Math.round(frac * 24 * 60);
    if (min >= 24 * 60) min = 0;
    return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
function textoParaHora(t: string): string | null {
    const m = /^(\d{1,2})[:h](\d{2})(?::\d{2})?$/.exec(t.trim());
    return m ? `${pad(Number(m[1]))}:${m[2]}` : null;
}
function textoParaData(t: string): string | null {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t.trim());
    return m ? `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}` : null;
}

type Celula = XLSX.CellObject | undefined;
const ehDataFmt = (c: Celula) => !!c && c.t === 'n' && !!c.z && XLSX.SSF.is_date(String(c.z));
const ehMoedaFmt = (c: Celula) => !!c && c.t === 'n' && !!c.z && /R\$|\[\$R|#,##0\.00/.test(String(c.z));

function deduzirTipo(celulas: Celula[]): TipoColuna {
    const cs = celulas.filter((c) => c && c.v !== undefined && c.v !== null && String(c.v).trim() !== '');
    if (!cs.length) return 'texto';
    const datas = cs.filter((c) => ehDataFmt(c));
    if (datas.length >= cs.length * 0.6) {
        const soHora = datas.every((c) => Number(c!.v) < 1);
        const temHora = datas.some((c) => Number(c!.v) % 1 !== 0);
        if (soHora) return 'hora';
        if (!temHora) return 'data';
    }
    // Coluna de hora com parte em texto ("08:00")
    if (cs.every((c) => (ehDataFmt(c) && Number(c!.v) < 1) || (c!.t === 's' && textoParaHora(String(c!.v))))) return 'hora';
    if (cs.every((c) => c!.t === 'n')) return cs.some((c) => ehMoedaFmt(c)) ? 'moeda' : 'numero';
    return 'texto';
}

function valorDaCelula(c: Celula, tipo: TipoColuna): unknown {
    if (!c || c.v === undefined || c.v === null) return null;
    const bruto = c.v;
    if (typeof bruto === 'string' && !bruto.trim()) return null;
    switch (tipo) {
        case 'data':
            if (c.t === 'n') return serialParaData(Number(bruto));
            return textoParaData(String(bruto)) ?? String(bruto).trim();
        case 'hora':
            if (c.t === 'n') return serialParaHora(Number(bruto));
            return textoParaHora(String(bruto)) ?? String(bruto).trim();
        case 'numero':
        case 'moeda':
            return typeof bruto === 'number' ? bruto : Number(String(bruto).replace(/\./g, '').replace(',', '.')) || null;
        default:
            if (c.t === 'n' && ehDataFmt(c)) {
                const n = Number(bruto);
                return n < 1 ? serialParaHora(n) : serialParaData(n) + (n % 1 ? ` ${serialParaHora(n)}` : '');
            }
            return String(c.w ?? bruto).trim();
    }
}

// "=(P3+Q3)-(N3+O3)" -> letras das colunas
function lerFormulaDuracao(f: string): { fim: string[]; inicio: string[] } | null {
    const m = /^\(?\s*([A-Z]+)\d+\s*(?:\+\s*([A-Z]+)\d+)?\s*\)?\s*-\s*\(?\s*([A-Z]+)\d+\s*(?:\+\s*([A-Z]+)\d+)?\s*\)?$/.exec(f.replace(/^=/, '').trim());
    if (!m) return null;
    return { fim: [m[1], m[2]].filter(Boolean) as string[], inicio: [m[3], m[4]].filter(Boolean) as string[] };
}

export function importarPlanilha(buffer: Buffer): AbaImportada[] {
    const wb = XLSX.read(buffer, { type: 'buffer', cellNF: true, cellFormula: true, cellDates: false });
    const abas: AbaImportada[] = [];

    for (const nomeAba of wb.SheetNames) {
        const ws = wb.Sheets[nomeAba];
        if (!ws || !ws['!ref']) continue;
        const range = XLSX.utils.decode_range(ws['!ref']);
        const cel = (r: number, c: number): Celula => ws[XLSX.utils.encode_cell({ r, c })];
        const texto = (r: number, c: number) => String(cel(r, c)?.v ?? '').trim();

        // Linha de cabeçalho: a primeira (até a 10ª) com 3+ textos preenchidos.
        let linhaCab = -1;
        for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 10); r++) {
            let n = 0;
            for (let c = range.s.c; c <= range.e.c; c++) if (cel(r, c)?.t === 's' && texto(r, c)) n++;
            if (n >= 3) { linhaCab = r; break; }
        }
        if (linhaCab < 0) continue;
        const titulo = linhaCab > range.s.r ? (texto(range.s.r, range.s.c) || null) : null;

        // Última coluna com cabeçalho (ou com dado logo abaixo de uma mesclada).
        const colsIdx: number[] = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
            if (texto(linhaCab, c)) { colsIdx.push(c); continue; }
            // Cabeçalho vazio ao lado de uma coluna (célula mesclada tipo "Chegada XCMG"): mantém se tiver dado.
            let temDado = false;
            for (let r = linhaCab + 1; r <= Math.min(range.e.r, linhaCab + 50); r++) if (cel(r, c)?.v !== undefined && texto(r, c)) { temDado = true; break; }
            if (temDado && colsIdx.length && colsIdx[colsIdx.length - 1] === c - 1) colsIdx.push(c);
        }

        // Linhas com dado
        const linhasIdx: number[] = [];
        for (let r = linhaCab + 1; r <= range.e.r; r++) {
            if (colsIdx.some((c) => { const v = cel(r, c)?.v; return v !== undefined && v !== null && String(v).trim() !== '' && !String(cel(r, c)?.f ?? '').length; })) linhasIdx.push(r);
        }

        const usados = new Set<string>();
        const colunas: (Coluna & { idx: number; letra: string })[] = colsIdx.map((c, i) => {
            let label = texto(linhaCab, c);
            if (!label) {
                const ant = texto(linhaCab, colsIdx[i - 1]) || 'Coluna';
                label = `Hora ${ant.replace(/^Hora\s+/i, '')}`;
            }
            let key = slug(label);
            while (usados.has(key)) key = `${key}_2`;
            usados.add(key);
            const formula = linhasIdx.map((r) => cel(r, c)?.f).find(Boolean);
            const larguraXls = ws['!cols']?.[c]?.wch ?? ws['!cols']?.[c]?.width;
            return {
                idx: c, letra: XLSX.utils.encode_col(c), key, label,
                tipo: formula && lerFormulaDuracao(String(formula)) ? 'duracao' : deduzirTipo(linhasIdx.map((r) => cel(r, c))),
                largura: larguraXls ? Math.round(Number(larguraXls)) : undefined,
            };
        });

        // Resolve as fórmulas de duração para as chaves das colunas.
        for (const col of colunas) {
            if (col.tipo !== 'duracao') continue;
            const f = String(linhasIdx.map((r) => cel(r, col.idx)?.f).find(Boolean) ?? '');
            const p = lerFormulaDuracao(f);
            const chave = (letra?: string) => colunas.find((x) => x.letra === letra)?.key;
            if (p && chave(p.fim[0]) && chave(p.inicio[0])) {
                col.calculo = { fimData: chave(p.fim[0])!, fimHora: chave(p.fim[1]), inicioData: chave(p.inicio[0])!, inicioHora: chave(p.inicio[1]) };
            } else {
                col.tipo = 'texto';
            }
        }

        const linhas = linhasIdx.map((r) => {
            const dados: Record<string, unknown> = {};
            for (const col of colunas) {
                if (col.tipo === 'duracao') continue;
                const v = valorDaCelula(cel(r, col.idx), col.tipo);
                if (v !== null && v !== '') dados[col.key] = v;
            }
            return dados;
        }).filter((d) => Object.keys(d).length > 0);

        abas.push({
            nome: nomeAba.trim().slice(0, 40),
            titulo,
            colunas: colunas.map(({ idx: _i, letra: _l, ...c }) => c),
            linhas,
        });
    }
    return abas;
}

// ---------------------------------------------------------------------------
// Exportação: aba do sistema -> .xlsx (com título, cabeçalho e valores)
// ---------------------------------------------------------------------------

export function duracaoMinutos(dados: Record<string, any>, calc: NonNullable<Coluna['calculo']>): number | null {
    const instante = (d?: string, h?: string) => {
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return null;
        const [hh, mm] = /^\d{2}:\d{2}$/.test(String(h ?? '')) ? String(h).split(':').map(Number) : [0, 0];
        const [a, m, dd] = String(d).split('-').map(Number);
        return Date.UTC(a, m - 1, dd, hh, mm) / 60000;
    };
    const ini = instante(dados[calc.inicioData], calc.inicioHora ? dados[calc.inicioHora] : undefined);
    const fim = instante(dados[calc.fimData], calc.fimHora ? dados[calc.fimHora] : undefined);
    return ini === null || fim === null ? null : fim - ini;
}

export function exportarPlanilha(nome: string, titulo: string | null, colunas: Coluna[], linhas: Record<string, any>[]): Buffer {
    const aoa: unknown[][] = [];
    if (titulo) aoa.push([titulo]);
    aoa.push(colunas.map((c) => c.label));
    for (const d of linhas) {
        aoa.push(colunas.map((c) => {
            const v = d[c.key];
            if (c.tipo === 'duracao' && c.calculo) {
                const min = duracaoMinutos(d, c.calculo);
                return min === null ? '' : `${Math.floor(min / 60)}:${pad(Math.abs(min % 60))}`;
            }
            if (c.tipo === 'data' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
                const [a, m, dd] = v.split('-');
                return `${dd}/${m}/${a}`;
            }
            return v ?? '';
        }));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (titulo) ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, colunas.length - 1) } }];
    ws['!cols'] = colunas.map((c) => ({ wch: c.largura ?? Math.max(10, c.label.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31) || 'Viagens');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
