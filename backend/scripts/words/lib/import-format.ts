/**
 * The word import format (PLAN.md §7), shared by the enrich and import scripts.
 * JSON uses arrays; CSV uses `|` to separate multiple values in one cell.
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export type ImportExample = { sentence: string; translation_vi?: string | null };

export type ImportWord = {
  headword: string;
  pos: string;
  sense_no: number;
  ipa?: string | null;
  cefr_level: CefrLevel;
  definition_en: string;
  meaning_vi?: string | null;
  examples: ImportExample[];
  topics: string[];
  synonyms: string[];
  antonyms: string[];
  audio_url?: string | null;
  source?: string | null;
};

export type ValidationError = { index: number; headword: string; message: string };

const splitList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean);
};

const optionalString = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
};

/**
 * Audio hosts the app must not link to. `api.dictionaryapi.dev` serves its mp3
 * files behind a Cloudflare block (403 HTML instead of audio, seen 2026-11-13),
 * so a word with such a URL plays nothing and only then falls back to the
 * browser's speech synthesis.
 */
export const BLOCKED_AUDIO_HOSTS: readonly string[] = ['api.dictionaryapi.dev'];

/** True when the URL points at a host in BLOCKED_AUDIO_HOSTS. */
export function isBlockedAudioUrl(url: string): boolean {
  try {
    return BLOCKED_AUDIO_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Removes the `audio: …` credit from a `source` string (parts are joined with " · "). */
export function stripAudioCredit(source: string | null): string | null {
  if (!source) return source;
  const parts = source.split(' · ').filter((part) => !part.trimStart().startsWith('audio:'));
  return parts.length ? parts.join(' · ') : null;
}

/** Maps one raw record (a CSV row or a JSON object) onto the import shape, without validating. */
export function normalizeRecord(raw: Record<string, unknown>): ImportWord {
  const examples: ImportExample[] = Array.isArray(raw.examples)
    ? (raw.examples as unknown[]).flatMap((e) => {
        if (typeof e === 'string') return e.trim() ? [{ sentence: e.trim() }] : [];
        if (e && typeof e === 'object' && 'sentence' in e) {
          const ex = e as { sentence: unknown; translation_vi?: unknown };
          const sentence = String(ex.sentence ?? '').trim();
          return sentence ? [{ sentence, translation_vi: optionalString(ex.translation_vi) }] : [];
        }
        return [];
      })
    : splitList(raw.examples).map((sentence) => ({ sentence }));

  const senseRaw = optionalString(raw.sense_no);
  // Older enrich output links audio on blocked hosts: drop it, and its credit.
  const audioRaw = optionalString(raw.audio_url);
  const audioBlocked = audioRaw !== null && isBlockedAudioUrl(audioRaw);
  const sourceRaw = optionalString(raw.source);
  return {
    headword: String(raw.headword ?? '').trim(),
    pos: String(raw.pos ?? '')
      .trim()
      .toLowerCase(),
    sense_no: senseRaw === null ? 1 : Number(senseRaw),
    ipa: optionalString(raw.ipa),
    cefr_level: String(raw.cefr_level ?? '')
      .trim()
      .toUpperCase() as CefrLevel,
    definition_en: String(raw.definition_en ?? '').trim(),
    meaning_vi: optionalString(raw.meaning_vi),
    examples,
    topics: splitList(raw.topics).map((t) => t.toLowerCase()),
    synonyms: splitList(raw.synonyms),
    antonyms: splitList(raw.antonyms),
    audio_url: audioBlocked ? null : audioRaw,
    source: audioBlocked ? stripAudioCredit(sourceRaw) : sourceRaw,
  };
}

/**
 * Applies the PLAN.md §7 rules. `knownTopics` is the set of topic slugs that
 * exist; pass null to skip the topic check.
 */
export function validateWords(
  words: ImportWord[],
  knownTopics: ReadonlySet<string> | null,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const seen = new Map<string, number>();

  words.forEach((w, index) => {
    const fail = (message: string) => errors.push({ index, headword: w.headword, message });

    if (!w.headword) fail('headword is required');
    if (!w.pos) fail('pos is required');
    if (!w.definition_en) fail('definition_en is required');
    if (!CEFR_LEVELS.includes(w.cefr_level)) {
      fail(`cefr_level must be one of ${CEFR_LEVELS.join(' ')} (got "${w.cefr_level}")`);
    }
    if (!Number.isInteger(w.sense_no) || w.sense_no < 1) {
      fail('sense_no must be a positive integer');
    }
    if (knownTopics) {
      for (const slug of w.topics) {
        if (!knownTopics.has(slug)) fail(`unknown topic slug "${slug}"`);
      }
    }

    const key = wordKey(w);
    const first = seen.get(key);
    if (first !== undefined) fail(`duplicate of row ${first + 1} (${key})`);
    else seen.set(key, index);
  });

  return errors;
}

/** Natural key of a word: (headword, pos, sense_no). */
export const wordKey = (w: Pick<ImportWord, 'headword' | 'pos' | 'sense_no'>) =>
  `${w.headword.toLowerCase()}|${w.pos}|${w.sense_no}`;

/** URL slug, e.g. "bank-noun-2". */
export function wordSlug(w: Pick<ImportWord, 'headword' | 'pos' | 'sense_no'>): string {
  const base = `${w.headword}-${w.pos}-${w.sense_no}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base;
}
