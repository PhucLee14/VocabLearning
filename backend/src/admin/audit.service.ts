import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type AuditTarget = { type: 'user' | 'word' | 'topic' | 'feedback' | 'import'; id?: string; name?: string };

type Db = Pick<PrismaService, 'auditLog'>;

/**
 * The fields that differ between `before` and `after`, as { field: [before, after] }.
 * Only the keys present in `after` are compared (a PATCH sends only what changed).
 */
export function changes(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, [unknown, unknown]> = {};
  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) continue;
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(value ?? null)) out[key] = [before[key] ?? null, value];
  }
  return out;
}

/** Records who changed what in the admin site (table `audit_logs`). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `db` (a transaction client) to write the entry with the change it describes. */
  record(actorId: string, action: string, target: AuditTarget, data?: Prisma.InputJsonValue, db: Db = this.prisma) {
    return db.auditLog.create({
      data: {
        actorId,
        action,
        targetType: target.type,
        targetId: target.id ?? null,
        targetName: target.name?.slice(0, 200) ?? null,
        data: data ?? undefined,
      },
    });
  }

  async list(query: { page?: number; pageSize?: number; targetType?: string; targetId?: string; actorId?: string }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.AuditLogWhereInput = {
      targetType: query.targetType,
      targetId: query.targetId,
      actorId: query.actorId,
    };
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          targetName: true,
          data: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);
    return { items, total, page, pageSize };
  }
}
