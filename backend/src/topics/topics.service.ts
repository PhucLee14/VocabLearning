import { Injectable } from '@nestjs/common';
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
}
