/**
 * Imports words in the PLAN.md §7 format (JSON or CSV) into the database.
 *
 *   npm run words:import -- <file.json|csv> [--dry-run]
 *
 * - Validates every row first and writes nothing if any row is invalid.
 * - Upserts by (headword, pos, sense_no). For an existing word, its examples
 *   and topic links are replaced by the ones in the file.
 * - Topics are referenced by slug and must already exist (npm run db:seed).
 * - `--dry-run`: validate and report creates/updates without writing.
 * - Keys starting with "_" (e.g. `_review` from words:enrich) are ignored.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { parseCsvRecords } from './lib/csv.js';
import { normalizeRecord, validateWords, wordSlug } from './lib/import-format.js';

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const files = argv.filter((a) => !a.startsWith('-'));
  const unknown = argv.filter((a) => a.startsWith('-') && a !== '--dry-run');
  if (files.length !== 1 || unknown.length > 0) {
    throw new Error('Usage: npm run words:import -- <file.json|csv> [--dry-run]');
  }
  return { file: files[0], dryRun };
}

function readRecords(path: string): Record<string, unknown>[] {
  const text = readFileSync(path, 'utf8');
  if (extname(path).toLowerCase() === '.json') {
    const data = JSON.parse(text) as unknown;
    if (!Array.isArray(data)) throw new Error('JSON import file must contain an array of words');
    return data as Record<string, unknown>[];
  }
  return parseCsvRecords(text);
}

async function main() {
  const { file, dryRun } = parseArgs(process.argv.slice(2));
  const words = readRecords(file).map(normalizeRecord);

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing DIRECT_URL / DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const topics = await prisma.topic.findMany({ select: { id: true, slug: true } });
    const topicId = new Map(topics.map((t) => [t.slug, t.id]));

    const errors = validateWords(words, new Set(topicId.keys()));
    if (errors.length > 0) {
      console.error(`✘ ${errors.length} validation error(s); nothing was imported:`);
      for (const e of errors) console.error(`  row ${e.index + 1} ${e.headword || '(empty)'}: ${e.message}`);
      process.exitCode = 1;
      return;
    }

    const existing = await prisma.word.findMany({
      select: { headword: true, pos: true, senseNo: true, slug: true },
    });
    const existingKeys = new Set(existing.map((w) => `${w.headword}|${w.pos}|${w.senseNo}`));
    const updates = words.filter((w) => existingKeys.has(`${w.headword}|${w.pos}|${w.sense_no}`)).length;
    const creates = words.length - updates;

    if (dryRun) {
      console.log(`✔ ${words.length} valid word(s): ${creates} to create, ${updates} to update.`);
      console.log('Dry run: nothing was written. Re-run without --dry-run to import.');
      return;
    }

    // Slugs: an existing word keeps its slug (URLs stay stable). A new word whose
    // slug is taken by a different word gets "-2", "-3"… ("March" the month and
    // "march" the walk would both be "march-noun-1").
    // Exact key: the DB's unique key (headword, pos, senseNo) is case-sensitive.
    const exactKey = (h: string, pos: string, sense: number) => `${h}|${pos}|${sense}`;
    const slugOwner = new Map(existing.map((w) => [w.slug, exactKey(w.headword, w.pos, w.senseNo)]));
    const slugOf = new Map(existing.map((w) => [exactKey(w.headword, w.pos, w.senseNo), w.slug]));
    const slugFor = (w: (typeof words)[number]) => {
      const key = exactKey(w.headword, w.pos, w.sense_no);
      const known = slugOf.get(key);
      if (known) return known;
      const base = wordSlug(w);
      let slug = base;
      for (let n = 2; slugOwner.has(slug) && slugOwner.get(slug) !== key; n++) slug = `${base}-${n}`;
      slugOwner.set(slug, key);
      slugOf.set(key, slug);
      return slug;
    };

    for (const [i, w] of words.entries()) {
      const data = {
        slug: slugFor(w),
        ipa: w.ipa ?? null,
        cefrLevel: w.cefr_level,
        definitionEn: w.definition_en,
        meaningVi: w.meaning_vi ?? null,
        synonyms: w.synonyms,
        antonyms: w.antonyms,
        audioUrl: w.audio_url ?? null,
        source: w.source ?? null,
      };

      await prisma.$transaction(async (tx) => {
        const saved = await tx.word.upsert({
          where: {
            headword_pos_senseNo: { headword: w.headword, pos: w.pos, senseNo: w.sense_no },
          },
          create: { headword: w.headword, pos: w.pos, senseNo: w.sense_no, ...data },
          update: data,
        });
        await tx.example.deleteMany({ where: { wordId: saved.id } });
        if (w.examples.length > 0) {
          await tx.example.createMany({
            data: w.examples.map((e, sortOrder) => ({
              wordId: saved.id,
              sentence: e.sentence,
              translationVi: e.translation_vi ?? null,
              sortOrder,
            })),
          });
        }
        await tx.wordTopic.deleteMany({ where: { wordId: saved.id } });
        if (w.topics.length > 0) {
          await tx.wordTopic.createMany({
            data: w.topics.map((slug) => ({ wordId: saved.id, topicId: topicId.get(slug) as string })),
          });
        }
      });
      if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${words.length}`);
    }

    console.log(`✔ Imported ${words.length} word(s): ${creates} created, ${updates} updated.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
