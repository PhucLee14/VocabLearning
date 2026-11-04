# Word review guide

How to review one part exported by `npm run words:review -- export` (see `review.ts`). Written for a person or an AI agent. The app is for **Vietnamese learners of English**: every word becomes a flashcard with an English definition, a Vietnamese meaning and example sentences.

## Input

A JSON array. Each item:

```json
{ "id": "address|noun", "level": "A1",
  "definition_en": "Direction.", "meaning_vi": "địa chỉ",
  "examples": [{ "i": 0, "en": "What's your address?", "vi": "Địa chỉ của bạn là gì?" }],
  "topics": ["people-family"], "notes": ["automatic notes from words:enrich"] }
```

`id` is `headword|pos`. `level` is the CEFR level of this word and part of speech. The data came from free sources automatically, so expect errors.

## What to check, for every item

1. **Sense.** Use the sense a learner at this `level` needs for this part of speech. The most common modern meaning, not an old, rare, technical or regional one (e.g. *address* noun → where someone lives, not "direction").
2. **`definition_en`.** Replace it when it is the wrong sense, missing, archaic, circular, grammar-talk ("Form of a"), longer than about 25 words, or uses words harder than the headword.
   - Write a short learner-friendly definition **in your own words**: plain English, at most about 20 words, no headword inside it.
   - **Never copy** a definition from Cambridge, Oxford, Longman, Merriam-Webster or any other dictionary.
   - Function words (prepositions, conjunctions, modals, pronouns, determiners): describe the use simply, e.g. *above* prep → "In or to a higher place than something."
3. **`meaning_vi`.** It must match the chosen sense. Give 1–3 common Vietnamese equivalents, comma-separated, lower case unless a proper noun, no explanations in brackets unless needed to disambiguate. Replace it when it is wrong, for another sense, odd or missing.
4. **Examples.** Drop (by index `i`) any example that uses another sense or another part of speech, is offensive, sensitive (violence, politics, religion, sex), or unnatural. Keep at most 2 good ones. If a kept example has no Vietnamese (`vi: null`) or a wrong one, give a natural translation in `example_translations`. **If no good example is left (or there was none), write one** in `add_examples`: your own short, natural sentence (5–12 words, vocabulary at or below the item's level, using this sense and part of speech, nothing sensitive) with its Vietnamese translation.
5. **Topics.** Only slugs from the list below. Add topics to words that have none when one clearly fits (most concrete nouns, many verbs and adjectives do). Leave abstract or general words without a topic rather than forcing one. Fix obviously wrong topics. Prefer the most specific subtopic.
6. **Drop** the item (`"action": "drop"`) only when it should not be a flashcard at all: a pure inflection or contraction, a duplicate of another item in the part with the same meaning, a proper noun that is not useful, or an entry whose headword is garbled.

## Output

Write **only** a JSON array of corrections to the given output path. Include an item only when something changes. Items you leave out are accepted as they are.

```json
[
  { "id": "address|noun", "action": "fix",
    "definition_en": "The number, street and town where someone lives or where a building is.",
    "drop_examples": [1], "example_translations": { "0": "Địa chỉ của bạn là gì?" },
    "add_examples": [{ "sentence": "Please write your address here.", "translation_vi": "Vui lòng viết địa chỉ của bạn ở đây." }],
    "topics": ["people-family"], "note": "wrong sense" },
  { "id": "the|determiner", "action": "drop", "note": "article" }
]
```

Fields: `id` (exactly as given), `action` (`fix` or `drop`), and for `fix` any of `definition_en`, `meaning_vi`, `drop_examples` (indexes), `example_translations` (`{ "index": "Vietnamese" }`), `add_examples` (`[{ "sentence", "translation_vi" }]`), `topics` (the full new list), `note` (a few words on why). Make sure the file is valid JSON.

## Topic slugs

- `people-family` (People & Family): `family-members` (Family members), `relationships` (Relationships), `life-stages` (Life stages)
- `appearance-personality` (Appearance & Personality): `appearance` (Appearance), `character-traits` (Character traits)
- `feelings` (Feelings & Emotions): `positive-feelings` (Positive feelings), `negative-feelings` (Negative feelings), `attitudes` (Attitudes)
- `health-body` (Health & Body): `body-parts` (Body parts), `illness-injury` (Illness & Injury), `fitness` (Fitness)
- `food-drink` (Food & Drink): `cooking` (Cooking), `restaurant` (At the restaurant), `taste-texture` (Taste & Texture)
- `home` (Home & Housing): `rooms-furniture` (Rooms & Furniture), `housework` (Housework)
- `daily-life` (Daily Life & Routines)
- `money-shopping` (Shopping & Money): `shops` (Shops & Shopping), `prices-payment` (Prices & Payment), `banking` (Banking)
- `clothes-fashion` (Clothes & Fashion)
- `travel-transport` (Travel & Transport): `airport-flights` (Airport & Flights), `accommodation` (Hotels & Accommodation), `directions` (Directions)
- `places-city` (Places & City): `buildings` (Buildings), `countryside` (Countryside)
- `work-jobs` (Work & Jobs): `occupations` (Occupations), `office` (In the office), `job-hunting` (Job hunting)
- `education` (Education): `school` (School), `university` (University), `exams` (Exams)
- `technology` (Technology): `computers` (Computers), `internet` (The Internet), `devices` (Devices)
- `nature-environment` (Nature & Environment): `animals` (Animals), `plants` (Plants), `pollution` (Pollution)
- `weather` (Weather & Climate)
- `sports-hobbies` (Sports & Hobbies)
- `arts-entertainment` (Arts & Entertainment): `music` (Music), `film-tv` (Film & TV), `books` (Books & Literature)
- `media-communication` (Media & Communication): `news` (News), `social-media` (Social media)
- `society` (Society & Politics): `law-crime` (Law & Crime), `government` (Government)
- `business-economy` (Business & Economy): `marketing` (Marketing), `finance` (Finance)
- `science` (Science)
- `time-numbers` (Time & Numbers)
- `academic` (Academic English): `academic-word-list` (Academic Word List), `ielts` (IELTS)
