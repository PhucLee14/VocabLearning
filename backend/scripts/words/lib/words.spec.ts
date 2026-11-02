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
