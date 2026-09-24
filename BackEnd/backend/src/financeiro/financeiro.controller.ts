import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { FinanceiroFiltrosDto } from './dto/financeiro-filtros.dto';
import { CreateCategoriaFinanceiraDto } from './dto/create-categoria-financeira.dto';
import { ClassificarTransacaoDto } from './dto/classificar-transacao.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateRegraClassificacaoDto } from './dto/create-regra-classificacao.dto';
import { EmpresaAtual } from '../auth/empresa-atual.decorator';

@Controller('financeiro')
export class FinanceiroController {
    constructor(private readonly financeiroService: FinanceiroService) { }

    @Post('importar-extrato')
    @UseInterceptors(FileInterceptor('file'))
    importarExtrato(@EmpresaAtual() empresaId: string, @UploadedFile() file: Express.Multer.File) {
        return this.financeiroService.importarExtrato(empresaId, file);
    }

    @Get('caminhoes')
    listarCaminhoes(@EmpresaAtual() empresaId: string) {
        return this.financeiroService.listarCaminhoes(empresaId);
    }

    @Get('regras')
    listarRegras(@EmpresaAtual() empresaId: string) {
        return this.financeiroService.listarRegras(empresaId);
    }

    @Post('regras')
    criarRegra(@EmpresaAtual() empresaId: string, @Body() dto: CreateRegraClassificacaoDto) {
        return this.financeiroService.criarRegra(empresaId, dto);
    }

    @Post('reprocessar-classificacao')
    reprocessarClassificacao(@EmpresaAtual() empresaId: string) {
        return this.financeiroService.reprocessarClassificacao(empresaId);
    }

    @Get('transacoes')
    listarTransacoes(@EmpresaAtual() empresaId: string, @Query() filtros: FinanceiroFiltrosDto) {
        return this.financeiroService.listarTransacoes(empresaId, filtros);
    }

    @Get('resumo')
    resumo(@EmpresaAtual() empresaId: string, @Query() filtros: FinanceiroFiltrosDto) {
        return this.financeiroService.resumo(empresaId, filtros);
    }

    @Get('categorias')
    listarCategorias(@EmpresaAtual() empresaId: string) {
        return this.financeiroService.listarCategorias(empresaId);
    }

    @Post('categorias')
    criarCategoria(@EmpresaAtual() empresaId: string, @Body() dto: CreateCategoriaFinanceiraDto) {
        return this.financeiroService.criarCategoria(empresaId, dto);
    }

    @Patch('transacoes/:id/classificar')
    classificarTransacao(
        @EmpresaAtual() empresaId: string,
        @Param('id') id: string,
        @Body() dto: ClassificarTransacaoDto,
    ) {
        return this.financeiroService.classificarTransacao(empresaId, id, dto);
    }
}
