import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { wordSlug } from '../words/import/import-format.js';
import { inTopic } from '../words/word-shape.js';
import type { ListAdminWordsQuery, UpdateWordDto } from './admin.dto.js';
import { AuditService, changes } from './audit.service.js';

const EDIT_SELECT = {
  id: true,
  slug: true,
  headword: true,
  pos: true,
  senseNo: true,
  ipa: true,
  cefrLevel: true,
  definitionEn: true,
  meaningVi: true,
  synonyms: true,
  antonyms: true,
  collocations: true,
  audioUrl: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  examples: { orderBy: { sortOrder: 'asc' }, select: { sentence: true, translationVi: true } },
  topics: { select: { topic: { select: { id: true, slug: true, nameEn: true, nameVi: true } } } },
} satisfies Prisma.WordSelect;

type Db = Prisma.TransactionClient;

/** Trims text fields; an empty optional text becomes null. */
function clean(dto: UpdateWordDto) {
  const opt = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  const list = (v: string[] | undefined) => (v === undefined ? undefined : [...new Set(v.map((s) => s.trim()).filter(Boolean))]);
  return {
    headword: dto.headword?.trim(),
    pos: dto.pos?.trim().toLowerCase(),
    senseNo: dto.senseNo,
    ipa: opt(dto.ipa),
    cefrLevel: dto.cefrLevel,
    definitionEn: dto.definitionEn?.trim(),
    meaningVi: opt(dto.meaningVi),
    synonyms: list(dto.synonyms),
    antonyms: list(dto.antonyms),
    collocations: list(dto.collocations),
    source: opt(dto.source),
  };
}

@Injectable()
export class AdminWordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListAdminWordsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const and: Prisma.WordWhereInput[] = [];
    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { headword: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q.toLowerCase() } },
          { meaningVi: { contains: q, mode: 'insensitive' } },
          { definitionEn: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.level) and.push({ cefrLevel: query.level });
    if (query.topic) and.push(inTopic(query.topic));
    if (query.pos) and.push({ pos: query.pos.toLowerCase() });
    if (query.reported) and.push({ feedback: { some: { status: { in: ['OPEN', 'IN_PROGRESS'] } } } });
    const where: Prisma.WordWhereInput = { AND: and };
    const orderBy: Prisma.WordOrderByWithRelationInput[] =
      query.sort === 'recent'
        ? [{ updatedAt: 'desc' }, { id: 'asc' }]
        : query.sort === 'level'
          ? [{ cefrLevel: 'asc' }, { headword: 'asc' }, { id: 'asc' }]
          : [{ headword: 'asc' }, { pos: 'asc' }, { senseNo: 'asc' }, { id: 'asc' }];

    const [total, words] = await Promise.all([
      this.prisma.word.count({ where }),
      this.prisma.word.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          slug: true,
          headword: true,
          pos: true,
          senseNo: true,
          cefrLevel: true,
          definitionEn: true,
          meaningVi: true,
          updatedAt: true,
          _count: { select: { cards: true, examples: true } },
          feedback: { where: { status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } },
        },
      }),
    ]);
    const items = words.map(({ _count, feedback, ...w }) => ({
      ...w,
      learners: _count.cards,
      examples: _count.examples,
      openReports: feedback.length,
    }));
    return { items, total, page, pageSize };
  }

  /** Distinct parts of speech, for the filter. */
  async partsOfSpeech() {
    const rows = await this.prisma.word.groupBy({ by: ['pos'], _count: { _all: true }, orderBy: { pos: 'asc' } });
    return rows.map((r) => ({ pos: r.pos, count: r._count._all }));
  }

  async detail(id: string) {
    const word = await this.prisma.word.findUnique({ where: { id }, select: EDIT_SELECT });
    if (!word) throw new NotFoundException('No such word');
    const [learners, notes, reviews, openReports, sameHeadword] = await Promise.all([
      this.prisma.userCard.count({ where: { wordId: id } }),
      this.prisma.note.count({ where: { wordId: id } }),
      this.prisma.reviewLog.count({ where: { wordId: id } }),
      this.prisma.feedback.count({ where: { wordId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      // Merge candidates: the other entries with the same headword (any case).
      this.prisma.word.findMany({
        where: { headword: { equals: word.headword, mode: 'insensitive' }, NOT: { id } },
        orderBy: [{ pos: 'asc' }, { senseNo: 'asc' }],
        select: { id: true, slug: true, headword: true, pos: true, senseNo: true, cefrLevel: true, definitionEn: true },
      }),
    ]);
    return {
      ...word,
      topics: word.topics.map((t) => t.topic),
      counts: { learners, notes, reviews, openReports },
      sameHeadword,
    };
  }

  private async assertTopics(ids: string[] | undefined) {
    if (!ids?.length) return;
    const found = await this.prisma.topic.count({ where: { id: { in: ids } } });
    if (found !== new Set(ids).size) throw new BadRequestException('Unknown topic id');
  }

  /** A free slug for a new word: "bank-noun-2", or "bank-noun-2-2" if taken. */
  private async freeSlug(w: { headword: string; pos: string; sense_no: number }) {
    const base = wordSlug(w) || 'word';
    const taken = new Set(
      (await this.prisma.word.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((x) => x.slug),
    );
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    return slug;
  }

  private async replaceRelations(tx: Db, wordId: string, dto: UpdateWordDto) {
    if (dto.examples) {
      await tx.example.deleteMany({ where: { wordId } });
      if (dto.examples.length > 0) {
        await tx.example.createMany({
          data: dto.examples.map((e, sortOrder) => ({
            wordId,
            sentence: e.sentence.trim(),
            translationVi: e.translationVi?.trim() || null,
            sortOrder,
          })),
        });
      }
    }
    if (dto.topicIds) {
      await tx.wordTopic.deleteMany({ where: { wordId } });
      if (dto.topicIds.length > 0) {
        await tx.wordTopic.createMany({
          data: [...new Set(dto.topicIds)].map((topicId) => ({ wordId, topicId })),
        });
      }
    }
  }

  async create(adminId: string, dto: UpdateWordDto) {
    const data = clean(dto);
    if (!data.headword || !data.pos || !data.cefrLevel || !data.definitionEn) {
      throw new BadRequestException('headword, pos, cefrLevel and definitionEn are required');
    }
    await this.assertTopics(dto.topicIds);
    const senseNo = data.senseNo ?? 1;
    const exists = await this.prisma.word.findUnique({
      where: { headword_pos_senseNo: { headword: data.headword, pos: data.pos, senseNo } },
      select: { slug: true },
    });
    if (exists) throw new ConflictException(`This word already exists (${exists.slug})`);
    const slug = await this.freeSlug({ headword: data.headword, pos: data.pos, sense_no: senseNo });

    const id = await this.prisma.$transaction(async (tx) => {
      const word = await tx.word.create({
        data: {
          ...data,
          headword: data.headword as string,
          pos: data.pos as string,
          cefrLevel: data.cefrLevel as NonNullable<typeof data.cefrLevel>,
          definitionEn: data.definitionEn as string,
          senseNo,
          slug,
          source: data.source ?? 'admin',
        },
        select: { id: true },
      });
      await this.replaceRelations(tx, word.id, dto);
      await this.audit.record(adminId, 'word.create', { type: 'word', id: word.id, name: slug }, undefined, tx);
      return word.id;
    });
    return this.detail(id);
  }

  /**
   * Edits a word. Its slug stays the same even when the headword, part of
   * speech or sense number changes, so links and bookmarks keep working.
   */
  async update(adminId: string, id: string, dto: UpdateWordDto) {
    const before = await this.prisma.word.findUnique({ where: { id }, select: EDIT_SELECT });
    if (!before) throw new NotFoundException('No such word');
    await this.assertTopics(dto.topicIds);
    const data = clean(dto);

    const beforeFlat = {
      ...before,
      examples: before.examples.map((e) => ({ sentence: e.sentence, translationVi: e.translationVi })),
      topicIds: before.topics.map((t) => t.topic.id).sort(),
    };
    const afterFlat = {
      ...data,
      examples: dto.examples?.map((e) => ({ sentence: e.sentence.trim(), translationVi: e.translationVi?.trim() || null })),
      topicIds: dto.topicIds ? [...new Set(dto.topicIds)].sort() : undefined,
    };
    const diff = changes(beforeFlat, afterFlat);
    if (Object.keys(diff).length === 0) return this.detail(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.word.update({ where: { id }, data });
      await this.replaceRelations(tx, id, dto);
      await this.audit.record(
        adminId,
        'word.update',
        { type: 'word', id, name: before.slug },
        diff as Prisma.InputJsonValue,
        tx,
      );
    });
    return this.detail(id);
  }

  /**
   * Deletes a word. Learners' cards and review history for it go with it;
   * their notes stay in the notebook, titled with the headword.
   */
  async remove(adminId: string, id: string) {
    const word = await this.prisma.word.findUnique({
      where: { id },
      select: { slug: true, headword: true, _count: { select: { cards: true, reviewLogs: true } } },
    });
    if (!word) throw new NotFoundException('No such word');
    await this.prisma.$transaction(async (tx) => {
      await tx.note.updateMany({ where: { wordId: id, title: null }, data: { title: word.headword } });
      await tx.word.delete({ where: { id } });
      await this.audit.record(
        adminId,
        'word.delete',
        { type: 'word', id, name: word.slug },
        { cards: word._count.cards, reviews: word._count.reviewLogs },
        tx,
      );
    });
  }

  /**
   * Merges a duplicate entry (`id`) into another (`intoId`) and deletes it.
   * Moves to the kept word: learners' cards (where a learner has both, the
   * card with more reviews wins), review history, notes (two notes are joined),
   * topic links, new example sentences and reports.
   */
  async merge(adminId: string, id: string, intoId: string) {
    if (id === intoId) throw new BadRequestException('A word cannot be merged into itself');
    const [from, into] = await Promise.all([
      this.prisma.word.findUnique({ where: { id }, select: { slug: true } }),
      this.prisma.word.findUnique({ where: { id: intoId }, select: { slug: true } }),
    ]);
    if (!from || !into) throw new NotFoundException('No such word');

    const moved = await this.prisma.$transaction(
      async (tx) => {
        // Cards: (userId, wordId) is the key, so a learner with both keeps one.
        const fromCards = await tx.userCard.findMany({ where: { wordId: id }, select: { userId: true, reps: true } });
        const intoCards = new Map(
          (
            await tx.userCard.findMany({
              where: { wordId: intoId, userId: { in: fromCards.map((c) => c.userId) } },
              select: { userId: true, reps: true },
            })
          ).map((c) => [c.userId, c.reps]),
        );
        const dropFrom: string[] = [];
        const dropInto: string[] = [];
        for (const c of fromCards) {
          const kept = intoCards.get(c.userId);
          if (kept === undefined) continue;
          if (c.reps > kept) dropInto.push(c.userId);
          else dropFrom.push(c.userId);
        }
        if (dropInto.length) await tx.userCard.deleteMany({ where: { wordId: intoId, userId: { in: dropInto } } });
        if (dropFrom.length) await tx.userCard.deleteMany({ where: { wordId: id, userId: { in: dropFrom } } });
        const cards = await tx.userCard.updateMany({ where: { wordId: id }, data: { wordId: intoId } });

        const reviews = await tx.reviewLog.updateMany({ where: { wordId: id }, data: { wordId: intoId } });

        // Notes: one per (user, word). Where a learner has both, join the texts.
        const fromNotes = await tx.note.findMany({ where: { wordId: id }, select: { id: true, userId: true, content: true } });
        for (const note of fromNotes) {
          const kept = await tx.note.findUnique({
            where: { userId_wordId: { userId: note.userId, wordId: intoId } },
            select: { id: true, content: true },
          });
          if (kept) {
            await tx.note.update({ where: { id: kept.id }, data: { content: `${kept.content}\n\n${note.content}` } });
            await tx.note.delete({ where: { id: note.id } });
          } else {
            await tx.note.update({ where: { id: note.id }, data: { wordId: intoId } });
          }
        }

        const topics = await tx.wordTopic.findMany({ where: { wordId: id }, select: { topicId: true } });
        if (topics.length) {
          await tx.wordTopic.createMany({
            data: topics.map((t) => ({ wordId: intoId, topicId: t.topicId })),
            skipDuplicates: true,
          });
        }

        const [fromExamples, intoExamples] = await Promise.all([
          tx.example.findMany({ where: { wordId: id }, orderBy: { sortOrder: 'asc' } }),
          tx.example.findMany({ where: { wordId: intoId }, select: { sentence: true, sortOrder: true } }),
        ]);
        const known = new Set(intoExamples.map((e) => e.sentence.trim().toLowerCase()));
        let next = Math.max(-1, ...intoExamples.map((e) => e.sortOrder)) + 1;
        const newExamples = fromExamples.filter((e) => !known.has(e.sentence.trim().toLowerCase()));
        for (const e of newExamples) {
          await tx.example.update({ where: { id: e.id }, data: { wordId: intoId, sortOrder: next++ } });
        }

        const reports = await tx.feedback.updateMany({ where: { wordId: id }, data: { wordId: intoId } });
        await tx.word.delete({ where: { id } });

        const summary = {
          into: into.slug,
          cards: cards.count,
          droppedCards: dropFrom.length + dropInto.length,
          reviews: reviews.count,
          notes: fromNotes.length,
          examples: newExamples.length,
          reports: reports.count,
        };
        await this.audit.record(adminId, 'word.merge', { type: 'word', id, name: from.slug }, summary, tx);
        return summary;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    return moved;
  }
}
