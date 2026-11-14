import { BoxGeometry, BufferAttribute, type BufferGeometry, Color, ConeGeometry, CylinderGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Palette } from './palette';

/**
 * Prototype island, built from primitives in code (no model files yet).
 *
 * Everything static is merged into ONE geometry with per-vertex colours, so the
 * whole island is a single draw call. Real low-poly models replace this later;
 * the layout (where the path, the mountain and the districts are) stays.
 *
 * Layout, seen from above. Angles are degrees from the front (+z), clockwise
 * towards +x; the ground is at y = 0 and the island's radius is 10.
 * - SRS path: 6 stepping stones on an arc at the front right (20°–100°).
 * - CEFR mountain: 6 terraces at the back right (140°).
 * - Topic district: one building per topic on the left half (205°–335°).
 */
export const ISLAND_RADIUS = 10;

const deg = (d: number) => (d * Math.PI) / 180;

function polar(angle: number, radius: number, y = 0): Vector3 {
  return new Vector3(Math.sin(deg(angle)) * radius, y, Math.cos(deg(angle)) * radius);
}

/** Centres of the tops of the 6 stepping stones (10m → 1d → 3d → 8d → 3w → 2mo). */
export const STONES: Vector3[] = Array.from({ length: 6 }, (_, i) => polar(20 + i * 16, 7.6, 0.3));

export const MOUNTAIN = polar(140, 4);
const TERRACE_HEIGHT = 1.1;
export const MOUNTAIN_TOP = 6 * TERRACE_HEIGHT;

function paint(geometry: BufferGeometry, color: Color): BufferGeometry {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/** Stable pseudo-random number in [0, 1) from a string, so a topic always gets the same building. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export function buildIsland(palette: Palette, topicSlugs: string[]): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const add = (geometry: BufferGeometry, color: Color, at: Vector3, turn = 0) => {
    if (turn) geometry.rotateY(turn);
    geometry.translate(at.x, at.y, at.z);
    parts.push(paint(geometry, color));
  };
  const m4 = palette.mastery[4];

  // Ground: a grass slab on an upside-down rock cone. The grass is not a
  // mastery colour, so every stepping stone stands out against it.
  add(new CylinderGeometry(ISLAND_RADIUS + 0.2, ISLAND_RADIUS, 0.8, 9), palette.accentSoft, new Vector3(0, -0.4, 0));
  add(new ConeGeometry(ISLAND_RADIUS, 9, 9).rotateX(Math.PI), palette.lineStrong, new Vector3(0, -5.3, 0));

  // CEFR mountain: A1 is the widest terrace at the bottom, C2 the peak.
  for (let i = 0; i < 6; i++) {
    const radius = 4.4 - i * 0.62;
    const color = new Color().lerpColors(palette.sunken, palette.lineStrong, i / 5);
    add(
      new CylinderGeometry(radius - 0.25, radius, TERRACE_HEIGHT, 7),
      color,
      new Vector3(MOUNTAIN.x, (i + 0.5) * TERRACE_HEIGHT, MOUNTAIN.z),
      i * 0.3,
    );
  }
  add(new ConeGeometry(0.5, 0.9, 5), palette.streak, new Vector3(MOUNTAIN.x, MOUNTAIN_TOP + 0.45, MOUNTAIN.z));

  // SRS path: the stones carry the mastery ramp m0 → m5.
  STONES.forEach((stone, i) => {
    add(new CylinderGeometry(0.75, 0.85, 0.3, 6), palette.mastery[i], new Vector3(stone.x, 0.15, stone.z));
  });

  // Topic district: two rings of generic buildings, one per topic.
  const inner = Math.round(topicSlugs.length * 0.38);
  topicSlugs.forEach((slug, i) => {
    const onInner = i < inner;
    const index = onInner ? i : i - inner;
    const count = onInner ? inner : topicSlugs.length - inner;
    const angle = 205 + (count > 1 ? (index / (count - 1)) * 130 : 65);
    const seed = hash(slug);
    const width = 0.9 + seed * 0.4;
    const height = 1 + hash(`${slug}:h`) * 1.4;
    const at = polar(angle, onInner ? 5.2 : 8.2);
    add(new BoxGeometry(width, height, width), palette.raised, new Vector3(at.x, height / 2, at.z), deg(angle));
    add(
      new ConeGeometry(width * 0.8, 0.7, 4).rotateY(Math.PI / 4),
      seed > 0.5 ? palette.accent : palette.accentLip,
      new Vector3(at.x, height + 0.35, at.z),
      deg(angle),
    );
  });

  // A few trees on the free ground.
  for (const [angle, radius] of [
    [350, 6],
    [5, 8.5],
    [330, 3],
    [15, 4],
    [180, 8.8],
    [120, 8.9],
    [0, 1.5],
  ]) {
    const at = polar(angle, radius);
    add(new CylinderGeometry(0.12, 0.15, 0.5, 5), palette.lineStrong, new Vector3(at.x, 0.25, at.z));
    add(new ConeGeometry(0.6, 1.4, 6), m4, new Vector3(at.x, 1.2, at.z));
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}
