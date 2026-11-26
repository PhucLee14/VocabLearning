import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Days shown on the admin dashboard. */
const DAYS = 14;
/** The dashboard counts days in Vietnam time (most learners are there). */
const ZONE = 'Asia/Ho_Chi_Minh';

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const now = Date.now();
    const weekAgo = new Date(now - 7 * 86_400_000);
    const from = new Date(now - (DAYS + 1) * 86_400_000);

    const [users, newUsers, admins, disabled, words, topics, openFeedback, activeWeek, learning, signUps] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        this.prisma.user.count({ where: { role: 'ADMIN' } }),
        this.prisma.user.count({ where: { disabledAt: { not: null } } }),
        this.prisma.word.count(),
        this.prisma.topic.count(),
        this.prisma.feedback.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
        // Learners who studied in the last 7 days (their own calendar days).
        this.prisma.dailyStat
          .groupBy({ by: ['userId'], where: { date: { gte: weekAgo }, OR: [{ reviews: { gt: 0 } }, { newWords: { gt: 0 } }] } })
          .then((rows) => rows.length),
        // Learners per day and cards per day. daily_stats.date is each learner's own day.
        this.prisma.$queryRaw<{ date: Date; learners: bigint; reviews: bigint; newWords: bigint }[]>`
          SELECT "date", count(*) AS learners, sum("reviews") AS reviews, sum("newWords") AS "newWords"
          FROM daily_stats
          WHERE "date" >= ${from}::date AND ("reviews" > 0 OR "newWords" > 0)
          GROUP BY "date" ORDER BY "date"`,
        this.prisma.$queryRaw<{ date: Date; count: bigint }[]>`
          SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${ZONE})::date AS "date", count(*) AS count
          FROM users
          WHERE "createdAt" >= ${from}
          GROUP BY 1 ORDER BY 1`,
      ]);

    // One entry per day, oldest first, including days with nothing.
    const key = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(now));
    const byDay = new Map(learning.map((r) => [key(r.date), r]));
    const signUpsByDay = new Map(signUps.map((r) => [key(r.date), Number(r.count)]));
    const days = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i));
      const date = key(d);
      const row = byDay.get(date);
      return {
        date,
        learners: Number(row?.learners ?? 0),
        reviews: Number(row?.reviews ?? 0),
        newWords: Number(row?.newWords ?? 0),
        signUps: signUpsByDay.get(date) ?? 0,
      };
    });

    return {
      users: { total: users, newThisWeek: newUsers, admins, disabled, activeThisWeek: activeWeek },
      words,
      topics,
      openFeedback,
      days,
    };
  }
}
