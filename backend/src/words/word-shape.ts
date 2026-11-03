import type { Prisma } from '../generated/prisma/client.js';

/** Fields of a word shown in lists and on flashcards. */
export const WORD_SUMMARY_SELECT = {
  id: true,
  slug: true,
  headword: true,
  pos: true,
  ipa: true,
  cefrLevel: true,
  definitionEn: true,
  meaningVi: true,
  audioUrl: true,
} satisfies Prisma.WordSelect;

/** Everything a flashcard's back needs. */
export const WORD_CARD_SELECT = {
  ...WORD_SUMMARY_SELECT,
  synonyms: true,
  examples: { orderBy: { sortOrder: 'asc' }, take: 3, select: { sentence: true, translationVi: true } },
  topics: { select: { topic: { select: { slug: true, nameEn: true, nameVi: true } } } },
} satisfies Prisma.WordSelect;

type CardTopics = { topics: { topic: { slug: string; nameEn: string; nameVi: string } }[] };

/** Flattens the word_topics join rows into a plain topic list. */
export function flattenTopics<T extends CardTopics>(word: T) {
  const { topics, ...rest } = word;
  return { ...rest, topics: topics.map((t) => t.topic) };
}

/**
 * Words in a topic or any of its subtopics. Topics are two levels deep
 * (PLAN.md §8), so checking the parent covers the whole subtree.
 */
export const inTopic = (slug: string): Prisma.WordWhereInput => ({
  topics: { some: { topic: { OR: [{ slug }, { parent: { slug } }] } } },
});

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
