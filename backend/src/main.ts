import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { httpSecurity } from './common/http-security.js';
import { PrismaExceptionFilter } from './common/prisma-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Every route lives under /api, e.g. GET /api/health
  app.setGlobalPrefix('api');

  // FRONTEND_URL may hold several comma-separated origins. In production it
  // must be set: it drives CORS, the CSRF origin check and OAuth redirects.
  const frontendUrl = config.get<string>('FRONTEND_URL');
  if (!frontendUrl && process.env.NODE_ENV === 'production') {
    throw new Error('FRONTEND_URL must be set in production');
  }
  const origins = (frontendUrl ?? 'http://localhost:3300')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  // Security headers + CSRF checks on state-changing requests (src/common/http-security.ts).
  app.use(httpSecurity(origins));
  // Reads the session cookie (src/auth/session-cookie.ts).
  app.use(cookieParser());
  app.enableCors({ origin: origins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.enableShutdownHooks();

  await app.listen(config.get<number>('PORT', 4300));
}
await bootstrap();
