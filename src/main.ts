import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { raw } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    '/files/:fileType/:fileId',
    raw({ type: 'application/octet-stream', limit: '10mb' }),
  );

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('PORT');

  await app.listen(port);
}
await bootstrap();
