import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Every route lives under /api, e.g. GET /api/health
  app.setGlobalPrefix('api');

  // FRONTEND_URL may hold several comma-separated origins
  const origins = config
    .get<string>('FRONTEND_URL', 'http://localhost:3300')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  await app.listen(config.get<number>('PORT', 4300));
}
await bootstrap();
