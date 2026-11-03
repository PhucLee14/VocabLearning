import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Two-level topic tree (topic → subtopics) with the word count of each topic. */
  findTree() {
    return this.prisma.topic.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        nameEn: true,
        nameVi: true,
        icon: true,
        _count: { select: { words: true } },
        children: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            slug: true,
            nameEn: true,
            nameVi: true,
            _count: { select: { words: true } },
          },
        },
      },
    });
  }

  /** One topic with its parent, subtopics and the number of words in its whole subtree. */
  async findOne(slug: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        nameEn: true,
        nameVi: true,
        descriptionEn: true,
        descriptionVi: true,
        icon: true,
        parent: { select: { slug: true, nameEn: true, nameVi: true } },
        _count: { select: { words: true } },
        children: {
          orderBy: { sortOrder: 'asc' },
          select: { slug: true, nameEn: true, nameVi: true, _count: { select: { words: true } } },
        },
      },
    });
    if (!topic) throw new NotFoundException(`No topic "${slug}"`);
    const totalWords = await this.prisma.word.count({
      where: { topics: { some: { topic: { OR: [{ slug }, { parent: { slug } }] } } } },
    });
    return { ...topic, totalWords };
  }
}
