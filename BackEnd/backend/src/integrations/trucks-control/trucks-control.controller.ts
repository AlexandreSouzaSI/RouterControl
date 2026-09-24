import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { EmpresaModulo } from '@prisma/client';
import { TrucksControlService } from './trucks-control.service';
import { EmpresaAtual } from '../../auth/empresa-atual.decorator';
import { RequiresModulo } from '../../auth/requires-modulo.decorator';

@Controller('trucks-control')
@RequiresModulo(EmpresaModulo.RASTREADOR)
export class TrucksControlController {
    constructor(private readonly service: TrucksControlService) { }

    // -----------------------------------------------------------------
    // Credencial da empresa na Trucks Control (Cadastros → Rastreador)
    // -----------------------------------------------------------------

    @Get('credencial')
    obterCredencial(@EmpresaAtual() empresaId: string) {
        return this.service.obterCredencial(empresaId);
    }

    @Put('credencial')
    salvarCredencial(
        @EmpresaAtual() empresaId: string,
        @Body() body: { login: string; senha: string },
    ) {
        return this.service.salvarCredencial(empresaId, body);
    }

    @Patch('credencial/ativo')
    alternarCredencialAtiva(
        @EmpresaAtual() empresaId: string,
        @Body() body: { ativo: boolean },
    ) {
        return this.service.alternarCredencialAtiva(empresaId, !!body.ativo);
    }

    @Delete('credencial')
    removerCredencial(@EmpresaAtual() empresaId: string) {
        return this.service.removerCredencial(empresaId);
    }

    // -----------------------------------------------------------------

    @Get('veiculos')
    listarVeiculos(@EmpresaAtual() empresaId: string) {
        return this.service.listarVeiculosComCache(empresaId, true);
    }

    @Get('mensagens')
    buscarMensagens(
        @EmpresaAtual() empresaId: string,
        @Query('lastMid') lastMid?: string,
    ) {
        return this.service.buscarMensagens(empresaId, lastMid ? Number(lastMid) : undefined);
    }

    @Get('tracking')
    buscarUltimasPosicoes(@EmpresaAtual() empresaId: string) {
        return this.service.buscarUltimasPosicoes(empresaId);
    }

    @Get('caminhoes-localizacao')
    buscarCaminhoesComLocalizacao(
        @EmpresaAtual() empresaId: string,
        @Query('forcar') forcar?: string,
    ) {
        return this.service.buscarCaminhoesComLocalizacao(empresaId, {
            forcar: forcar === 'true',
        });
    }

    @Get('historico')
    buscarHistorico(
        @EmpresaAtual() empresaId: string,
        @Query('placa') placa?: string,
        @Query('veiId') veiId?: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
    ) {
        return this.service.buscarHistorico(empresaId, {
            placa,
            veiId: veiId ? Number(veiId) : undefined,
            dataInicio,
            dataFim,
        });
    }

    // Viagens detectadas automaticamente por GPS (saiu da região do porto
    // de Santos = iniciou; chegou em Betim ou Pouso Alegre = concluiu).
    @Get('viagens')
    listarViagensGps(
        @EmpresaAtual() empresaId: string,
        @Query('status') status?: 'EM_ANDAMENTO' | 'CONCLUIDA',
        @Query('placa') placa?: string,
        @Query('limit') limit?: string,
    ) {
        return this.service.listarViagensGps(empresaId, {
            status,
            placa,
            limit: limit ? Number(limit) : undefined,
        });
    }

    // Consumo médio (km/L) e autonomia estimada de um caminhão, calculado
    // a partir do histórico real de litros no tanque + odômetro.
    @Get('consumo')
    calcularConsumo(
        @EmpresaAtual() empresaId: string,
        @Query('veiId') veiId: string,
        @Query('dataInicio') dataInicio?: string,
        @Query('dataFim') dataFim?: string,
    ) {
        return this.service.calcularConsumo(empresaId, {
            veiId: Number(veiId),
            dataInicio,
            dataFim,
        });
    }

    // Criação manual de viagem — botão "Nova Viagem" (alguém do
    // administrativo escolhe o caminhão e digita origem/destino). A
    // conclusão continua automática pelo GPS.
    @Post('viagens/manual')
    criarViagemManual(
        @EmpresaAtual() empresaId: string,
        @Body()
        body: {
            veiId: number;
            origemMunicipio: string;
            destinoMunicipio: string;
        },
    ) {
        return this.service.criarViagemManual(empresaId, {
            veiId: Number(body.veiId),
            origemMunicipio: body.origemMunicipio,
            destinoMunicipio: body.destinoMunicipio,
        });
    }

    // Criação manual de viagem de caminhão de terceiro/agregado — aba
    // "Terceiros" do modal "Nova Viagem". Sem veiId (não tem cadastro na
    // Trucks Control), só placa digitada + origem/destino.
    @Post('viagens/terceiro')
    criarViagemTerceiro(
        @EmpresaAtual() empresaId: string,
        @Body()
        body: {
            placa: string;
            origemMunicipio: string;
            destinoMunicipio: string;
        },
    ) {
        return this.service.criarViagemTerceiro(empresaId, {
            placa: body.placa,
            origemMunicipio: body.origemMunicipio,
            destinoMunicipio: body.destinoMunicipio,
        });
    }

    // Editar viagem (própria ou de terceiro) — corrige origem/destino/placa
    // digitados errado, ou conclui na mão uma viagem de terceiro (sem GPS
    // pra fechar sozinha).
    @Patch('viagens/:id')
    atualizarViagem(
        @EmpresaAtual() empresaId: string,
        @Param('id') id: string,
        @Body()
        body: {
            placa?: string;
            origemMunicipio?: string;
            destinoMunicipio?: string;
            status?: 'EM_ANDAMENTO' | 'CONCLUIDA';
        },
    ) {
        return this.service.atualizarViagemGps(empresaId, id, body);
    }

    // Excluir viagem (própria ou de terceiro) criada por engano/duplicada.
    @Delete('viagens/:id')
    excluirViagem(
        @EmpresaAtual() empresaId: string,
        @Param('id') id: string,
    ) {
        return this.service.excluirViagemGps(empresaId, id);
    }

    // Resumo pro Dashboard: total de viagens concluídas + contagem por
    // placa (ex: "QPM - 4 viagens concluídas"). `mes` (YYYY-MM) filtra o
    // mês inteiro (início ao fim); `desde`/`ate` (ISO) continuam aceitos
    // pra quem já usava só o início do período.
    @Get('viagens/resumo-concluidas')
    resumoViagensConcluidas(
        @EmpresaAtual() empresaId: string,
        @Query('mes') mes?: string,
        @Query('desde') desde?: string,
        @Query('ate') ate?: string,
    ) {
        return this.service.resumoViagensConcluidas(empresaId, {
            mes,
            desde: desde ? new Date(desde) : undefined,
            ate: ate ? new Date(ate) : undefined,
        });
    }

    // Dias parados (mês) calculados automaticamente a partir do
    // rastreamento GPS — substitui a dependência do upload manual de
    // planilha. `mes` no formato 'YYYY-MM' (padrão: mês atual).
    @Get('dias-parados')
    resumoDiasParados(
        @EmpresaAtual() empresaId: string,
        @Query('mes') mes?: string,
    ) {
        return this.service.resumoDiasParados(empresaId, { mes });
    }
}
