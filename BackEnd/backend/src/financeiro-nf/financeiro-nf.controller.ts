import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import AdmZip from 'adm-zip';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Response } from 'express';
import { EmpresaModulo } from '@prisma/client';
import { FinanceiroNfService } from './financeiro-nf.service';
import { CertificadoDigitalService } from './certificado-digital.service';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';
import { RequiresModulo } from '../auth/requires-modulo.decorator';

// Monta o nome de arquivo do XML dentro do ZIP a partir da data + nome do
// emitente/prestador, evitando colisão quando duas NFs caem no mesmo nome
// — mesmo critério usado no Controle NF.
function montarNomeArquivoZip(data: Date | null, nome: string | null, usados: Set<string>): string {
    const base = `${(data ?? new Date()).toISOString().slice(0, 10)}-${nome || 'sem-nome'}`
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .trim();

    let entryName = `${base}.xml`;
    let contador = 2;

    while (usados.has(entryName)) {
        entryName = `${base}-${contador}.xml`;
        contador += 1;
    }

    usados.add(entryName);
    return entryName;
}

// Cadastros do módulo Financeiro/NF (Fornecedor, Categoria de Conta a
// Pagar, Certificado Digital) — prefixo separado de /financeiro (extrato
// bancário/caminhão) que já existe. Nas próximas fases entram aqui também
// NF de Entrada, NF de Serviço e Conta a Pagar.
@Controller('financeiro-nf')
@RequiresModulo(EmpresaModulo.FINANCEIRO_NF)
export class FinanceiroNfController {
    constructor(
        private readonly service: FinanceiroNfService,
        private readonly certificadoService: CertificadoDigitalService,
    ) { }

    // ---------------- Empresa (dados fiscais próprios) ----------------

    // Self-service: a própria empresa lê/edita os PRÓPRIOS dados fiscais
    // (nome, CNPJ, telefone, endereço estruturado, IE) — sempre filtrado
    // pelo empresaId do JWT via @EmpresaAtual(), nunca por id no
    // body/params. Não confundir com /admin/empresas/:id (módulo admin),
    // que é o Admin Master editando nome/módulos de QUALQUER empresa.
    // Sem restrição extra de perfil por enquanto: não existe hoje no
    // backend um guard de "só Proprietário edita X" pra seguir de padrão
    // (só há o CompanyAdminGuard, que restringe por perfil ADMIN e é
    // específico da aba Colaboradores) — qualquer usuário logado da
    // empresa pode editar estes dados.
    @Get('empresa')
    obterEmpresa(@EmpresaAtual() empresaId: string) {
        return this.service.obterDadosFiscaisEmpresa(empresaId);
    }

    @Patch('empresa')
    atualizarEmpresa(@EmpresaAtual() empresaId: string, @Body() body: Record<string, unknown>) {
        return this.service.atualizarDadosFiscaisEmpresa(empresaId, body as any);
    }

    // ---------------- Fornecedores ----------------

    @Get('fornecedores')
    listarFornecedores(@EmpresaAtual() empresaId: string, @Query('busca') busca?: string) {
        return this.service.listarFornecedores(empresaId, busca);
    }

    @Post('fornecedores')
    criarFornecedor(
        @EmpresaAtual() empresaId: string,
        @Body() body: { nome: string; cnpj?: string; telefone?: string },
    ) {
        return this.service.criarFornecedor(empresaId, body);
    }

    @Post('fornecedores/encontrar-ou-criar')
    encontrarOuCriarFornecedor(@EmpresaAtual() empresaId: string, @Body() body: { nome: string }) {
        return this.service.encontrarOuCriarFornecedor(empresaId, body.nome);
    }

    @Patch('fornecedores/:id')
    atualizarFornecedor(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.service.atualizarFornecedor(id, empresaId, body as any);
    }

    @Delete('fornecedores/:id')
    removerFornecedor(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.removerFornecedor(id, empresaId);
    }

    // ---------------- Categorias de Conta a Pagar ----------------

    @Get('categorias')
    listarCategorias(@EmpresaAtual() empresaId: string, @Query('busca') busca?: string) {
        return this.service.listarCategorias(empresaId, busca);
    }

    @Post('categorias')
    criarCategoria(@EmpresaAtual() empresaId: string, @Body() body: { nome: string }) {
        return this.service.criarCategoria(empresaId, body);
    }

    @Post('categorias/encontrar-ou-criar')
    encontrarOuCriarCategoria(@EmpresaAtual() empresaId: string, @Body() body: { nome: string }) {
        return this.service.encontrarOuCriarCategoria(empresaId, body.nome);
    }

    @Patch('categorias/:id')
    atualizarCategoria(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Body() body: Record<string, unknown>,
    ) {
        return this.service.atualizarCategoria(id, empresaId, body as any);
    }

    @Delete('categorias/:id')
    removerCategoria(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.removerCategoria(id, empresaId);
    }

    // ---------------- Certificado Digital ----------------

    @Get('certificado')
    obterCertificado(@EmpresaAtual() empresaId: string) {
        return this.certificadoService.obterStatus(empresaId);
    }

    @Post('certificado')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            fileFilter: (_req, file, callback) => {
                const valido = /\.(pfx|p12)$/i.test(file.originalname || '');

                if (!valido) {
                    return callback(
                        new Error('Arquivo inválido. Envie um certificado .pfx ou .p12.'),
                        false,
                    );
                }

                callback(null, true);
            },
        }),
    )
    enviarCertificado(
        @EmpresaAtual() empresaId: string,
        @UploadedFile() file: Express.Multer.File,
        @Body('senha') senha: string,
    ) {
        return this.certificadoService.salvar(empresaId, file, senha);
    }

    @Delete('certificado')
    removerCertificado(@EmpresaAtual() empresaId: string) {
        return this.certificadoService.remover(empresaId);
    }

    // ---------------- Conta a Pagar ----------------

    @Get('contas-pagar')
    listarContasPagar(
        @EmpresaAtual() empresaId: string,
        @Query('status') status?: any,
        @Query('mes') mes?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        return this.service.listarContasPagar(empresaId, { status, mes, page, pageSize });
    }

    @Get('contas-pagar/resumo')
    resumoContasPagar(@EmpresaAtual() empresaId: string, @Query('mes') mes?: string) {
        return this.service.resumoContasPagar(empresaId, mes);
    }

    // ABERTA + PARCIAL — usado pelo dropdown de conciliação bancária.
    // Precisa vir antes de 'contas-pagar/:id' pra não colidir.
    @Get('contas-pagar/pendentes')
    listarContasPendentes(@EmpresaAtual() empresaId: string) {
        return this.service.listarContasPendentes(empresaId);
    }

    // Baixa (total ou parcial) de uma conta — dívida de 5000, baixa de 3000
    // agora, 2000 depois: duas chamadas aqui, mesma ContaPagar.
    @Post('contas-pagar/:id/pagamentos')
    registrarPagamento(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Body() body: Record<string, any>,
    ) {
        return this.service.registrarPagamento(id, empresaId, body as any);
    }

    @Get('contas-pagar/:id/pagamentos')
    listarPagamentos(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.listarPagamentos(id, empresaId);
    }

    @Delete('contas-pagar/pagamentos/:pagamentoId')
    excluirPagamento(@Param('pagamentoId') pagamentoId: string, @EmpresaAtual() empresaId: string) {
        return this.service.excluirPagamento(pagamentoId, empresaId);
    }

    @Post('contas-pagar')
    criarContaPagar(@EmpresaAtual() empresaId: string, @Body() body: Record<string, any>) {
        return this.service.criarContaPagar(empresaId, body as any);
    }

    @Patch('contas-pagar/:id')
    atualizarContaPagar(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Body() body: Record<string, any>,
    ) {
        return this.service.atualizarContaPagar(id, empresaId, body);
    }

    @Patch('contas-pagar/:id/pagar')
    marcarContaPagarPaga(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Body() body: Record<string, any>,
    ) {
        return this.service.marcarContaPagarPaga(id, empresaId, body as any);
    }

    @Delete('contas-pagar/:id')
    removerContaPagar(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.removerContaPagar(id, empresaId);
    }

    // Lê o extrato OFX só pra devolver as movimentações — não salva o
    // arquivo nem grava nada no banco (mesmo padrão do Controle NF).
    @Post('contas-pagar/reconcile/import')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            fileFilter: (_req, file, callback) => {
                const isOfx = /\.(ofx)$/i.test(file.originalname || '');

                if (!isOfx) {
                    return callback(
                        new Error('Arquivo inválido. Envie um extrato .ofx.'),
                        false,
                    );
                }

                callback(null, true);
            },
        }),
    )
    importarOfx(@UploadedFile() file: Express.Multer.File) {
        return this.service.parseOfxStatement(file.buffer.toString('utf-8'));
    }

    // ---------------- Dashboard ----------------

    @Get('dashboard')
    dashboardFinanceiro(@EmpresaAtual() empresaId: string, @Query('mes') mes?: string) {
        return this.service.dashboardFinanceiro(empresaId, mes);
    }

    // ---------------- NF de Entrada ----------------

    // Precisa vir antes de qualquer rota "nf-entrada/:id" futura, pra não
    // ser interpretada como um id.
    @Get('nf-entrada/download/zip')
    async baixarZipNfEntrada(
        @EmpresaAtual() empresaId: string,
        @Res() res: Response,
        @Query('de') de?: string,
        @Query('ate') ate?: string,
    ) {
        // Exclui NF de carga (mercadoria de terceiro que a empresa só
        // transportou) — essas ficam no ZIP separado de NF de Transporte.
        const items = await this.service.buscarNfEntradaParaZip(empresaId, { de, ate }, { ehCarga: false });

        const zip = new AdmZip();
        const usados = new Set<string>();

        for (const item of items) {
            if (!item.arquivoUrl) continue;

            const filePath = join(process.cwd(), item.arquivoUrl.replace(/^\/+/, ''));
            if (!existsSync(filePath)) continue;

            const entryName = montarNomeArquivoZip(item.dataEmissao, item.emitenteNome, usados);
            zip.addLocalFile(filePath, '', entryName);
        }

        const nomeZip = de || ate ? `nf-entrada-${de || 'inicio'}_a_${ate || 'fim'}.zip` : 'nf-entrada.zip';

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${nomeZip}"`,
        });
        res.send(zip.toBuffer());
    }

    @Get('nf-entrada')
    listarNfEntrada(
        @EmpresaAtual() empresaId: string,
        @Query('de') de?: string,
        @Query('ate') ate?: string,
        @Query('mes') mes?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('busca') busca?: string,
    ) {
        // NF de carga (mercadoria de terceiro que a empresa só transportou,
        // não é compra própria) não entra aqui — ver GET /nf-transporte.
        return this.service.listarNfEntrada(
            empresaId,
            { de, ate, mes, page, pageSize, busca },
            { ehCarga: false },
        );
    }

    // Precisa vir antes de "nf-transporte/:id" futura, mesmo motivo do
    // download/zip de nf-entrada acima.
    @Get('nf-transporte/download/zip')
    async baixarZipNfTransporte(
        @EmpresaAtual() empresaId: string,
        @Res() res: Response,
        @Query('de') de?: string,
        @Query('ate') ate?: string,
    ) {
        const items = await this.service.buscarNfEntradaParaZip(empresaId, { de, ate }, { ehCarga: true });

        const zip = new AdmZip();
        const usados = new Set<string>();

        for (const item of items) {
            if (!item.arquivoUrl) continue;

            const filePath = join(process.cwd(), item.arquivoUrl.replace(/^\/+/, ''));
            if (!existsSync(filePath)) continue;

            const entryName = montarNomeArquivoZip(item.dataEmissao, item.emitenteNome, usados);
            zip.addLocalFile(filePath, '', entryName);
        }

        const nomeZip = de || ate ? `nf-transporte-${de || 'inicio'}_a_${ate || 'fim'}.zip` : 'nf-transporte.zip';

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${nomeZip}"`,
        });
        res.send(zip.toBuffer());
    }

    // NF de Transporte: notas em que a empresa aparece só como
    // transportadora (mercadoria/destinatário de terceiro), não é compra
    // própria. Mesma tabela (NfEntrada) que a NF de Entrada, só filtrando
    // ehCarga=true — ver runSyncNfEntrada em financeiro-nf.service.ts pra
    // como essa classificação é feita a partir do XML.
    @Get('nf-transporte')
    listarNfTransporte(
        @EmpresaAtual() empresaId: string,
        @Query('de') de?: string,
        @Query('ate') ate?: string,
        @Query('mes') mes?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('busca') busca?: string,
    ) {
        return this.service.listarNfEntrada(
            empresaId,
            { de, ate, mes, page, pageSize, busca },
            { ehCarga: true },
        );
    }

    // Precisa vir antes de qualquer rota "nf-entrada/:id" futura que não
    // seja essas três (view/danfe/xml), pra não colidir com download/zip.
    @Get('nf-entrada/:id/view')
    visualizarNfEntrada(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.viewNfEntrada(id, empresaId);
    }

    @Get('nf-entrada/:id/danfe')
    async baixarDanfeNfEntrada(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Res() res: Response,
    ) {
        const buffer = await this.service.downloadNfEntradaDanfe(id, empresaId);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="danfe-entrada-${id}.pdf"`,
        });
        res.send(buffer);
    }

    @Get('nf-entrada/:id/xml')
    async baixarXmlNfEntrada(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Res() res: Response,
    ) {
        const { buffer, filename } = await this.service.downloadNfEntradaXml(id, empresaId);
        res.set({
            'Content-Type': 'application/xml',
            'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.send(buffer);
    }

    // ---------------- NF de Serviço ----------------

    @Get('nf-servico/download/zip')
    async baixarZipNfServico(
        @EmpresaAtual() empresaId: string,
        @Res() res: Response,
        @Query('de') de?: string,
        @Query('ate') ate?: string,
    ) {
        const items = await this.service.buscarNfServicoParaZip(empresaId, { de, ate });

        const zip = new AdmZip();
        const usados = new Set<string>();

        for (const item of items) {
            if (!item.arquivoUrl) continue;

            const filePath = join(process.cwd(), item.arquivoUrl.replace(/^\/+/, ''));
            if (!existsSync(filePath)) continue;

            const entryName = montarNomeArquivoZip(item.dataEmissao, item.prestadorNome, usados);
            zip.addLocalFile(filePath, '', entryName);
        }

        const nomeZip = de || ate ? `nf-servico-${de || 'inicio'}_a_${ate || 'fim'}.zip` : 'nf-servico.zip';

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${nomeZip}"`,
        });
        res.send(zip.toBuffer());
    }

    @Get('nf-servico')
    listarNfServico(
        @EmpresaAtual() empresaId: string,
        @Query('de') de?: string,
        @Query('ate') ate?: string,
        @Query('mes') mes?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('busca') busca?: string,
    ) {
        return this.service.listarNfServico(empresaId, { de, ate, mes, page, pageSize, busca });
    }

    @Get('nf-servico/:id/view')
    visualizarNfServico(@Param('id') id: string, @EmpresaAtual() empresaId: string) {
        return this.service.viewNfServico(id, empresaId);
    }

    @Get('nf-servico/:id/danfe')
    async baixarDanfeNfServico(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Res() res: Response,
    ) {
        const buffer = await this.service.downloadNfServicoDanfe(id, empresaId);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="danfe-servico-${id}.pdf"`,
        });
        res.send(buffer);
    }

    @Get('nf-servico/:id/xml')
    async baixarXmlNfServico(
        @Param('id') id: string,
        @EmpresaAtual() empresaId: string,
        @Res() res: Response,
    ) {
        const { buffer, filename } = await this.service.downloadNfServicoXml(id, empresaId);
        res.set({
            'Content-Type': 'application/xml',
            'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.send(buffer);
    }

    // ---------------- Busca manual na Sefaz/ADN ----------------

    // Dispara a busca de NF-e de mercadoria sob demanda (botão "Buscar
    // agora" da tela) pra empresa autenticada. Devolve quantas notas novas
    // vieram; se a Sefaz recusar (sem certificado, sem CNPJ, bloqueio de
    // cooldown etc.) o erro vem como BadRequestException, tratado no front.
    @Post('nf-entrada/buscar')
    buscarNfEntrada(@EmpresaAtual() empresaId: string) {
        return this.service.buscarNfEntradaManual(empresaId);
    }

    // Mesma coisa, só que pro ADN de NFS-e de serviço.
    @Post('nf-servico/buscar')
    buscarNfServico(@EmpresaAtual() empresaId: string) {
        return this.service.buscarNfServicoManual(empresaId);
    }

    // Histórico das últimas tentativas de busca (manuais e automáticas) —
    // mesmo painel que o Controle NF mostra na aba Lojas.
    @Get('sefaz-logs')
    listarLogsSefaz(@EmpresaAtual() empresaId: string) {
        return this.service.listarLogsSefaz(empresaId);
    }
}
