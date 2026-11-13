/**
 * Enriches a plain word list into the import format (PLAN.md §7).
 *
 *   npm run words:enrich -- <input.csv|json> [-o out.json] [--refresh] [--no-mymemory] [--limit N] [--concurrency N]
 *
 * Input columns: headword, cefr_level, topics (slug|slug), and optionally pos,
 * sense_no, def_pick (1-based index of the Datamuse definition to use when the
 * automatic choice is the wrong sense) and any import-format field
 * (definition_en, meaning_vi, ipa, examples…). Values you fill in are kept; only
 * empty fields are looked up. `level_source` (e.g. "CEFR-J Wordlist 1.5") is
 * credited first in the word's `source`.
 *
 * Lookups (docs/DATA_SOURCES.md):
 *   definition                → Datamuse (Wiktionary senses, most common first)
 *                               → Free Dictionary API → kaikki.org
 *   IPA, audio, synonyms      → Free Dictionary API (Wiktionary); IPA fallback kaikki.org
 *   meaning_vi                → kaikki.org (Wiktionary) → MyMemory (flagged for review)
 *   examples + Vietnamese     → Tatoeba
 *
 * Responses are cached in scripts/words/.cache, so re-runs are fast and polite.
 * Output: a JSON array ready for `npm run words:import`, where each word has a
 * `_review` list of things a human should check.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { parseCsvRecords } from './lib/csv.js';
import { fetchCached, fetchJson, type HttpOptions } from './lib/http.js';
import {
  type ImportExample,
  type ImportWord,
  isBlockedAudioUrl,
  normalizeRecord,
  validateWords,
} from './lib/import-format.js';
import {
  cleanMeaningVi,
  datamuseUrl,
  type FdEntry,
  freeDictionaryUrl,
  kaikkiUrl,
  myMemoryUrl,
  normalizePos,
  parseDatamuse,
  parseKaikki,
  parseMyMemory,
  parseTatoeba,
  pickDefinition,
  tatoebaUrl,
} from './lib/sources.js';

type Args = {
  input: string;
  out: string;
  refresh: boolean;
  myMemory: boolean;
  limit: number | null;
  /** Words enriched at the same time. Each host still gets its own minimum gap between requests. */
  concurrency: number;
};

function parseArgs(argv: string[]): Args {
  const rest = [...argv];
  let input: string | undefined;
  let out: string | undefined;
  let refresh = false;
  let myMemory = true;
  let limit: number | null = null;
  let concurrency = 4;

  while (rest.length > 0) {
    const arg = rest.shift() as string;
    if (arg === '-o' || arg === '--out') out = rest.shift();
    else if (arg === '--refresh') refresh = true;
    else if (arg === '--no-mymemory') myMemory = false;
    else if (arg === '--limit') limit = Number(rest.shift());
    else if (arg === '--concurrency') concurrency = Math.max(1, Math.min(8, Number(rest.shift()) || 1));
    else if (!arg.startsWith('-') && !input) input = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!input) {
    throw new Error(
      'Usage: npm run words:enrich -- <input.csv|json> [-o out.json] [--refresh] [--no-mymemory] [--limit N] [--concurrency N]',
    );
  }
  out ??= join(dirname(input), `${basename(input, extname(input))}.enriched.json`);
  return { input, out, refresh, myMemory, limit, concurrency };
}

function readRecords(path: string): Record<string, unknown>[] {
  const text = readFileSync(path, 'utf8');
  if (extname(path).toLowerCase() === '.json') return JSON.parse(text) as Record<string, unknown>[];
  return parseCsvRecords(text);
}

function knownTopicSlugs(): Set<string> {
  type Seed = { slug: string; children?: Seed[] };
  const seed = JSON.parse(
    readFileSync(new URL('../../prisma/seed/topics.json', import.meta.url), 'utf8'),
  ) as Seed[];
  const slugs = new Set<string>();
  const walk = (list: Seed[]) =>
    list.forEach((t) => {
      slugs.add(t.slug);
      walk(t.children ?? []);
    });
  walk(seed);
  return slugs;
}

type Enriched = ImportWord & { _review: string[] };

const MYMEMORY_QUOTA = /quotaFinished"\s*:\s*true|"responseStatus"\s*:\s*"?429|ALL AVAILABLE FREE TRANSLATIONS/i;
let myMemoryExhausted = false;

/** Runs a lookup; a failing source becomes a review note instead of aborting the run. */
async function attempt<T>(label: string, review: string[], run: () => Promise<T | null>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    review.push(`${label} failed (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

async function enrichOne(raw: Record<string, unknown>, args: Args, http: HttpOptions): Promise<Enriched> {
  const given = normalizeRecord(raw);
  const headword = given.headword;
  const review: string[] = [];
  const sources: string[] = [];
  if (typeof raw.level_source === 'string' && raw.level_source) sources.push(`level: ${raw.level_source}`);

  // 1) IPA, audio, synonyms (+ definition fallback): Free Dictionary API.
  const defPick = raw.def_pick ? Number(raw.def_pick) : null;
  const entries = await attempt('Free Dictionary API', review, () =>
    fetchJson<FdEntry[]>(freeDictionaryUrl(headword), { ...http, minIntervalMs: 300 }),
  );
  const picked = entries ? pickDefinition(entries, given.pos || null, null) : null;
  const pos = given.pos ? normalizePos(given.pos) : (picked?.pos ?? '');
  if (!given.pos && picked) review.push(`pos not given; used "${picked.pos}"`);

  // 2) kaikki.org: definition fallback, IPA fallback, Vietnamese translations.
  const kaikkiRes = await attempt('kaikki.org', review, () =>
    fetchCached(kaikkiUrl(headword), { ...http, minIntervalMs: 300 }),
  );
  const kaikki =
    kaikkiRes?.status === 200
      ? parseKaikki(kaikkiRes.body, pos || 'noun')
      : { ipa: null, vi: [], definition: null, example: null };

  // 2b) Definition: given → Datamuse (most common sense first) → Free Dictionary → kaikki.
  let definitionEn = given.definition_en;
  if (!definitionEn) {
    const lookup = async (word: string) => {
      const body = await attempt('Datamuse', review, () =>
        fetchJson<Parameters<typeof parseDatamuse>[0]>(datamuseUrl(word), { ...http, minIntervalMs: 200 }),
      );
      return body ? parseDatamuse(body, word, pos || null, word === headword ? defPick : null) : null;
    };
    let dm = await lookup(headword);
    if (dm?.clippingOf) {
      const full = await lookup(dm.clippingOf);
      if (full) {
        review.push(`"${headword}" is a clipping of "${dm.clippingOf}"; used its definition`);
        dm = full;
      }
    }
    if (dm) {
      definitionEn = dm.definition;
      sources.push('definition: Wiktionary/WordNet via Datamuse (CC BY-SA)');
      if (defPick === null && dm.index > 1) {
        review.push(`skipped ${dm.index - 1} labelled sense(s); check the definition`);
      }
    }
  }
  if (!definitionEn && picked) {
    definitionEn = picked.definition;
    sources.push('definition: Wiktionary via dictionaryapi.dev (CC BY-SA 3.0)');
  }
  if (!definitionEn && kaikki.definition) {
    definitionEn = kaikki.definition;
    sources.push('definition: Wiktionary via kaikki.org (CC BY-SA)');
  }
  if (!definitionEn) review.push('no definition found; fill definition_en');

  const ipa = given.ipa ?? picked?.ipa ?? kaikki.ipa ?? null;
  if (!ipa) review.push('no IPA found');

  // 3) meaning_vi: given → Wiktionary → MyMemory.
  let meaningVi = given.meaning_vi ?? null;
  if (!meaningVi && kaikki.vi.length > 0) {
    meaningVi = cleanMeaningVi(kaikki.vi.join(', '), headword);
  }
  if (meaningVi && !given.meaning_vi) {
    sources.push('vi: Wiktionary via kaikki.org (CC BY-SA)');
    review.push('meaning_vi from Wiktionary translations; check it matches this sense');
  }
  if (!meaningVi && args.myMemory && !myMemoryExhausted) {
    const mm = await attempt('MyMemory', review, () =>
      fetchJson<Parameters<typeof parseMyMemory>[0]>(myMemoryUrl(headword, process.env.MYMEMORY_EMAIL), {
        ...http,
        minIntervalMs: 500,
        // A "quota used up" answer comes back as HTTP 200: never cache it.
        shouldCache: (body) => !MYMEMORY_QUOTA.test(body),
      }),
    );
    if (mm && MYMEMORY_QUOTA.test(JSON.stringify(mm))) {
      myMemoryExhausted = true;
      console.log('  MyMemory daily quota used up: no more MyMemory lookups in this run.');
    }
    meaningVi = mm ? cleanMeaningVi(parseMyMemory(mm, headword), headword) : null;
    if (meaningVi) {
      sources.push('vi: MyMemory');
      review.push('meaning_vi from MyMemory (machine/TM); verify it');
    }
  }
  if (!meaningVi) review.push('no meaning_vi found; fill it in');

  // 4) Examples: given → Tatoeba (with Vietnamese) → Wiktionary example.
  let examples: ImportExample[] = given.examples;
  if (examples.length === 0) {
    const tatoeba = await attempt('Tatoeba', review, () =>
      fetchJson<Parameters<typeof parseTatoeba>[0]>(tatoebaUrl(headword), {
        ...http,
        minIntervalMs: 1000,
      }),
    );
    const found = tatoeba ? parseTatoeba(tatoeba, headword) : [];
    if (found.length > 0) {
      examples = found.map((e) => ({ sentence: e.sentence, translation_vi: e.translationVi }));
      const credits = found.map((e) => `#${e.id}${e.owner ? ` by ${e.owner}` : ''}`).join(', ');
      sources.push(`examples: Tatoeba ${credits} (${found[0].license})`);
      review.push('Tatoeba examples may use another sense of the word');
    } else if (picked?.example ?? kaikki.example) {
      examples = [{ sentence: (picked?.example ?? kaikki.example) as string }];
      sources.push('example: Wiktionary (CC BY-SA)');
    } else {
      review.push('no example sentence found');
    }
  }

  // Free Dictionary's own mp3 links are blocked (see BLOCKED_AUDIO_HOSTS).
  const pickedAudio = picked?.audioUrl && !isBlockedAudioUrl(picked.audioUrl) ? picked.audioUrl : null;
  const audioUrl = given.audio_url ?? pickedAudio;
  if (audioUrl && !given.audio_url) {
    sources.push(`audio: Wikimedia Commons (${picked?.audioLicense ?? 'CC BY-SA'})`);
  }

  return {
    headword,
    pos,
    sense_no: given.sense_no,
    ipa,
    cefr_level: given.cefr_level,
    definition_en: definitionEn,
    meaning_vi: meaningVi,
    examples,
    topics: given.topics,
    synonyms: given.synonyms.length ? given.synonyms : (picked?.synonyms ?? []),
    antonyms: given.antonyms.length ? given.antonyms : (picked?.antonyms ?? []),
    audio_url: audioUrl,
    source: given.source ?? (sources.length ? sources.join(' · ') : null),
    _review: review,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const http: HttpOptions = {
    cacheDir: new URL('./.cache', import.meta.url).pathname,
    refresh: args.refresh,
  };

  let records = readRecords(args.input);
  if (args.limit !== null) records = records.slice(0, args.limit);
  console.log(`Enriching ${records.length} word(s) from ${args.input}`);

  // A small worker pool; output keeps the input order.
  const words: Enriched[] = Array.from({ length: records.length });
  let nextIndex = 0;
  let done = 0;
  const worker = async () => {
    while (nextIndex < records.length) {
      const i = nextIndex++;
      const w = await enrichOne(records[i], args, http);
      words[i] = w;
      done++;
      const mark = w.definition_en ? (w._review.length ? '•' : '✔') : '✘';
      console.log(
        `${mark} [${done}/${records.length}] ${w.headword} (${w.pos || '?'}, ${w.cefr_level})` +
          `  vi: ${w.meaning_vi ?? '-'}  examples: ${w.examples.length}` +
          (w._review.length ? `\n    review: ${w._review.join('; ')}` : ''),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(args.concurrency, records.length) }, worker));

  const errors = validateWords(words, knownTopicSlugs());
  writeFileSync(args.out, `${JSON.stringify(words, null, 2)}\n`);

  const needReview = words.filter((w) => w._review.length > 0).length;
  console.log(`\nWrote ${words.length} word(s) to ${args.out}`);
  console.log(`${needReview} word(s) have notes in "_review". Check them before importing.`);
  if (errors.length > 0) {
    console.log(`\n${errors.length} validation error(s), fix them before importing:`);
    for (const e of errors) console.log(`  row ${e.index + 1} ${e.headword}: ${e.message}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
