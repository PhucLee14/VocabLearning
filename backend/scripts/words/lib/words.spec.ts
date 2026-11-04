import { parseCsv, parseCsvRecords } from './csv.js';
import { normalizeRecord, validateWords, wordSlug } from './import-format.js';
import {
  cleanDefinition,
  type FdEntry,
  kaikkiUrl,
  parseKaikki,
  parseDatamuse,
  parseMyMemory,
  parseTatoeba,
  pickDefinition,
} from './sources.js';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, embedded commas/newlines, CRLF and a BOM', () => {
    const text = '﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n\r\nlast,';
    expect(parseCsv(text)).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
      ['last', ''],
    ]);
  });

  it('maps rows to objects by lower-cased header', () => {
    expect(parseCsvRecords('Headword,POS\napple, noun \n')).toEqual([
      { headword: 'apple', pos: 'noun' },
    ]);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('a,"b')).toThrow(/unterminated/);
  });
});

describe('import format', () => {
  it('normalizes a CSV row with | separated lists', () => {
    const w = normalizeRecord({
      headword: 'abandon',
      pos: 'Verb',
      sense_no: '',
      cefr_level: 'b2',
      definition_en: 'to leave and not come back',
      examples: 'They abandoned the car.|She abandoned her plan.',
      topics: 'society|Feelings',
      synonyms: 'desert|leave',
    });
    expect(w).toMatchObject({
      pos: 'verb',
      sense_no: 1,
      cefr_level: 'B2',
      topics: ['society', 'feelings'],
      synonyms: ['desert', 'leave'],
      examples: [{ sentence: 'They abandoned the car.' }, { sentence: 'She abandoned her plan.' }],
    });
  });

  it('keeps JSON example translations', () => {
    const w = normalizeRecord({
      headword: 'apple',
      examples: [{ sentence: 'I eat an apple.', translation_vi: 'Tôi ăn táo.' }, 'Plain one.'],
    });
    expect(w.examples).toEqual([
      { sentence: 'I eat an apple.', translation_vi: 'Tôi ăn táo.' },
      { sentence: 'Plain one.' },
    ]);
  });

  it('reports missing fields, bad level, unknown topics and duplicates', () => {
    const base = { headword: 'bank', pos: 'noun', cefr_level: 'A2', definition_en: 'x', topics: 'banking' };
    const words = [
      normalizeRecord(base),
      normalizeRecord({ ...base, topics: 'nope' }),
      normalizeRecord({ headword: 'x', pos: '', cefr_level: 'Z9', definition_en: '' }),
    ];
    const messages = validateWords(words, new Set(['banking'])).map((e) => `${e.index}:${e.message}`);
    expect(messages).toEqual([
      '1:unknown topic slug "nope"',
      '1:duplicate of row 1 (bank|noun|1)',
      '2:pos is required',
      '2:definition_en is required',
      '2:cefr_level must be one of A1 A2 B1 B2 C1 C2 (got "Z9")',
    ]);
  });

  it('builds URL slugs', () => {
    expect(wordSlug({ headword: 'Café au lait', pos: 'noun', sense_no: 2 })).toBe('cafe-au-lait-noun-2');
  });
});

describe('pickDefinition (Free Dictionary)', () => {
  const entries: FdEntry[] = [
    {
      word: 'brand',
      phonetics: [
        { text: '/bɹænd/', audio: 'https://x/brand-uk.mp3' },
        { text: '/bɹænd/', audio: 'https://x/brand-us.mp3', license: { name: 'BY-SA 4.0' } },
      ],
      meanings: [
        {
          partOfSpeech: 'noun',
          definitions: [
            { definition: '(obsolete) A conflagration; a flame.' },
            { definition: 'The name of a product made by one company.', example: 'a popular brand' },
          ],
          synonyms: ['make'],
        },
        { partOfSpeech: 'verb', definitions: [{ definition: 'To burn a mark on.' }] },
      ],
    },
  ];

  it('skips labelled senses and prefers US audio', () => {
    expect(pickDefinition(entries, 'noun', null)).toMatchObject({
      pos: 'noun',
      definition: 'The name of a product made by one company.',
      definitionIndex: 2,
      example: 'a popular brand',
      synonyms: ['make'],
      ipa: '/bɹænd/',
      audioUrl: 'https://x/brand-us.mp3',
      audioLicense: 'BY-SA 4.0',
    });
  });

  it('honours a forced sense and filters by part of speech', () => {
    expect(pickDefinition(entries, 'noun', 1)?.definition).toBe('(obsolete) A conflagration; a flame.');
    expect(pickDefinition(entries, 'verb', null)?.definition).toBe('To burn a mark on.');
    expect(pickDefinition(entries, 'adjective', null)).toBeNull();
    expect(pickDefinition(entries, 'noun', 9)).toBeNull();
  });
});

describe('kaikki.org', () => {
  it('builds the per-word URL', () => {
    expect(kaikkiUrl('Resilient')).toBe(
      'https://kaikki.org/dictionary/English/meaning/r/re/resilient.jsonl',
    );
  });

  it('returns US IPA and the first Vietnamese sense group', () => {
    const lines = [
      JSON.stringify({
        word: 'bank',
        pos: 'noun',
        sounds: [{ ipa: '/bæŋk/', tags: ['UK'] }, { ipa: '/beɪŋk/', tags: ['US'] }],
        senses: [
          {
            translations: [
              { code: 'vi', word: 'ngân hàng', sense: 'institution' },
              { code: 'fr', word: 'banque', sense: 'institution' },
            ],
          },
          { translations: [{ code: 'vi', word: 'bờ', sense: 'edge of river' }] },
        ],
      }),
      JSON.stringify({ word: 'bank', pos: 'verb', sounds: [{ ipa: '/v/' }] }),
      'not json',
    ].join('\n');
    expect(parseKaikki(lines, 'noun')).toEqual({
      ipa: '/beɪŋk/',
      vi: ['ngân hàng'],
      definition: null,
      example: null,
    });
  });

  it('picks the first suitable gloss, skipping labelled and form-of senses', () => {
    const line = JSON.stringify({
      word: 'brand',
      pos: 'noun',
      senses: [
        { glosses: ['A flame.'], tags: ['obsolete'] },
        { glosses: ['Plural of brands.'], form_of: [{ word: 'brands' }] },
        { glosses: ['A name given to a product.'], examples: [{ text: 'a big brand' }] },
      ],
    });
    expect(parseKaikki(line, 'noun')).toMatchObject({
      definition: 'A name given to a product.',
      example: 'a big brand',
    });
  });
});

describe('MyMemory', () => {
  it('accepts a translation and rejects warnings / untranslated text', () => {
    expect(parseMyMemory({ responseStatus: 200, responseData: { translatedText: 'Kiên cường' } }, 'resilient')).toBe(
      'kiên cường',
    );
    expect(parseMyMemory({ responseStatus: 200, responseData: { translatedText: 'resilient' } }, 'resilient')).toBeNull();
    expect(
      parseMyMemory({ responseStatus: 429, responseData: { translatedText: 'MYMEMORY WARNING' } }, 'x'),
    ).toBeNull();
  });
});

describe('Tatoeba', () => {
  const sentence = (id: number, text: string, extra: object = {}) => ({
    id,
    text,
    lang: 'eng',
    license: 'CC BY 2.0 FR',
    user: { username: `u${id}` },
    translations: [[{ id: id + 1000, text: `vi ${id}`, lang: 'vie' }], []],
    ...extra,
  });

  it('keeps short, openly licensed sentences that contain the word and have Vietnamese', () => {
    const body = {
      results: [
        sentence(1, 'Apples.'), // too short
        sentence(2, 'I bought a new map of the city.'),
        sentence(3, 'The mapping software crashed again today.'), // not the whole word
        sentence(4, 'She drew a map for me.', { license: 'CC BY-NC' }), // licence
        sentence(5, 'Can you show me on the map?', { translations: [[]] }), // no Vietnamese
        sentence(6, 'This map is too old to use.'),
        sentence(7, 'Where is the map I gave you?'),
      ],
    };
    expect(parseTatoeba(body, 'map')).toEqual([
      { id: 2, sentence: 'I bought a new map of the city.', translationVi: 'vi 2', owner: 'u2', license: 'CC BY 2.0 FR' },
      { id: 6, sentence: 'This map is too old to use.', translationVi: 'vi 6', owner: 'u6', license: 'CC BY 2.0 FR' },
    ]);
  });
});

describe('Datamuse', () => {
  const body = [
    {
      word: 'exam',
      defs: [
        'v\t(sciences) Shortened form of examine',
        'n\t(informal) Clipping of examination, especially when meaning “test” or “quiz”.',
      ],
    },
  ];

  it('filters by part of speech and detects clippings', () => {
    expect(parseDatamuse(body, 'exam', 'noun', null)).toMatchObject({ index: 1, clippingOf: 'examination' });
    expect(parseDatamuse(body, 'exam', 'verb', null)?.clippingOf).toBe('examine');
    expect(parseDatamuse(body, 'other', 'noun', null)).toBeNull();
  });

  it('skips labelled senses unless a pick is forced', () => {
    const b = [
      {
        word: 'follower',
        defs: ['n\t(literally) One who follows.', 'n\t(social media) An account holder who subscribes.'],
      },
    ];
    expect(parseDatamuse(b, 'follower', 'noun', null)).toMatchObject({
      definition: '(social media) An account holder who subscribes.',
      index: 2,
    });
    expect(parseDatamuse(b, 'follower', 'noun', 1)?.index).toBe(1);
  });

  it('cleans grammar labels and hedges', () => {
    expect(cleanDefinition('(countable) A musical performance.')).toBe('A musical performance.');
    expect(cleanDefinition('Now especially, a set of instructions.')).toBe('A set of instructions.');
    expect(cleanDefinition('(computing) A set of keys.')).toBe('(computing) A set of keys.');
  });
});

describe('CEFR-J list builder', () => {
  it('maps topics, keeps the first spelling and the lower level, and keeps case', async () => {
    const { buildList, mapTopics } = await import('../build-cefrj.js');
    expect(mapTopics(['Food and drink', 'Shopping', 'unknown label', ''])).toEqual(['food-drink', 'money-shopping']);
    const list = buildList(
      [
        { headword: 'adviser/advisor', pos: 'noun', cefr: 'B1', 'coreinventory 1': 'Work and Jobs', threshold: '' },
        { headword: 'March', pos: 'noun', cefr: 'A1', 'coreinventory 1': '', threshold: '' },
        { headword: 'march', pos: 'noun', cefr: 'B1', 'coreinventory 1': '', threshold: '' },
        { headword: 'can', pos: 'modal auxiliary', cefr: 'A1', 'coreinventory 1': '', threshold: '' },
        { headword: 'bad row', pos: 'noun', cefr: 'Z9', 'coreinventory 1': '', threshold: '' },
      ],
      [
        { headword: 'adviser', pos: 'noun', cefr: 'C1', notes: '' },
        { headword: 'laud ', pos: 'verb', cefr: 'C2', notes: '' },
      ],
    );
    expect(list).toEqual([
      { headword: 'adviser', pos: 'noun', cefr_level: 'B1', topics: ['work-jobs'], level_source: expect.stringContaining('CEFR-J') },
      { headword: 'March', pos: 'noun', cefr_level: 'A1', topics: [], level_source: expect.stringContaining('CEFR-J') },
      { headword: 'march', pos: 'noun', cefr_level: 'B1', topics: [], level_source: expect.stringContaining('CEFR-J') },
      { headword: 'can', pos: 'verb', cefr_level: 'A1', topics: [], level_source: expect.stringContaining('CEFR-J') },
      { headword: 'laud', pos: 'verb', cefr_level: 'C2', topics: [], level_source: expect.stringContaining('Octanove') },
    ]);
  });
});

describe('cleanMeaningVi and skipped rows', () => {
  it('decodes entities, trims punctuation and drops a bare copy of the word', async () => {
    const { cleanMeaningVi } = await import('./sources.js');
    expect(cleanMeaningVi('&#10;ở trên', 'above')).toBe('ở trên');
    expect(cleanMeaningVi('sáng.', 'a.m.')).toBe('sáng');
    expect(cleanMeaningVi('a', 'a')).toBeNull();
    expect(cleanMeaningVi('m', "'m")).toBeNull();
    expect(cleanMeaningVi('  bữa   sáng ', 'breakfast')).toBe('bữa sáng');
    expect(cleanMeaningVi(null, 'x')).toBeNull();
  });

  it('skips contractions, inflected be/do/have and articles', async () => {
    const { isSkipped } = await import('../build-cefrj.js');
    expect(["'re", 'am', 'Was', 'the', 'an'].map(isSkipped)).toEqual([true, true, true, true, true]);
    expect(['be', 'have', 'do', 'about', 'can'].map(isSkipped)).toEqual([false, false, false, false, false]);
  });
});

describe('review corrections', () => {
  const word = (headword: string, pos: string) => ({
    headword,
    pos,
    sense_no: 1,
    cefr_level: 'A1' as const,
    definition_en: 'Direction.',
    meaning_vi: 'sai',
    examples: [{ sentence: 'One.' }, { sentence: 'Two.' }],
    topics: [],
    synonyms: [],
    antonyms: [],
    source: 'definition: Wiktionary',
    _review: ['note'],
  });

  it('fixes, drops and validates', async () => {
    const { applyCorrections } = await import('../review.js');
    const words = [word('address', 'noun'), word('the', 'determiner'), word('key', 'noun')];
    const result = applyCorrections(
      words,
      [
        {
          id: 'address|noun',
          action: 'fix',
          definition_en: 'The number, street and town where someone lives.',
          meaning_vi: 'địa chỉ',
          drop_examples: [1],
          example_translations: { '0': 'Một.' },
          topics: ['people-family', 'nope'],
        },
        { id: 'the|determiner', action: 'drop' },
        { id: 'ghost|noun', action: 'fix', meaning_vi: 'ma' },
      ],
      new Set(['people-family']),
    );
    expect(result.fixed).toBe(1);
    expect(result.dropped).toBe(1);
    expect(result.problems).toEqual(['address|noun: unknown topic(s) nope', 'unknown id "ghost|noun"']);
    expect(result.words.map((w) => w.headword)).toEqual(['address', 'key']);
    expect(result.words[0]).toMatchObject({
      definition_en: 'The number, street and town where someone lives.',
      meaning_vi: 'địa chỉ',
      examples: [{ sentence: 'One.', translation_vi: 'Một.' }],
      topics: ['people-family'],
    });
    expect(result.words[0].source).toContain('reviewed: definition, vi, example translations, examples, topics edited');
    expect('_review' in result.words[1]).toBe(false); // reviewed and kept as is
  });
});

describe('review: added examples', () => {
  it('adds original examples up to two per word', async () => {
    const { applyCorrections } = await import('../review.js');
    const base = { pos: 'noun', sense_no: 1, cefr_level: 'A1' as const, definition_en: 'x', topics: [], synonyms: [], antonyms: [] };
    const words = [
      { ...base, headword: 'water', examples: [] },
      { ...base, headword: 'key', examples: [{ sentence: 'One.' }] },
    ];
    const r = applyCorrections(
      words,
      [
        { id: 'water|noun', action: 'fix', add_examples: [{ sentence: 'Drink some water.', translation_vi: 'Uống chút nước.' }] },
        {
          id: 'key|noun',
          action: 'fix',
          add_examples: [
            { sentence: 'Where is my key?', translation_vi: 'Chìa khóa của tôi đâu?' },
            { sentence: 'Too many.', translation_vi: 'Quá nhiều.' },
          ],
        },
      ],
      new Set(),
    );
    expect(r.words[0].examples).toEqual([{ sentence: 'Drink some water.', translation_vi: 'Uống chút nước.' }]);
    expect(r.words[1].examples).toHaveLength(2);
    expect(r.words[0].source).toContain('examples added');
  });
});
