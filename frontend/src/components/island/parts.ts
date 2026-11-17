import { THEME_FADE_SECONDS } from '@/lib/theme';

/**
 * What the page's own script (island.tsx) and the lazily loaded scene share.
 * Kept free of three.js: island.tsx is in the page's first script.
 */

/**
 * A theme change is not a cut: for this many seconds the sun and the moon trade
 * places (celestial.ts) and the scene's sky, colours and light ease over
 * (scene.tsx), in step with the page's own colours (lib/theme.ts).
 */
export const THEME_SECONDS = THEME_FADE_SECONDS;

export const ZOOM_EVENT = 'island-zoom';
/** How far in the island can be zoomed: step 0 is the floor's own view, where the whole island fits. */
export const ZOOM_STEPS = [1, 1.6, 2.4, 3.4];

/**
 * The page's zoom buttons (island.tsx) ask the scene (scene.tsx) to zoom with
 * a `ZOOM_EVENT` on the window: its `detail` is +1 (one step in) or -1 (out).
 */
export function requestZoom(step: 1 | -1) {
  window.dispatchEvent(new CustomEvent<number>(ZOOM_EVENT, { detail: step }));
}

/**
 * The parts of speech: one house each on the island, in this order (the
 * houses' places are HOUSES in geometry.ts, their labels `Island.pos_*` in the
 * messages).
 */
export const PARTS_OF_SPEECH = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection'] as const;

/**
 * What floats up from a thing on the island when it is clicked (words.ts): its
 * English word, and the Vietnamese meaning, which only the Vietnamese page
 * shows. Vocabulary, not UI text: the English is the same on every page.
 */
type Entry = readonly [english: string, vietnamese: string];
export const WORDS = {
  tree: ['tree', 'cái cây'],
  tent: ['tent', 'cái lều'],
  bridge: ['bridge', 'cây cầu'],
  field: ['field', 'cánh đồng'],
  stone: ['stone', 'hòn đá'],
  waterfall: ['waterfall', 'thác nước'],
  lake: ['lake', 'hồ nước'],
  mountain: ['mountain', 'ngọn núi'],
  grass: ['grass', 'bãi cỏ'],
  stream: ['stream', 'dòng suối'],
  path: ['path', 'lối đi'],
  flag: ['flag', 'lá cờ'],
  windmill: ['windmill', 'cối xay gió'],
  campfire: ['campfire', 'lửa trại'],
  canoe: ['canoe', 'chiếc xuồng'],
  mushroom: ['mushroom', 'cây nấm'],
  birds: ['birds', 'đàn chim'],
  sun: ['sun', 'mặt trời'],
  moon: ['moon', 'mặt trăng'],
} as const satisfies Record<string, Entry>;
export type WordKey = keyof typeof WORDS;

/** A house floats up its part of speech, in the order of PARTS_OF_SPEECH. */
export const PARTS_OF_SPEECH_VI: readonly string[] = ['danh từ', 'động từ', 'tính từ', 'trạng từ', 'đại từ', 'giới từ', 'liên từ', 'thán từ'];

/** A person floats up what they are doing, in the order of the people in people.ts. */
export const PEOPLE_WORDS: readonly Entry[] = [
  ['fishing', 'câu cá'],
  ['walking', 'đi dạo'],
  ['walking', 'đi dạo'],
  ['hiking', 'leo núi'],
  ['reading', 'đọc sách'],
  ['warming up', 'sưởi ấm'],
  ['farming', 'làm ruộng'],
  ['rowing', 'chèo thuyền'],
];
