/**
 * Seeds the topic framework (prisma/seed/topics.json).
 * Run: npm run db:seed. Safe to re-run (upserts by slug).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

type TopicSeed = {
  slug: string;
  nameEn: string;
  nameVi: string;
  icon?: string;
  children?: TopicSeed[];
};

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('Missing DIRECT_URL / DATABASE_URL');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const topics = JSON.parse(
  readFileSync(new URL('./seed/topics.json', import.meta.url), 'utf8'),
) as TopicSeed[];

async function upsertTopic(t: TopicSeed, sortOrder: number, parentId: string | null) {
  const data = { nameEn: t.nameEn, nameVi: t.nameVi, icon: t.icon ?? null, sortOrder, parentId };
  return prisma.topic.upsert({
    where: { slug: t.slug },
    create: { slug: t.slug, ...data },
    update: data,
  });
}

async function main() {
  let count = 0;
  for (const [i, parent] of topics.entries()) {
    const saved = await upsertTopic(parent, i, null);
    count++;
    for (const [j, child] of (parent.children ?? []).entries()) {
      await upsertTopic(child, j, saved.id);
      count++;
    }
  }
  console.log(`✔ Seeded ${count} topics (${topics.length} top-level)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
