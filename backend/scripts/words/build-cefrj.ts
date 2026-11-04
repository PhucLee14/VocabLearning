/**
 * Builds enrich-ready word lists from the CEFR-J Wordlist (A1–B2) and the
 * Octanove Vocabulary Profile (C1–C2), both from
 * https://github.com/openlanguageprofiles/olp-en-cefrj (docs/DATA_SOURCES.md §3).
 *
 *   npm run words:cefrj -- [--levels A1,A2] [--out scripts/words/out]
 *
 * Writes one JSON file per level (e.g. out/cefrj-a1.json) with headword, pos,
 * cefr_level, topics and level_source, ready for `npm run words:enrich`.
 * - CEFR-J's topic columns (CoreInventory 1/2, Threshold) are mapped onto our
 *   topic slugs; words without a topic stay topic-less (still listed by level).
 * - "adviser/advisor" style variants keep the first spelling.
 * - A word in both lists keeps the lower level (CEFR-J).
 * - Words already curated by hand (prisma/seed/words-sample.enriched.json)
 *   keep their reviewed content; only the level and topics come from here.
 *
 * Licences: CEFR-J is free for research and commercial use with citation
 * ("The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University
 * of Foreign Studies"); Octanove C1/C2 is CC BY-SA 4.0. The raw lists are not
 * committed: they are downloaded (and cached) on each run.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsvRecords } from './lib/csv.js';
import { fetchCached } from './lib/http.js';
import { CEFR_LEVELS, type CefrLevel, type ImportWord } from './lib/import-format.js';

const REPO = 'https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master';
export const CEFRJ_URL = `${REPO}/cefrj-vocabulary-profile-1.5.csv`;
export const OCTANOVE_URL = `${REPO}/octanove-vocabulary-profile-c1c2-1.0.csv`;
export const CEFRJ_CREDIT = 'CEFR-J Wordlist 1.5 (Yukio Tono, TUFS)';
export const OCTANOVE_CREDIT = 'Octanove Vocabulary Profile C1/C2 (CC BY-SA 4.0)';

/** CEFR-J topic labels → our topic slugs (prisma/seed/topics.json). Unlisted labels are dropped. */
export const TOPIC_MAP: Record<string, string[]> = {
  // CoreInventory 1 / 2
  'work and jobs': ['work-jobs'],
  education: ['education'],
  'objects and rooms': ['rooms-furniture'],
  'news, lifestyles and current affairs': ['news'],
  'things in the town, shops and shopping': ['places-city', 'shops'],
  'food and drink': ['food-drink'],
  'travel and services vocab': ['travel-transport'],
  'hobbies and pastimes': ['sports-hobbies'],
  'family life': ['family-members'],
  clothes: ['clothes-fashion'],
  'leisure activities': ['sports-hobbies'],
  'books and literature': ['books'],
  media: ['media-communication'],
  shopping: ['money-shopping'],
  'personal information': ['people-family'],
  'ways of travelling': ['travel-transport'],
  'ways of traveling': ['travel-transport'],
  arts: ['arts-entertainment'],
  art: ['arts-entertainment'],
  holidays: ['travel-transport'],
  film: ['film-tv'],
  'scientific development': ['science'],
  // Threshold
  'personal identification': ['people-family'],
  'free time, entertainment': ['arts-entertainment'],
  'house and home, environment': ['home'],
  travel: ['travel-transport'],
  'health and body care': ['health-body'],
  'relations with other people': ['relationships'],
  services: ['places-city'],
  language: ['education'],
  'daily life': ['daily-life'],
  weather: ['weather'],
  places: ['places-city'],
};

/** CEFR-J part-of-speech names → the names Wiktionary-based sources use. */
const POS_MAP: Record<string, string> = {
  'be-verb': 'verb',
  'do-verb': 'verb',
  'have-verb': 'verb',
  'modal auxiliary': 'verb',
  number: 'numeral',
  'infinitive-to': 'particle',
  vern: 'verb', // a typo in the Octanove list
};

/**
 * Rows that make poor flashcards and have no dictionary entry of their own:
 * contractions ('re, 's, n't…) and inflected forms of be / do / have (the base
 * forms stay). Articles are skipped too: definitions of "a" / "the" are about
 * the letter or grammar, not something a learner reviews.
 */
const SKIP = new Set(['am', 'is', 'are', 'was', 'were', 'been', 'being', 'does', 'did', 'done', 'doing', 'has', 'had', 'having', 'a', 'an', 'the']);
export const isSkipped = (headword: string) => headword.startsWith("'") || SKIP.has(headword.toLowerCase());

export type ListWord = {
  headword: string;
  pos: string;
  cefr_level: CefrLevel;
  topics: string[];
  level_source: string;
};

/** The first spelling of "adviser/advisor", trimmed. */
export const firstVariant = (headword: string) => headword.split('/')[0].trim();

export function mapTopics(labels: (string | undefined)[]): string[] {
  const slugs = labels.flatMap((l) => TOPIC_MAP[(l ?? '').trim().toLowerCase()] ?? []);
  return [...new Set(slugs)];
}

/** Merges both lists: one entry per (headword, pos), lowest level wins, topics are unioned. */
export function buildList(cefrj: Record<string, string>[], octanove: Record<string, string>[]): ListWord[] {
  const byKey = new Map<string, ListWord>();
  const add = (row: Record<string, string>, credit: string, topics: string[]) => {
    const headword = firstVariant(row.headword ?? '');
    const rawPos = (row.pos ?? '').trim().toLowerCase();
    const pos = POS_MAP[rawPos] ?? rawPos;
    const level = (row.cefr ?? '').trim().toUpperCase() as CefrLevel;
    if (!headword || !pos || !CEFR_LEVELS.includes(level) || isSkipped(headword)) return;
    // Case matters: "March" (the month) and "march" (to walk) are different words.
    const key = `${headword}|${pos}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { headword, pos, cefr_level: level, topics, level_source: credit });
      return;
    }
    existing.topics = [...new Set([...existing.topics, ...topics])];
    if (CEFR_LEVELS.indexOf(level) < CEFR_LEVELS.indexOf(existing.cefr_level)) {
      existing.cefr_level = level;
      existing.level_source = credit;
    }
  };
  for (const row of cefrj) {
    add(row, CEFRJ_CREDIT, mapTopics([row['coreinventory 1'], row['coreinventory 2'], row.threshold]));
  }
  for (const row of octanove) add(row, OCTANOVE_CREDIT, []);
  return [...byKey.values()];
}

function parseArgs(argv: string[]) {
  let levels: CefrLevel[] = [...CEFR_LEVELS];
  let out = new URL('./out', import.meta.url).pathname;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--levels') levels = argv[++i].split(',').map((l) => l.trim().toUpperCase() as CefrLevel);
    else if (argv[i] === '--out') out = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return { levels, out };
}

async function download(url: string) {
  const res = await fetchCached(url, { cacheDir: new URL('./.cache', import.meta.url).pathname });
  if (res.status !== 200) throw new Error(`GET ${url} → ${res.status}`);
  return parseCsvRecords(res.body);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cefrj, octanove] = await Promise.all([download(CEFRJ_URL), download(OCTANOVE_URL)]);
  const list = buildList(cefrj, octanove);

  // Hand-curated words keep their reviewed content.
  const curated = JSON.parse(
    readFileSync(new URL('../../prisma/seed/words-sample.enriched.json', import.meta.url), 'utf8'),
  ) as (ImportWord & { _review?: string[] })[];
  const curatedByKey = new Map(curated.map((w) => [`${w.headword}|${w.pos}`, w]));

  mkdirSync(args.out, { recursive: true });
  let kept = 0;
  for (const level of args.levels) {
    const words = list
      .filter((w) => w.cefr_level === level)
      .map((w) => {
        const c = curatedByKey.get(`${w.headword}|${w.pos}`);
        if (!c) return w;
        kept++;
        const { _review: _ignored, ...content } = c;
        return { ...content, ...w, topics: [...new Set([...c.topics, ...w.topics])] };
      })
      .sort((a, b) => a.headword.localeCompare(b.headword));
    const file = join(args.out, `cefrj-${level.toLowerCase()}.json`);
    writeFileSync(file, `${JSON.stringify(words, null, 2)}\n`);
    const withTopic = words.filter((w) => w.topics.length > 0).length;
    console.log(`${level}: ${words.length} words (${withTopic} with a topic) → ${file}`);
  }
  console.log(`\n${list.length} words in total; ${kept} reuse hand-curated content.`);
  console.log('Next: npm run words:enrich -- <file> --concurrency 4');
}

// Run only as a script (the spec imports the pure functions).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() as string)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
