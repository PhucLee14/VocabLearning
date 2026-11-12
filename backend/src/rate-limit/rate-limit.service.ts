import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** One limit: at most `limit` hits per `windowMs` for `id` (an IP, email or user id) in `bucket`. */
export type Rule = { bucket: string; id: string; limit: number; windowMs: number };

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/** The stored key: the raw IP / email never reaches the table. */
export const rateKey = (bucket: string, id: string) =>
  `${bucket}:${createHash('sha256').update(id.trim().toLowerCase()).digest('base64url').slice(0, 32)}`;

/**
 * Fixed-window rate limits kept in Postgres (table `rate_limits`), so they hold
 * across serverless instances without another service. One atomic upsert per
 * rule: it starts a new window when the old one has ended, else counts up.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  /** Counts a hit; returns whether it is within the limit and when the window ends. */
  async hit(rule: Rule): Promise<{ allowed: boolean; retryAfterS: number }> {
    const key = rateKey(rule.bucket, rule.id);
    const [row] = await this.prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO rate_limits ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + ${rule.windowMs}::int * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN rate_limits."resetAt" <= now() THEN 1 ELSE rate_limits."count" + 1 END,
        "resetAt" = CASE WHEN rate_limits."resetAt" <= now()
          THEN now() + ${rule.windowMs}::int * interval '1 millisecond'
          ELSE rate_limits."resetAt" END
      RETURNING "count", "resetAt"`;
    // Housekeeping without a cron job: now and then drop windows that ended long ago.
    if (Math.random() < 0.01) {
      await this.prisma.$executeRaw`DELETE FROM rate_limits WHERE "resetAt" < now() - interval '1 day'`;
    }
    return {
      allowed: row.count <= rule.limit,
      retryAfterS: Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)),
    };
  }

  /** Counts a hit on every rule and throws 429 when any of them is over its limit. */
  async consume(...rules: Rule[]) {
    const results = await Promise.all(rules.map((rule) => this.hit(rule)));
    const blocked = results.filter((r) => !r.allowed);
    if (blocked.length > 0) {
      const retryAfterS = Math.max(...blocked.map((r) => r.retryAfterS));
      throw new HttpException(
        { statusCode: 429, message: 'Too many attempts. Try again later.', retryAfterS },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
