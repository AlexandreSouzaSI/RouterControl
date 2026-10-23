"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const XLSX = __importStar(require("xlsx"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function normalizar(texto) {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
function paraNumero(valor) {
    if (typeof valor === 'number')
        return Number.isFinite(valor) ? valor : null;
    if (valor == null)
        return null;
    let s = String(valor).replace(/[R$\s]/g, '');
    if (!s)
        return null;
    if (s.includes(','))
        s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}
function paraData(valor) {
    if (valor == null || valor === '')
        return null;
    if (valor instanceof Date) {
        return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
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
    if (m)
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return null;
}
const SINONIMOS = [
    ['pagoEm', ['data pagamento', 'data de pagamento', 'pago em', 'dt pagamento', 'data pgto', 'data baixa', 'baixa']],
    ['vencimento', ['vencimento', 'venc', 'data venc', 'data de vencimento', 'dt venc']],
    ['valor', ['valor', 'valor total', 'valor r$', 'total', 'valor a pagar']],
    ['fornecedor', ['fornecedor', 'favorecido', 'credor', 'beneficiario']],
    ['categoria', ['categoria', 'tipo de despesa', 'grupo', 'classificacao', 'natureza']],
    ['forma', ['forma de pagamento', 'forma pagamento', 'forma', 'pagamento', 'meio de pagamento']],
    ['status', ['status', 'situacao', 'pago', 'quitado']],
    ['placa', ['placa', 'caminhao', 'veiculo']],
    ['observacao', ['observacao', 'observacoes', 'obs', 'detalhes', 'nota']],
    ['descricao', ['descricao', 'conta', 'historico', 'nome', 'despesa', 'referencia', 'documento']],
];
function mapearColunas(cabecalho) {
    const mapa = {};
    const usadas = new Set();
    for (const [campo, nomes] of SINONIMOS) {
        for (let i = 0; i < cabecalho.length; i++) {
            if (usadas.has(i))
                continue;
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
function traduzForma(texto) {
    const t = normalizar(texto);
    if (t.includes('pix'))
        return 'PIX';
    if (t.includes('boleto'))
        return 'BOLETO';
    if (t.includes('credito'))
        return 'CARTAO_CREDITO';
    if (t.includes('debito'))
        return 'CARTAO_DEBITO';
    if (t.includes('cartao'))
        return 'CARTAO_CREDITO';
    if (t.includes('dinheiro'))
        return 'DINHEIRO';
    if (t.includes('transf') || t.includes('ted') || t.includes('doc'))
        return 'TRANSFERENCIA';
    if (t.includes('conta'))
        return 'CONTA_EMPRESA';
    return 'BOLETO';
}
function tipoDaForma(forma) {
    if (forma === 'PIX')
        return 'PIX';
    if (forma === 'BOLETO')
        return 'BOLETO';
    if (forma.startsWith('CARTAO'))
        return 'CARTAO';
    return 'SEM_BOLETO';
}
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
    const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true, email: true } });
    let empresa = emailEmpresa ? empresas.find((e) => e.email.toLowerCase() === emailEmpresa.toLowerCase()) : undefined;
    if (!empresa) {
        if (emailEmpresa)
            throw new Error(`Empresa com e-mail "${emailEmpresa}" não encontrada.`);
        if (empresas.length === 1)
            empresa = empresas[0];
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
    const fornecedores = new Map();
    const categorias = new Map();
    async function fornecedorId(nome) {
        const norm = normalizar(nome);
        if (fornecedores.has(norm))
            return fornecedores.get(norm);
        let f = await prisma.fornecedor.findFirst({ where: { empresaId: empresa.id, nomeNormalizado: norm } });
        if (!f && aplicar) {
            f = await prisma.fornecedor.create({ data: { empresaId: empresa.id, nome: nome.trim(), nomeNormalizado: norm } });
        }
        fornecedores.set(norm, f?.id ?? '');
        return f?.id ?? '';
    }
    async function categoriaId(nome) {
        const norm = normalizar(nome);
        if (categorias.has(norm))
            return categorias.get(norm);
        let c = await prisma.categoriaContaPagar.findFirst({ where: { empresaId: empresa.id, nomeNormalizado: norm } });
        if (!c && aplicar) {
            c = await prisma.categoriaContaPagar.create({ data: { empresaId: empresa.id, nome: nome.trim(), nomeNormalizado: norm } });
        }
        categorias.set(norm, c?.id ?? '');
        return c?.id ?? '';
    }
    for (const nomeAba of wb.SheetNames.slice(0, 1)) {
        const linhas = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], { header: 1, raw: true, defval: null });
        let idxCab = -1;
        let colunas = {};
        for (let i = 0; i < Math.min(15, linhas.length); i++) {
            const m = mapearColunas(linhas[i]);
            if (m.vencimento !== undefined && m.valor !== undefined) {
                idxCab = i;
                colunas = m;
                break;
            }
        }
        if (idxCab < 0) {
            console.log(`\n[aba "${nomeAba}"] sem cabeçalho de Vencimento + Valor — ignorada.`);
            continue;
        }
        console.log(`\n[aba "${nomeAba}"] colunas: ` + Object.entries(colunas).map(([k, v]) => `${k}=#${v + 1}`).join(', '));
        for (let i = idxCab + 1; i < linhas.length; i++) {
            const l = linhas[i];
            const pega = (c) => (colunas[c] !== undefined ? l[colunas[c]] : null);
            const venc = paraData(pega('vencimento'));
            const valor = paraNumero(pega('valor'));
            if (!venc || valor === null || valor <= 0) {
                ignoradas++;
                continue;
            }
            const fornecedorNome = String(pega('fornecedor') ?? '').trim();
            const descricao = String(pega('descricao') ?? '').trim() || fornecedorNome || 'Conta importada';
            const categoriaNome = String(pega('categoria') ?? '').trim();
            const forma = traduzForma(String(pega('forma') ?? ''));
            const statusTexto = normalizar(pega('status'));
            const pagoEmData = paraData(pega('pagoEm'));
            const pago = !!pagoEmData || /^(pago|paga|sim|ok|quitad|liquidad|x)/.test(statusTexto);
            const placa = String(pega('placa') ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
            const observacao = String(pega('observacao') ?? '').trim() || null;
            const duplicada = await prisma.contaPagar.findFirst({
                where: { empresaId: empresa.id, descricao, vencimento: venc, valor },
                select: { id: true },
            });
            if (duplicada) {
                puladas++;
                continue;
            }
            console.log(`  ${aplicar ? '+' : '·'} ${venc.toLocaleDateString('pt-BR')}  R$ ${valor.toFixed(2).padStart(10)}  ${pago ? 'PAGA  ' : 'aberta'}  ${descricao}${fornecedorNome ? ' — ' + fornecedorNome : ''}`);
            criadas++;
            if (!aplicar)
                continue;
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
                    tipo: tipoDaForma(forma),
                    formaPagamento: forma,
                    status: (pago ? 'PAGA' : 'ABERTA'),
                    pagoEm: pago ? dataPagamento : null,
                    observacao,
                    fornecedorId: fornecedorNome ? (await fornecedorId(fornecedorNome)) || null : null,
                    categoriaId: categoriaNome ? (await categoriaId(categoriaNome)) || null : null,
                    caminhaoId: caminhao?.id ?? null,
                },
            });
            if (pago) {
                await prisma.pagamentoContaPagar.create({
                    data: { contaPagarId: conta.id, valor, data: dataPagamento, formaPagamento: forma },
                });
            }
        }
    }
    console.log(`\nResumo: ${criadas} ${aplicar ? 'importada(s)' : 'a importar'}, ${puladas} já existiam, ${ignoradas} linha(s) ignorada(s) (vazias/totais).`);
    if (!aplicar)
        console.log('Nada foi gravado. Confira a lista acima e rode de novo com --aplicar.');
}
main()
    .catch((e) => {
    console.error('Erro:', e.message ?? e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=importar-contas-pagar.js.map