/**
 * Importa a planilha de Contas a Pagar (.xlsx) para o sistema.
 *
 * Uso (dentro de BackEnd/backend):
 *   npx ts-node scripts/importar-contas-pagar.ts "C:\caminho\Contas-a-Pagar VIA MINAS - 10-2026.xlsx"            (simulação)
 *   npx ts-node scripts/importar-contas-pagar.ts "C:\caminho\planilha.xlsx" --aplicar                            (grava no banco)
 *   npx ts-node scripts/importar-contas-pagar.ts "C:\caminho\planilha.xlsx" --aplicar --empresa email@empresa.com
 *
 * - Sem --aplicar só mostra o que seria importado (nada é gravado).
 * - Reconhece as colunas pelo nome do cabeçalho (vencimento, descrição/conta, fornecedor, valor,
 *   categoria, forma de pagamento, status/pago, data de pagamento, observação, placa).
 * - Rodar duas vezes não duplica: pula conta com mesma descrição + vencimento + valor.
 * - Cria fornecedor/categoria automaticamente quando não existirem.
 */
import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------- utilidades ----------

function normalizar(texto: unknown): string {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[.*:]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function paraNumero(valor: unknown): number | null {
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
    if (valor == null) return null;
    let s = String(valor).replace(/[R$\s]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

function paraData(valor: unknown): Date | null {
    if (valor == null || valor === '') return null;
    if (valor instanceof Date) {
        // A lib xlsx devolve a data em UTC (pode vir com segundos de diferença); +12h e lê em UTC
        // para nunca "voltar um dia" no fuso do Brasil.
        const d = new Date(valor.getTime() + 12 * 3600 * 1000);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    if (typeof valor === 'number') {
        const d = XLSX.SSF.parse_date_code(valor);
        return d ? new Date(d.y, d.m - 1, d.d) : null;
    }
    const s = String(valor).trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (m) {
        const ano = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
        return new Date(ano, Number(m[2]) - 1, Number(m[1]));
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return null;
}

type Campo = 'vencimento' | 'descricao' | 'fornecedor' | 'valor' | 'categoria' | 'forma' | 'status' | 'pagoEm' | 'observacao' | 'placa' | 'banco' | 'emissao' | 'doc';

// ordem importa: o primeiro que casar leva a coluna
const SINONIMOS: Array<[Campo, string[]]> = [
    ['pagoEm', ['data pagamento', 'data de pagamento', 'pago em', 'dt pagamento', 'data pgto', 'data baixa', 'baixa', 'pagto', 'dt pagto']],
    ['vencimento', ['vencimento', 'venc', 'vcto', 'data venc', 'data de vencimento', 'dt venc']],
    ['banco', ['banco']],
    ['doc', ['doc']],
    ['valor', ['valor', 'valor total', 'valor r$', 'total', 'valor a pagar']],
    ['fornecedor', ['fornecedor', 'favorecido', 'credor', 'beneficiario']],
    ['categoria', ['categoria', 'tipo de despesa', 'grupo', 'classificacao', 'natureza']],
    ['forma', ['forma de pagamento', 'forma pagamento', 'boleto ou pix', 'forma', 'pagamento', 'meio de pagamento']],
    ['status', ['status', 'situacao', 'pago', 'quitado']],
    ['placa', ['placa', 'caminhao', 'veiculo']],
    ['observacao', ['observacao', 'observacoes', 'obs', 'detalhes', 'nota']],
    ['descricao', ['descricao', 'conta', 'historico', 'nome', 'despesa', 'referencia', 'documento', '9']], // "9*" = coluna da descrição na planilha da Via Minas
    ['emissao', ['data']], // coluna "Data" (emissão): usada como vencimento quando o Vcto. está vazio
];

function mapearColunas(cabecalho: unknown[]): Partial<Record<Campo, number>> {
    const mapa: Partial<Record<Campo, number>> = {};
    const usadas = new Set<number>();
    for (const [campo, nomes] of SINONIMOS) {
        for (let i = 0; i < cabecalho.length; i++) {
            if (usadas.has(i)) continue;
            const h = normalizar(cabecalho[i]);
            if (h && nomes.some((n) => h === n || (n.length > 4 && h.includes(n)))) {
                mapa[campo] = i;
                usadas.add(i);
                break;
            }
        }
    }
    return mapa;
}

function traduzForma(texto: string): string {
    const t = normalizar(texto);
    if (t.includes('pix')) return 'PIX';
    if (t.includes('boleto')) return 'BOLETO';
    if (t.includes('credito')) return 'CARTAO_CREDITO';
    if (t.includes('debito')) return 'CARTAO_DEBITO';
    if (t.includes('cartao')) return 'CARTAO_CREDITO';
    if (t.includes('dinheiro')) return 'DINHEIRO';
    if (t.includes('transf') || t.includes('ted') || t.includes('doc')) return 'TRANSFERENCIA';
    if (t.includes('conta')) return 'CONTA_EMPRESA';
    return 'BOLETO';
}

// Separa o "quadro" da conta pela categoria: impostos e sócios ficam fora do
// Contas a Pagar urgente (fornecedores).
function grupoDaConta(categoria: string, descricao: string): 'FORNECEDORES' | 'IMPOSTOS' | 'SOCIOS' {
    const c = normalizar(categoria);
    const d = normalizar(descricao);
    if (/^imposto|^gnre|^tributo/.test(c) || /\b(darf|das|gfd|fgts|icms|issqn|irrf|ipva)\b/.test(d)) return 'IMPOSTOS';
    if (/pro-?labore|retirada socio|alimentacao socio|emprestimo|distribuicao de lucro/.test(c)) return 'SOCIOS';
    if (/distribuicao de lucro|pro-?labore/.test(d)) return 'SOCIOS';
    return 'FORNECEDORES';
}

function tipoDaForma(forma: string): string {
    if (forma === 'PIX') return 'PIX';
    if (forma === 'BOLETO') return 'BOLETO';
    if (forma.startsWith('CARTAO')) return 'CARTAO';
    return 'SEM_BOLETO';
}

// ---------- principal ----------

async function main() {
    const args = process.argv.slice(2);
    const arquivo = args.find((a) => !a.startsWith('--'));
    const aplicar = args.includes('--aplicar');
    const idxEmpresa = args.indexOf('--empresa');
    const emailEmpresa = idxEmpresa >= 0 ? args[idxEmpresa + 1] : undefined;

    if (!arquivo) {
        console.log('Informe o caminho da planilha. Ex: npx ts-node scripts/importar-contas-pagar.ts "C:\\planilha.xlsx" --aplicar');
        process.exit(1);
    }

    // empresa
    const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true, email: true } });
    let empresa = emailEmpresa ? empresas.find((e) => e.email.toLowerCase() === emailEmpresa.toLowerCase()) : undefined;
    if (!empresa) {
        if (emailEmpresa) throw new Error(`Empresa com e-mail "${emailEmpresa}" não encontrada.`);
        if (empresas.length === 1) empresa = empresas[0];
        else {
            console.log('Há mais de uma empresa. Rode de novo com --empresa <email>. Opções:');
            empresas.forEach((e) => console.log(`  ${e.email}  (${e.nome})`));
            process.exit(1);
        }
    }
    console.log(`Empresa: ${empresa.nome} <${empresa.email}>`);
    console.log(aplicar ? 'MODO: GRAVAR NO BANCO' : 'MODO: SIMULAÇÃO (use --aplicar para gravar)');

    const wb = XLSX.readFile(arquivo, { cellDates: true });

    let criadas = 0, puladas = 0, ignoradas = 0;
    const fornecedores = new Map<string, string>();
    const categorias = new Map<string, string>();

    async function fornecedorId(nome: string) {
        const norm = normalizar(nome);
        if (fornecedores.has(norm)) return fornecedores.get(norm)!;
        let f = await prisma.fornecedor.findFirst({ where: { empresaId: empresa!.id, nomeNormalizado: norm } });
        if (!f && aplicar) {
            f = await prisma.fornecedor.create({ data: { empresaId: empresa!.id, nome: nome.trim(), nomeNormalizado: norm } });
        }
        fornecedores.set(norm, f?.id ?? '');
        return f?.id ?? '';
    }

    async function categoriaId(nome: string) {
        const norm = normalizar(nome);
        if (categorias.has(norm)) return categorias.get(norm)!;
        let c = await prisma.categoriaContaPagar.findFirst({ where: { empresaId: empresa!.id, nomeNormalizado: norm } });
        if (!c && aplicar) {
            c = await prisma.categoriaContaPagar.create({ data: { empresaId: empresa!.id, nome: nome.trim(), nomeNormalizado: norm } });
        }
        categorias.set(norm, c?.id ?? '');
        return c?.id ?? '';
    }

    // --aba <número|parte do nome>; padrão = 1ª aba
    const idxAba = args.indexOf('--aba');
    const abaArg = idxAba >= 0 ? args[idxAba + 1] : '1';
    let abaIdx = /^\d+$/.test(abaArg) ? Number(abaArg) - 1 : wb.SheetNames.findIndex((n) => normalizar(n).includes(normalizar(abaArg)));
    if (abaIdx < 0 || abaIdx >= wb.SheetNames.length) throw new Error(`Aba "${abaArg}" não encontrada.`);
    console.log(`Abas da planilha: ${wb.SheetNames.map((n, i) => `${i + 1}) ${n}`).join(' | ')}  → importando só a aba ${abaIdx + 1}`);
    const vistos = new Map<string, number>();
    for (const nomeAba of [wb.SheetNames[abaIdx]]) {
        const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAba], { header: 1, raw: true, defval: null });

        // cabeçalho = primeira linha (nas 15 primeiras) que tenha vencimento + valor
        let idxCab = -1;
        let colunas: Partial<Record<Campo, number>> = {};
        for (let i = 0; i < Math.min(15, linhas.length); i++) {
            const m = mapearColunas(linhas[i] as unknown[]);
            if (m.vencimento !== undefined && m.valor !== undefined) { idxCab = i; colunas = m; break; }
        }
        if (idxCab < 0) {
            console.log(`\n[aba "${nomeAba}"] sem cabeçalho de Vencimento + Valor — ignorada.`);
            console.log('Primeiras linhas da aba (me envie isto para eu ajustar o script):');
            linhas.slice(0, 12).forEach((l, n) => {
                const celulas = (l as unknown[]).map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? '')));
                console.log(`  linha ${n + 1}: ${JSON.stringify(celulas)}`);
            });
            continue;
        }

        console.log(`\n[aba "${nomeAba}"] colunas: ` + Object.entries(colunas).map(([k, v]) => `${k}=#${(v as number) + 1}`).join(', '));
        const sheet: any = wb.Sheets[nomeAba];
        const ocultas = ((sheet['!rows'] ?? []) as Array<{ hidden?: boolean } | undefined>).filter((r) => r?.hidden).length;
        console.log(`  intervalo: ${sheet['!ref']} | linhas lidas: ${linhas.length} | linhas ocultas: ${ocultas} | filtro ativo: ${sheet['!autofilter']?.ref ?? 'nenhum'}`);
        console.log('  (linhas ocultas/filtradas na planilha também são lidas — o script não respeita filtro)');

        for (let i = idxCab + 1; i < linhas.length; i++) {
            const l = linhas[i] as unknown[];
            const pega = (c: Campo) => (colunas[c] !== undefined ? l[colunas[c]!] : null);

            let valor = paraNumero(pega('valor'));
            // sem Vcto.? usa a data da coluna "Data" para não perder a conta
            const venc = paraData(pega('vencimento')) ?? paraData(pega('emissao'));
            const descBruta = String(pega('descricao') ?? '').trim();
            let valorPendente = false;
            // conta com descrição + vencimento mas valor vazio/"verificar": entra com valor 0 e aviso na observação
            if (venc && descBruta && (valor === null || valor <= 0)) { valor = 0; valorPendente = true; }
            if (!venc || valor === null || (valor <= 0 && !valorPendente)) {
                ignoradas++;
                // só avisa quando a linha tem conteúdo "de conta" (descrição ou valor), para você conferir
                const desc = String(pega('descricao') ?? '').trim();
                if (desc || (valor !== null && valor !== 0)) {
                    const motivo = valor === null || valor <= 0 ? 'valor vazio/zero' : 'sem data de vencimento';
                    console.log(`  ✗ linha ${i + 1} IGNORADA (${motivo}): ${desc || '(sem descrição)'} | valor=${pega('valor') ?? ''} | venc=${pega('vencimento') ?? ''}`);
                }
                continue;
            }

            let fornecedorNome = String(pega('fornecedor') ?? '').trim();
            let categoriaNome = String(pega('categoria') ?? '').trim();
            // nesta planilha a coluna "FORNECEDOR" na verdade guarda a categoria (ABASTECIMENTO, SEGURO...)
            if (colunas.categoria === undefined && fornecedorNome) { categoriaNome = fornecedorNome; fornecedorNome = ''; }
            const descricao = descBruta || fornecedorNome || categoriaNome || 'Conta importada';
            const bancoTexto = String(pega('banco') ?? '').trim() || String(pega('doc') ?? '').trim() || null;
            const observacaoTexto = String(pega('observacao') ?? '');
            // sem coluna de forma: se a observação cita PIX (chave pix), vira PIX; senão boleto
            const forma = traduzForma(String(pega('forma') ?? '') || (/pix/i.test(observacaoTexto) ? 'pix' : ''));
            const statusTexto = normalizar(pega('status'));
            const pagoEmData = paraData(pega('pagoEm'));
            const pago = !!pagoEmData || /^(pago|paga|sim|ok|quitad|liquidad|x)/.test(statusTexto);
            const placa = String(pega('placa') ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            let observacao = String(pega('observacao') ?? '').trim() || null;
            if (valorPendente) observacao = `[VALOR A VERIFICAR] ${observacao ?? ''}`.trim();

            // linhas idênticas dentro da planilha (ex.: 5 multas iguais) contam como contas distintas:
            // pula só se o banco já tem pelo menos "n" iguais (n = ocorrência dentro do arquivo)
            const chave = `${descricao}|${venc.getTime()}|${valor}`;
            const nOcorrencia = (vistos.get(chave) ?? 0) + 1;
            vistos.set(chave, nOcorrencia);
            const existentes = await prisma.contaPagar.count({
                where: { empresaId: empresa.id, descricao, vencimento: venc, valor },
            });
            if (existentes >= nOcorrencia) { puladas++; continue; }

            console.log(
                `  ${aplicar ? '+' : '·'} ${venc.toLocaleDateString('pt-BR')}  R$ ${valor.toFixed(2).padStart(10)}  ${pago ? 'PAGA  ' : 'aberta'}  ${descricao}${fornecedorNome ? ' — ' + fornecedorNome : ''}`,
            );
            criadas++;
            if (!aplicar) continue;

            const caminhao = placa
                ? await prisma.caminhao.findFirst({ where: { empresaId: empresa.id, placa } })
                : null;
            const dataPagamento = pagoEmData ?? venc;

            const conta = await prisma.contaPagar.create({
                data: {
                    empresaId: empresa.id,
                    descricao,
                    valor,
                    vencimento: venc,
                    tipo: tipoDaForma(forma) as any,
                    formaPagamento: forma as any,
                    status: (pago ? 'PAGA' : 'ABERTA') as any,
                    pagoEm: pago ? dataPagamento : null,
                    observacao,
                    banco: bancoTexto,
                    fornecedorId: fornecedorNome ? (await fornecedorId(fornecedorNome)) || null : null,
                    categoriaId: categoriaNome ? (await categoriaId(categoriaNome)) || null : null,
                    caminhaoId: caminhao?.id ?? null,
                    grupo: grupoDaConta(categoriaNome, descricao),
                } as any,
            });

            if (pago) {
                await prisma.pagamentoContaPagar.create({
                    data: { contaPagarId: conta.id, valor, data: dataPagamento, formaPagamento: forma as any },
                });
            }
        }
    }

    console.log(`\nResumo: ${criadas} ${aplicar ? 'importada(s)' : 'a importar'}, ${puladas} já existiam, ${ignoradas} linha(s) ignorada(s) (vazias/totais).`);
    if (!aplicar) console.log('Nada foi gravado. Confira a lista acima e rode de novo com --aplicar.');
}

main()
    .catch((e) => {
        console.error('Erro:', e.message ?? e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
