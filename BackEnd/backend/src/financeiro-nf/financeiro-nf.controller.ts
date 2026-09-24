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
    ) {
        return this.service.listarContasPagar(empresaId, { status, mes });
    }

    @Get('contas-pagar/resumo')
    resumoContasPagar(@EmpresaAtual() empresaId: string, @Query('mes') mes?: string) {
        return this.service.resumoContasPagar(empresaId, mes);
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
        const items = await this.service.buscarNfEntradaParaZip(empresaId, { de, ate });

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
    ) {
        return this.service.listarNfEntrada(empresaId, { de, ate });
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
    ) {
        return this.service.listarNfServico(empresaId, { de, ate });
    }
}
