import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { recallProbability } from '../study/srs.js';
import type { ListWordsQuery, WordStatus } from './words.dto.js';
import { inTopic, WORD_SUMMARY_SELECT } from './word-shape.js';

const DEFAULT_PAGE_SIZE = 24;

/** Card fields shown next to a word in lists. */
const PROGRESS_SELECT = {
  state: true,
  due: true,
  masteryLevel: true,
  isKnown: true,
  isStarred: true,
  updatedAt: true,
} satisfies Prisma.UserCardSelect;

/** Card conditions for each status (relative to one user). */
function cardFilter(status: Exclude<WordStatus, 'all' | 'new'>, userId: string): Prisma.UserCardWhereInput {
  switch (status) {
    case 'learned':
      return { userId };
    case 'learning':
      return { userId, isKnown: false };
    case 'known':
      return { userId, isKnown: true };
    case 'due':
      return { userId, isKnown: false, isSuspended: false, due: { lte: new Date() } };
  }
}

@Injectable()
export class WordsService {
  constructor(private readonly prisma: PrismaService) {}

  private wordFilter(query: ListWordsQuery): Prisma.WordWhereInput {
    const and: Prisma.WordWhereInput[] = [];
    if (query.topic) and.push(inTopic(query.topic));
    if (query.level) and.push({ cefrLevel: query.level });
    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { headword: { contains: q, mode: 'insensitive' } },
          { meaningVi: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    return { AND: and };
  }

  async list(query: ListWordsQuery, userId?: string) {
    const status = query.status ?? 'all';
    if (status !== 'all' && !userId) throw new UnauthorizedException('Sign in to filter by status');

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = this.wordFilter(query);
    const counts = userId ? this.counts(where, userId) : this.prisma.word.count({ where }).then((all) => ({ all }));

    if (status === 'all' || status === 'new') {
      const filtered: Prisma.WordWhereInput =
        status === 'new' ? { AND: [where, { cards: { none: { userId } } }] } : where;
      const orderBy: Prisma.WordOrderByWithRelationInput[] =
        query.sort === 'level' ? [{ cefrLevel: 'asc' }, { headword: 'asc' }] : [{ headword: 'asc' }, { senseNo: 'asc' }];
      const [total, words] = await Promise.all([
        this.prisma.word.count({ where: filtered }),
        this.prisma.word.findMany({
          where: filtered,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            ...WORD_SUMMARY_SELECT,
            ...(userId ? { cards: { where: { userId }, select: PROGRESS_SELECT } } : {}),
          },
        }),
      ]);
      const items = words.map(({ cards, ...word }) => ({ ...word, progress: cards?.[0] ?? null }));
      return { items, total, page, pageSize, counts: await counts };
    }

    // Statuses about the learner's own cards: list cards, so they can be ordered by card fields.
    const cardWhere: Prisma.UserCardWhereInput = { ...cardFilter(status, userId as string), word: where };
    const orderBy: Prisma.UserCardOrderByWithRelationInput[] =
      query.sort === 'az'
        ? [{ word: { headword: 'asc' } }]
        : query.sort === 'level'
          ? [{ word: { cefrLevel: 'asc' } }, { word: { headword: 'asc' } }]
          : query.sort === 'due'
            ? [{ due: 'asc' }]
            : query.sort === 'mastery'
              ? [{ masteryLevel: 'asc' }, { due: 'asc' }]
              : [{ updatedAt: 'desc' }];
    const [total, cards] = await Promise.all([
      this.prisma.userCard.count({ where: cardWhere }),
      this.prisma.userCard.findMany({
        where: cardWhere,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { ...PROGRESS_SELECT, word: { select: WORD_SUMMARY_SELECT } },
      }),
    ]);
    const items = cards.map(({ word, ...progress }) => ({ ...word, progress }));
    return { items, total, page, pageSize, counts: await counts };
  }

  /** Word counts per status for the list tabs. */
  private async counts(where: Prisma.WordWhereInput, userId: string) {
    const card = (status: Exclude<WordStatus, 'all' | 'new'>) =>
      this.prisma.userCard.count({ where: { ...cardFilter(status, userId), word: where } });
    const [all, learned, learning, known, due] = await Promise.all([
      this.prisma.word.count({ where }),
      card('learned'),
      card('learning'),
      card('known'),
      card('due'),
    ]);
    return { all, new: all - learned, learned, learning, known, due };
  }

  async detail(slug: string, userId?: string) {
    const word = await this.prisma.word.findUnique({
      where: { slug },
      select: {
        ...WORD_SUMMARY_SELECT,
        senseNo: true,
        synonyms: true,
        antonyms: true,
        collocations: true,
        imageUrl: true,
        source: true,
        examples: { orderBy: { sortOrder: 'asc' }, select: { id: true, sentence: true, translationVi: true } },
        topics: {
          select: {
            topic: { select: { slug: true, nameEn: true, nameVi: true, parent: { select: { slug: true } } } },
          },
        },
      },
    });
    if (!word) throw new NotFoundException(`No word "${slug}"`);

    // Other senses of the same headword, e.g. "bank" (noun) and "bank" (verb).
    const otherSenses = await this.prisma.word.findMany({
      where: { headword: word.headword, NOT: { id: word.id } },
      orderBy: [{ pos: 'asc' }, { senseNo: 'asc' }],
      select: { slug: true, pos: true, senseNo: true, definitionEn: true },
    });

    const base = {
      ...word,
      topics: word.topics.map(({ topic }) => ({
        slug: topic.slug,
        nameEn: topic.nameEn,
        nameVi: topic.nameVi,
        parentSlug: topic.parent?.slug ?? null,
      })),
      otherSenses,
    };
    if (!userId) return { ...base, progress: null, note: null, history: [] };

    const [card, note, history, settings] = await Promise.all([
      this.prisma.userCard.findUnique({ where: { userId_wordId: { userId, wordId: word.id } } }),
      this.prisma.note.findFirst({
        where: { userId, wordId: word.id },
        orderBy: { updatedAt: 'desc' },
        select: { content: true, updatedAt: true },
      }),
      this.prisma.reviewLog.findMany({
        where: { userId, wordId: word.id },
        orderBy: { reviewedAt: 'desc' },
        take: 20,
        select: { rating: true, mode: true, reviewedAt: true, nextIntervalDays: true },
      }),
      this.prisma.userSettings.findUnique({ where: { userId }, select: { desiredRetention: true } }),
    ]);

    const progress = card && {
      state: card.state,
      due: card.due,
      masteryLevel: card.masteryLevel,
      isKnown: card.isKnown,
      isLeech: card.isLeech,
      reps: card.reps,
      lapses: card.lapses,
      lastReviewAt: card.lastReviewAt,
      recall: card.isKnown ? null : recallProbability(card, new Date(), settings?.desiredRetention ?? 0.9),
    };
    return { ...base, progress, note, history };
  }

  async saveNote(slug: string, userId: string, content: string) {
    const word = await this.prisma.word.findUnique({ where: { slug }, select: { id: true } });
    if (!word) throw new NotFoundException(`No word "${slug}"`);
    const text = content.trim();

    const existing = await this.prisma.note.findFirst({ where: { userId, wordId: word.id }, select: { id: true } });
    if (!text) {
      if (existing) await this.prisma.note.delete({ where: { id: existing.id } });
      return { note: null };
    }
    const note = existing
      ? await this.prisma.note.update({ where: { id: existing.id }, data: { content: text } })
      : await this.prisma.note.create({ data: { userId, wordId: word.id, content: text } });
    return { note: { content: note.content, updatedAt: note.updatedAt } };
  }

  /** Word counts per CEFR level. */
  async levels() {
    const rows = await this.prisma.word.groupBy({ by: ['cefrLevel'], _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.cefrLevel, r._count._all]));
  }
}
