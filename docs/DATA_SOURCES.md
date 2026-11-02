# Vocabulary data sources

Where word data comes from, the licence of each source, and how to turn a plain word list into importable data.

Checked on 2026-11-02. Terms change, so re-check a source's page before a large import.

## 1. Workflow

```text
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
| `ipa`, `audio_url`, `synonyms`, `antonyms` | **Free Dictionary API** (`api.dictionaryapi.dev`). IPA falls back to kaikki.org. | Wiktionary text: CC BY-SA 3.0. Audio: Wikimedia Commons, mostly CC BY-SA 3.0/4.0 (per file). |
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

`words:enrich` does not assign CEFR levels or topics. They come from your list.

| List | Levels | Licence | Use |
|------|--------|---------|-----|
| **CEFR-J Wordlist** (cefr-j.org/download.html) | A1–B2 | Not confirmed. Read the terms on the download page before redistributing. | Best candidate for the main list |
| **Octanove Vocabulary Profile** (with CEFR-J) | C1–C2 | CC BY-SA 4.0 | C-level words |
| Oxford 3000 / 5000 | A1–C1 | © Oxford University Press. Free to view and download, but not an open licence. | Cross-checking only. Do not copy it into the app. |
| English Vocabulary Profile (Cambridge) | A1–C2 per sense | Look-up only | Cross-checking only |

The sample list `backend/prisma/seed/words-sample.csv` (53 words, one per leaf topic) is for testing the pipeline. **Its CEFR levels were assigned by hand.** Verify them against CEFR-J before relying on them.

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

If the automatic definition is the wrong sense, add `def_pick` (a 1-based index into the Datamuse definitions for that part of speech) to the input row and re-run. Example: `brand,noun,B1,marketing,3` picks "The symbolic identity… of a product" instead of "A mark made by burning".

## 6. Other free sources considered

| Source | Why it is not used (yet) |
|--------|--------------------------|
| Merriam-Webster Learner's API | Best learner definitions, but needs a key, allows 1,000 requests/day per key, is non-commercial only and has restrictive terms. Worth adding later as an optional source. |
| WordsAPI (RapidAPI) | About 2,500 requests/day free (third-party figure), and RapidAPI sign-up. Adds nothing over the sources above. |
| Oxford Dictionaries API | No useful free tier. |
| FreeDict eng-vie | The licence differs per dictionary, and the eng-vie terms were not confirmed. |
