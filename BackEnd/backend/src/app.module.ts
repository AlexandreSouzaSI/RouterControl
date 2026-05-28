import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UploadModule } from './upload/upload.module';
import { PrismaModule } from './prisma/prisma.module';
import { RelatorioModule } from './relatorio/relatorio.module';
import { RegraCaminhaoModule } from './RegrasCaminhao/regra-caminhao.module';
import { CaminhaoModule } from './modules/caminhao/caminhao.module';
import { PagamentosModule } from './modules/pagamentos/pagamentos.module';
import { FinanceiroModule } from './financeiro/financeiro.module';

@Module({
  imports: [UploadModule, PrismaModule, RelatorioModule, RegraCaminhaoModule, CaminhaoModule, PagamentosModule, FinanceiroModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
