import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FinanceiroService } from './financeiro.service';
import { FinanceiroFiltrosDto } from './dto/financeiro-filtros.dto';
import { CreateCategoriaFinanceiraDto } from './dto/create-categoria-financeira.dto';
import { ClassificarTransacaoDto } from './dto/classificar-transacao.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateRegraClassificacaoDto } from './dto/create-regra-classificacao.dto';

@Controller('financeiro')
export class FinanceiroController {
    constructor(private readonly financeiroService: FinanceiroService) { }

    @Post('importar-extrato')
    @UseInterceptors(FileInterceptor('file'))
    importarExtrato(@UploadedFile() file: Express.Multer.File) {
        return this.financeiroService.importarExtrato(file);
    }

    @Get('caminhoes')
    listarCaminhoes() {
        return this.financeiroService.listarCaminhoes();
    }

    @Get('regras')
    listarRegras() {
        return this.financeiroService.listarRegras();
    }

    @Post('regras')
    criarRegra(@Body() dto: CreateRegraClassificacaoDto) {
        return this.financeiroService.criarRegra(dto);
    }

    @Post('reprocessar-classificacao')
    reprocessarClassificacao() {
        return this.financeiroService.reprocessarClassificacao();
    }

    @Get('transacoes')
    listarTransacoes(@Query() filtros: FinanceiroFiltrosDto) {
        return this.financeiroService.listarTransacoes(filtros);
    }

    @Get('resumo')
    resumo(@Query() filtros: FinanceiroFiltrosDto) {
        return this.financeiroService.resumo(filtros);
    }

    @Get('categorias')
    listarCategorias() {
        return this.financeiroService.listarCategorias();
    }

    @Post('categorias')
    criarCategoria(@Body() dto: CreateCategoriaFinanceiraDto) {
        return this.financeiroService.criarCategoria(dto);
    }

    @Patch('transacoes/:id/classificar')
    classificarTransacao(
        @Param('id') id: string,
        @Body() dto: ClassificarTransacaoDto,
    ) {
        return this.financeiroService.classificarTransacao(id, dto);
    }
}