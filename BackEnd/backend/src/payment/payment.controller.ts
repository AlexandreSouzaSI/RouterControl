import { Controller, Post, Param } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('pagamento')
export class PaymentController {
    constructor(private service: PaymentService) { }

    @Post(':caminhaoId/:mes')
    gerar(
        @Param('caminhaoId') caminhaoId: string,
        @Param('mes') mes: string,
    ) {
        return this.service.gerarPagamento(caminhaoId, mes);
    }
}