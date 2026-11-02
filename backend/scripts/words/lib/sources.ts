/**
 * Free data sources used to enrich a word list. See docs/DATA_SOURCES.md for
 * licences and attribution rules.
 *
 * Each source has a `...Url()` builder and a pure `parse...()` function, so the
 * parsing can be unit-tested with fixtures and no network.
 */

// ---------------------------------------------------------------------------
// Part-of-speech names. Stored values are the long English names.
// ---------------------------------------------------------------------------

const POS_ALIASES: Record<string, string> = {
  adj: 'adjective',
  adv: 'adverb',
  prep: 'preposition',
  conj: 'conjunction',
  pron: 'pronoun',
  intj: 'interjection',
  det: 'determiner',
  num: 'numeral',
  name: 'proper noun',
};

export const normalizePos = (pos: string) => {
  const p = pos.trim().toLowerCase();
  return POS_ALIASES[p] ?? p;
};

// ---------------------------------------------------------------------------
// Free Dictionary API (dictionaryapi.dev): Wiktionary data, CC BY-SA 3.0.
// Definitions, IPA, pronunciation audio (Wikimedia Commons), synonyms, examples.
// ---------------------------------------------------------------------------

export type FdEntry = {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string; audio?: string; license?: { name?: string } }[];
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string; synonyms?: string[]; antonyms?: string[] }[];
    synonyms?: string[];
    antonyms?: string[];
  }[];
};

export const freeDictionaryUrl = (word: string) =>
  `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;

export type PickedDefinition = {
  pos: string;
  definition: string;
  /** 1-based index of the chosen definition among those of this part of speech. */
  definitionIndex: number;
  example: string | null;
  synonyms: string[];
  antonyms: string[];
  ipa: string | null;
  audioUrl: string | null;
  audioLicense: string | null;
};

/** Sense labels that make a definition a poor first choice for learners. */
const UNSUITABLE_LABEL =
  /\b(obsolete|archaic|rare|dated|historical|dialect(al)?|poetic|slang|vulgar|nonstandard|offensive|figuratively|originally|literally)\b/i;

function isSuitable(definition: string) {
  const label = /^\(([^)]*)\)/.exec(definition.trim());
  return !(label && UNSUITABLE_LABEL.test(label[1]));
}

const unique = (items: string[]) => [...new Set(items.map((s) => s.trim()).filter(Boolean))];

/**
 * Picks one definition.
 * - `pos`: wanted part of speech; null = the first one listed.
 * - `index`: 1-based definition index to force (from the input's `wiktionary_sense`);
 *   null = the first definition without an obsolete/archaic/slang… label.
 */
export function pickDefinition(
  entries: FdEntry[],
  pos: string | null,
  index: number | null,
): PickedDefinition | null {
  const meanings = entries.flatMap((e) => e.meanings);
  const wanted = pos ? normalizePos(pos) : null;
  const sameMeanings = meanings.filter((m) => !wanted || normalizePos(m.partOfSpeech) === wanted);
  if (sameMeanings.length === 0) return null;

  const definitions = sameMeanings.flatMap((m) =>
    m.definitions.map((d) => ({ ...d, meaning: m })),
  );
  if (definitions.length === 0) return null;

  let i: number;
  if (index !== null) {
    if (index < 1 || index > definitions.length) return null;
    i = index - 1;
  } else {
    i = Math.max(
      0,
      definitions.findIndex((d) => isSuitable(d.definition)),
    );
  }
  const chosen = definitions[i];

  const phonetics = entries.flatMap((e) => e.phonetics ?? []);
  const withAudio = (suffix: string) =>
    phonetics.find((p) => p.audio && p.audio.endsWith(suffix));
  const audio = withAudio('-us.mp3') ?? withAudio('-uk.mp3') ?? phonetics.find((p) => p.audio);
  const ipa =
    (audio?.text ? audio.text : undefined) ??
    phonetics.find((p) => p.text)?.text ??
    entries.find((e) => e.phonetic)?.phonetic ??
    null;

  return {
    pos: normalizePos(chosen.meaning.partOfSpeech),
    definition: chosen.definition.trim(),
    definitionIndex: i + 1,
    example: chosen.example?.trim() || null,
    synonyms: unique([...(chosen.synonyms ?? []), ...(chosen.meaning.synonyms ?? [])]).slice(0, 8),
    antonyms: unique([...(chosen.antonyms ?? []), ...(chosen.meaning.antonyms ?? [])]).slice(0, 8),
    ipa: ipa || null,
    audioUrl: audio?.audio || null,
    audioLicense: audio?.license?.name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Datamuse: the same Wiktionary (+ WordNet) definitions, but ordered by how
// common each sense is, so the first one is usually the sense learners need.
// Primary source for definition_en.
// ---------------------------------------------------------------------------

export const datamuseUrl = (word: string) =>
  `https://api.datamuse.com/words?${new URLSearchParams({ sp: word, md: 'd', max: '1' })}`;

const DATAMUSE_POS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };

/** Grammar-only labels that add nothing for a learner. Domain labels like "(computing)" are kept. */
const GRAMMAR_LABEL = /^\((?:countable|uncountable|transitive|intransitive|ambitransitive)(?:,\s*(?:countable|uncountable|transitive|intransitive))*\)\s*/i;
const HEDGE_PREFIX = /^(?:now especially|now chiefly|now|chiefly|especially),\s*/i;
const CLIPPING = /^(?:\([^)]*\)\s*)?(?:clipping|shortened form|short form|short|abbreviation) (?:of|for) [“"]?([A-Za-z][A-Za-z -]*?)[”"]?(?:[,.;]|$)/i;

export function cleanDefinition(definition: string): string {
  let d = definition.trim().replace(GRAMMAR_LABEL, '').replace(HEDGE_PREFIX, '');
  if (d) d = d[0].toUpperCase() + d.slice(1);
  return d;
}

export type DatamusePick = {
  definition: string;
  /** 1-based index among this word's definitions for the part of speech. */
  index: number;
  /** Set when the chosen sense is just "Clipping of X": look X up instead. */
  clippingOf: string | null;
};

/**
 * Picks a definition for `pos` (null = any). `pick` forces a 1-based index;
 * otherwise the first one without an obsolete/archaic/slang… label.
 */
export function parseDatamuse(
  body: { word?: string; defs?: string[] }[],
  word: string,
  pos: string | null,
  pick: number | null,
): DatamusePick | null {
  const hit = body.find((b) => b.word?.toLowerCase() === word.toLowerCase());
  if (!hit?.defs) return null;
  const wanted = pos ? normalizePos(pos) : null;
  const defs = hit.defs
    .map((raw) => {
      const [code, ...rest] = raw.split('\t');
      return { pos: DATAMUSE_POS[code] ?? code, text: rest.join('\t').trim() };
    })
    .filter((d) => d.text && (!wanted || d.pos === wanted));
  if (defs.length === 0) return null;

  let i: number;
  if (pick !== null) {
    if (pick < 1 || pick > defs.length) return null;
    i = pick - 1;
  } else {
    i = Math.max(
      0,
      defs.findIndex((d) => isSuitable(d.text)),
    );
  }
  const text = defs[i].text;
  const clipping = CLIPPING.exec(text);
  return {
    definition: cleanDefinition(text),
    index: i + 1,
    clippingOf: clipping ? clipping[1].trim() : null,
  };
}

// ---------------------------------------------------------------------------
// kaikki.org: Wiktionary extracted by wiktextract, CC BY-SA.
// Used for IPA (when the Free Dictionary has none) and Vietnamese translations.
// ---------------------------------------------------------------------------

type KaikkiTranslation = { code?: string; lang?: string; word?: string; sense?: string };
type KaikkiSense = {
  glosses?: string[];
  tags?: string[];
  form_of?: unknown[];
  alt_of?: unknown[];
  examples?: { text?: string }[];
  translations?: KaikkiTranslation[];
};
type KaikkiEntry = {
  word: string;
  pos: string;
  sounds?: { ipa?: string; tags?: string[] }[];
  translations?: KaikkiTranslation[];
  senses?: KaikkiSense[];
};

const UNSUITABLE_TAGS = new Set([
  'obsolete', 'archaic', 'rare', 'dated', 'historical', 'dialectal', 'poetic',
  'slang', 'vulgar', 'offensive', 'nonstandard', 'figuratively', 'uncommon',
]);

export type KaikkiResult = {
  ipa: string | null;
  vi: string[];
  /** First learner-suitable gloss (fallback when the Free Dictionary API has none). */
  definition: string | null;
  example: string | null;
};

export function kaikkiUrl(word: string) {
  const w = word.toLowerCase();
  const seg = (s: string) => encodeURIComponent(s);
  return `https://kaikki.org/dictionary/English/meaning/${seg(w.slice(0, 1))}/${seg(w.slice(0, 2))}/${seg(w)}.jsonl`;
}

/**
 * Parses the JSONL page: IPA, up to 3 Vietnamese translations of the first
 * translated sense, and the first suitable gloss with its example.
 */
export function parseKaikki(jsonl: string, pos: string): KaikkiResult {
  const entries: KaikkiEntry[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as KaikkiEntry);
    } catch {
      // Ignore malformed lines.
    }
  }
  const wanted = normalizePos(pos);
  const matching = entries.filter((e) => normalizePos(e.pos) === wanted);
  const pool = matching.length > 0 ? matching : entries;

  const sounds = pool.flatMap((e) => e.sounds ?? []).filter((s) => s.ipa);
  const us = sounds.find((s) =>
    (s.tags ?? []).some((t) => /^(US|General-American)$/i.test(t)),
  );
  const ipa = (us ?? sounds[0])?.ipa ?? null;

  const translations = pool.flatMap((e) => [
    ...(e.translations ?? []),
    ...(e.senses ?? []).flatMap((s) => s.translations ?? []),
  ]);
  const vietnamese = translations.filter(
    (t) => (t.code === 'vi' || t.lang === 'Vietnamese') && t.word,
  );
  // Keep the first sense group only: it usually matches the main meaning.
  const firstSense = vietnamese[0]?.sense;
  const vi = unique(
    vietnamese.filter((t) => t.sense === firstSense).map((t) => t.word as string),
  ).slice(0, 3);

  const sense = pool
    .flatMap((e) => e.senses ?? [])
    .find(
      (x) =>
        x.glosses?.[0] &&
        !x.form_of &&
        !x.alt_of &&
        !(x.tags ?? []).some((t) => UNSUITABLE_TAGS.has(t)),
    );
  const definition = sense?.glosses?.[0]?.trim() ?? null;
  const example = sense?.examples?.find((e) => e.text)?.text?.trim() ?? null;

  return { ipa, vi, definition, example };
}

// ---------------------------------------------------------------------------
// MyMemory: translation memory + machine translation. Fallback for meaning_vi
// only; quality varies, so results are flagged for review.
// ---------------------------------------------------------------------------

export function myMemoryUrl(word: string, email?: string) {
  const params = new URLSearchParams({ q: word, langpair: 'en|vi' });
  if (email) params.set('de', email);
  return `https://api.mymemory.translated.net/get?${params}`;
}

export function parseMyMemory(
  body: { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: string } },
  word: string,
): string | null {
  if (Number(body.responseStatus) !== 200 || body.quotaFinished) return null;
  const text = body.responseData?.translatedText?.trim();
  if (!text || /MYMEMORY/i.test(text)) return null;
  if (text.toLowerCase() === word.toLowerCase()) return null; // untranslated
  return text.toLowerCase();
}

// ---------------------------------------------------------------------------
// Tatoeba: example sentences with Vietnamese translations. CC BY 2.0 FR
// (attribute the sentence owner) or CC0.
// ---------------------------------------------------------------------------

export type TatoebaExample = {
  id: number;
  sentence: string;
  translationVi: string;
  owner: string | null;
  license: string;
};

type TatoebaSentence = {
  id: number;
  text: string;
  lang: string;
  license?: string | null;
  user?: { username?: string } | null;
  translations?: { id: number; text: string; lang: string }[][];
};

export function tatoebaUrl(word: string) {
  const params = new URLSearchParams({
    from: 'eng',
    to: 'vie',
    trans_filter: 'limit',
    query: `=${word}`, // exact word form
    sort: 'relevance',
  });
  return `https://tatoeba.org/en/api_v0/search?${params}`;
}

const OPEN_LICENSES = new Set(['CC BY 2.0 FR', 'CC0 1.0']);

/** Up to `max` short sentences (4–14 words) that contain the word and have a Vietnamese translation. */
export function parseTatoeba(
  body: { results?: TatoebaSentence[] },
  word: string,
  max = 2,
): TatoebaExample[] {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wholeWord = new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu');
  const out: TatoebaExample[] = [];

  for (const s of body.results ?? []) {
    if (s.lang !== 'eng' || !OPEN_LICENSES.has(s.license ?? '')) continue;
    const words = s.text.trim().split(/\s+/).length;
    if (words < 4 || words > 14 || !wholeWord.test(s.text)) continue;
    const vi = (s.translations ?? []).flat().find((t) => t.lang === 'vie');
    if (!vi) continue;
    out.push({
      id: s.id,
      sentence: s.text.trim(),
      translationVi: vi.text.trim(),
      owner: s.user?.username ?? null,
      license: s.license as string,
    });
    if (out.length >= max) break;
  }
  return out;
}
