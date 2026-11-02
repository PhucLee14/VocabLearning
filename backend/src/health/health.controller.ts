import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness – does NOT touch the DB.
   * Used by the hosting platform's health check: if it queried the DB, Neon would
   * never scale to zero and would burn through the Free plan's compute quota.
   */
  @Get()
  live() {
    return { status: 'ok', time: new Date().toISOString() };
  }

  /** DB connectivity check – call it manually when needed. */
  @Get('db')
  async db() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'unreachable' });
    }
  }
}
