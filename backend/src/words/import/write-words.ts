/**
 * Writes validated import rows (see import-format.ts) to the database. Shared
 * by the `words:import` CLI and the admin import API, so both give words the
 * same slugs and replace examples and topic links the same way.
 */
import type { PrismaClient } from '../../generated/prisma/client.js';
import { type ImportWord, wordSlug } from './import-format.js';

/** Words per transaction: one upsert per word, then four bulk statements per batch. */
const BATCH = 100;

/** Exact key: the DB's unique key (headword, pos, senseNo) is case-sensitive. */
const exactKey = (headword: string, pos: string, sense: number) => `${headword}|${pos}|${sense}`;

export type ImportPlan = {
  creates: number;
  updates: number;
  /** Slug per row, in the same order as the rows. */
  slugs: string[];
  /** Topic slug → id, for the topics the rows use. */
  topicIds: Map<string, string>;
};

/**
 * Works out which rows create a word and which update one, and the slug of
 * each. An existing word keeps its slug (URLs stay stable). A new word whose
 * slug is taken by a different word gets "-2", "-3"… ("March" the month and
 * "march" the walk would both be "march-noun-1").
 */
export async function planImport(prisma: PrismaClient, words: ImportWord[]): Promise<ImportPlan> {
  const [existing, topics] = await Promise.all([
    prisma.word.findMany({ select: { headword: true, pos: true, senseNo: true, slug: true } }),
    prisma.topic.findMany({ select: { id: true, slug: true } }),
  ]);
  const slugOwner = new Map(existing.map((w) => [w.slug, exactKey(w.headword, w.pos, w.senseNo)]));
  const slugOf = new Map(existing.map((w) => [exactKey(w.headword, w.pos, w.senseNo), w.slug]));

  let updates = 0;
  const slugs = words.map((w) => {
    const key = exactKey(w.headword, w.pos, w.sense_no);
    const known = slugOf.get(key);
    if (known) {
      updates++;
      return known;
    }
    const base = wordSlug(w);
    let slug = base;
    for (let n = 2; slugOwner.has(slug) && slugOwner.get(slug) !== key; n++) slug = `${base}-${n}`;
    slugOwner.set(slug, key);
    slugOf.set(key, slug);
    return slug;
  });

  return {
    creates: words.length - updates,
    updates,
    slugs,
    topicIds: new Map(topics.map((t) => [t.slug, t.id])),
  };
}

/**
 * Upserts the rows by (headword, pos, sense_no). For each word, its examples
 * and topic links are replaced by the ones in the row; learners' cards, notes
 * and review history are kept. Rows must have passed `validateWords`.
 */
export async function writeWords(
  prisma: PrismaClient,
  words: ImportWord[],
  plan: ImportPlan,
  onProgress?: (done: number) => void,
) {
  for (let start = 0; start < words.length; start += BATCH) {
    const batch = words.slice(start, start + BATCH);
    await prisma.$transaction(
      async (tx) => {
        const ids: string[] = [];
        for (const [i, w] of batch.entries()) {
          const data = {
            slug: plan.slugs[start + i],
            ipa: w.ipa ?? null,
            cefrLevel: w.cefr_level,
            definitionEn: w.definition_en,
            meaningVi: w.meaning_vi ?? null,
            synonyms: w.synonyms,
            antonyms: w.antonyms,
            audioUrl: w.audio_url ?? null,
            source: w.source ?? null,
          };
          const saved = await tx.word.upsert({
            where: { headword_pos_senseNo: { headword: w.headword, pos: w.pos, senseNo: w.sense_no } },
            create: { headword: w.headword, pos: w.pos, senseNo: w.sense_no, ...data },
            update: data,
            select: { id: true },
          });
          ids.push(saved.id);
        }

        await tx.example.deleteMany({ where: { wordId: { in: ids } } });
        const examples = batch.flatMap((w, i) =>
          w.examples.map((e, sortOrder) => ({
            wordId: ids[i],
            sentence: e.sentence,
            translationVi: e.translation_vi ?? null,
            sortOrder,
          })),
        );
        if (examples.length > 0) await tx.example.createMany({ data: examples });

        await tx.wordTopic.deleteMany({ where: { wordId: { in: ids } } });
        const links = batch.flatMap((w, i) =>
          w.topics.map((slug) => ({ wordId: ids[i], topicId: plan.topicIds.get(slug) as string })),
        );
        if (links.length > 0) await tx.wordTopic.createMany({ data: links, skipDuplicates: true });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    onProgress?.(Math.min(start + BATCH, words.length));
  }
}
