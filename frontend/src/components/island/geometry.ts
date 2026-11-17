import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Vector3 } from 'three';
import { type Kit, type KitModel, ROLES, roleColors } from './kit';
import { creasedNormals } from './mesh';
import type { Palette } from './palette';

/**
 * The island: a small village. The island's body, the mountain, water and
 * paths are built in code; houses, trees, the windmill and the small things
 * come from the kit's models (see kit.ts). Without the kit (the file failed to
 * load) houses and trees fall back to plain shapes and the rest of the
 * dressing is left out.
 *
 * Everything static is merged into ONE geometry with per-vertex colours, so
 * the island is a single draw call, and it is rebuilt when the theme changes.
 * Nothing is shared between triangles: every corner has its own normal, the
 * same as its neighbours' where the surface is meant to look curved and its
 * face's own where there is a real edge (mesh.ts). Outlines that used to be
 * polygons (the rim, the lake, the paths, the mountain's rings) are smooth
 * curves through the same points, cut into short pieces.
 *
 * Separate meshes: the water (`buildWater`, drawn with its own material by
 * water.ts), and what moves: the windmill's blades (`buildBlades`), the actors
 * (canoe, fish, flame, mushrooms: actors.ts), the people (people.ts) and the
 * smoke, spray and fireflies (ambience.ts).
 *
 * Layout, seen from above. Angles are degrees from the front (+z), clockwise
 * towards +x; the ground is flat at y = 0 and the island's radius is about 10
 * (the rim is uneven, never less than 9.8).
 * - SRS path: 6 stepping stones on an arc at the front right (10°–90°).
 * - Mountain: at the back right, a craggy rock with a trail winding up to the
 *   summit. Six flags along the trail are the CEFR levels, A1 at the foot and
 *   C2 on top. A waterfall runs down a gully on its side into the lake.
 * - Lake: left of the centre. A stream leaves it for the rim at the front
 *   left and falls off the island; a wooden bridge crosses the stream.
 * - Village: eight houses, one per part of speech, on the left half; a path
 *   from the windmill (front) over the bridge to the field (back), and on to
 *   the foot of the trail; a small camp.
 * - Under and around it: soil and rock hanging below the grass, and a few
 *   small rocks floating nearby.
 */
export const ISLAND_RADIUS = 10;

type XZ = [x: number, z: number];

const deg = (d: number) => (d * Math.PI) / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function polar(angle: number, radius: number, y = 0): Vector3 {
  return new Vector3(Math.sin(deg(angle)) * radius, y, Math.cos(deg(angle)) * radius);
}

/** Stable pseudo-random number in [0, 1) from a string: the island looks the same on every visit. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}
/** The same, as -1 … 1. */
const jitter = (text: string) => hash(text) * 2 - 1;

const smoothstep = (x: number, from: number, to: number) => {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};
const cosine = (degrees: number) => Math.cos(deg(degrees));

/**
 * The smooth curve through p1 and p2, at t = 0 … 1; their neighbours p0 and p3
 * set its direction at the two ends (a Catmull-Rom spline).
 */
function spline(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
}

/** The smooth closed curve through `values`, at a fractional index. */
function around(values: number[], at: number): number {
  const i = Math.floor(at);
  const value = (k: number) => values[(((i + k) % values.length) + values.length) % values.length];
  return spline(value(-1), value(0), value(1), value(2), at - i);
}

/** A closed outline rounded off: the smooth curve through its points, cut into `pieces` per side. */
function roundLoop(points: XZ[], pieces: number): XZ[] {
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  return Array.from({ length: points.length * pieces }, (_, i): XZ => [around(xs, i / pieces), around(zs, i / pieces)]);
}

/** An open line rounded off the same way; it still starts and ends where it did, and passes through every point. */
function roundLine(points: XZ[], pieces: number): XZ[] {
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  const line: XZ[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    for (let piece = 0; piece < pieces; piece++) {
      const t = piece / pieces;
      line.push([spline(at(i - 1)[0], at(i)[0], at(i + 1)[0], at(i + 2)[0], t), spline(at(i - 1)[1], at(i)[1], at(i + 1)[1], at(i + 2)[1], t)]);
    }
  }
  line.push(points[points.length - 1]);
  return line;
}

/** Heights of the flat layers on the ground, so they don't flicker against it or each other. */
const PATCH_Y = 0.012;
const PATH_Y = 0.02;
const BANK_Y = 0.03;
export const WATER_Y = 0.05;

// ── The island's body ──

/** The rim of the grass: an uneven outline, one radius every 18°, rounded off between them. */
const RIM: number[] = Array.from({ length: 20 }, (_, i) => 10.1 + 0.45 * (hash(`rim${i}`) * 1.4 - 0.4));
const RIM_STEP = 360 / RIM.length;
const rimEdge = (angle: number) => around(RIM, (((angle % 360) + 360) % 360) / RIM_STEP);

/** Distance from the island's axis to just inside the rim in that direction. */
function rimRadius(angle: number): number {
  return rimEdge(angle) * 0.99;
}

const waves = new Map<string, number[]>();
/** A smooth wobble around the island, about -1 … 1: one random value every 18°, rounded off. The same for the same key. */
function wave(key: string, angle: number): number {
  let values = waves.get(key);
  if (!values) waves.set(key, (values = RIM.map((_, i) => jitter(`${key}:${i}`))));
  return around(values, (((angle % 360) + 360) % 360) / RIM_STEP);
}

/**
 * What hangs under the grass, as rings going down: [height, width as a share
 * of the rim, roughness]. The first is the rim itself; then the grass's edge,
 * a band of soil, and rock that narrows to a point.
 */
const BODY_RINGS: [number, number, number][] = [
  [0, 1, 0],
  [-0.45, 0.985, 0],
  [-1.4, 0.93, 0.03],
  [-3, 0.78, 0.1],
  [-4.8, 0.58, 0.14],
  [-6.6, 0.38, 0.18],
  [-8.2, 0.2, 0.25],
];
const BODY_TIP = new Vector3(0.8, -10.4, -0.5);
/** The body is drawn with this many points around, and this many rows between two of the rings above. */
const BODY_POINTS = 60;
const BODY_PIECES = 3;
/**
 * The body's rows of points, from the rim down to just above the tip: the
 * rings above, with smooth curves between them from the second ring on (the
 * first band is the grass's lip, which stays an edge).
 */
const BODY: Vector3[][] = (() => {
  const control = BODY_RINGS.map(([y, share, rough], k) =>
    Array.from({ length: BODY_POINTS }, (_, i) => {
      const angle = (i * 360) / BODY_POINTS;
      const reach = rimEdge(angle) * share * (1 + rough * wave(`body${k}`, angle));
      return new Vector3(Math.sin(deg(angle)) * reach, y + (k >= 3 ? wave(`drop${k}`, angle) * 0.3 : 0), Math.cos(deg(angle)) * reach);
    }),
  );
  // The tip counts as a last ring of no width.
  control.push(control[0].map(() => BODY_TIP.clone()));
  const last = control.length - 1;
  const rows = [control[0], control[1]];
  for (let k = 1; k < last; k++) {
    for (let piece = 1; piece <= BODY_PIECES; piece++) {
      // The tip itself closes the body (see buildIsland).
      if (k === last - 1 && piece === BODY_PIECES) break;
      const t = piece / BODY_PIECES;
      rows.push(
        control[k].map((p1, i) => {
          const p0 = control[k - 1][i];
          const p2 = control[k + 1][i];
          // Past the tip the curve carries straight on.
          const p3 = k + 2 <= last ? control[k + 2][i] : p2.clone().multiplyScalar(2).sub(p1);
          return new Vector3(spline(p0.x, p1.x, p2.x, p3.x, t), spline(p0.y, p1.y, p2.y, p3.y, t), spline(p0.z, p1.z, p2.z, p3.z, t));
        }),
      );
    }
  }
  return rows;
})();
/** Rock spikes hanging from the underside: [x, z, radius, length, height of their top]. */
const SPIKES: [number, number, number, number, number][] = [
  [-3.2, 2, 1.1, 3.2, -5.4],
  [2.6, -3, 0.9, 2.6, -5.9],
  [3.4, 3.2, 0.7, 2.2, -6.3],
];
/** Small rocks floating near the island: [x, y, z, scale, model]. Low and close, so they never stand between the camera and the village. */
const FLOATERS: [number, number, number, number, string][] = [
  [13, -3.5, 2.5, 3.2, 'rock_largeA'],
  [-11.5, -8, -4, 3.6, 'rock_largeC'],
  [4.5, -7.5, -13, 3, 'rock_largeA'],
  [11.5, -1.5, -9, 2.4, 'rock_largeC'],
  [-3.5, -9.5, 12.5, 3.4, 'rock_largeA'],
];
/** Patches of darker grass: [x, z, radius]. */
const PATCHES: [number, number, number][] = [
  [-6.2, -3.6, 2.6],
  [-3.6, 6.3, 2.4],
  [5.2, 4.2, 2.4],
  [8.2, -1, 1.6],
  [-1, -7.6, 1.8],
  [1.4, 3.6, 1.5],
];

// ── Stepping stones ──

/** Centres of the tops of the 6 stepping stones (10m → 1d → 3d → 8d → 3w → 2mo). */
export const STONES: Vector3[] = Array.from({ length: 6 }, (_, i) => polar(10 + i * 16, 7.6, 0.3));
const STONE_MODELS = ['stone_smallFlatA', 'stone_smallFlatB', 'stone_smallFlatC'];
const STONE_WIDTH = 1.7;

// ── Lake ──

const LAKE: XZ = [-3.8, 1.2];
const LAKE_RADIUS = 2.3;
/** The middle of the lake, on the water. */
export const LAKE_CENTRE = new Vector3(LAKE[0], WATER_Y, LAKE[1]);
/** Everything within this distance of the lake's middle is open water (the shore is uneven). */
export const LAKE_OPEN_RADIUS = 1.7;
/** The lake's outline: an uneven blob, the smooth curve through 12 points. */
const LAKE_SHORE: XZ[] = roundLoop(
  Array.from({ length: 12 }, (_, k): XZ => {
    const radius = LAKE_RADIUS * (1 + 0.14 * Math.sin(k * 1.9 + 0.7) + 0.08 * Math.cos(k * 3.1));
    return [LAKE[0] + Math.sin(deg(k * 30)) * radius, LAKE[1] + Math.cos(deg(k * 30)) * radius];
  }),
  4,
);

// ── Mountain ──

export const MOUNTAIN = polar(140, 4.8);
/** The waterfall leaves the mountain towards the lake: that direction, the horizontal direction across it, and its angle around the mountain. */
const FALL_DIRECTION = new Vector3(LAKE[0] - MOUNTAIN.x, 0, LAKE[1] - MOUNTAIN.z).normalize();
const FALL_ACROSS = new Vector3(FALL_DIRECTION.z, 0, -FALL_DIRECTION.x);
const FALL_ANGLE = (Math.atan2(FALL_DIRECTION.x, FALL_DIRECTION.z) * 180) / Math.PI;

/**
 * The mountain is a craggy rock. Its shape is set by rings of 12 corners from
 * the foot to just under the summit, [height, radius, lean], each corner
 * pushed in or out at random, and each ring's middle moved `lean` units away
 * from the lake, so the peak is off-centre. The corners are at the same 12
 * angles on every ring. The rock face is the smooth surface through those
 * corners with smaller lumps on it (`rockFace`), drawn as a fine grid.
 *
 * Two neighbouring columns of corners, either side of the waterfall, are left
 * smooth and equal, and the face runs straight between them: a gully the
 * water can lie in exactly.
 */
const MOUNTAIN_RINGS: [number, number, number][] = [
  [0, 4.75, 0],
  [1, 4.3, 0.1],
  [2.2, 3.75, 0.25],
  [3.4, 3.05, 0.4],
  [4.6, 2.5, 0.55],
  [5.8, 1.85, 0.7],
  [6.9, 1.2, 0.85],
  [7.9, 0.7, 0.95],
];
const MOUNTAIN_COLUMNS = 12;
const COLUMN = 360 / MOUNTAIN_COLUMNS;
export const MOUNTAIN_TOP = 8.7;
const GULLY_DEPTH = 0.04;
/** The angle (around the mountain) of column j: columns 0 and 11 flank the waterfall. */
const columnAngle = (j: number) => FALL_ANGLE + (j + 0.5) * COLUMN;
const ringCentre = (lean: number, y: number) => new Vector3(MOUNTAIN.x - FALL_DIRECTION.x * lean, y, MOUNTAIN.z - FALL_DIRECTION.z * lean);

const MOUNTAIN_CORNERS: Vector3[][] = MOUNTAIN_RINGS.map(([y, radius, lean], k) =>
  Array.from({ length: MOUNTAIN_COLUMNS }, (_, j) => {
    const gully = j === 0 || j === MOUNTAIN_COLUMNS - 1;
    // The foot stays close to its radius (things stand around it); higher up some corners jut out as crags.
    const rough = gully ? -GULLY_DEPTH : jitter(`rock${k}:${j}`) * (k === 0 ? 0.07 : 0.2) + (k > 0 && hash(`crag${k}:${j}`) > 0.8 ? 0.16 : 0);
    const angle = deg(columnAngle(j));
    const reach = radius * (1 + rough);
    return ringCentre(lean, y).add(new Vector3(Math.sin(angle) * reach, 0, Math.cos(angle) * reach));
  }),
);
const SUMMIT = ringCentre(1.05, MOUNTAIN_TOP);

const LAST_RING = MOUNTAIN_RINGS.length - 1;
/** Height and lean of every ring, the summit counting as a last ring of no width. */
const RING_HEIGHTS = [...MOUNTAIN_RINGS.map(([y]) => y), MOUNTAIN_TOP];
const RING_LEANS = [...MOUNTAIN_RINGS.map(([, , lean]) => lean), 1.05];

/** Where an angle (around the mountain) is, counted in columns: column j's corner is at j, the gully between 11 and 12 (= 0). */
const columnsAt = (angle: number) => ((((angle - FALL_ANGLE) / COLUMN - 0.5) % MOUNTAIN_COLUMNS) + MOUNTAIN_COLUMNS) % MOUNTAIN_COLUMNS;
/** A height as a place among the rings: ring k is at level k, the summit at the last level. */
function levelAt(y: number): number {
  const height = Math.max(0, Math.min(MOUNTAIN_TOP, y));
  let k = 0;
  while (k < LAST_RING && RING_HEIGHTS[k + 1] < height) k++;
  return k + (height - RING_HEIGHTS[k]) / (RING_HEIGHTS[k + 1] - RING_HEIGHTS[k]);
}

/** Ring k's outline at `at` columns: the smooth curve through its corners, but straight across the gully. */
function ringPoint(k: number, at: number): Vector3 {
  if (k > LAST_RING) return SUMMIT.clone();
  const ring = MOUNTAIN_CORNERS[k];
  const j = Math.floor(at) % MOUNTAIN_COLUMNS;
  const t = at - Math.floor(at);
  const corner = (i: number) => ring[(((j + i) % MOUNTAIN_COLUMNS) + MOUNTAIN_COLUMNS) % MOUNTAIN_COLUMNS];
  if (j === MOUNTAIN_COLUMNS - 1) return new Vector3().lerpVectors(corner(0), corner(1), t);
  return new Vector3(
    spline(corner(-1).x, corner(0).x, corner(1).x, corner(2).x, t),
    ring[0].y,
    spline(corner(-1).z, corner(0).z, corner(1).z, corner(2).z, t),
  );
}

/** Smooth bumps, -1 … 1, by place on the mountain (columns around, height): the same on every visit. */
function lumps(key: string, at: number, y: number, perColumn: number, perUnit: number): number {
  const u = at * perColumn;
  const v = y * perUnit;
  const wrap = MOUNTAIN_COLUMNS * perColumn;
  const [i, j] = [Math.floor(u), Math.floor(v)];
  const value = (a: number, b: number) => jitter(`${key}${((a % wrap) + wrap) % wrap}:${b}`);
  const [fu, fv] = [smoothstep(u - i, 0, 1), smoothstep(v - j, 0, 1)];
  return lerp(lerp(value(i, j), value(i + 1, j), fu), lerp(value(i, j + 1), value(i + 1, j + 1), fu), fv);
}

/**
 * The rock face, `at` columns around the mountain and `level` rings up (both
 * may be fractions; the last level is the summit): the smooth surface through
 * the rings' outlines, with lumps on it. No lumps in the gully (the water
 * lies there), at the foot (things stand around it) or on the summit.
 */
function rockFace(at: number, level: number): Vector3 {
  const k = Math.min(Math.floor(level), LAST_RING);
  const t = level - k;
  const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((i) => ringPoint(Math.max(0, k + i), at));
  // Below the foot and above the summit the curve carries straight on.
  if (k === 0) p0.lerpVectors(p2, p1, 2);
  if (k === LAST_RING) p3.lerpVectors(p1, p2, 2);
  const y = lerp(RING_HEIGHTS[k], RING_HEIGHTS[k + 1], t);
  const point = new Vector3(spline(p0.x, p1.x, p2.x, p3.x, t), y, spline(p0.z, p1.z, p2.z, p3.z, t));

  const fromGully = at <= MOUNTAIN_COLUMNS - 1 ? Math.min(at, MOUNTAIN_COLUMNS - 1 - at) : 0;
  const strength = smoothstep(fromGully, 0, 1.2) * smoothstep(y, 0, 0.9) * smoothstep(MOUNTAIN_TOP - y, 0, 0.6);
  if (strength > 0) {
    const centre = ringCentre(lerp(RING_LEANS[k], RING_LEANS[k + 1], t), y);
    const out = (lumps('lump', at, y, 2, 1.5) * 0.17 + lumps('grit', at, y, 5, 4) * 0.06) * strength;
    const length = Math.hypot(point.x - centre.x, point.z - centre.z) || 1;
    point.x += ((point.x - centre.x) / length) * out;
    point.z += ((point.z - centre.z) / length) * out;
  }
  return point;
}

/** The mountain is drawn with this many pieces per column and per ring. */
const ROCK_PIECES = 4;
/** The rock face as rows of points, from the foot to just under the summit; and for each point two smooth random numbers (-1 … 1) for its colour. */
const MOUNTAIN_GRID: Vector3[][] = Array.from({ length: (LAST_RING + 1) * ROCK_PIECES }, (_, row) =>
  Array.from({ length: MOUNTAIN_COLUMNS * ROCK_PIECES }, (_, column) => rockFace(column / ROCK_PIECES, row / ROCK_PIECES)),
);
const MOUNTAIN_TINT: [number, number][][] = MOUNTAIN_GRID.map((points, row) =>
  points.map((point, column) => [lumps('tint', column / ROCK_PIECES, point.y, 1.5, 1.1), lumps('snow', column / ROCK_PIECES, row, 1, 0.5)]),
);
/** The middle of the mountain at that height (it leans). */
const mountainAxis = (y: number) => {
  const level = levelAt(y);
  const k = Math.min(Math.floor(level), LAST_RING);
  return ringCentre(lerp(RING_LEANS[k], RING_LEANS[k + 1], level - k), y);
};

/**
 * A point of the rock face, at that angle around the mountain and that height,
 * moved `out` units away from the mountain (negative = into the rock). The
 * mountain is drawn as a grid of flat pieces of that face, so this is very
 * near what is drawn but not exactly on it: whatever is laid on the rock with
 * this should reach a little into it.
 */
function onMountain(angle: number, y: number, out = 0): Vector3 {
  return rockFace(columnsAt(angle), levelAt(y)).add(new Vector3(Math.sin(deg(angle)) * out, 0, Math.cos(deg(angle)) * out));
}

/** The trail winds this many times around the mountain, from this angle (around the mountain) at the foot, up to this height. */
const TRAIL_TURNS = 2.3;
const TRAIL_START = 330;
const TRAIL_TOP = MOUNTAIN_RINGS[MOUNTAIN_RINGS.length - 1][0];
const TRAIL_PIECES = 140;

/** A cross-section of the trail, `along` = 0 at the foot … 1 at the top. */
function trail(along: number) {
  const y = along * TRAIL_TOP;
  const angle = TRAIL_START + along * TRAIL_TURNS * 360;
  // Narrower near the top, where the mountain is thin.
  const width = lerp(0.85, 0.45, along);
  return {
    angle,
    width,
    /** Its inner edge is in the rock, its outer edge in the air; `under` is the rock below the outer edge. */
    inner: onMountain(angle, y, -0.3).setY(y + 0.04),
    outer: onMountain(angle, y, width).setY(y + 0.04),
    under: onMountain(angle, Math.max(0, y - 0.45), 0.25),
    /** A spot on the trail, `fromRock` units from the rock face. */
    spot: (fromRock: number, lift = 0) => onMountain(angle, y, fromRock).setY(y + 0.04 + lift),
  };
}

/** The trail's cross-sections from the foot to the top, as it is drawn. */
const TRAIL_SECTIONS = Array.from({ length: TRAIL_PIECES + 1 }, (_, i) => trail(i / TRAIL_PIECES));

/** Where along the trail the level flags stand: A1 at the foot … C1 near the top; C2 is the summit's own flag. */
const LEVEL_POSTS = [0.03, 0.23, 0.43, 0.63, 0.83];
const FLAG_HEIGHT = 1;
/** The six level flags (A1 … C2), at the height of their pennants: where their labels and click areas are. */
export const LEVEL_FLAGS: Vector3[] = [
  ...LEVEL_POSTS.map((along) => {
    const here = trail(along);
    return here.spot(here.width - 0.12, FLAG_HEIGHT);
  }),
  new Vector3(SUMMIT.x, SUMMIT.y + 1.4, SUMMIT.z),
];

/** Rocks at the foot of the mountain: [model, angle around the mountain, scale]. */
const MOUNTAIN_ROCKS: [string, number, number][] = [
  ['rock_tallA', 40, 1.5],
  ['stone_largeA', 200, 1.9],
  ['stone_tallE', 250, 1.6],
];

// ── Running water ──

/** The stream from the lake to the rim; the last point hangs just over the edge. */
const STREAM_ANGLE = 300.6;
const STREAM: XZ[] = [
  [-4.9, 2.3],
  [-6.5, 3.7],
  [-7.9, 4.6],
  [Math.sin(deg(STREAM_ANGLE)) * (rimRadius(STREAM_ANGLE) + 0.15), Math.cos(deg(STREAM_ANGLE)) * (rimRadius(STREAM_ANGLE) + 0.15)],
];
const STREAM_LINE = roundLine(STREAM, 6);
const STREAM_WIDTH = 1;
/** Running water is not flat: it stands this high in the middle of the stream, of the waterfall on the rock, and of the fall off the rim. */
const STREAM_SWELL = 0.035;
const FALL_SWELL = 0.14;
/** How far the stream falls before it thins out into spray, well above the sea of clouds. */
const FALL_BOTTOM = -13;

/** The waterfall starts at this ring of the mountain (its spring) and is at most this wide. */
const SPRING_RING = 5;
const FALL_WIDTH = 1.15;

/**
 * The waterfall's course along the gully, as a line `side` of the way from its
 * middle to its edge (-1 … 1): down the flat face of the gully from the
 * spring to the foot, then over the ground into the lake. The water is a
 * sheet with some body: its middle stands off the rock (and the ground).
 */
function cascade(side: number): Vector3[] {
  const gap = 0.05;
  const swell = FALL_SWELL * (1 - side * side);
  const points: Vector3[] = [];
  const spring = SPRING_RING * ROCK_PIECES;
  // Down the gully, row by row of the mountain's grid: the water follows the rock's own curve.
  for (let row = spring; row >= 0; row--) {
    const from = rockFace(MOUNTAIN_COLUMNS - 1, row / ROCK_PIECES);
    const to = rockFace(0, row / ROCK_PIECES);
    const chord = from.distanceTo(to);
    // Narrow where it wells out of the rock, then as wide as the gully lets it be.
    const width = Math.min(FALL_WIDTH, chord * 0.9) * (0.4 + 0.6 * smoothstep(spring - row, 0, 3));
    const foot = row === 0;
    const point = from.lerp(to, 0.5 + (side * width) / (2 * chord)).addScaledVector(FALL_DIRECTION, gap + swell * (foot ? 0.7 : 1));
    if (foot) point.y = WATER_Y + swell * 0.7;
    points.push(point);
  }
  const toLake = Math.hypot(LAKE[0] - MOUNTAIN.x, LAKE[1] - MOUNTAIN.z);
  points.push(
    new Vector3(MOUNTAIN.x, WATER_Y + swell * 0.5, MOUNTAIN.z)
      .addScaledVector(FALL_DIRECTION, toLake - LAKE_RADIUS * 0.7)
      .addScaledVector(FALL_ACROSS, (side * FALL_WIDTH) / 2),
  );
  return points;
}

/** Where the stream leaves the island, and the horizontal direction across it there. */
const STREAM_END = new Vector3(STREAM[STREAM.length - 1][0], WATER_Y, STREAM[STREAM.length - 1][1]);
const STREAM_ACROSS = (() => {
  const [ax, az] = STREAM[STREAM.length - 2];
  const [bx, bz] = STREAM[STREAM.length - 1];
  const length = Math.hypot(bx - ax, bz - az);
  return new Vector3((bz - az) / length, 0, -(bx - ax) / length);
})();

/** The stream's fall off the rim: it leaves the edge at this speed and drops in an arc, in this many pieces; `depth` is how far the column's front and back stand off its middle. */
const RIM_FALL = { speed: 1.2, gravity: 8, pieces: 14, depth: 0.2 };
/** The middle of that fall, from the rim down to where it has thinned out into spray; and the direction it leaves in. */
const RIM_FALL_OUT = new Vector3(-STREAM_ACROSS.z, 0, STREAM_ACROSS.x);
const RIM_FALL_LINE: Vector3[] = Array.from({ length: RIM_FALL.pieces + 1 }, (_, i) => {
  const time = (i / RIM_FALL.pieces) * Math.sqrt((2 * (WATER_Y - FALL_BOTTOM)) / RIM_FALL.gravity);
  return STREAM_END.clone()
    .addScaledVector(RIM_FALL_OUT, RIM_FALL.speed * time)
    .setY(WATER_Y - (RIM_FALL.gravity * time * time) / 2);
});

/**
 * Where water hits something and throws up spray (ambience.ts): the foot of
 * the waterfall, where its run reaches the lake, the lip of the rim, and the
 * end of the fall off the rim (a drifting mist rather than a splash).
 */
export const SPLASHES: { at: Vector3; reach: number; rise: number; size: number; seconds: number; count: number }[] = [
  { at: cascade(0)[SPRING_RING * ROCK_PIECES].clone(), reach: 0.45, rise: 0.55, size: 0.3, seconds: 0.9, count: 12 },
  { at: cascade(0)[SPRING_RING * ROCK_PIECES + 1].clone(), reach: 0.4, rise: 0.25, size: 0.26, seconds: 0.8, count: 7 },
  { at: STREAM_END.clone(), reach: 0.35, rise: 0.2, size: 0.24, seconds: 0.8, count: 6 },
  { at: RIM_FALL_LINE[RIM_FALL.pieces].clone(), reach: 1.1, rise: -2.2, size: 1.6, seconds: 3.2, count: 12 },
];

// ── Village ──

/** The village path, from the windmill over the bridge to the field. */
const PATH: XZ[] = [
  [-1.3, 6.1],
  [-3.3, 5.6],
  [-5, 5.1],
  [-6.25, 4.6],
  [-7.35, 3],
  [-7.6, 1.2],
  [-7.1, -1.2],
  [-6.3, -3.2],
  [-4.9, -3.9],
  [-3.95, -3.9],
];
/** A branch from the field past the lake, over the waterfall's run, to the foot of the mountain trail. */
const TRAIL_FOOT = trail(0).spot(0.45);
const TRAIL_PATH: XZ[] = [
  [-4.9, -3.9],
  [-3.9, -2.4],
  [-2.6, -1.5],
  [-1.66, -0.32],
  [-0.5, 0.5],
  [TRAIL_FOOT.x, TRAIL_FOOT.z],
];

const PATH_LINE = roundLine(PATH, 5);
const TRAIL_PATH_LINE = roundLine(TRAIL_PATH, 5);

/**
 * Houses, one per part of speech: [angle, radius, model], in the order of
 * PARTS_OF_SPEECH (parts.ts). Each one turns its front to the nearest stretch
 * of the path.
 */
const HOUSES: [number, number, string][] = [
  [322, 7.6, 'house-b'],
  [335, 5.2, 'house-p'],
  [338, 8.5, 'house-h'],
  [266, 8.3, 'house-f'],
  [245, 6, 'house-c'],
  [250, 8.4, 'house-k'],
  [232, 7.9, 'house-d'],
  [212, 8, 'house-a'],
];
const HOUSE_SCALE = 1.25;
/** Where each house stands (the middle of its walls), in the order of PARTS_OF_SPEECH. */
export const HOUSE_SPOTS: Vector3[] = HOUSES.map(([angle, radius]) => polar(angle, radius, 0.7));

export const WINDMILL = { at: polar(352, 7), turn: 100, scale: 4 };

const FIELD = { at: polar(216, 5), turn: 0 };

export const CAMPFIRE = polar(22, 4.2);

/** Hidden mushrooms to find: [model, position, scale]. The fourth sits on the mountain trail. */
export const MUSHROOMS: [string, Vector3, number][] = [
  ['mushroom_red', polar(4, 6), 1.8],
  ['mushroom_tan', new Vector3(LAKE[0] - 2.82, 0, LAKE[1] - 1.03), 1.8],
  ['mushroom_red', polar(252, 9.5), 1.8],
  ['mushroom_tan', trail(0.34).spot(0.45, 0.02), 1.6],
  ['mushroom_red', polar(66, 9.5), 1.8],
];

/** [angle, radius] of each tree; the model cycles through TREE_MODELS. All clear of the water, the houses, the paths and the mountain. */
const TREES: XZ[] = [
  [4, 8.9], [14, 5.9], [356, 5.2], [28, 5.7], [44, 4.6], [52, 5.6], [68, 5.4],
  [40, 9.2], [58, 9.3], [72, 9.3], [90, 9.3], [104, 9.2],
  [184, 9], [194, 9.2], [204, 9.4], [222, 9.2],
  [340, 2.2],
  [258, 9.4], [283, 8.9], [310, 8.9], [328, 9.3],
];
const TREE_MODELS = [
  'tree_default', 'tree_pineRoundA', 'tree_oak', 'tree_detailed', 'tree_pineDefaultA', 'tree_fat',
  'tree_cone', 'tree_pineRoundC', 'tree_simple', 'tree_tall', 'tree_pineTallA', 'tree_small', 'tree_pineSmallA',
];
const TREE_SCALE = 1.6;

/** Small things: [model, x, z, scale, turn in degrees, y]. */
type Prop = [model: string, x: number, z: number, scale: number, turn: number, y?: number];

const at = (angle: number, radius: number): XZ => [Math.sin(deg(angle)) * radius, Math.cos(deg(angle)) * radius];
const prop = (model: string, [x, z]: XZ, scale: number, turn = 0, y = 0): Prop => [model, x, z, scale, turn, y];
/** A point on the lake's shore (or a little off it), by angle around the lake. */
const shore = (angle: number, distance: number): XZ => [LAKE[0] + Math.sin(deg(angle)) * distance, LAKE[1] + Math.cos(deg(angle)) * distance];
/** The kit's nature models sit 0.05 below their own origin; things on the water are lifted by that much. */
const AFLOAT = WATER_Y + 0.04;

/** The direction from one point to another, in the layout's degrees (0 = towards +z, 90 = towards +x). */
function bearing(from: XZ, to: XZ): number {
  return (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;
}

/**
 * The two bridges: where the village path crosses the stream, and where the
 * path to the mountain crosses the waterfall's run to the lake. Each is turned
 * to carry its path. The kit's bridge is walked along its own **x** axis: its
 * rails are on its ±z sides, its deck is 0.15 above its origin, and its ends
 * (beyond ±0.4) slope down to the ground. Big enough for those ends to stand
 * clear of the water.
 */
const BRIDGE_SPOTS: { at: XZ; turn: number; scale: number }[] = [
  { at: [-6.8, 3.8], turn: bearing(PATH[3], PATH[4]) - 90, scale: 1.65 },
  { at: TRAIL_PATH[3], turn: bearing(TRAIL_PATH[2], TRAIL_PATH[4]) - 90, scale: 1.7 },
];

const PROPS: Prop[] = [
  // A camp near the front (its fire is an actor, see actors.ts).
  prop('tent_detailedOpen', at(10, 4.6), 1.5, 20),
  prop('campfire_stones', [CAMPFIRE.x, CAMPFIRE.z], 1.4),
  prop('log_stack', at(2, 3.8), 1.3, 60),
  prop('mushroom_redGroup', at(16, 5.4), 1.5),
  prop('stump_round', at(30, 4.4), 1.4),
  // Signs: where the stepping-stone path starts, and at the foot of the mountain trail.
  prop('sign', at(3, 8.6), 1.5, 5),
  prop('sign', [TRAIL_FOOT.x - 0.75, TRAIL_FOOT.z + 0.35], 1.5, 300),
  // On and around the lake (the canoe is an actor).
  prop('lily_large', shore(300, 0.9), 2, 0, AFLOAT),
  prop('lily_small', shore(130, 1), 2.2, 80, AFLOAT),
  prop('lily_large', shore(20, 1.2), 1.8, 200, AFLOAT),
  prop('lily_small', shore(230, 1.1), 2.2, 30, AFLOAT),
  ...[20, 75, 160, 215, 260].map((angle, i) => prop('plant_flatTall', shore(angle, 2.75 + (i % 2) * 0.2), 1.9, angle)),
  prop('rock_smallA', shore(185, 3), 1.5, 40),
  prop('rock_smallC', shore(330, 3.05), 1.4),
  ...BRIDGE_SPOTS.map(({ at: spot, turn, scale }) => prop('bridge_wood', spot, scale, turn)),
  // Rocks, stumps and a log near the rim.
  prop('rock_largeC', at(30, 9.6), 1.5, 100),
  prop('rock_smallA', at(84, 9.6), 1.6),
  prop('rock_tallD', at(176, 9.5), 1.3, 200),
  prop('rock_smallC', at(276, 9.6), 1.5),
  prop('stump_old', at(34, 8.7), 1.5, 30),
  prop('stump_round', at(188, 7.9), 1.4),
  prop('log', at(292, 9.2), 1.5, 70),
  // Bushes on the rim by the houses.
  prop('plant_bushLarge', at(228, 9.5), 1.4),
  prop('plant_bush', at(244, 9.5), 1.4, 40),
  prop('plant_bushDetailed', at(318, 9.4), 1.4, 90),
  prop('plant_bushSmall', at(346, 9.6), 1.4),
  // Flowers and grass at the front.
  ...Array.from({ length: 10 }, (_, i) =>
    prop(['flower_redA', 'flower_yellowA', 'flower_purpleA'][i % 3], at(356 + i * 2.4, 8.6 + (i % 3) * 0.3), 1.6, i * 47),
  ),
  ...([[30, 3], [58, 6.6], [14, 2.2], [196, 8.6], [44, 7.2], [358, 8], [150, 9.3], [300, 3.9], [270, 6.6], [118, 9.4]] as XZ[]).map(
    ([angle, radius], i) => prop('grass_large', at(angle, radius), 1.5, i * 70),
  ),
];

// ── Things to click that are part of the island's mesh (scene.tsx picks them) ──

/** Where the trees stand. */
export const TREE_SPOTS: Vector3[] = TREES.map(([angle, radius]) => polar(angle, radius));
export const TENT_SPOT = new Vector3(at(10, 4.6)[0], 0, at(10, 4.6)[1]);
export const FIELD_SPOT = FIELD.at;
/** Points down the middle of the waterfall, from the spring to the foot. */
export const WATERFALL: Vector3[] = cascade(0).filter((_, i, all) => i % 3 === 0 && i < all.length - 1);

/** Distance from a point on the ground to a line through `line`'s points. */
function distanceToLine(line: XZ[], x: number, z: number): number {
  let nearest = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
    nearest = Math.min(nearest, Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z));
  }
  return nearest;
}

/** What a point on the ground is: the stream, a path, or grass. */
export function groundAt(point: Vector3): 'stream' | 'path' | 'grass' {
  if (distanceToLine(STREAM_LINE, point.x, point.z) < STREAM_WIDTH * 0.65) return 'stream';
  if (Math.min(distanceToLine(PATH_LINE, point.x, point.z), distanceToLine(TRAIL_PATH_LINE, point.x, point.z)) < 0.4) return 'path';
  return 'grass';
}

// ── People (people.ts moves them) ──

/** The routes the villagers walk, there and back: the village path, and the path to the foot of the mountain trail. */
export const WALKS: Vector3[][] = [PATH_LINE, TRAIL_PATH_LINE].map((line) => line.map(([x, z]) => new Vector3(x, 0, z)));
/**
 * Someone crossing a bridge walks on its deck: this far above the ground
 * within BRIDGE_FLAT of the bridge's middle, sloping down to the ground at
 * BRIDGE_END (the model's 0.15, 0.4 and 0.52 at the bridges' scale).
 */
export const BRIDGES: Vector3[] = BRIDGE_SPOTS.map(({ at: [x, z] }) => new Vector3(x, 0, z));
export const BRIDGE_DECK = 0.25;
export const BRIDGE_FLAT = 0.67;
export const BRIDGE_END = 0.9;

/** A place to walk on the mountain trail, `along` = 0 at the foot … 1 at the top: nearer the rock than the edge, clear of the flags and the stones. */
export function trailWalk(along: number): Vector3 {
  const section = trail(Math.max(0, Math.min(1, along)));
  return section.spot(section.width * 0.42);
}

/** A point on the lake's shore in that direction from its middle (degrees), `beyond` units further out (negative = on the water). */
function lakeside(angle: number, beyond: number): Vector3 {
  const [dx, dz] = [Math.sin(deg(angle)), Math.cos(deg(angle))];
  let reach = LAKE_RADIUS;
  let nearest = -Infinity;
  for (const [x, z] of LAKE_SHORE) {
    const distance = Math.hypot(x - LAKE[0], z - LAKE[1]);
    const towards = ((x - LAKE[0]) * dx + (z - LAKE[1]) * dz) / distance;
    if (towards > nearest) [nearest, reach] = [towards, distance];
  }
  return new Vector3(LAKE[0] + dx * (reach + beyond), 0, LAKE[1] + dz * (reach + beyond));
}

/**
 * Where the people who stay in one place are, and what they look at: fishing
 * on the lake's bank (the float is out on the water), reading under a tree,
 * sitting on the stump by the campfire (`seat` is the stump's height), and
 * hoeing between the field's two rows.
 */
export const PEOPLE_SPOTS = {
  fisher: lakeside(90, 0.3),
  float: lakeside(90, -0.95).setY(WATER_Y + 0.03),
  // The tree at 68°, on the side away from the mountain (the trail passes on the other side), back to its trunk.
  reader: polar(68, 5.4).add(polar(68, 5.4).sub(MOUNTAIN).setLength(0.5)),
  readerLooksAt: polar(68, 5.4).add(polar(68, 5.4).sub(MOUNTAIN).setLength(3)),
  camper: new Vector3(at(30, 4.4)[0], 0, at(30, 4.4)[1]),
  seat: 0.21,
  farmer: FIELD.at.clone().add(new Vector3(-0.75, 0, 0)),
  farmerLooksAt: FIELD.at,
};

// ── Building ──

/**
 * Where two faces of a shape built here meet at less than this angle, the edge
 * is shaded as a curve. SHARP suits things with real edges; ROUND is for rock,
 * earth and other lumps.
 */
const SHARP = 35;
const ROUND = 62;
/** How dark the most shut-in corner of a kit model gets (`shut` in kit.ts): the share of its colour it loses. */
const OCCLUSION = 0.6;
const GLASS = ROLES.indexOf('glass');
/** A point far under the island: flat things on the ground are "solids" seen from above. */
const BELOW = new Vector3(0, -1e4, 0);

/** One colour for a whole face, or one per corner. */
type Paint = Color | Color[];

/**
 * Everything about a built geometry that does not depend on the theme, i.e.
 * all but the colours. A builder that is given the frame of an earlier build
 * of the same thing only works out the colours again (a theme change rebuilds
 * the island, and this is most of that work).
 */
interface Frame {
  /** The kit it was built with. */
  kit: Kit | null;
  position: Float32Array;
  normal: Float32Array;
  extra: Float32Array;
  /** How many corners belong to shapes built here; the rest are kit models'. */
  own: number;
  /** Per corner of a kit model: its role, which set of colours it is painted with, and how much of its colour the occlusion leaves it. */
  roles: Uint8Array;
  paints: Uint8Array;
  light: Float32Array;
}

const edgeA = new Vector3();
const edgeB = new Vector3();

/**
 * Collects shapes and models into one geometry: three corners per triangle,
 * nothing shared. Per corner: position, normal, colour, and `extra` = how far
 * it sways in the wind (0 = not at all) and whether it glows at night (0 or
 * 1), both used by the island's material (scene.tsx).
 */
class Builder {
  /** Corners of the shapes built here; their normals are worked out in `build`. */
  private positions: number[] = [];
  private colors: number[] = [];
  private extras: number[] = [];
  /** Per triangle of those shapes: the cosine of its crease angle. */
  private creases: number[] = [];
  /** Corners of kit models, which bring their own normals; and per corner what its colour is made from (see Frame). */
  private kit = {
    positions: [] as number[],
    normals: [] as number[],
    extras: [] as number[],
    roles: [] as number[],
    paints: [] as number[],
    light: [] as number[],
  };
  /** The sets of colours (indexed by role) that kit models were painted with, in the order they first came up. */
  private paints: Color[][] = [];

  /** With the `frame` of an earlier build of the same thing, only colours are collected. */
  constructor(private frame: Frame | null = null) {}

  /** One triangle, seen from the side on which a, b, c run anticlockwise. `sway` is per corner. */
  face(a: Vector3, b: Vector3, c: Vector3, paint: Paint, crease = SHARP, sway?: number[]) {
    for (let i = 0; i < 3; i++) {
      const color = Array.isArray(paint) ? paint[i] : paint;
      this.colors.push(color.r, color.g, color.b);
    }
    if (this.frame) return;
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.extras.push(sway ? sway[0] : 0, 0, sway ? sway[1] : 0, 0, sway ? sway[2] : 0, 0);
    this.creases.push(cosine(crease));
  }

  /** A triangle of a solid's surface, seen from outside: `inside` is any point on the other side of it. */
  skin(a: Vector3, b: Vector3, c: Vector3, paint: Paint, inside: Vector3, crease = SHARP) {
    edgeA.subVectors(b, a).cross(edgeB.subVectors(c, a));
    if (edgeA.dot(edgeB.subVectors(a, inside)) >= 0) this.face(a, b, c, paint, crease);
    else this.face(a, c, b, Array.isArray(paint) ? [paint[0], paint[2], paint[1]] : paint, crease);
  }

  /** A four-cornered piece of a solid's surface (corners in order around it), seen from outside. */
  sheet(a: Vector3, b: Vector3, c: Vector3, d: Vector3, paint: Paint, inside: Vector3, crease = SHARP) {
    const [pa, pb, pc, pd] = Array.isArray(paint) ? paint : [paint, paint, paint, paint];
    this.skin(a, b, c, [pa, pb, pc], inside, crease);
    this.skin(a, c, d, [pa, pc, pd], inside, crease);
  }

  /** A flat three-cornered face, visible from both sides. */
  triangle(a: Vector3, b: Vector3, c: Vector3, color: Color, sway?: number[]) {
    this.face(a, b, c, color, SHARP, sway);
    this.face(a, c, b, color, SHARP, sway && [sway[0], sway[2], sway[1]]);
  }

  /**
   * The surface between two closed rings of points (same count), as two
   * triangles per pair of neighbours. `colorOf(i, upper)` is the colour at
   * point i of the lower or the upper ring; `inside(y)` is a point inside the
   * solid at that height.
   */
  band(lower: Vector3[], upper: Vector3[], colorOf: (i: number, upper: boolean) => Color, inside: (y: number) => Vector3, crease = ROUND, flip = 0) {
    for (let i = 0; i < lower.length; i++) {
      const next = (i + 1) % lower.length;
      const [a, b, c, d] = [lower[i], lower[next], upper[next], upper[i]];
      const [pa, pb, pc, pd] = [colorOf(i, false), colorOf(next, false), colorOf(next, true), colorOf(i, true)];
      const axis = inside((a.y + c.y) / 2);
      // Alternating which way the four corners are cut in two keeps the pieces from lining up.
      if ((i + flip) % 2) {
        this.skin(a, b, c, [pa, pb, pc], axis, crease);
        this.skin(a, c, d, [pa, pc, pd], axis, crease);
      } else {
        this.skin(a, b, d, [pa, pb, pd], axis, crease);
        this.skin(b, c, d, [pb, pc, pd], axis, crease);
      }
    }
  }

  /** A flat polygon on the ground at height `y`, around `centre`. */
  disc(centre: XZ, outline: XZ[], y: number, color: Color) {
    const middle = new Vector3(centre[0], y, centre[1]);
    const rim = outline.map(([x, z]) => new Vector3(x, y, z));
    rim.forEach((point, i) => this.skin(middle, point, rim[(i + 1) % rim.length], color, BELOW));
  }

  /** A flat band of the given width along a line on the ground. */
  ribbon(line: XZ[], width: number, y: number, color: Color) {
    const sides = line.map(([x, z], i) => {
      const [px, pz] = line[Math.max(0, i - 1)];
      const [nx, nz] = line[Math.min(line.length - 1, i + 1)];
      const length = Math.hypot(nx - px, nz - pz);
      const ox = ((nz - pz) / length) * (width / 2);
      const oz = (-(nx - px) / length) * (width / 2);
      return [new Vector3(x - ox, y, z - oz), new Vector3(x + ox, y, z + oz)];
    });
    for (let i = 0; i < sides.length - 1; i++) this.sheet(sides[i][0], sides[i][1], sides[i + 1][1], sides[i + 1][0], color, BELOW);
  }

  /** A three.js shape, turned (radians), moved into place and painted one colour. The shape is consumed. */
  shape(geometry: BufferGeometry, color: Color, at: Vector3, turn = 0, crease = SHARP) {
    if (this.frame) {
      const corners = (geometry.index ?? geometry.attributes.position).count;
      for (let i = 0; i < corners; i++) this.colors.push(color.r, color.g, color.b);
      geometry.dispose();
      return;
    }
    if (turn) geometry.rotateY(turn);
    geometry.translate(at.x, at.y, at.z);
    const position = geometry.attributes.position;
    const index = geometry.index;
    const corner = (i: number) => new Vector3().fromBufferAttribute(position, index ? index.getX(i) : i);
    for (let i = 0; i < (index ? index.count : position.count); i += 3) this.face(corner(i), corner(i + 1), corner(i + 2), color, crease);
    geometry.dispose();
  }

  /**
   * A kit model standing at `at`, turned by `turn` degrees (0 = as modelled)
   * and scaled. `colors` is indexed by role. With `sway` its top moves in the
   * wind by about that much (1 = a tree), less further down.
   */
  model(model: KitModel, colors: Color[], at: Vector3, turn = 0, scale: number | [number, number, number] = 1, sway = 0) {
    let paint = this.paints.indexOf(colors);
    if (paint === -1) paint = this.paints.push(colors) - 1;
    if (this.frame) return;
    const [sx, sy, sz] = typeof scale === 'number' ? [scale, scale, scale] : scale;
    const cos = Math.cos(deg(turn));
    const sin = Math.sin(deg(turn));
    const height = model.max[1] * sy || 1;
    const { positions, normals, extras, roles, paints, light } = this.kit;
    for (let i = 0; i < model.roles.length; i++) {
      const x = model.positions[i * 3] * sx;
      const y = model.positions[i * 3 + 1] * sy;
      const z = model.positions[i * 3 + 2] * sz;
      positions.push(at.x + x * cos + z * sin, at.y + y, at.z - x * sin + z * cos);
      // A stretched model's normals lean the other way: undo the scale, then turn.
      const nx = model.normals[i * 3] / sx;
      const ny = model.normals[i * 3 + 1] / sy;
      const nz = model.normals[i * 3 + 2] / sz;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals.push((nx * cos + nz * sin) / length, ny / length, (-nx * sin + nz * cos) / length);
      const role = model.roles[i];
      roles.push(role);
      paints.push(paint);
      light.push(1 - OCCLUSION * model.shut[i]);
      extras.push(sway ? sway * Math.max(0, y / height) ** 1.5 : 0, role === GLASS ? 1 : 0);
    }
  }

  /** A flag: a thin pole standing at `foot` and a pennant flying towards `fly` (a horizontal unit vector), its tip in the wind. */
  flag(foot: Vector3, height: number, fly: Vector3, pole: Color, pennant: Color) {
    this.shape(new CylinderGeometry(0.035, 0.035, height, 6), pole, new Vector3(foot.x, foot.y + height / 2, foot.z), 0, ROUND);
    const top = new Vector3(foot.x, foot.y + height, foot.z);
    const size = height * 0.42;
    this.triangle(top, new Vector3(top.x, top.y - size * 0.7, top.z), top.clone().addScaledVector(fly, size).setY(top.y - size * 0.35), pennant, [0, 0, 1.6]);
  }

  /** The geometry, and its frame for the next builder of the same thing (`kit` is only recorded in it). */
  build(kit: Kit | null = null): { geometry: BufferGeometry; frame: Frame } {
    let frame = this.frame;
    if (!frame) {
      const own = new Float32Array(this.positions);
      const join = (first: ArrayLike<number>, second: number[]) => {
        const all = new Float32Array(first.length + second.length);
        all.set(first);
        all.set(second, first.length);
        return all;
      };
      frame = {
        kit,
        position: join(own, this.kit.positions),
        normal: join(creasedNormals(own, new Float32Array(this.creases)), this.kit.normals),
        extra: join(this.extras, this.kit.extras),
        own: own.length / 3,
        roles: Uint8Array.from(this.kit.roles),
        paints: Uint8Array.from(this.kit.paints),
        light: Float32Array.from(this.kit.light),
      };
    }
    // Colours: as collected for the shapes built here, then role by role for the kit models.
    const painted = new Float32Array(frame.position.length);
    painted.set(this.colors);
    for (let i = 0, at = frame.own * 3; i < frame.roles.length; i++, at += 3) {
      const color = this.paints[frame.paints[i]][frame.roles[i]];
      painted[at] = color.r * frame.light[i];
      painted[at + 1] = color.g * frame.light[i];
      painted[at + 2] = color.b * frame.light[i];
    }
    const geometry = new BufferGeometry();
    const colors = new BufferAttribute(painted, 3);
    geometry.setAttribute('position', new BufferAttribute(frame.position, 3));
    geometry.setAttribute('normal', new BufferAttribute(frame.normal, 3));
    geometry.setAttribute('color', colors);
    // Nothing to fade from yet (see fadeFrom).
    geometry.setAttribute('colorFrom', colors);
    geometry.setAttribute('extra', new BufferAttribute(frame.extra, 2));
    return { geometry, frame };
  }
}

/** The frame of the island as it was last built (see Frame). */
let islandFrame: Frame | null = null;

/** How much a kit model moves in the wind (see Builder.model), by its name. */
function swayOf(name: string): number {
  if (name.startsWith('tree_')) return 1;
  return /^(plant_|flower_|grass_|crops_corn)/.test(name) ? 0.5 : 0;
}

/** Degrees to turn a house at `from` so that its front looks at the nearest point of the village path. */
function towardsPath(from: Vector3): number {
  let best: XZ = PATH[0];
  let bestDistance = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i];
    const [bx, bz] = PATH[i + 1];
    const t = Math.max(0, Math.min(1, ((from.x - ax) * (bx - ax) + (from.z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    const point: XZ = [ax + (bx - ax) * t, az + (bz - az) * t];
    const distance = Math.hypot(point[0] - from.x, point[1] - from.z);
    if (distance < bestDistance) [best, bestDistance] = [point, distance];
  }
  // The kit's houses have their door on the -z side, hence the half turn.
  return (Math.atan2(best[0] - from.x, best[1] - from.z) * 180) / Math.PI + 180;
}

export function buildIsland(palette: Palette, kit: Kit | null): BufferGeometry {
  const builder = new Builder(islandFrame?.kit === kit ? islandFrame : null);
  const colors = roleColors(palette);
  const color = (role: (typeof ROLES)[number]) => colors[ROLES.indexOf(role)];
  const mix = (a: Color, b: Color, amount: number) => new Color().lerpColors(a, b, amount);
  const place = (name: string, at: Vector3, turn = 0, scale: number | [number, number, number] = 1, paint = colors) => {
    const model = kit?.get(name);
    if (model) builder.model(model, paint, at, turn, scale, swayOf(name));
    return model !== undefined;
  };
  /** Rock, a little different from one thing to the next. */
  const rock = (base: Color, key: string) => mix(base, palette.muted, hash(key) * 0.14);

  // ── The island's body ──
  // Grass on top (flat: everything stands on it); not a mastery colour, so every stepping stone stands out against it.
  const grass = palette.accentSoft;
  builder.disc([0, 0], BODY[0].map((point): XZ => [point.x, point.z]), 0, grass);
  const grassEdge = mix(grass, palette.accent, 0.3);
  const soil = mix(color('woodDark'), palette.lineStrong, 0.25);
  // Under the lip: soil that turns into rock further down, both a little uneven in colour.
  const earth = (point: Vector3, i: number) => {
    const angle = (i * 360) / BODY_POINTS;
    const stone = mix(palette.lineStrong, palette.muted, 0.07 + 0.07 * wave('stone', angle + point.y * 25));
    return mix(mix(soil, palette.ink, 0.06 + 0.05 * wave('soil', angle * 3)), stone, smoothstep(-point.y, 1.1, 2.2));
  };
  // The body narrows to a tip that is off the island's axis.
  const bodyAxis = (y: number) => {
    const lean = smoothstep(-y, 5, -BODY_TIP.y);
    return new Vector3(BODY_TIP.x * lean, y, BODY_TIP.z * lean);
  };
  const bodyColors = BODY.map((row) => row.map((point, i) => earth(point, i)));
  for (let row = 0; row < BODY.length - 1; row++) {
    builder.band(BODY[row + 1], BODY[row], (i, upper) => (row === 0 ? grassEdge : bodyColors[upper ? row : row + 1][i]), bodyAxis, ROUND, row);
  }
  const lowest = BODY.length - 1;
  const tip = earth(BODY_TIP, 0);
  BODY[lowest].forEach((point, i) => {
    const next = (i + 1) % BODY_POINTS;
    builder.skin(point, BODY[lowest][next], BODY_TIP, [bodyColors[lowest][i], bodyColors[lowest][next], tip], bodyAxis(point.y), ROUND);
  });
  for (const [x, z, radius, length, top] of SPIKES) {
    builder.shape(new ConeGeometry(radius, length, 9).rotateX(Math.PI), rock(palette.lineStrong, `spike${x}`), new Vector3(x, top - length / 2, z), x, ROUND);
  }
  // Small rocks floating nearby: a kit rock with grass on it, on a point of rock.
  for (const [x, y, z, scale, name] of FLOATERS) {
    builder.shape(new ConeGeometry(0.42 * scale, 0.9 * scale, 10).rotateX(Math.PI), rock(palette.lineStrong, `floater${x}`), new Vector3(x, y - 0.42 * scale, z), x, ROUND);
    place(name, new Vector3(x, y, z), x * 40, scale);
  }
  // Patches of darker grass.
  const patch = mix(grass, palette.accent, 0.16);
  for (const [x, z, radius] of PATCHES) {
    const outline = Array.from({ length: 9 }, (_, i): XZ => {
      const reach = radius * (0.8 + 0.4 * hash(`patch${x}:${i}`));
      return [x + Math.sin(deg(i * 40)) * reach, z + Math.cos(deg(i * 40)) * reach];
    });
    builder.disc([x, z], roundLoop(outline, 4), PATCH_Y, patch);
  }

  // ── The mountain: craggy rock, paler towards a snowy summit ──
  const snow = palette.dark ? mix(palette.lineStrong, palette.muted, 0.4) : palette.raised;
  const rockColors = MOUNTAIN_GRID.map((points, row) =>
    points.map((point, column) => {
      const [tint, drift] = MOUNTAIN_TINT[row][column];
      const base = mix(palette.sunken, palette.lineStrong, Math.min(1, point.y / 6));
      // The snow line wanders up and down around the mountain.
      return mix(base, snow, smoothstep(point.y + drift * 0.7, 6.1, 7.4)).lerp(palette.muted, (tint * 0.5 + 0.5) * 0.16);
    }),
  );
  for (let row = 0; row < MOUNTAIN_GRID.length - 1; row++) {
    builder.band(MOUNTAIN_GRID[row], MOUNTAIN_GRID[row + 1], (j, upper) => rockColors[upper ? row + 1 : row][j], mountainAxis, ROUND, row);
  }
  const crown = MOUNTAIN_GRID.length - 1;
  MOUNTAIN_GRID[crown].forEach((corner, j) => {
    const next = (j + 1) % MOUNTAIN_GRID[crown].length;
    builder.skin(corner, MOUNTAIN_GRID[crown][next], SUMMIT, [rockColors[crown][j], rockColors[crown][next], snow], mountainAxis(corner.y), ROUND);
  });
  for (const [name, angle, scale] of MOUNTAIN_ROCKS) place(name, polar(angle, 5.6).add(MOUNTAIN), angle, scale);

  // The trail: a ledge of trodden earth cut into the rock, with a low earth bank under its outer edge and stones along it.
  const trodden = mix(color('dirt'), color('woodDark'), 0.4);
  const bankRock = mix(trodden, color('stoneDark'), 0.55);
  // Both a little uneven in colour along the way.
  const ledgeAt = (i: number) => mix(trodden, palette.ink, 0.05 + 0.05 * Math.sin(i * 0.9 + Math.sin(i * 0.23) * 2));
  const bankAt = (i: number) => mix(bankRock, palette.muted, 0.07 + 0.07 * Math.sin(i * 0.6 + 1));
  let before = TRAIL_SECTIONS[0];
  for (let i = 1; i <= TRAIL_PIECES; i++) {
    const here = TRAIL_SECTIONS[i];
    builder.sheet(before.inner, before.outer, here.outer, here.inner, [ledgeAt(i - 1), ledgeAt(i - 1), ledgeAt(i), ledgeAt(i)], BELOW);
    builder.sheet(before.outer, here.outer, here.under, before.under, [bankAt(i - 1), bankAt(i), bankAt(i), bankAt(i - 1)], mountainAxis(here.under.y), ROUND);
    if (i % 7 === 3) place(i % 2 ? 'stone_smallA' : 'stone_smallC', here.spot(here.width - 0.08), i * 53, 0.9 + hash(`edge${i}`) * 0.5);
    before = here;
  }
  // The level flags: A1 at the foot … C1 near the top, C2 on the summit. Their pennants fly along the trail, the way up.
  const pole = color('trimDark');
  for (const along of LEVEL_POSTS) {
    const here = trail(along);
    const angle = deg(here.angle);
    builder.flag(here.spot(here.width - 0.12), FLAG_HEIGHT, new Vector3(Math.cos(angle), 0, -Math.sin(angle)), pole, palette.streak);
  }
  builder.flag(SUMMIT.clone().setY(SUMMIT.y - 0.05), 1.6, FALL_ACROSS, pole, palette.streak);

  // ── The banks of the lake and the stream (the water itself is its own mesh: buildWater) ──
  const bank = color('dirt');
  builder.disc(LAKE, LAKE_SHORE.map(([x, z]) => [LAKE[0] + (x - LAKE[0]) * 1.12, LAKE[1] + (z - LAKE[1]) * 1.12]), BANK_Y, bank);
  builder.ribbon(STREAM_LINE, STREAM_WIDTH + 0.3, BANK_Y, bank);

  // The village paths (water and bridges lie over them where they cross).
  builder.ribbon(PATH_LINE, 0.55, PATH_Y, bank);
  builder.ribbon(TRAIL_PATH_LINE, 0.5, PATH_Y, bank);

  // SRS path: the stones carry the mastery ramp m0 → m5 (their only colours).
  STONES.forEach((stone, i) => {
    const model = kit?.get(STONE_MODELS[i % STONE_MODELS.length]);
    if (!model) {
      builder.shape(new CylinderGeometry(0.75, 0.85, 0.3, 12), palette.mastery[i], new Vector3(stone.x, 0.15, stone.z));
      return;
    }
    const shade = mix(palette.mastery[i], palette.ink, 0.18);
    const paint = ROLES.map((role) => (role === 'stoneDark' ? shade : palette.mastery[i]));
    const size = [0, 1, 2].map((axis) => model.max[axis] - model.min[axis]);
    // Stretched to one footprint and to the height the card lands on.
    builder.model(model, paint, new Vector3(stone.x, 0, stone.z), i * 50, [STONE_WIDTH / size[0], stone.y / size[1], STONE_WIDTH / size[2]]);
  });

  // Houses, fronts to the path, each with a few flowers by its door.
  HOUSES.forEach(([angle, radius, name], i) => {
    const at = polar(angle, radius);
    const turn = towardsPath(at);
    if (place(name, at, turn, HOUSE_SCALE)) {
      // The door side is the model's -z; the flowers stand either side of it.
      const front = new Vector3(-Math.sin(deg(turn)), 0, -Math.cos(deg(turn)));
      const along = new Vector3(front.z, 0, -front.x);
      for (const side of [-0.55, 0.55]) {
        place(['flower_redA', 'flower_yellowA', 'flower_purpleA'][(i + (side > 0 ? 1 : 0)) % 3], at.clone().addScaledVector(front, 0.95).addScaledVector(along, side), i * 31, 1.5);
      }
      return;
    }
    // No kit: a box with a pyramid roof.
    const width = 1.1 + hash(name) * 0.4;
    const height = 1 + hash(`${name}:h`) * 0.8;
    builder.shape(new BoxGeometry(width, height, width), palette.raised, new Vector3(at.x, height / 2, at.z), deg(angle));
    builder.shape(
      new ConeGeometry(width * 0.8, 0.7, 4).rotateY(Math.PI / 4),
      i % 2 ? palette.accent : palette.accentLip,
      new Vector3(at.x, height + 0.35, at.z),
      deg(angle),
    );
  });

  // The windmill (its blades turn: see buildBlades).
  place('windmill', WINDMILL.at, WINDMILL.turn, WINDMILL.scale);

  // A fenced field: two rows of corn and pumpkins.
  const inField = (x: number, z: number) => {
    const cos = Math.cos(deg(FIELD.turn));
    const sin = Math.sin(deg(FIELD.turn));
    return new Vector3(FIELD.at.x + x * cos + z * sin, 0, FIELD.at.z - x * sin + z * cos);
  };
  for (const row of [-0.45, 0.45]) {
    place('crops_dirtRow', inField(0, row), FIELD.turn, 1.5);
    for (const along of [-0.5, 0, 0.5]) {
      const pumpkin = row > 0 && along > 0;
      place(pumpkin ? 'crop_pumpkin' : 'crops_cornStageC', inField(along, row), along * 90, pumpkin ? 1.2 : 0.8);
    }
  }
  // Fenced on three sides (the model is the -z edge of a tile); the open side faces the path's end, to the west.
  for (const side of [0, 180, 270]) place('fence_simple', FIELD.at, FIELD.turn + side, 1.95);

  TREES.forEach(([angle, radius], i) => {
    const at = polar(angle, radius);
    if (place(TREE_MODELS[i % TREE_MODELS.length], at, i * 67, TREE_SCALE * (0.85 + hash(`tree${i}`) * 0.3))) return;
    // No kit: a trunk and a cone.
    builder.shape(new CylinderGeometry(0.12, 0.15, 0.5, 8), color('woodDark'), new Vector3(at.x, 0.25, at.z), 0, ROUND);
    builder.shape(new ConeGeometry(0.6, 1.4, 12), color('leaf'), new Vector3(at.x, 1.2, at.z), 0, ROUND);
  });

  for (const [name, x, z, scale, turn, y] of PROPS) place(name, new Vector3(x, y ?? 0, z), turn, scale);

  const { geometry, frame } = builder.build(kit);
  islandFrame = frame;
  return geometry;
}

/**
 * The water, as its own geometry (water.ts draws it): the lake, the waterfall
 * down the gully and its run to the lake, the stream to the rim and its fall
 * into the clouds. Running water is five strips wide and arched, so it has
 * some body and takes the light like a rounded thing. Per corner, besides
 * position and normal:
 * - `flow`: where the corner is in the water's pattern (two numbers: across
 *   and along, in world units), how fast the pattern runs along (units per
 *   second; 0 = the lake, whose pattern only drifts), and how much of the
 *   water is missing there (0 = all there … 1 = thinned out into spray);
 * - `shore`: 0 in open water … 1 at the water's edge.
 * The same for both themes: built once.
 */
export function buildWater(): BufferGeometry {
  const positions: number[] = [];
  const flows: number[] = [];
  const shores: number[] = [];
  type Corner = [point: Vector3, across: number, along: number, speed: number, shore: number, thinning: number];
  const triangle = (...corners: Corner[]) => {
    for (const [point, across, along, speed, shore, thinning] of corners) {
      positions.push(point.x, point.y, point.z);
      flows.push(across, along, speed, thinning);
      shores.push(shore);
    }
  };
  /** How the water's width is cut into strips: from its left edge (-1) over its middle to its right edge (1). */
  const sides = [-1, -0.5, 0, 0.5, 1];
  /**
   * A run of water: one line of points per entry of `sides`, all of the same
   * length. `from` is how far along its pattern it starts; it returns how far
   * along it ends. `thinning(i)` is how much of the water is missing at point i.
   */
  const run = (lines: Vector3[][], speed: number, from = 0, thinning: (i: number) => number = () => 0): number => {
    const middle = lines[2];
    const edge = (line: number, at: number) => sides[line] * middle[at].distanceTo(lines[sides[line] < 0 ? 0 : 4][at]);
    let along = from;
    for (let i = 0; i < middle.length - 1; i++) {
      const next = along + middle[i].distanceTo(middle[i + 1]);
      for (let k = 0; k < sides.length - 1; k++) {
        const corner = (line: number, at: number, distance: number): Corner => [lines[line][at], edge(line, at), distance, speed, Math.abs(sides[line]), thinning(at)];
        triangle(corner(k, i, along), corner(k + 1, i, along), corner(k + 1, i + 1, next));
        triangle(corner(k, i, along), corner(k + 1, i + 1, next), corner(k, i + 1, next));
      }
      along = next;
    }
    return along;
  };

  // The lake: a fan from its middle to the shore.
  const shore = LAKE_SHORE.map(([x, z]) => new Vector3(x, WATER_Y, z));
  shore.forEach((point, i) => {
    const next = shore[(i + 1) % shore.length];
    triangle([LAKE_CENTRE, LAKE_CENTRE.x, LAKE_CENTRE.z, 0, 0, 0], [next, next.x, next.z, 0, 1, 0], [point, point.x, point.z, 0, 1, 0]);
  });

  // The waterfall, from its spring down the gully and over the ground to the lake.
  run(sides.map((side) => cascade(side)), 2.4);

  // The stream: a little higher in the middle than at its banks.
  const middle = STREAM_LINE.map(([x, z]) => new Vector3(x, WATER_Y, z));
  const across = middle.map((point, i) => {
    if (i === middle.length - 1) return STREAM_ACROSS.clone().multiplyScalar(STREAM_WIDTH / 2);
    const before = middle[Math.max(0, i - 1)];
    const after = middle[i + 1];
    return new Vector3(after.z - before.z, 0, -(after.x - before.x)).setLength(STREAM_WIDTH / 2);
  });
  const end = run(
    sides.map((side) => middle.map((point, i) => point.clone().addScaledVector(across[i], side).setY(WATER_Y + STREAM_SWELL * (1 - side * side)))),
    1.3,
  );

  // Its fall off the rim: an arc that narrows a little, and breaks up into spray only near its end.
  // A column of water, not a sheet: a front and a back, so it has the same body from every side
  // (the back starts flat at the rim, where the water still lies on the ground).
  const last = RIM_FALL_LINE.length - 1;
  for (const face of [1, -1]) {
    run(
      sides.map((side) =>
        RIM_FALL_LINE.map((point, i) => {
          const after = RIM_FALL_LINE[Math.min(last, i + 1)];
          const before = RIM_FALL_LINE[Math.max(0, i - 1)];
          // Off the column's face: across the way it is going and across its width (straight up where it leaves the rim).
          const outward = new Vector3().subVectors(after, before).normalize().cross(STREAM_ACROSS);
          const narrowing = lerp(1, 0.7, i / last);
          const swell = face === 1 ? lerp(STREAM_SWELL, RIM_FALL.depth, smoothstep(i, 0, 2)) : -RIM_FALL.depth * smoothstep(i, 0, 3);
          return point
            .clone()
            .addScaledVector(STREAM_ACROSS, (side * narrowing * STREAM_WIDTH) / 2)
            .addScaledVector(outward, swell * narrowing * (1 - side * side));
        }),
      ),
      5,
      end,
      (i) => 0.85 * smoothstep(i / last, 0.62, 1),
    );
  }

  const points = new Float32Array(positions);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(points, 3));
  geometry.setAttribute('normal', new BufferAttribute(creasedNormals(points, cosine(60)), 3));
  geometry.setAttribute('flow', new BufferAttribute(new Float32Array(flows), 4));
  geometry.setAttribute('shore', new BufferAttribute(new Float32Array(shores), 1));
  return geometry;
}

/**
 * After a theme change the island's material fades from the old colours to the
 * new ones (scene.tsx), so every geometry it draws also carries the colours to
 * fade from, as `colorFrom`. `previous` is the same thing as it was built for
 * the last theme; without one, or when it is not the same shape, the geometry
 * simply fades from its own colours (no change).
 */
export function fadeFrom<G extends BufferGeometry>(geometry: G, previous?: BufferGeometry | null): G {
  const before = previous?.attributes.color;
  if (before && before.count === geometry.attributes.color.count) geometry.setAttribute('colorFrom', before.clone());
  return geometry;
}

/** One kit model as its own geometry, around its own origin (for the things that move). Null without the kit. */
export function buildModel(palette: Palette, kit: Kit | null, name: string): BufferGeometry | null {
  const model = kit?.get(name);
  if (!model) return null;
  const builder = new Builder();
  builder.model(model, roleColors(palette), new Vector3());
  return builder.build().geometry;
}

/** Where the windmill's blades hang, which way they face (radians around y), and how big they are. */
export interface Blades {
  geometry: BufferGeometry;
  position: Vector3;
  turn: number;
  scale: number;
}

/**
 * The windmill's blades, as their own geometry around their hub: the scene
 * spins them around their local x axis. Null without the kit.
 */
export function buildBlades(palette: Palette, kit: Kit | null): Blades | null {
  const geometry = buildModel(palette, kit, 'windmill-blades');
  const pivot = kit?.get('windmill-blades')?.pivot;
  if (!geometry || !pivot) return null;
  // The hub's place on the mill, turned and scaled like the mill itself.
  const [px, py, pz] = pivot.map((value) => value * WINDMILL.scale);
  const cos = Math.cos(deg(WINDMILL.turn));
  const sin = Math.sin(deg(WINDMILL.turn));
  return {
    geometry,
    position: new Vector3(WINDMILL.at.x + px * cos + pz * sin, py, WINDMILL.at.z - px * sin + pz * cos),
    turn: deg(WINDMILL.turn),
    scale: WINDMILL.scale,
  };
}
