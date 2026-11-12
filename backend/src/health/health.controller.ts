import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, NotFoundException, Req, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { clientIp } from '../common/client-ip.js';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Liveness – does NOT touch the DB.
   * Used by the hosting platform's health check: if it queried the DB, Neon would
   * never scale to zero and would burn through the Free plan's compute quota.
   */
  @Get()
  live() {
    return { status: 'ok', time: new Date().toISOString() };
  }

  /**
   * DB connectivity check. Wakes Neon up, so it needs
   * `Authorization: Bearer <CRON_SECRET>`; without it the route looks absent.
   * Also reports the client IP the backend sees.
   */
  @Get('db')
  async db(@Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    const secret = this.config.get<string>('CRON_SECRET');
    const given = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret ?? ''}`);
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new NotFoundException();
    }
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // `ip`: the client IP as the backend sees it, to check that rate limits by IP
      // see visitors and not a proxy (src/common/client-ip.ts).
      return { status: 'ok', db: 'ok', ip: clientIp(req) };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'unreachable' });
    }
  }
}
