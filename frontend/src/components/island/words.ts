import { type Camera, MathUtils, Vector3 } from 'three';

/**
 * Words that float up from what was clicked on the island: the thing's English
 * word in a pill, with its Vietnamese meaning under it on the Vietnamese page
 * (the words themselves are in parts.ts).
 *
 * They are HTML, laid over the canvas, not drawn in the scene: text drawn into
 * a texture is blurred twice, once when the texture is scaled down and again
 * because the scene is drawn at a lower pixel ratio than the page (at most
 * 1.5, and lower when the quality guard steps in). As HTML the browser draws
 * them as sharp as the rest of the page, in the page's font and colour tokens.
 * Each frame their place in the scene is projected onto the screen. The layer
 * is in the canvas's wrapper, so it sits over the island and under the page's
 * panels, and is hidden from screen readers like the canvas.
 *
 * A few elements are reused in turn; a second click on the same thing while
 * its word is still up starts that word again instead of stacking a copy.
 */

const POOL = 5;
/** Seconds a word stays up, and how far it rises in that time (scene units). */
const LIFE = 2.4;
const RISE = 1.25;

export interface Words {
  /**
   * Floats `word` (and `gloss` under it, unless empty) up from `at`, a point
   * in the space this set of words was made for. `key` names the thing, so a
   * second click restarts its word. `rise` scales how far it goes up: for
   * something much nearer the camera than the island.
   */
  show: (key: string, word: string, gloss: string, at: Vector3, rise?: number) => void;
  /**
   * `delta` is the real time since the last frame; `still` (reduced motion)
   * shows the word where it is, without rising. `width` and `height` are the
   * canvas's size in CSS pixels.
   */
  update: (delta: number, still: boolean, camera: Camera, width: number, height: number) => void;
  dispose: () => void;
}

/** 0 → 1 with a little overshoot: a pop. */
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

const point = new Vector3();

/**
 * A set of floating words in `layer`. `toWorld` turns a point of the space
 * they are given in (the island's group, or the camera) into the world's, in
 * place.
 */
export function createWords(layer: HTMLElement, toWorld: (point: Vector3) => Vector3): Words {
  const items = Array.from({ length: POOL }, () => {
    const element = document.createElement('div');
    // Same look as the label that follows the pointer (island.tsx): ink pill, page-coloured text.
    element.className =
      'pointer-events-none absolute top-0 left-0 rounded-2xl bg-ink px-3.5 py-1.5 text-center leading-tight whitespace-nowrap text-canvas will-change-transform';
    element.style.display = 'none';
    const word = document.createElement('span');
    word.className = 'block text-[16px] font-extrabold';
    const gloss = document.createElement('span');
    gloss.className = 'block text-[12px] font-bold opacity-75';
    element.append(word, gloss);
    layer.append(element);
    return { element, word, gloss, key: '', age: Infinity, from: new Vector3(), sway: 0, rise: 1 };
  });

  return {
    show(key, word, gloss, at, rise = 1) {
      const item =
        items.find((each) => each.key === key && each.age < LIFE) ??
        items.reduce((oldest, each) => (each.age > oldest.age ? each : oldest));
      item.word.textContent = word;
      item.gloss.textContent = gloss;
      item.gloss.style.display = gloss ? 'block' : 'none';
      item.key = key;
      item.age = 0;
      item.from.copy(at);
      item.rise = rise;
      item.sway = Math.random() * Math.PI * 2;
    },

    update(delta, still, camera, width, height) {
      // Whole device pixels: a box between two pixels has blurry text.
      const ratio = window.devicePixelRatio || 1;
      const snap = (value: number) => Math.round(value * ratio) / ratio;
      for (const item of items) {
        if (item.age >= LIFE) {
          if (item.element.style.display !== 'none') item.element.style.display = 'none';
          continue;
        }
        item.age += delta;
        const t = Math.min(1, item.age / LIFE);
        point.copy(item.from);
        if (!still) {
          // Quick at first, then slowing as it fades; drifting a little from side to side.
          point.y += RISE * item.rise * (1 - (1 - t) ** 3);
          point.x += Math.sin(item.age * 2.2 + item.sway) * 0.05 * item.rise * t;
        }
        toWorld(point).project(camera);
        // Behind the camera: nothing to show.
        if (point.z > 1) {
          item.element.style.display = 'none';
          continue;
        }
        const x = snap(((point.x + 1) / 2) * width);
        const y = snap(((1 - point.y) / 2) * height);
        const opacity = MathUtils.smoothstep(item.age, 0, 0.12) * (1 - MathUtils.smoothstep(item.age, LIFE - 0.7, LIFE));
        const pop = still ? 1 : 0.6 + 0.4 * easeOutBack(Math.min(1, item.age / 0.28));
        const { style } = item.element;
        style.display = 'block';
        style.opacity = opacity.toFixed(3);
        // Centred above its point, growing from there.
        style.transformOrigin = '50% 100%';
        style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${pop.toFixed(3)})`;
      }
    },

    dispose() {
      for (const item of items) item.element.remove();
    },
  };
}
