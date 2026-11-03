import { Injectable, NotFoundException } from '@nestjs/common';
import type { Grade } from 'ts-fsrs';
import type { Prisma, UserCard } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { flattenTopics, inTopic, shuffle, WORD_CARD_SELECT, WORD_SUMMARY_SELECT } from '../words/word-shape.js';
import { addDays, advanceStreak, dayKey, displayedStreak, localDay } from './days.js';
import { LEECH_LAPSES, masteryLevel, newStoredCard, previewDue, review, type StoredCard } from './srs.js';
import type { LearnQueueQuery, PracticeQuery, ReviewDto, StartCardDto } from './study.dto.js';

type StudyContext = {
  timezone: string;
  desiredRetention: number;
  dailyNewWords: number;
  dailyGoalCards: number;
  dailyGoalMinutes: number;
};

type DailyDelta = { newWords?: number; reviews?: number; correct?: number; durationMs?: number };

/** Study time counted per card is capped, so a card left open does not inflate the stats. */
const MAX_MS_PER_CARD = 60_000;

const cardSummary = (card: Pick<UserCard, 'state' | 'due' | 'masteryLevel' | 'isKnown' | 'reps' | 'lapses'>) => ({
  state: card.state,
  due: card.due,
  masteryLevel: card.masteryLevel,
  isKnown: card.isKnown,
  reps: card.reps,
  lapses: card.lapses,
});

@Injectable()
export class StudyService {
  constructor(private readonly prisma: PrismaService) {}

  private async context(userId: string): Promise<StudyContext> {
    const [user, settings] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } }),
      this.prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} }),
    ]);
    return {
      timezone: user.timezone,
      desiredRetention: settings.desiredRetention,
      dailyNewWords: settings.dailyNewWords,
      dailyGoalCards: settings.dailyGoalCards,
      dailyGoalMinutes: settings.dailyGoalMinutes,
    };
  }

  private wordFilter(q: { topic?: string; level?: string }): Prisma.WordWhereInput[] {
    const and: Prisma.WordWhereInput[] = [];
    if (q.topic) and.push(inTopic(q.topic));
    if (q.level) and.push({ cefrLevel: q.level as Prisma.WordWhereInput['cefrLevel'] });
    return and;
  }

  // ───────────── Learn new words (PLAN.md §3.3) ─────────────

  async learnQueue(userId: string, q: LearnQueueQuery) {
    const ctx = await this.context(userId);
    const where: Prisma.WordWhereInput = { AND: [...this.wordFilter(q), { cards: { none: { userId } } }] };
    const words = await this.prisma.word.findMany({
      where,
      orderBy: [{ cefrLevel: 'asc' }, { frequencyRank: { sort: 'asc', nulls: 'last' } }, { headword: 'asc' }],
      take: q.limit ?? ctx.dailyNewWords,
      select: WORD_CARD_SELECT,
    });
    // Wrong answers for the end-of-session quiz, taken from other words.
    const others = await this.prisma.word.findMany({
      where: { id: { notIn: words.map((w) => w.id) } },
      take: 40,
      select: { id: true, headword: true, definitionEn: true },
    });
    const today = await this.prisma.dailyStat.findUnique({
      where: { userId_date: { userId, date: localDay(new Date(), ctx.timezone) } },
      select: { newWords: true },
    });
    return {
      words: words.map(flattenTopics),
      distractors: shuffle(others).slice(0, 8),
      newToday: today?.newWords ?? 0,
      dailyNewWords: ctx.dailyNewWords,
    };
  }

  /** "Learn this word" or "I already know this". Idempotent. */
  async startCard(userId: string, dto: StartCardDto) {
    await this.assertWord(dto.wordId);
    const ctx = await this.context(userId);
    const key = { userId_wordId: { userId, wordId: dto.wordId } };
    const existing = await this.prisma.userCard.findUnique({ where: key });

    if (dto.action === 'known') {
      const card = await this.prisma.userCard.upsert({
        where: key,
        create: { userId, wordId: dto.wordId, ...newStoredCard(new Date()), isKnown: true, masteryLevel: 5 },
        update: { isKnown: true, masteryLevel: 5 },
      });
      return { card: cardSummary(card), today: await this.todaySummary(userId, ctx) };
    }

    if (existing) {
      const card = existing.isKnown
        ? await this.prisma.userCard.update({
            where: key,
            data: { isKnown: false, masteryLevel: masteryLevel({ ...existing, isKnown: false }) },
          })
        : existing;
      return { card: cardSummary(card), today: await this.todaySummary(userId, ctx) };
    }

    const card = await this.prisma.userCard.create({
      data: { userId, wordId: dto.wordId, ...newStoredCard(new Date()), masteryLevel: 1 },
    });
    return { card: cardSummary(card), today: await this.bumpDaily(userId, ctx, { newWords: 1 }) };
  }

  /** Forget a word: removes its card (and so its schedule). Review history is kept. */
  async resetCard(userId: string, wordId: string) {
    await this.prisma.userCard.deleteMany({ where: { userId, wordId } });
  }

  // ───────────── Flashcards (PLAN.md §3.4) ─────────────

  async reviewQueue(userId: string, limit = 50) {
    const ctx = await this.context(userId);
    const now = new Date();
    const where: Prisma.UserCardWhereInput = { userId, isKnown: false, isSuspended: false, due: { lte: now } };
    const [totalDue, cards] = await Promise.all([
      this.prisma.userCard.count({ where }),
      this.prisma.userCard.findMany({
        where,
        orderBy: { due: 'asc' },
        take: limit,
        include: { word: { select: WORD_CARD_SELECT } },
      }),
    ]);
    const notes = await this.notesFor(userId, cards.map((c) => c.wordId));
    return {
      totalDue,
      items: cards.map(({ word, ...card }) => ({
        word: { ...flattenTopics(word), note: notes.get(word.id) ?? null },
        card: cardSummary(card),
        preview: previewDue(card, now, ctx.desiredRetention),
      })),
    };
  }

  /** Practice cards: shuffled, and ratings never touch the schedule. */
  async practiceQueue(userId: string, q: PracticeQuery) {
    const ctx = await this.context(userId);
    const filter = this.wordFilter(q);
    const ids =
      (q.source ?? 'learned') === 'learned'
        ? (
            await this.prisma.userCard.findMany({
              where: { userId, word: { AND: filter } },
              select: { wordId: true },
              take: 500,
            })
          ).map((c) => c.wordId)
        : (await this.prisma.word.findMany({ where: { AND: filter }, select: { id: true }, take: 500 })).map(
            (w) => w.id,
          );
    const picked = shuffle(ids).slice(0, q.limit ?? 20);
    const words = await this.prisma.word.findMany({
      where: { id: { in: picked } },
      select: { ...WORD_CARD_SELECT, cards: { where: { userId } } },
    });
    const notes = await this.notesFor(userId, picked);
    const byId = new Map(words.map((w) => [w.id, w]));
    const now = new Date();
    return {
      items: picked.flatMap((id) => {
        const found = byId.get(id);
        if (!found) return [];
        const { cards, ...word } = found;
        const card = cards[0];
        return [
          {
            word: { ...flattenTopics(word), note: notes.get(id) ?? null },
            card: card ? cardSummary(card) : null,
            preview: previewDue(card ?? newStoredCard(now), now, ctx.desiredRetention),
          },
        ];
      }),
    };
  }

  async submitReview(userId: string, dto: ReviewDto) {
    await this.assertWord(dto.wordId);
    const ctx = await this.context(userId);
    const now = new Date();
    const key = { userId_wordId: { userId, wordId: dto.wordId } };
    const card = await this.prisma.userCard.findUnique({ where: key });
    const correct = dto.rating >= 3 ? 1 : 0;
    const durationMs = dto.durationMs;

    if (dto.mode === 'PRACTICE') {
      await this.prisma.reviewLog.create({
        data: {
          userId,
          wordId: dto.wordId,
          rating: dto.rating,
          mode: 'PRACTICE',
          stateBefore: card?.state ?? 'NEW',
          prevIntervalDays: card?.scheduledDays ?? 0,
          nextIntervalDays: card?.scheduledDays ?? 0,
          durationMs,
        },
      });
      const today = await this.bumpDaily(userId, ctx, { reviews: 1, correct, durationMs });
      return { card: card ? cardSummary(card) : null, today };
    }

    const before: StoredCard = card ?? newStoredCard(now);
    const next = review(before, dto.rating as Grade, now, ctx.desiredRetention);
    const derived = {
      masteryLevel: masteryLevel({ ...next, isKnown: card?.isKnown }),
      isLeech: next.lapses >= LEECH_LAPSES,
    };
    const [saved] = await this.prisma.$transaction([
      this.prisma.userCard.upsert({
        where: key,
        create: { userId, wordId: dto.wordId, ...next, ...derived },
        update: { ...next, ...derived },
      }),
      this.prisma.reviewLog.create({
        data: {
          userId,
          wordId: dto.wordId,
          rating: dto.rating,
          mode: dto.mode,
          stateBefore: before.state,
          prevIntervalDays: before.scheduledDays,
          nextIntervalDays: next.scheduledDays,
          durationMs,
        },
      }),
    ]);
    // A word reviewed without a card yet counts as a new word.
    const today = await this.bumpDaily(userId, ctx, card ? { reviews: 1, correct, durationMs } : { newWords: 1, correct, durationMs });
    return { card: cardSummary(saved), today };
  }

  // ───────────── Dashboard & progress (PLAN.md §3.8, §3.11) ─────────────

  async summary(userId: string) {
    const ctx = await this.context(userId);
    const now = new Date();
    const [dueCount, learnedCount, knownCount, totalWords, mastery, forecast, today, recent] = await Promise.all([
      this.prisma.userCard.count({ where: { userId, isKnown: false, isSuspended: false, due: { lte: now } } }),
      this.prisma.userCard.count({ where: { userId } }),
      this.prisma.userCard.count({ where: { userId, isKnown: true } }),
      this.prisma.word.count(),
      this.masteryCounts(userId),
      this.forecast(userId, ctx.timezone, 7),
      this.todaySummary(userId, ctx),
      this.prisma.userCard.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        select: { masteryLevel: true, isKnown: true, due: true, word: { select: WORD_SUMMARY_SELECT } },
      }),
    ]);
    return {
      dueCount,
      newAvailable: totalWords - learnedCount,
      learnedCount,
      knownCount,
      totalWords,
      mastery: { ...mastery, 0: totalWords - learnedCount },
      forecast,
      today,
      recent: recent.map(({ word, ...progress }) => ({ ...word, progress })),
    };
  }

  async progress(userId: string) {
    const ctx = await this.context(userId);
    const now = new Date();
    const todayDay = localDay(now, ctx.timezone);
    const yearAgo = addDays(todayDay, -364);

    const [stats, mastery, forecast, levelTotals, cards, byTopic, recentLogs, totalReviews, today] =
      await Promise.all([
        this.prisma.dailyStat.findMany({
          where: { userId, date: { gte: yearAgo } },
          orderBy: { date: 'asc' },
          select: { date: true, newWords: true, reviews: true, activeSeconds: true, goalMet: true },
        }),
        this.masteryCounts(userId),
        this.forecast(userId, ctx.timezone, 7),
        this.prisma.word.groupBy({ by: ['cefrLevel'], _count: { _all: true } }),
        this.prisma.userCard.findMany({
          where: { userId },
          select: { masteryLevel: true, word: { select: { cefrLevel: true } } },
        }),
        this.prisma.$queryRaw<{ slug: string; nameEn: string; nameVi: string; total: bigint; learned: bigint }[]>`
          SELECT t.slug, t."nameEn", t."nameVi",
                 count(DISTINCT wt."wordId") AS total,
                 count(DISTINCT uc."wordId") AS learned
          FROM topics t
          JOIN topics c ON c.id = t.id OR c."parentId" = t.id
          JOIN word_topics wt ON wt."topicId" = c.id
          LEFT JOIN user_cards uc ON uc."wordId" = wt."wordId" AND uc."userId" = ${userId}::uuid
          WHERE t."parentId" IS NULL
          GROUP BY t.id
          ORDER BY t."sortOrder"`,
        this.prisma.reviewLog.findMany({
          where: { userId, reviewedAt: { gte: addDays(todayDay, -7 * 8) }, mode: { not: 'PRACTICE' } },
          select: { rating: true, reviewedAt: true },
        }),
        this.prisma.reviewLog.count({ where: { userId } }),
        this.todaySummary(userId, ctx),
      ]);

    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
    const byLevel = levels.map((level) => {
      const mine = cards.filter((c) => c.word.cefrLevel === level);
      return {
        level,
        total: levelTotals.find((r) => r.cefrLevel === level)?._count._all ?? 0,
        learned: mine.length,
        mastered: mine.filter((c) => c.masteryLevel >= 4).length,
      };
    });

    // Recall rate per week (weeks start on Monday, in the learner's timezone).
    const weeks = new Map<string, { total: number; correct: number }>();
    for (const log of recentLogs) {
      const day = localDay(log.reviewedAt, ctx.timezone);
      const monday = dayKey(addDays(day, -((day.getUTCDay() + 6) % 7)));
      const w = weeks.get(monday) ?? { total: 0, correct: 0 };
      w.total++;
      if (log.rating >= 3) w.correct++;
      weeks.set(monday, w);
    }

    return {
      heatmap: stats.map((s) => ({
        date: dayKey(s.date),
        count: s.newWords + s.reviews,
        seconds: s.activeSeconds,
        goalMet: s.goalMet,
      })),
      mastery: { ...mastery, 0: levelTotals.reduce((n, r) => n + r._count._all, 0) - cards.length },
      byLevel,
      byTopic: byTopic
        .map((t) => ({ slug: t.slug, nameEn: t.nameEn, nameVi: t.nameVi, total: Number(t.total), learned: Number(t.learned) }))
        .filter((t) => t.total > 0),
      forecast,
      weeklyRecall: [...weeks.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, w]) => ({ week, total: w.total, rate: w.correct / w.total })),
      totals: {
        reviews: totalReviews,
        seconds: stats.reduce((n, s) => n + s.activeSeconds, 0),
        learned: cards.length,
        daysStudied: stats.filter((s) => s.newWords + s.reviews > 0).length,
      },
      today,
    };
  }

  // ───────────── Helpers ─────────────

  private async assertWord(wordId: string) {
    const word = await this.prisma.word.findUnique({ where: { id: wordId }, select: { id: true } });
    if (!word) throw new NotFoundException('No such word');
  }

  private async notesFor(userId: string, wordIds: string[]) {
    if (wordIds.length === 0) return new Map<string, string>();
    const notes = await this.prisma.note.findMany({
      where: { userId, wordId: { in: wordIds } },
      orderBy: { updatedAt: 'asc' },
      select: { wordId: true, content: true },
    });
    return new Map(notes.map((n) => [n.wordId as string, n.content]));
  }

  /** Card counts per mastery level 1..5 (level 0 = words without a card, added by callers). */
  private async masteryCounts(userId: string) {
    const rows = await this.prisma.userCard.groupBy({
      by: ['masteryLevel'],
      where: { userId },
      _count: { _all: true },
    });
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of rows) counts[r.masteryLevel] = r._count._all;
    return counts;
  }

  /** Reviews due per day for the next `days` days; overdue cards count for today. */
  private async forecast(userId: string, timezone: string, days: number) {
    const today = localDay(new Date(), timezone);
    const end = addDays(today, days + 1); // generous bound; exact bucketing below
    const cards = await this.prisma.userCard.findMany({
      where: { userId, isKnown: false, isSuspended: false, due: { lt: end } },
      select: { due: true },
    });
    const buckets = Array.from({ length: days }, (_, i) => ({ date: dayKey(addDays(today, i)), count: 0 }));
    for (const c of cards) {
      const offset = Math.max(0, Math.round((localDay(c.due, timezone).getTime() - today.getTime()) / 86_400_000));
      if (offset < days) buckets[offset].count++;
    }
    return buckets;
  }

  private async todaySummary(userId: string, ctx: StudyContext) {
    const day = localDay(new Date(), ctx.timezone);
    const [stat, streak] = await Promise.all([
      this.prisma.dailyStat.findUnique({ where: { userId_date: { userId, date: day } } }),
      this.prisma.userStreak.findUnique({ where: { userId } }),
    ]);
    return this.formatToday(stat, streak, day, ctx);
  }

  private formatToday(
    stat: { newWords: number; reviews: number; correct: number; activeSeconds: number; goalMet: boolean } | null,
    streak: { current: number; longest: number; lastActiveDate: Date | null } | null,
    day: Date,
    ctx: StudyContext,
  ) {
    return {
      date: dayKey(day),
      newWords: stat?.newWords ?? 0,
      reviews: stat?.reviews ?? 0,
      correct: stat?.correct ?? 0,
      activeSeconds: stat?.activeSeconds ?? 0,
      goalMet: stat?.goalMet ?? false,
      goalCards: ctx.dailyGoalCards,
      goalMinutes: ctx.dailyGoalMinutes,
      streak: streak ? displayedStreak(streak, day) : 0,
      longestStreak: streak?.longest ?? 0,
    };
  }

  /** Adds to today's DailyStat; the first time today's goal is met, the streak advances. */
  private async bumpDaily(userId: string, ctx: StudyContext, delta: DailyDelta) {
    const day = localDay(new Date(), ctx.timezone);
    const seconds = Math.round(Math.min(delta.durationMs ?? 0, MAX_MS_PER_CARD) / 1000);
    const increments = {
      newWords: delta.newWords ?? 0,
      reviews: delta.reviews ?? 0,
      correct: delta.correct ?? 0,
      activeSeconds: seconds,
    };
    let stat = await this.prisma.dailyStat.upsert({
      where: { userId_date: { userId, date: day } },
      create: { userId, date: day, ...increments },
      update: Object.fromEntries(Object.entries(increments).map(([k, v]) => [k, { increment: v }])),
    });

    let streak = await this.prisma.userStreak.findUnique({ where: { userId } });
    const met =
      stat.newWords + stat.reviews >= ctx.dailyGoalCards || stat.activeSeconds >= ctx.dailyGoalMinutes * 60;
    if (met && !stat.goalMet) {
      stat = await this.prisma.dailyStat.update({
        where: { userId_date: { userId, date: day } },
        data: { goalMet: true },
      });
      const next = advanceStreak(streak ?? { current: 0, longest: 0, lastActiveDate: null }, day);
      streak = await this.prisma.userStreak.upsert({
        where: { userId },
        create: { userId, ...next },
        update: next,
      });
    }
    return this.formatToday(stat, streak, day, ctx);
  }
}
