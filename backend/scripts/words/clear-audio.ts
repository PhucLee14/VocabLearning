/**
 * Removes audio links on blocked hosts (BLOCKED_AUDIO_HOSTS) from words already
 * in the database, together with their `audio: …` credit in `source`. Words
 * without audio play the browser's speech synthesis straight away.
 *
 *   npm run words:clear-audio -- [--dry-run]
 *
 * Safe to run more than once: a second run finds nothing to change.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { BLOCKED_AUDIO_HOSTS, isBlockedAudioUrl, stripAudioCredit } from './lib/import-format.js';

async function main() {
  const argv = process.argv.slice(2);
  const unknown = argv.filter((a) => a !== '--dry-run');
  if (unknown.length > 0) throw new Error('Usage: npm run words:clear-audio -- [--dry-run]');
  const dryRun = argv.includes('--dry-run');

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing DIRECT_URL / DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const withAudio = await prisma.word.findMany({
      where: { audioUrl: { not: null } },
      select: { id: true, headword: true, audioUrl: true, source: true },
    });
    const blocked = withAudio.filter((w) => isBlockedAudioUrl(w.audioUrl as string));
    console.log(
      `${withAudio.length} word(s) have audio; ${blocked.length} link to ${BLOCKED_AUDIO_HOSTS.join(', ')}.`,
    );
    for (const w of blocked.slice(0, 5)) {
      console.log(`  ${w.headword}: ${w.audioUrl}\n    source → ${stripAudioCredit(w.source) ?? '(none)'}`);
    }
    if (blocked.length > 5) console.log(`  … and ${blocked.length - 5} more`);

    if (dryRun) {
      console.log('Dry run: nothing was changed.');
      return;
    }

    // One UPDATE statement per batch (the source string differs per word, so the
    // new values come in as arrays). One update() call per word inside a
    // transaction hit Prisma's 5 s transaction timeout on a far-away connection.
    let done = 0;
    for (let i = 0; i < blocked.length; i += 1000) {
      const batch = blocked.slice(i, i + 1000);
      const ids = batch.map((w) => w.id);
      const sources = batch.map((w) => stripAudioCredit(w.source));
      await prisma.$executeRaw`
        UPDATE words AS w
        SET "audioUrl" = NULL, source = v.source
        FROM unnest(${ids}::uuid[], ${sources}::text[]) AS v(id, source)
        WHERE w.id = v.id`;
      done += batch.length;
      console.log(`  cleared ${done}/${blocked.length}`);
    }
    console.log(`✔ Cleared the audio link of ${done} word(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
