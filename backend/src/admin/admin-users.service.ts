import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ListUsersQuery, UpdateUserDto } from './admin.dto.js';
import { AuditService } from './audit.service.js';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const and: Prisma.UserWhereInput[] = [];
    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }],
      });
    }
    if (query.filter === 'admins') and.push({ role: 'ADMIN' });
    if (query.filter === 'disabled') and.push({ disabledAt: { not: null } });
    if (query.filter === 'unverified') and.push({ emailVerifiedAt: null });
    const where: Prisma.UserWhereInput = { AND: and };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerifiedAt: true,
          disabledAt: true,
          createdAt: true,
          passwordHash: true,
          googleId: true,
          streak: { select: { current: true, lastActiveDate: true } },
          _count: { select: { cards: true } },
        },
      }),
    ]);
    const items = users.map(({ passwordHash, googleId, streak, _count, ...u }) => ({
      ...u,
      hasPassword: passwordHash !== null,
      hasGoogle: googleId !== null,
      streak: streak?.current ?? 0,
      lastActiveDate: streak?.lastActiveDate?.toISOString().slice(0, 10) ?? null,
      cards: _count.cards,
    }));
    return { items, total, page, pageSize };
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        timezone: true,
        targetLevel: true,
        emailVerifiedAt: true,
        disabledAt: true,
        createdAt: true,
        passwordHash: true,
        googleId: true,
        streak: { select: { current: true, longest: true, lastActiveDate: true } },
        _count: { select: { cards: true, reviewLogs: true, notes: true, feedback: true } },
      },
    });
    if (!user) throw new NotFoundException('No such user');

    const now = new Date();
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [known, due, sessions, days] = await Promise.all([
      this.prisma.userCard.count({ where: { userId: id, isKnown: true } }),
      this.prisma.userCard.count({ where: { userId: id, isKnown: false, isSuspended: false, due: { lte: now } } }),
      this.prisma.session.findMany({
        where: { userId: id, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { lastUsedAt: 'desc' },
        select: { id: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true },
      }),
      this.prisma.dailyStat.findMany({
        where: { userId: id, date: { gte: since } },
        orderBy: { date: 'asc' },
        select: { date: true, reviews: true, newWords: true, activeSeconds: true, goalMet: true },
      }),
    ]);

    const { passwordHash, googleId, streak, _count, ...rest } = user;
    return {
      ...rest,
      hasPassword: passwordHash !== null,
      hasGoogle: googleId !== null,
      streak: {
        current: streak?.current ?? 0,
        longest: streak?.longest ?? 0,
        lastActiveDate: streak?.lastActiveDate?.toISOString().slice(0, 10) ?? null,
      },
      counts: { ..._count, known, due },
      sessions,
      days: days.map((d) => ({ ...d, date: d.date.toISOString().slice(0, 10) })),
    };
  }

  /**
   * Changes the role or disables / enables the account. Disabling signs it
   * out everywhere. Admins can't change their own role or disable themselves,
   * so the site can't lose its last admin by accident.
   */
  async update(adminId: string, id: string, dto: UpdateUserDto) {
    if (id === adminId) throw new BadRequestException("You can't change your own role or disable yourself");
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true, role: true, disabledAt: true },
    });
    if (!before) throw new NotFoundException('No such user');

    const data: Prisma.UserUpdateInput = {};
    const changed: Record<string, [unknown, unknown]> = {};
    if (dto.role !== undefined && dto.role !== before.role) {
      data.role = dto.role;
      changed.role = [before.role, dto.role];
    }
    if (dto.disabled !== undefined && dto.disabled !== (before.disabledAt !== null)) {
      data.disabledAt = dto.disabled ? new Date() : null;
      changed.disabled = [before.disabledAt !== null, dto.disabled];
    }
    if (Object.keys(changed).length === 0) return this.detail(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      if (dto.disabled) {
        await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      const action = changed.disabled ? (dto.disabled ? 'user.disable' : 'user.enable') : 'user.role';
      await this.audit.record(adminId, action, { type: 'user', id, name: before.email }, changed as Prisma.InputJsonValue, tx);
    });
    return this.detail(id);
  }

  /** Signs the user out of every browser. */
  async revokeSessions(adminId: string, id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!user) throw new NotFoundException('No such user');
    const { count } = await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(adminId, 'user.revoke_sessions', { type: 'user', id, name: user.email }, { sessions: count });
    return { revoked: count };
  }
}
