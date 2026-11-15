import { Color } from 'three';
import type { Palette } from './palette';

/**
 * The island's 3D models: houses, trees, rocks and plants from two CC0 kits,
 * baked by `scripts/island-kit.mjs` into `public/models/island-kit.bin` (file
 * layout and sources are described there).
 *
 * A model has no colours of its own. Every vertex has a role (wall, roof,
 * leaf, …) and `roleColors` turns roles into the theme's token colours, so the
 * models follow the light and dark themes.
 */

/** Order matters: the binary stores the index. Keep in sync with ROLES in scripts/island-kit.mjs. */
export const ROLES = [
  'wall', 'wallShade', 'trim', 'trimDark', 'dark',
  'roof', 'roofMid', 'roofDark',
  'wood', 'woodDark', 'woodLight', 'glass',
  'leaf', 'leafDark', 'leafFall',
  'stone', 'stoneDark', 'grass', 'dirt', 'dirtDark',
  'red', 'yellow', 'purple', 'white', 'water',
] as const;
export type Role = (typeof ROLES)[number];

export interface KitModel {
  /** x, y, z per vertex, in the model's own units (a house is about 1.3 wide, a tree about 1.3 tall). */
  positions: Float32Array;
  /** Index into ROLES per vertex. */
  roles: Uint8Array;
  indices: Uint16Array;
  min: [number, number, number];
  max: [number, number, number];
  /** For a moving part cut out of a model (the windmill's blades): where its hub sits on that model. */
  pivot?: [number, number, number];
}
export type Kit = Map<string, KitModel>;

type Triple = [number, number, number];
interface Header {
  version: number;
  roles: string[];
  models: { name: string; vertices: number; indices: number; offset: number; min: Triple; max: Triple; pivot?: Triple }[];
}

const KIT_URL = '/models/island-kit.bin';

export async function loadKit(): Promise<Kit> {
  const response = await fetch(KIT_URL);
  if (!response.ok) throw new Error(`island kit: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x314b4447) throw new Error('island kit: not a kit file'); // "GDK1"
  const headerLength = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength))) as Header;
  if (header.version !== 1 || header.roles.join() !== ROLES.join()) throw new Error('island kit: file and code are out of sync');

  const kit: Kit = new Map();
  const dataStart = 8 + headerLength;
  for (const { name, vertices, indices, offset, min, max, pivot } of header.models) {
    const start = dataStart + offset;
    const packed = new Uint16Array(buffer, start, vertices * 3);
    const positions = new Float32Array(vertices * 3);
    for (let i = 0; i < packed.length; i++) {
      const axis = i % 3;
      positions[i] = min[axis] + (packed[i] / 65535) * (max[axis] - min[axis]);
    }
    const rolesStart = start + vertices * 6;
    kit.set(name, {
      positions,
      roles: new Uint8Array(buffer, rolesStart, vertices),
      indices: new Uint16Array(buffer, rolesStart + vertices + (vertices % 2), indices),
      min,
      max,
      pivot,
    });
  }
  return kit;
}

/**
 * Token colours per role, indexed like ROLES. At night the windows take the
 * sun colour: lit windows.
 */
export function roleColors(palette: Palette): Color[] {
  const mix = (a: Color, b: Color, amount: number) => new Color().lerpColors(a, b, amount);
  const colors: Record<Role, Color> = {
    wall: palette.raised,
    wallShade: palette.sunken,
    trim: palette.muted,
    trimDark: mix(palette.muted, palette.ink, 0.45),
    dark: palette.ink,
    roof: mix(palette.accent, palette.accentSoft, 0.35),
    roofMid: palette.accent,
    roofDark: palette.accentLip,
    wood: palette.streak,
    // Tree trunks: a brown, not the UI's orange (`ink` is light in the dark theme, so darken with `sunken` there).
    woodDark: mix(palette.streak, palette.dark ? palette.sunken : palette.ink, 0.45),
    woodLight: mix(palette.streak, palette.raised, 0.6),
    glass: palette.dark ? palette.sun : mix(palette.sky, palette.muted, 0.4),
    leaf: mix(palette.accentLip, palette.accent, 0.5),
    leafDark: palette.accentLip,
    leafFall: palette.streak,
    stone: palette.lineStrong,
    stoneDark: mix(palette.lineStrong, palette.muted, 0.45),
    grass: palette.accentSoft,
    // Warm rock: mostly the stone grey, a little of the orange.
    dirt: mix(palette.lineStrong, palette.streak, 0.22),
    dirtDark: mix(palette.muted, palette.streak, 0.3),
    red: palette.danger,
    yellow: palette.sun,
    purple: palette.streak,
    white: palette.raised,
    water: palette.water,
  };
  return ROLES.map((role) => colors[role]);
}
