import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { publicOrigin } from '../auth/google.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MailerService } from '../mail/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HOUR, RateLimitService } from '../rate-limit/rate-limit.service.js';
import { type CreateFeedbackDto, type FeedbackStatus, type FeedbackType, WORD_FEEDBACK_TYPES } from './feedback.dto.js';

/** Reply emails per day, site-wide: they share the Gmail quota with sign-up and reset mail. */
export const REPLY_MAILS_PER_DAY = 100;

const MINE_SELECT = {
  id: true,
  type: true,
  message: true,
  status: true,
  reply: true,
  repliedAt: true,
  replySeenAt: true,
  createdAt: true,
  word: { select: { slug: true, headword: true, pos: true } },
} satisfies Prisma.FeedbackSelect;

const COPY = {
  vi: {
    subject: 'Godee đã trả lời góp ý của bạn',
    body: 'Đội ngũ Godee vừa trả lời một góp ý bạn gửi. Mở trang dưới đây để đọc câu trả lời:',
  },
  en: {
    subject: 'Godee replied to your feedback',
    body: 'The Godee team has replied to feedback you sent. Open this page to read the reply:',
  },
} as const;

/**
 * The email that tells a learner there is a reply. It holds neither the reply
 * nor their message (house rule: no free text in our emails), only a link.
 */
export function replyMail(locale: 'vi' | 'en', url: string) {
  const c = COPY[locale];
  return { subject: c.subject, text: `${locale === 'vi' ? 'Chào bạn,' : 'Hi,'}\n\n${c.body}\n\n${url}\n\n— Godee` };
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly limits: RateLimitService,
    private readonly config: ConfigService,
  ) {}

  /** A learner sends feedback or reports a word. At most 10 an hour and 30 a day. */
  async create(userId: string, dto: CreateFeedbackDto) {
    const forWord = WORD_FEEDBACK_TYPES.includes(dto.type);
    if (forWord && !dto.wordSlug) throw new BadRequestException('wordSlug is required for a word report');
    await this.limits.consume(
      { bucket: 'feedback', id: userId, limit: 10, windowMs: HOUR },
      { bucket: 'feedback-day', id: userId, limit: 30, windowMs: 24 * HOUR },
    );
    let wordId: string | null = null;
    if (dto.wordSlug) {
      const word = await this.prisma.word.findUnique({ where: { slug: dto.wordSlug }, select: { id: true } });
      if (!word) throw new NotFoundException(`No word "${dto.wordSlug}"`);
      wordId = word.id;
    }
    return this.prisma.feedback.create({
      data: { userId, type: dto.type, wordId, message: dto.message.trim(), pagePath: dto.pagePath ?? null },
      select: { id: true },
    });
  }

  /** The learner's own feedback (newest first) and how many replies they haven't opened. */
  async mine(userId: string) {
    const [items, unread] = await Promise.all([
      this.prisma.feedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: MINE_SELECT,
      }),
      this.unreadCount(userId),
    ]);
    return { items, unread };
  }

  unreadCount(userId: string) {
    return this.prisma.feedback.count({ where: { userId, reply: { not: null }, replySeenAt: null } });
  }

  async markSeen(userId: string) {
    await this.prisma.feedback.updateMany({
      where: { userId, reply: { not: null }, replySeenAt: null },
      data: { replySeenAt: new Date() },
    });
  }

  // ───────────────────────────── Admin side ─────────────────────────────

  async list(query: {
    page?: number;
    pageSize?: number;
    status?: FeedbackStatus;
    type?: FeedbackType | 'WORD';
    wordId?: string;
    userId?: string;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const base: Prisma.FeedbackWhereInput = {
      type: query.type === 'WORD' ? { in: [...WORD_FEEDBACK_TYPES] } : query.type,
      wordId: query.wordId,
      userId: query.userId,
    };
    const where: Prisma.FeedbackWhereInput = { ...base, status: query.status };
    const [total, items, byStatus] = await Promise.all([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        // Open first within the same status filter, then newest.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          type: true,
          message: true,
          pagePath: true,
          status: true,
          reply: true,
          repliedAt: true,
          replySeenAt: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          repliedBy: { select: { id: true, name: true } },
          word: { select: { id: true, slug: true, headword: true, pos: true, senseNo: true } },
        },
      }),
      this.prisma.feedback.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Partial<
      Record<FeedbackStatus, number>
    >;
    return { items, total, page, pageSize, counts };
  }

  /**
   * Changes the status and/or the reply. A new or changed reply is shown to
   * the learner as unread; with `notify`, they also get an email saying so
   * (verified addresses only, at most REPLY_MAILS_PER_DAY a day site-wide).
   */
  async update(adminId: string, id: string, dto: { status?: FeedbackStatus; reply?: string; notify?: boolean }) {
    const before = await this.prisma.feedback.findUnique({
      where: { id },
      select: {
        status: true,
        reply: true,
        user: { select: { id: true, email: true, emailVerifiedAt: true, locale: true, disabledAt: true } },
      },
    });
    if (!before) throw new NotFoundException('No such feedback');

    const reply = dto.reply === undefined ? undefined : dto.reply.trim() || null;
    const replyChanged = reply !== undefined && reply !== before.reply;
    const saved = await this.prisma.feedback.update({
      where: { id },
      data: {
        status: dto.status,
        ...(replyChanged
          ? { reply, repliedAt: reply ? new Date() : null, repliedById: reply ? adminId : null, replySeenAt: null }
          : {}),
      },
      select: { id: true, status: true, reply: true, repliedAt: true },
    });

    let mailed = false;
    const user = before.user;
    if (dto.notify && saved.reply && user?.emailVerifiedAt && !user.disabledAt) {
      const { allowed } = await this.limits.hit({
        bucket: 'feedback-reply-mail',
        id: 'site',
        limit: REPLY_MAILS_PER_DAY,
        windowMs: 24 * HOUR,
      });
      if (allowed) {
        const origin = publicOrigin(this.config.get<string>('FRONTEND_URL', 'http://localhost:3300'));
        await this.mailer.send({ to: user.email, ...replyMail(user.locale, `${origin}/${user.locale}/feedback`) });
        mailed = true;
      }
    }

    return {
      feedback: saved,
      mailed,
      changes: {
        ...(dto.status !== undefined && dto.status !== before.status ? { status: [before.status, dto.status] } : {}),
        ...(replyChanged ? { reply: [before.reply, reply] } : {}),
      },
    };
  }
}
