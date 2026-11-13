# Vocabulary data sources

Where word data comes from, the licence of each source, and how to turn a plain word list into importable data.

Checked on 2026-11-02. Terms change, so re-check a source's page before a large import.

## 1. Workflow

```text
CEFR-J + Octanove lists ── npm run words:cefrj ──┐   (or your own CSV)
                                                 ▼
word list (headword, pos, CEFR, topics)
        │  npm run words:enrich      looks up the empty fields, caches every response
        ▼
<list>.enriched.json  + "_review" notes per word
        │  a human checks the notes and fixes the data
        ▼
npm run words:import -- <file> --dry-run   →   npm run words:import -- <file>
```

- **Enrich once, at import time.** The app never calls these APIs while serving users:
  - none of them has an SLA, and the Free Dictionary API sometimes returns errors for real words;
  - Datamuse will need a key from 2027;
  - the backend is a serverless function with a time limit.
- **Your values always win.** Any field already filled in the input (`definition_en`, `meaning_vi`, `examples`…) is kept. Only empty fields are looked up.
- **Responses are cached** in `backend/scripts/words/.cache/` (gitignored). Re-runs are fast and do not hit the APIs again. Use `--refresh` to refetch.
- **The script spaces out its requests** to each host (Tatoeba 1 s, others 200–500 ms) and retries on 429/5xx with backoff.

## 2. Sources used by `words:enrich`

| Field | Source, in order of preference | Licence |
|-------|--------------------------------|---------|
| `definition_en` | **Datamuse** (Wiktionary senses ordered by how common they are, so the first is usually the learner's sense). Falls back to the Free Dictionary API, then kaikki.org. | Wiktionary: CC BY-SA. WordNet: WordNet licence (permissive). |
| `ipa`, `synonyms`, `antonyms` | **Free Dictionary API** (`api.dictionaryapi.dev`). IPA falls back to kaikki.org. | Wiktionary text: CC BY-SA 3.0. |
| `audio_url` | **None for now.** The Free Dictionary API's mp3 links (`api.dictionaryapi.dev/media/…`) answer 403 behind a Cloudflare block (2026-11-13), so `BLOCKED_AUDIO_HOSTS` drops them in enrich and import, and `npm run words:clear-audio` removed them from the DB. Words without audio use the browser's speech synthesis. Self-hosted audio (Kokoro, PLAN.md Phase 3c) is the plan. | — |
| `meaning_vi` | **kaikki.org** (Wiktionary translation tables, via wiktextract). Falls back to **MyMemory**. | Wiktionary: CC BY-SA. MyMemory: translation memory plus machine translation, no clear licence. Treat it as a draft and always review it. |
| `examples` (+ `translation_vi`) | **Tatoeba** English sentences with a Vietnamese translation, 4–14 words. Only CC BY 2.0 FR or CC0 sentences are used. Falls back to a Wiktionary example (no translation). | CC BY 2.0 FR: attribute the sentence owner. |
| `cefr_level`, `topics` | **Not looked up.** Comes from your word list (see §3). | — |

### Endpoints and limits

| Source | Endpoint | Key | Limits / notes |
|--------|----------|-----|----------------|
| Datamuse | `https://api.datamuse.com/words?sp=<word>&md=d&max=1` | None until early 2027 | Free without a key "until January 1, 2027" (the site's banner says February 1, 2027). After that a key is required, 100,000 requests/day. Asks for an acknowledgement in the app's documentation. |
| Free Dictionary API | `https://api.dictionaryapi.dev/api/v2/entries/en/<word>` | None | No published limit. Unreliable: it sometimes returns an HTML 404 page for real words. The script treats that as a transient error and retries, and does not cache it. A genuine "not found" is a JSON 404. |
| kaikki.org | `https://kaikki.org/dictionary/English/meaning/<w>/<wo>/<word>.jsonl` | None | Static files. A full download is available at kaikki.org/dictionary/rawdata.html for offline bulk work. |
| MyMemory | `https://api.mymemory.translated.net/get?q=<word>&langpair=en\|vi` | None | Small daily quota per IP; adding `de=<email>` raises it. Set `MYMEMORY_EMAIL` to send one. Disable with `--no-mymemory`. |
| Tatoeba | `https://tatoeba.org/en/api_v0/search?from=eng&to=vie&trans_filter=limit&query==<word>` | None | `api_v0` is the website's own search API, not a documented public API, so use it gently. For bulk work, use the official exports at tatoeba.org/downloads. |

## 3. Word lists with CEFR levels

`words:enrich` does not assign CEFR levels. They come from the word list. **`npm run words:cefrj`** builds the lists from the open profiles below (checked 2026-11-03), downloading them into the cache on each run:

| List | Levels | Licence | Use |
|------|--------|---------|-----|
| **CEFR-J Wordlist 1.5** ([openlanguageprofiles/olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj)) | A1–B2, 7,799 rows | "Can be used for research and commercial purposes with no charge, provided that you cite the dataset properly." © Tono Laboratory, TUFS. Cite: *The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies.* | **Used** (`words:cefrj`) |
| **Octanove Vocabulary Profile C1/C2 1.0** (same repo) | C1–C2, 2,136 rows | CC BY-SA 4.0 | **Used** (`words:cefrj`) |
| Oxford 3000 / 5000 | A1–C1 | © Oxford University Press. Free to view and download, but not an open licence. | Cross-checking only. Do not copy it into the app. |
| English Vocabulary Profile (Cambridge) | A1–C2 per sense | Look-up only | Cross-checking only |

How `words:cefrj` builds the lists (`backend/scripts/words/build-cefrj.ts`):
- Topics: CEFR-J's *CoreInventory* and *Threshold* labels are mapped onto our topic slugs (`TOPIC_MAP`). About 2,100 A1–B2 words get a topic; the rest (and all C1/C2 words) have none and are found by level.
- Variants such as `adviser/advisor` keep the first spelling. Case is kept (`March` and `march` are different words).
- Skipped: contractions (`'re`, `'s`), inflected *be/do/have* forms, and the articles *a/an/the*.
- A word in both lists keeps the lower level. The 53 hand-curated sample words keep their reviewed content.
- Output: `backend/scripts/words/out/cefrj-<level>.json` (gitignored; the lists are cited, not redistributed). Each word's `source` starts with `level: CEFR-J Wordlist 1.5 (Yukio Tono, TUFS)` or `level: Octanove Vocabulary Profile C1/C2 (CC BY-SA 4.0)`.

The hand-made sample `backend/prisma/seed/words-sample.csv` (53 words) predates this; its levels are replaced by CEFR-J levels where the word is listed.

**Cambridge Dictionary is not a source.** Its content belongs to Cambridge University Press and is only available through the official Cambridge Dictionaries API, which needs an application and an Application Development Agreement. Do not scrape the website.

### Quality of automatic data at scale

A 40-word trial (A1) on 2026-11-03 showed what to expect from the free sources without human review:
- definitions are sometimes an old or rare first sense (*address* → "Direction.", *about* prep. → "In a circle around");
- Vietnamese meanings from Wiktionary tables can belong to another sense (*afraid* → "đáng sợ"); MyMemory is a machine-translation fallback with a small daily quota;
- function words (prepositions, determiners, modals) get grammar-style definitions.

Review the `_review` notes of a level before importing it, or improve definitions and meanings in a later pass.

## 4. Attribution (required)

CC BY-SA and CC BY require credit. Each enriched word carries a `source` string, for example:

```text
definition: Wiktionary/WordNet via Datamuse (CC BY-SA) · vi: Wiktionary via kaikki.org (CC BY-SA)
· examples: Tatoeba #13872712 by rul, #325947 by CK (CC BY 2.0 FR) · audio: Wikimedia Commons (BY-SA 3.0)
```

It is stored in `words.source`. When the word pages are built (Phase 1):

- show the `source` line (or a short form linking to an "About the data" page) on every word page;
- link Tatoeba sentences to `https://tatoeba.org/sentences/show/<id>` and name the owner;
- keep an "About the data" page listing Wiktionary (CC BY-SA), WordNet, Tatoeba (CC BY 2.0 FR), Wikimedia Commons, Datamuse and the Free Dictionary API.

**Share-alike:** text derived from CC BY-SA sources (definitions, Wiktionary translations) stays CC BY-SA. If the word data is ever published as a download, it must carry the same licence.

## 5. Reviewing the output

Each enriched word has a `_review` array. It is ignored by `words:import`, but read it before importing. Common notes:

| Note | What to do |
|------|------------|
| `meaning_vi from Wiktionary translations; check it matches this sense` | The translation table may belong to another sense, or list near-synonyms (e.g. "má, mẹ, mợ"). Keep the 1–2 best. |
| `meaning_vi from MyMemory (machine/TM); verify it` | Machine translation. Check it carefully. |
| `Tatoeba examples may use another sense of the word` | Example: "brand new bicycle" for *brand* (noun). Delete examples that don't fit. |
| `skipped N labelled sense(s); check the definition` | Obsolete, archaic or slang senses were skipped automatically. |
| `"exam" is a clipping of "examination"; used its definition` | Informational. |
| `<source> failed (…)` | The source was unreachable even after retries. Re-run later; cached results are kept. |
| `MyMemory daily quota used up` (printed once) | MyMemory is skipped for the rest of the run, and the quota answer is not cached. Re-run another day (or set `MYMEMORY_EMAIL` for a larger quota) to fill the remaining `meaning_vi`. |

If the automatic definition is the wrong sense, add `def_pick` (a 1-based index into the Datamuse definitions for that part of speech) to the input row and re-run. Example: `brand,noun,B1,marketing,3` picks "The symbolic identity… of a product" instead of "A mark made by burning".

### Review pass (`words:review`)

Between enrich and import, each level is reviewed in parts:

```bash
npm run words:review -- export scripts/words/out/cefrj-a1.enriched.json --size 230   # → out/review/cefrj-a1.part-NN.json
# a reviewer (person or AI agent) follows scripts/words/REVIEW_GUIDE.md and writes part-NN.corrections.json
npm run words:review -- apply scripts/words/out/cefrj-a1.enriched.json out/review/cefrj-a1.part-*.corrections.json -o scripts/words/out/cefrj-a1.reviewed.json
npm run words:import -- scripts/words/out/cefrj-a1.reviewed.json --dry-run
```

- Reviewers write definitions **in their own words** (never copied from another dictionary), fix Vietnamese meanings and example translations, drop examples that use another sense or are sensitive, and assign topics from the slug list.
- `apply` validates every correction (ids, topic slugs, example indexes) and appends `reviewed: … edited` to the word's `source`. A rewritten definition is the reviewer's own text, so it no longer carries the Wiktionary licence; untouched fields keep their original attribution.
- **All levels done (2026-11-03/04): 9,704 words in the DB** (A1 1,144 · A2 1,402 · B1 2,436 · B2 2,760 · C1 1,035 · C2 927), every one with a definition, a Vietnamese meaning and at least one translated example; 4,610 have a topic. About 50 review runs of 210–255 words each; 57 entries were dropped (inflections, duplicates, garbled headwords, slurs, obsolete senses).
- Lessons: run 3–4 reviewers at a time (the account's 5-hour usage limit stopped 15 runs that had 10–11 going); give each reviewer its own scratch folder; cross-check that every corrections file only holds ids of its own part before applying.
- A1 (2026-11-03, five AI agents): 1,118 of 1,148 words edited, 4 dropped. After the review all 1,144 have a Vietnamese meaning, every kept example has a translation, 640 have a topic, and 237 have no example left (all of their examples used another sense).

## 6. Other free sources considered

| Source | Why it is not used (yet) |
|--------|--------------------------|
| Merriam-Webster Learner's API | Best learner definitions, but needs a key, allows 1,000 requests/day per key, is non-commercial only and has restrictive terms. Worth adding later as an optional source. |
| WordsAPI (RapidAPI) | About 2,500 requests/day free (third-party figure), and RapidAPI sign-up. Adds nothing over the sources above. |
| Oxford Dictionaries API | No useful free tier. |
| FreeDict eng-vie | The licence differs per dictionary, and the eng-vie terms were not confirmed. |
