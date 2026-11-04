/**
 * Review pass between `words:enrich` and `words:import` (docs/DATA_SOURCES.md §5).
 *
 *   npm run words:review -- export <file.enriched.json> [--size 250] [--out dir]
 *   npm run words:review -- apply  <file.enriched.json> <corrections.json>... [-o out.json]
 *
 * `export` splits an enriched file into compact parts for a reviewer (a person
 * or an AI agent). `apply` merges the reviewer's corrections back. Words not
 * mentioned in a part's corrections were reviewed and are kept as they are.
 *
 * Corrections file: a JSON array of
 *   { "id": "headword|pos",
 *     "action": "fix" | "drop",
 *     "definition_en"?: string,        // learner-friendly, written in the reviewer's own words
 *     "meaning_vi"?: string,
 *     "drop_examples"?: number[],      // indexes of examples that use another sense
 *     "example_translations"?: { "<index>": "Vietnamese translation" },
 *     "add_examples"?: [{ "sentence": string, "translation_vi": string }],  // original sentences, when none is left
 *     "topics"?: string[],             // replaces the topics; slugs from prisma/seed/topics.json
 *     "note"?: string }
 * Everything is validated: unknown ids, topics or example indexes are reported and skipped.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ImportWord } from './lib/import-format.js';

type Enriched = ImportWord & { _review?: string[] };

export type Correction = {
  id: string;
  action: 'fix' | 'drop';
  definition_en?: string;
  meaning_vi?: string;
  drop_examples?: number[];
  example_translations?: Record<string, string>;
  add_examples?: { sentence: string; translation_vi: string }[];
  topics?: string[];
  note?: string;
};

export const wordId = (w: { headword: string; pos: string; sense_no?: number }) =>
  `${w.headword}|${w.pos}${w.sense_no && w.sense_no > 1 ? `|${w.sense_no}` : ''}`;

/** The compact shape a reviewer sees. */
export function toReviewItem(w: Enriched) {
  return {
    id: wordId(w),
    level: w.cefr_level,
    definition_en: w.definition_en || null,
    meaning_vi: w.meaning_vi ?? null,
    examples: w.examples.map((e, i) => ({ i, en: e.sentence, vi: e.translation_vi ?? null })),
    topics: w.topics,
    notes: w._review ?? [],
  };
}

export function knownTopicSlugs(): Set<string> {
  type Seed = { slug: string; children?: Seed[] };
  const seed = JSON.parse(readFileSync(new URL('../../prisma/seed/topics.json', import.meta.url), 'utf8')) as Seed[];
  const slugs = new Set<string>();
  const walk = (list: Seed[]) => list.forEach((t) => (slugs.add(t.slug), walk(t.children ?? [])));
  walk(seed);
  return slugs;
}

/** Applies corrections; returns the new list and the problems found in the corrections. */
export function applyCorrections(words: Enriched[], corrections: Correction[], topicSlugs: Set<string>) {
  const problems: string[] = [];
  const byId = new Map(words.map((w) => [wordId(w), w]));
  const dropped = new Set<string>();
  let fixed = 0;

  for (const c of corrections) {
    const w = byId.get(c.id);
    if (!w) {
      problems.push(`unknown id "${c.id}"`);
      continue;
    }
    if (c.action === 'drop') {
      dropped.add(c.id);
      continue;
    }
    if (c.action !== 'fix') {
      problems.push(`${c.id}: unknown action "${String(c.action)}"`);
      continue;
    }
    const edited: string[] = [];
    if (typeof c.definition_en === 'string' && c.definition_en.trim()) {
      w.definition_en = c.definition_en.trim();
      edited.push('definition');
    }
    if (typeof c.meaning_vi === 'string' && c.meaning_vi.trim()) {
      w.meaning_vi = c.meaning_vi.trim();
      edited.push('vi');
    }
    if (c.example_translations) {
      for (const [index, vi] of Object.entries(c.example_translations)) {
        const ex = w.examples[Number(index)];
        if (!ex || typeof vi !== 'string' || !vi.trim()) problems.push(`${c.id}: no example ${index} to translate`);
        else ex.translation_vi = vi.trim();
      }
      edited.push('example translations');
    }
    if (Array.isArray(c.drop_examples) && c.drop_examples.length > 0) {
      const bad = c.drop_examples.filter((i) => !w.examples[i]);
      if (bad.length) problems.push(`${c.id}: no example(s) ${bad.join(', ')}`);
      const drop = new Set(c.drop_examples);
      w.examples = w.examples.filter((_e, i) => !drop.has(i));
      edited.push('examples');
    }
    if (Array.isArray(c.add_examples) && c.add_examples.length > 0) {
      const good = c.add_examples.filter(
        (e) => e && typeof e.sentence === 'string' && e.sentence.trim() && typeof e.translation_vi === 'string',
      );
      if (good.length < c.add_examples.length) problems.push(`${c.id}: skipped an added example without sentence/translation`);
      // At most 2 examples per word in total.
      const room = Math.max(0, 2 - w.examples.length);
      w.examples.push(...good.slice(0, room).map((e) => ({ sentence: e.sentence.trim(), translation_vi: e.translation_vi.trim() })));
      if (good.length) edited.push('examples added');
    }
    if (Array.isArray(c.topics)) {
      const unknown = c.topics.filter((t) => !topicSlugs.has(t));
      if (unknown.length) problems.push(`${c.id}: unknown topic(s) ${unknown.join(', ')}`);
      w.topics = [...new Set(c.topics.filter((t) => topicSlugs.has(t)))];
      edited.push('topics');
    }
    if (edited.length) {
      fixed++;
      const mark = `reviewed: ${edited.join(', ')} edited`;
      w.source = w.source ? `${w.source} · ${mark}` : mark;
    }
  }

  const kept = words
    .filter((w) => !dropped.has(wordId(w)))
    .map((w) => {
      // Reviewed words no longer need the automatic notes; keep only what still blocks an import.
      const { _review, ...rest } = w;
      const missing = !rest.definition_en ? ['no definition_en'] : [];
      return missing.length ? { ...rest, _review: missing } : rest;
    });
  return { words: kept, fixed, dropped: dropped.size, problems };
}

function main() {
  const [command, file, ...rest] = process.argv.slice(2);
  if (!command || !file) {
    throw new Error(
      'Usage:\n  npm run words:review -- export <file.enriched.json> [--size 250] [--out dir]\n' +
        '  npm run words:review -- apply <file.enriched.json> <corrections.json>... [-o out.json]',
    );
  }
  const words = JSON.parse(readFileSync(file, 'utf8')) as Enriched[];

  if (command === 'export') {
    let size = 250;
    let out = join(dirname(file), 'review');
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--size') size = Number(rest[++i]);
      else if (rest[i] === '--out') out = rest[++i];
    }
    mkdirSync(out, { recursive: true });
    const name = basename(file).replace(/\.enriched\.json$|\.json$/, '');
    const parts = Math.ceil(words.length / size);
    for (let p = 0; p < parts; p++) {
      const path = join(out, `${name}.part-${String(p + 1).padStart(2, '0')}.json`);
      writeFileSync(path, `${JSON.stringify(words.slice(p * size, (p + 1) * size).map(toReviewItem), null, 1)}\n`);
      console.log(path);
    }
    return;
  }

  if (command === 'apply') {
    let out = file.replace(/\.json$/, '.reviewed.json');
    const inputs: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '-o') out = rest[++i];
      else inputs.push(rest[i]);
    }
    const corrections = inputs.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as Correction[]);
    const result = applyCorrections(words, corrections, knownTopicSlugs());
    writeFileSync(out, `${JSON.stringify(result.words, null, 2)}\n`);
    console.log(
      `${corrections.length} correction(s): ${result.fixed} word(s) edited, ${result.dropped} dropped → ${result.words.length} word(s) in ${out}`,
    );
    for (const p of result.problems) console.log(`  ! ${p}`);
    const blocked = result.words.filter((w) => '_review' in w).length;
    if (blocked) console.log(`  ${blocked} word(s) still have no definition and will fail the import.`);
    return;
  }
  throw new Error(`Unknown command "${command}"`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() as string)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
