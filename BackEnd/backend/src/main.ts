import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // O WhatsApp (Evolution API) manda o arquivo em base64 dentro do JSON.
  app.useBodyParser('json', { limit: '30mb' });
  app.enableCors();
  await app.listen(process.env.PORT ?? 3002, '0.0.0.0');
}
bootstrap();
