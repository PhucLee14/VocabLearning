import { CanvasTexture, type Color, Group, MathUtils, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three';

/**
 * Words that float up from what was clicked on the island: the thing's English
 * word in a pill, with its Vietnamese meaning under it on the Vietnamese page
 * (the words themselves are in parts.ts). Each is a sprite showing a canvas:
 * it keeps the same size on screen however far away it is, and is drawn on top
 * of everything.
 *
 * A few sprites are reused in turn; a second click on the same thing while its
 * word is still up starts that word again instead of stacking a copy.
 */

const POOL = 5;
const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 160;
/** The canvas is drawn this many times larger than it shows (in CSS pixels), so it stays sharp. */
const DENSITY = 3.6;
/** Seconds a word stays up, and how far it rises in that time (island units). */
const LIFE = 2.4;
const RISE = 1.25;
/** Drawn after everything else in the scene. */
const ORDER = 10;

export interface WordColors {
  back: Color;
  word: Color;
  gloss: Color;
}

export interface Words {
  /** Add to the island's group: the words float in its space. */
  group: Group;
  /**
   * Floats `word` (and `gloss` under it, unless empty) up from `at`. `key`
   * names the thing, so a second click restarts its word. `rise` scales how
   * far it goes up: for something much nearer the camera than the island.
   */
  show: (key: string, word: string, gloss: string, at: Vector3, rise?: number) => void;
  /**
   * `delta` is the real time since the last frame; `still` (reduced motion)
   * shows the word where it is, without rising. `viewHeight` is the canvas's
   * height in CSS pixels and `halfFovTan` the tangent of half the camera's
   * angle of view: together they keep the words the same size on screen.
   */
  update: (delta: number, still: boolean, viewHeight: number, halfFovTan: number) => void;
  /** The colours for the next words (follow the theme). */
  apply: (colors: WordColors) => void;
  dispose: () => void;
}

/** 0 → 1 with a little overshoot: a pop. */
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

export function createWords(): Words {
  const colors = { back: '#000000', word: '#ffffff', gloss: '#cccccc' };
  const items = Array.from({ length: POOL }, () => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    const sprite = new Sprite(material);
    // It grows upwards from its point.
    sprite.center.set(0.5, 0);
    sprite.renderOrder = ORDER;
    sprite.visible = false;
    return { canvas, texture, material, sprite, key: '', age: Infinity, from: new Vector3(), sway: 0, rise: 1 };
  });
  const group = new Group().add(...items.map((item) => item.sprite));

  /** Draws the pill at the bottom of the canvas, centred, as wide as its text. */
  const draw = (canvas: HTMLCanvasElement, word: string, gloss: string) => {
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    // The page's own font (Nunito, under the name next/font gave it).
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const padding = 34;
    const room = CANVAS_WIDTH - 8 - padding * 2;
    // Shrunk to fit when a word is long ("interjection").
    const fit = (weight: number, size: number, text: string) => {
      context.font = `${weight} ${size}px ${family}`;
      const width = context.measureText(text).width;
      if (width <= room) return { size, width };
      const smaller = Math.floor((size * room) / width);
      context.font = `${weight} ${smaller}px ${family}`;
      return { size: smaller, width: context.measureText(text).width };
    };
    const big = fit(800, gloss ? 58 : 64, word);
    const small = gloss ? fit(700, 36, gloss) : { size: 0, width: 0 };
    const height = gloss ? 138 : 96;
    const width = Math.max(big.width, small.width) + padding * 2;
    const left = (CANVAS_WIDTH - width) / 2;
    const top = CANVAS_HEIGHT - height;
    context.fillStyle = colors.back;
    context.beginPath();
    context.roundRect(left, top, width, height, gloss ? 40 : height / 2);
    context.fill();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = colors.word;
    context.font = `800 ${big.size}px ${family}`;
    context.fillText(word, CANVAS_WIDTH / 2, gloss ? top + 50 : top + height / 2 + 2);
    if (gloss) {
      context.fillStyle = colors.gloss;
      context.font = `700 ${small.size}px ${family}`;
      context.fillText(gloss, CANVAS_WIDTH / 2, top + 100);
    }
  };

  return {
    group,

    show(key, word, gloss, at, rise = 1) {
      const item =
        items.find((each) => each.key === key && each.age < LIFE) ??
        items.reduce((oldest, each) => (each.age > oldest.age ? each : oldest));
      draw(item.canvas, word, gloss);
      item.texture.needsUpdate = true;
      item.key = key;
      item.age = 0;
      item.from.copy(at);
      item.rise = rise;
      item.sway = Math.random() * Math.PI * 2;
    },

    update(delta, still, viewHeight, halfFovTan) {
      // The canvas's height on screen, in the units a sprite that keeps its size is scaled in.
      const height = viewHeight > 0 ? ((CANVAS_HEIGHT / DENSITY) * 2 * halfFovTan) / viewHeight : 0;
      for (const item of items) {
        if (item.age >= LIFE) {
          item.sprite.visible = false;
          continue;
        }
        item.age += delta;
        const t = Math.min(1, item.age / LIFE);
        const { sprite } = item;
        sprite.visible = true;
        sprite.position.copy(item.from);
        if (!still) {
          // Quick at first, then slowing as it fades; drifting a little from side to side.
          sprite.position.y += RISE * item.rise * (1 - (1 - t) ** 3);
          sprite.position.x += Math.sin(item.age * 2.2 + item.sway) * 0.05 * item.rise * t;
        }
        sprite.material.opacity = MathUtils.smoothstep(item.age, 0, 0.12) * (1 - MathUtils.smoothstep(item.age, LIFE - 0.7, LIFE));
        const pop = still ? 1 : 0.6 + 0.4 * easeOutBack(Math.min(1, item.age / 0.28));
        sprite.scale.set(height * pop * (CANVAS_WIDTH / CANVAS_HEIGHT), height * pop, 1);
      }
    },

    apply({ back, word, gloss }) {
      colors.back = `#${back.getHexString()}`;
      colors.word = `#${word.getHexString()}`;
      colors.gloss = `#${gloss.getHexString()}`;
    },

    dispose() {
      for (const item of items) {
        item.texture.dispose();
        item.material.dispose();
      }
    },
  };
}
