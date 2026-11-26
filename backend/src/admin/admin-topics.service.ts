import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateTopicDto } from './admin.dto.js';
import { AuditService, changes } from './audit.service.js';

const TOPIC_SELECT = {
  id: true,
  slug: true,
  nameEn: true,
  nameVi: true,
  descriptionEn: true,
  descriptionVi: true,
  icon: true,
  sortOrder: true,
  parentId: true,
} satisfies Prisma.TopicSelect;

function clean(dto: UpdateTopicDto) {
  const opt = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
  return {
    slug: dto.slug,
    nameEn: dto.nameEn?.trim(),
    nameVi: dto.nameVi?.trim(),
    descriptionEn: opt(dto.descriptionEn),
    descriptionVi: opt(dto.descriptionVi),
    icon: opt(dto.icon),
    parentId: dto.parentId,
  };
}

/**
 * Topics are two levels deep (PLAN.md §8): a topic's parent must be a
 * top-level topic, and a topic with subtopics can't become a subtopic.
 */
@Injectable()
export class AdminTopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Top-level topics in order, each with its subtopics; word counts are direct links. */
  async tree() {
    const topics = await this.prisma.topic.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }],
      select: { ...TOPIC_SELECT, _count: { select: { words: true } } },
    });
    const flat = topics.map(({ _count, ...t }) => ({ ...t, words: _count.words }));
    return flat
      .filter((t) => t.parentId === null)
      .map((t) => ({ ...t, children: flat.filter((c) => c.parentId === t.id) }));
  }

  private async assertParent(parentId: string | null | undefined, selfId?: string) {
    if (!parentId) return;
    if (parentId === selfId) throw new BadRequestException('A topic cannot be its own parent');
    const parent = await this.prisma.topic.findUnique({ where: { id: parentId }, select: { parentId: true } });
    if (!parent) throw new BadRequestException('Unknown parent topic');
    if (parent.parentId) throw new BadRequestException('Topics are two levels deep: pick a top-level parent');
  }

  private async nextSortOrder(parentId: string | null) {
    const last = await this.prisma.topic.aggregate({ where: { parentId }, _max: { sortOrder: true } });
    return (last._max.sortOrder ?? -1) + 1;
  }

  async create(adminId: string, dto: UpdateTopicDto) {
    const data = clean(dto);
    if (!data.slug || !data.nameEn || !data.nameVi) throw new BadRequestException('slug, nameEn and nameVi are required');
    await this.assertParent(data.parentId);
    if (await this.prisma.topic.findUnique({ where: { slug: data.slug }, select: { id: true } })) {
      throw new ConflictException(`The slug "${data.slug}" is taken`);
    }
    const parentId = data.parentId ?? null;
    return this.prisma.$transaction(async (tx) => {
      const topic = await tx.topic.create({
        data: {
          ...data,
          slug: data.slug as string,
          nameEn: data.nameEn as string,
          nameVi: data.nameVi as string,
          parentId,
          sortOrder: await this.nextSortOrder(parentId),
        },
        select: TOPIC_SELECT,
      });
      await this.audit.record(adminId, 'topic.create', { type: 'topic', id: topic.id, name: topic.slug }, undefined, tx);
      return topic;
    });
  }

  async update(adminId: string, id: string, dto: UpdateTopicDto) {
    const before = await this.prisma.topic.findUnique({
      where: { id },
      select: { ...TOPIC_SELECT, _count: { select: { children: true } } },
    });
    if (!before) throw new NotFoundException('No such topic');
    const data = clean(dto);
    const moving = data.parentId !== undefined && data.parentId !== before.parentId;
    if (moving) {
      await this.assertParent(data.parentId, id);
      if (data.parentId && before._count.children > 0) {
        throw new BadRequestException('This topic has subtopics, so it must stay top-level');
      }
    }
    if (data.slug && data.slug !== before.slug) {
      if (await this.prisma.topic.findUnique({ where: { slug: data.slug }, select: { id: true } })) {
        throw new ConflictException(`The slug "${data.slug}" is taken`);
      }
    }
    const diff = changes(before, data);
    if (Object.keys(diff).length === 0) return before;

    return this.prisma.$transaction(async (tx) => {
      const topic = await tx.topic.update({
        where: { id },
        data: {
          ...data,
          // A moved topic goes to the end of its new parent's list.
          ...(moving ? { sortOrder: await this.nextSortOrder(data.parentId ?? null) } : {}),
        },
        select: TOPIC_SELECT,
      });
      await this.audit.record(adminId, 'topic.update', { type: 'topic', id, name: topic.slug }, diff as Prisma.InputJsonValue, tx);
      return topic;
    });
  }

  /** Sets the order of the topics under one parent. `ids` must be exactly those topics. */
  async reorder(adminId: string, ids: string[]) {
    if (ids.length === 0) return;
    const first = await this.prisma.topic.findUnique({ where: { id: ids[0] }, select: { parentId: true } });
    if (!first) throw new BadRequestException('Unknown topic id');
    const siblings = await this.prisma.topic.findMany({ where: { parentId: first.parentId }, select: { id: true } });
    const expected = new Set(siblings.map((s) => s.id));
    if (expected.size !== ids.length || new Set(ids).size !== ids.length || !ids.every((x) => expected.has(x))) {
      throw new BadRequestException('Send every topic under the same parent, once each');
    }
    await this.prisma.$transaction([
      ...ids.map((topicId, sortOrder) => this.prisma.topic.update({ where: { id: topicId }, data: { sortOrder } })),
      this.prisma.auditLog.create({
        data: { actorId: adminId, action: 'topic.reorder', targetType: 'topic', targetId: first.parentId, data: { ids } },
      }),
    ]);
  }

  /** Deletes a topic without subtopics. Words stay; only their links to it go. */
  async remove(adminId: string, id: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id },
      select: { slug: true, _count: { select: { children: true, words: true } } },
    });
    if (!topic) throw new NotFoundException('No such topic');
    if (topic._count.children > 0) throw new ConflictException('Move or delete its subtopics first');
    await this.prisma.$transaction(async (tx) => {
      await tx.topic.delete({ where: { id } });
      await this.audit.record(adminId, 'topic.delete', { type: 'topic', id, name: topic.slug }, { words: topic._count.words }, tx);
    });
  }
}
