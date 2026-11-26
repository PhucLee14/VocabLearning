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
 *
 * The writing itself is shared with the admin import page (src/words/import/).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { parseCsvRecords } from '../../src/words/import/csv.js';
import { normalizeRecord, validateWords } from '../../src/words/import/import-format.js';
import { planImport, writeWords } from '../../src/words/import/write-words.js';

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
    const plan = await planImport(prisma, words);

    const errors = validateWords(words, new Set(plan.topicIds.keys()));
    if (errors.length > 0) {
      console.error(`✘ ${errors.length} validation error(s); nothing was imported:`);
      for (const e of errors) console.error(`  row ${e.index + 1} ${e.headword || '(empty)'}: ${e.message}`);
      process.exitCode = 1;
      return;
    }

    if (dryRun) {
      console.log(`✔ ${words.length} valid word(s): ${plan.creates} to create, ${plan.updates} to update.`);
      console.log('Dry run: nothing was written. Re-run without --dry-run to import.');
      return;
    }

    await writeWords(prisma, words, plan, (done) => console.log(`  … ${done}/${words.length}`));
    console.log(`✔ Imported ${words.length} word(s): ${plan.creates} created, ${plan.updates} updated.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
