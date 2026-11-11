import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Headers, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
   */
  @Get('db')
  async db(@Headers('authorization') authorization: string | undefined) {
    const secret = this.config.get<string>('CRON_SECRET');
    const given = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret ?? ''}`);
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new NotFoundException();
    }
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'unreachable' });
    }
  }
}
