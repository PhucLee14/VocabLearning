import { Color } from 'three';
import { creasedNormals, type Soup, tessellate } from './mesh';
import type { Palette } from './palette';

/**
 * The island's 3D models: houses, trees, rocks and plants from three CC0 kits,
 * baked by `scripts/island-kit.mjs` into `public/models/island-kit.bin` (file
 * layout and sources are described there).
 *
 * A model has no colours of its own. Every vertex has a role (wall, roof,
 * leaf, …) and `roleColors` turns roles into the theme's token colours, so the
 * models follow the light and dark themes.
 *
 * The kit's models are low-poly and were made to be drawn faceted. When the
 * file is loaded each one is reworked once (`refine`): edges that are not
 * sharp get shared normals, so they are shaded as curves, and the tops of
 * trees and bushes are split into smaller triangles on a rounder surface.
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
  /**
   * Three corners per triangle, nothing shared: x, y, z per corner, in the
   * model's own units (a house is about 1.3 wide, a tree about 1.3 tall).
   */
  positions: Float32Array;
  /** A unit normal per corner. */
  normals: Float32Array;
  /** Index into ROLES per corner. */
  roles: Uint8Array;
  /** Ambient occlusion per corner: 0 = sees the whole sky … 1 = shut in (baked by the script). */
  shut: Float32Array;
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

const cosine = (degrees: number) => Math.cos((degrees * Math.PI) / 180);
/**
 * Two faces that meet at less than this angle are shaded as one curved
 * surface; by the role of the face. Leaves, bark and rock are round things
 * made of few faces; walls, roofs and planks have real edges.
 */
const CREASE: Partial<Record<Role, number>> = {
  leaf: 75, leafDark: 75, leafFall: 75,
  woodDark: 65,
  stone: 50, stoneDark: 50, dirt: 50, dirtDark: 50,
  red: 60, yellow: 60, purple: 60, white: 60,
};
const DEFAULT_CREASE = 35;
const CREASE_COSINES = ROLES.map((role) => cosine(CREASE[role] ?? DEFAULT_CREASE));
const LEAVES = ROLES.map((role) => role.startsWith('leaf'));
/** Models whose leaves are split into smaller triangles on a rounder surface. */
const ROUNDED = /^(tree_|plant_bush)/;

/** From the file's shared vertices to corners with normals; see the note at the top. */
function refine(name: string, vertices: Float32Array, vertexRoles: Uint8Array, vertexShut: Uint8Array, indices: Uint16Array) {
  const corners = indices.length;
  const positions = new Float32Array(corners * 3);
  const roles = new Uint8Array(corners);
  const shut = new Float32Array(corners);
  for (let c = 0; c < corners; c++) {
    const v = indices[c];
    positions[c * 3] = vertices[v * 3];
    positions[c * 3 + 1] = vertices[v * 3 + 1];
    positions[c * 3 + 2] = vertices[v * 3 + 2];
    roles[c] = vertexRoles[v];
    shut[c] = vertexShut[v] / 255;
  }
  const crease = new Float32Array(corners / 3);
  for (let t = 0; t < crease.length; t++) crease[t] = CREASE_COSINES[roles[t * 3]];
  let soup: Soup = { positions, normals: creasedNormals(positions, crease), extras: [{ values: roles, pick: true }, { values: shut }] };
  if (ROUNDED.test(name)) {
    const mine = soup.extras[0].values;
    soup = tessellate(soup, (t) => LEAVES[mine[t * 3]] && LEAVES[mine[t * 3 + 1]] && LEAVES[mine[t * 3 + 2]]);
  }
  return { positions: soup.positions, normals: soup.normals, roles: soup.extras[0].values as Uint8Array, shut: soup.extras[1].values as Float32Array };
}

export async function loadKit(): Promise<Kit> {
  const response = await fetch(KIT_URL);
  if (!response.ok) throw new Error(`island kit: HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x324b4447) throw new Error('island kit: not a kit file'); // "GDK2"
  const headerLength = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength))) as Header;
  if (header.version !== 2 || header.roles.join() !== ROLES.join()) throw new Error('island kit: file and code are out of sync');

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
    // Then a role and an occlusion byte per vertex, then the triangles.
    const rolesStart = start + vertices * 6;
    kit.set(name, {
      ...refine(
        name,
        positions,
        new Uint8Array(buffer, rolesStart, vertices),
        new Uint8Array(buffer, rolesStart + vertices, vertices),
        new Uint16Array(buffer, rolesStart + vertices * 2, indices),
      ),
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
