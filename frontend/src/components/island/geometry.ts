import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Vector3 } from 'three';
import { type Kit, type KitModel, ROLES, roleColors } from './kit';
import type { Palette } from './palette';

/**
 * The island: a small village. Ground, mountain, water and paths are built in
 * code; houses, trees, the windmill and the small things come from the kit's
 * models (see kit.ts). Without the kit (the file failed to load) houses and
 * trees fall back to plain shapes and the rest of the dressing is left out.
 *
 * Everything static is merged into ONE geometry with per-vertex colours, so
 * the island is a single draw call, and it is rebuilt when the theme changes.
 * No normals: the material is flat-shaded, which derives them per face. Two
 * things move and are separate meshes: the windmill's blades (`buildBlades`)
 * and the foam on the waterfalls (`WATER_STREAMS`, drawn by water.ts).
 *
 * Layout, seen from above. Angles are degrees from the front (+z), clockwise
 * towards +x; the ground is at y = 0 and the island's radius is 10.
 * - SRS path: 6 stepping stones on an arc at the front right (20°–100°).
 * - CEFR mountain: 6 terraces at the back right. A waterfall runs down its
 *   steps into the lake.
 * - Lake: left of the centre. A stream leaves it for the rim at the front
 *   left and falls off the island; a wooden bridge crosses the stream.
 * - Village: nine houses around the lake on the left half, a path from the
 *   windmill (front) over the bridge to the field (back), a small camp.
 */
export const ISLAND_RADIUS = 10;

type XZ = [x: number, z: number];

const deg = (d: number) => (d * Math.PI) / 180;

function polar(angle: number, radius: number, y = 0): Vector3 {
  return new Vector3(Math.sin(deg(angle)) * radius, y, Math.cos(deg(angle)) * radius);
}

/** Stable pseudo-random number in [0, 1) from a string. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

// ── Landmarks ──

/** Centres of the tops of the 6 stepping stones (10m → 1d → 3d → 8d → 3w → 2mo). */
export const STONES: Vector3[] = Array.from({ length: 6 }, (_, i) => polar(20 + i * 16, 7.6, 0.3));

export const MOUNTAIN = polar(140, 4);
const TERRACES = 6;
const TERRACE_HEIGHT = 1.1;
export const MOUNTAIN_TOP = TERRACES * TERRACE_HEIGHT;
/** Each terrace is a 7-sided block, a little narrower at the top, turned a little more than the one below. */
const TERRACE_SIDES = 7;
const terrace = (i: number) => ({ bottom: 4.4 - i * 0.62, top: 4.4 - i * 0.62 - 0.25, turn: i * 0.3 });

const LAKE: XZ = [-3.8, 1.2];
const LAKE_RADIUS = 2.3;
/** The lake's outline: an uneven 12-sided blob. */
const LAKE_SHORE: XZ[] = Array.from({ length: 12 }, (_, k) => {
  const radius = LAKE_RADIUS * (1 + 0.14 * Math.sin(k * 1.9 + 0.7) + 0.08 * Math.cos(k * 3.1));
  return [LAKE[0] + Math.sin(deg(k * 30)) * radius, LAKE[1] + Math.cos(deg(k * 30)) * radius];
});

/** Heights of the flat layers on the ground, so they don't flicker against it or each other. */
const PATH_Y = 0.02;
const BANK_Y = 0.03;
const WATER_Y = 0.05;

/** The stream from the lake to the rim; the last point hangs just over the edge. */
const STREAM: XZ[] = [
  [-4.9, 2.3],
  [-6.5, 3.7],
  [-7.9, 4.6],
  [-8.45, 5],
];
const STREAM_WIDTH = 0.7;
/** How far the stream falls before it thins out into spray, well above the sea of clouds. */
const FALL_BOTTOM = -13;

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
  [-3.7, -3.6],
];
const BRIDGE: XZ = [-6.8, 3.8];

/** Houses: [angle, radius, model]. Each one turns its front to the nearest stretch of the path. */
const HOUSES: [number, number, string][] = [
  [215, 6, 'house-a'],
  [232, 7.9, 'house-d'],
  [250, 8.4, 'house-k'],
  [245, 6, 'house-c'],
  [266, 8.3, 'house-f'],
  [200, 8.2, 'house-m'],
  [322, 7.6, 'house-b'],
  [338, 8.5, 'house-h'],
  [335, 5.2, 'house-p'],
];
const HOUSE_SCALE = 1.25;

const WINDMILL = { at: polar(352, 7), turn: 100, scale: 4 };

const FIELD = { at: polar(222, 4), turn: 30 };

/** [angle, radius] of each tree; the model cycles through TREE_MODELS. All clear of the water, the houses and the paths. */
const TREES: XZ[] = [
  [4, 8.9], [12, 6.5], [356, 5.2], [28, 5.7], [44, 4.6], [68, 5.4], [80, 5.6], [20, 2],
  [40, 9.2], [58, 9.3], [72, 9.3], [90, 9.3], [104, 9.2],
  [118, 8.9], [150, 9], [158, 9.2], [178, 8.8], [190, 9.2], [188, 7],
  [340, 2.2],
  [258, 9.4], [283, 8.9], [310, 8.9], [328, 9.3], [222, 9.2], [210, 9.3],
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

const PROPS: Prop[] = [
  // A camp near the front.
  prop('tent_detailedOpen', at(10, 4.6), 1.5, 20),
  prop('campfire_stones', at(22, 4.2), 1.4),
  prop('log_stack', at(2, 3.8), 1.3, 60),
  prop('mushroom_redGroup', at(16, 5.4), 1.5),
  // A sign where the stepping-stone path starts.
  prop('sign', at(12, 8.4), 1.5, 12),
  // On and around the lake.
  prop('canoe', [LAKE[0] + 0.5, LAKE[1] + 0.4], 1.6, 40, WATER_Y),
  prop('lily_large', shore(300, 0.9), 2, 0, WATER_Y),
  prop('lily_small', shore(130, 1), 2.2, 80, WATER_Y),
  prop('lily_large', shore(20, 1.2), 1.8, 200, WATER_Y),
  prop('lily_small', shore(230, 1.1), 2.2, 30, WATER_Y),
  ...[20, 75, 160, 215, 260].map((angle, i) => prop('plant_flatTall', shore(angle, 2.75 + (i % 2) * 0.2), 1.9, angle)),
  prop('rock_smallA', shore(185, 3), 1.5, 40),
  prop('rock_smallC', shore(330, 3.05), 1.4),
  // The bridge over the stream, across the path.
  prop('bridge_wood', BRIDGE, 1.55, 122),
  // Rocks on the rim.
  prop('rock_largeA', at(135, 9.4), 1.8, 30),
  prop('rock_tallA', at(165, 9.3), 1.6),
  prop('rock_largeC', at(30, 9.5), 1.5, 100),
  prop('rock_smallA', at(88, 9.6), 1.6),
  prop('rock_tallD', at(198, 9.6), 1.3, 200),
  prop('rock_smallC', at(276, 9.6), 1.5),
  // Bushes by the houses.
  prop('plant_bushLarge', at(206, 9.4), 1.4),
  prop('plant_bush', at(244, 9.5), 1.4, 40),
  prop('plant_bushDetailed', at(318, 9.4), 1.4, 90),
  prop('plant_bushSmall', at(346, 9.6), 1.4),
  prop('plant_bush', at(226, 5.6), 1.3, 10),
  prop('plant_bushSmall', at(330, 6.6), 1.3),
  // Flowers and grass at the front.
  ...Array.from({ length: 10 }, (_, i) =>
    prop(['flower_redA', 'flower_yellowA', 'flower_purpleA'][i % 3], at(356 + i * 2.4, 8.5 + (i % 3) * 0.35), 1.6, i * 47),
  ),
  ...([[30, 3], [58, 6.6], [14, 2.2], [196, 8.6], [110, 7.2], [44, 7.2], [2, 8]] as XZ[]).map(([angle, radius], i) =>
    prop('grass_large', at(angle, radius), 1.5, i * 70),
  ),
];

/** Rocks at the foot of the mountain: [model, angle around the mountain, scale]. */
const MOUNTAIN_ROCKS: [string, number, number][] = [
  ['stone_tallB', 335, 1.7],
  ['stone_largeA', 200, 1.9],
  ['stone_tallE', 0, 1.6],
];

const STONE_MODELS = ['stone_smallFlatA', 'stone_smallFlatB', 'stone_smallFlatC'];
const STONE_WIDTH = 1.7;

// ── The waterfall down the mountain ──

/** Unit vector from the mountain towards the lake, and the horizontal direction across it. */
const FALL_DIRECTION = new Vector3(LAKE[0] - MOUNTAIN.x, 0, LAKE[1] - MOUNTAIN.z).normalize();
const FALL_ACROSS = new Vector3(FALL_DIRECTION.z, 0, -FALL_DIRECTION.x);
const FALL_WIDTH = 0.8;

/** Distance from a terrace's axis to its wall, looking in the direction of the (x, z) offset. */
function wallDistance(radius: number, turn: number, x: number, z: number): number {
  const sector = (2 * Math.PI) / TERRACE_SIDES;
  const local = (((Math.atan2(x, z) - turn) % sector) + sector) % sector;
  return (radius * Math.cos(sector / 2)) / Math.cos(local - sector / 2);
}

/**
 * How far along the waterfall's direction a line `across` units to the side
 * meets the wall of a terrace of the given radius (found by bisection, so the
 * water hugs the slanted faces of the 7-sided terraces).
 */
function wallAlong(radius: number, turn: number, across: number): number {
  let inside = 0;
  let outside = radius + 2;
  for (let step = 0; step < 24; step++) {
    const middle = (inside + outside) / 2;
    const x = FALL_DIRECTION.x * middle + FALL_ACROSS.x * across;
    const z = FALL_DIRECTION.z * middle + FALL_ACROSS.z * across;
    if (Math.hypot(x, z) < wallDistance(radius, turn, x, z)) inside = middle;
    else outside = middle;
  }
  return outside;
}

/**
 * The waterfall's course as [distance along, height] steps, for a line
 * `across` units to the side of its centre: from the spring under the summit,
 * over every ledge and down every wall, then over the ground into the lake.
 */
function cascade(across: number): [along: number, y: number][] {
  const gap = 0.04;
  const steps: [number, number][] = [[0.62, MOUNTAIN_TOP + gap]];
  for (let i = TERRACES - 1; i >= 0; i--) {
    const { bottom, top, turn } = terrace(i);
    steps.push([wallAlong(top, turn, across) + gap, (i + 1) * TERRACE_HEIGHT + gap]);
    steps.push([wallAlong(bottom, turn, across) + gap, i === 0 ? WATER_Y : i * TERRACE_HEIGHT + gap]);
  }
  const toLake = Math.hypot(LAKE[0] - MOUNTAIN.x, LAKE[1] - MOUNTAIN.z);
  steps.push([toLake - LAKE_RADIUS * 0.7, WATER_Y]);
  return steps;
}

const cascadePoint = ([along, y]: [number, number], across: number) =>
  new Vector3(MOUNTAIN.x, y, MOUNTAIN.z).addScaledVector(FALL_DIRECTION, along).addScaledVector(FALL_ACROSS, across);

/** Where the stream leaves the island, and the horizontal direction across it there. */
const STREAM_END = new Vector3(STREAM[STREAM.length - 1][0], WATER_Y, STREAM[STREAM.length - 1][1]);
const STREAM_ACROSS = (() => {
  const [ax, az] = STREAM[STREAM.length - 2];
  const [bx, bz] = STREAM[STREAM.length - 1];
  const length = Math.hypot(bx - ax, bz - az);
  return new Vector3((bz - az) / length, 0, -(bx - ax) / length);
})();

/** A course that foam runs along (water.ts): the points, the horizontal direction across it and its width. */
export interface WaterStream {
  points: Vector3[];
  across: Vector3;
  /** The open side of the water where it runs down a wall (horizontal). */
  outward: Vector3;
  width: number;
  /** How many streaks of foam, and how fast they go (units per second). */
  streaks: number;
  speed: number;
}
export const WATER_STREAMS: WaterStream[] = [
  {
    points: cascade(0).map((step) => cascadePoint(step, 0)),
    across: FALL_ACROSS,
    outward: FALL_DIRECTION,
    width: FALL_WIDTH,
    streaks: 16,
    speed: 2.4,
  },
  {
    points: [STREAM_END.clone(), new Vector3(STREAM_END.x, FALL_BOTTOM, STREAM_END.z)],
    across: STREAM_ACROSS,
    // Away from the island: the way the stream was flowing.
    outward: new Vector3(-STREAM_ACROSS.z, 0, STREAM_ACROSS.x),
    width: STREAM_WIDTH,
    streaks: 12,
    speed: 5,
  },
];

// ── Building ──

/** Collects shapes and models into one indexed geometry with vertex colours. */
class Builder {
  private positions: number[] = [];
  private colors: number[] = [];
  private indices: number[] = [];

  private vertex(point: Vector3, color: Color): number {
    this.positions.push(point.x, point.y, point.z);
    this.colors.push(color.r, color.g, color.b);
    return this.positions.length / 3 - 1;
  }

  /** A three.js shape, moved into place and painted one colour. The shape is consumed. */
  shape(geometry: BufferGeometry, color: Color, at: Vector3, turn = 0) {
    if (turn) geometry.rotateY(turn);
    geometry.translate(at.x, at.y, at.z);
    const base = this.positions.length / 3;
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) this.vertex(new Vector3().fromBufferAttribute(position, i), color);
    const index = geometry.index;
    for (let i = 0; i < (index ? index.count : position.count); i++) this.indices.push(base + (index ? index.getX(i) : i));
    geometry.dispose();
  }

  /**
   * A kit model standing at `at`, turned by `turn` degrees (0 = as modelled)
   * and scaled. `colors` is indexed by role.
   */
  model(model: KitModel, colors: Color[], at: Vector3, turn = 0, scale: number | [number, number, number] = 1) {
    const [sx, sy, sz] = typeof scale === 'number' ? [scale, scale, scale] : scale;
    const cos = Math.cos(deg(turn));
    const sin = Math.sin(deg(turn));
    const base = this.positions.length / 3;
    const point = new Vector3();
    for (let i = 0; i < model.roles.length; i++) {
      const x = model.positions[i * 3] * sx;
      const z = model.positions[i * 3 + 2] * sz;
      this.vertex(point.set(at.x + x * cos + z * sin, at.y + model.positions[i * 3 + 1] * sy, at.z - x * sin + z * cos), colors[model.roles[i]]);
    }
    for (let i = 0; i < model.indices.length; i++) this.indices.push(base + model.indices[i]);
  }

  /** A flat four-cornered face, visible from both sides. */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color) {
    const [ia, ib, ic, id] = [a, b, c, d].map((point) => this.vertex(point, color));
    this.indices.push(ia, ib, ic, ia, ic, id, ia, ic, ib, ia, id, ic);
  }

  /** A flat polygon on the ground at height `y`, around `centre`. */
  disc(centre: XZ, outline: XZ[], y: number, color: Color) {
    const middle = this.vertex(new Vector3(centre[0], y, centre[1]), color);
    const rim = outline.map(([x, z]) => this.vertex(new Vector3(x, y, z), color));
    for (let i = 0; i < rim.length; i++) {
      const next = rim[(i + 1) % rim.length];
      this.indices.push(middle, rim[i], next, middle, next, rim[i]);
    }
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
    for (let i = 0; i < sides.length - 1; i++) this.quad(sides[i][0], sides[i][1], sides[i + 1][1], sides[i + 1][0], color);
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

/** Degrees to turn a model at `from` so that its front (+z) looks at the nearest point of the village path. */
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
  return (Math.atan2(best[0] - from.x, best[1] - from.z) * 180) / Math.PI;
}

export function buildIsland(palette: Palette, kit: Kit | null): BufferGeometry {
  const builder = new Builder();
  const colors = roleColors(palette);
  const color = (role: (typeof ROLES)[number]) => colors[ROLES.indexOf(role)];
  const place = (name: string, at: Vector3, turn = 0, scale: number | [number, number, number] = 1, paint = colors) => {
    const model = kit?.get(name);
    if (model) builder.model(model, paint, at, turn, scale);
    return model !== undefined;
  };

  // Ground: a grass slab on an upside-down rock cone. The grass is not a
  // mastery colour, so every stepping stone stands out against it.
  builder.shape(new CylinderGeometry(ISLAND_RADIUS + 0.2, ISLAND_RADIUS, 0.8, 9), palette.accentSoft, new Vector3(0, -0.4, 0));
  builder.shape(new ConeGeometry(ISLAND_RADIUS, 9, 9).rotateX(Math.PI), palette.lineStrong, new Vector3(0, -5.3, 0));

  // CEFR mountain: A1 is the widest terrace at the bottom, C2 the peak.
  for (let i = 0; i < TERRACES; i++) {
    const { bottom, top, turn } = terrace(i);
    builder.shape(
      new CylinderGeometry(top, bottom, TERRACE_HEIGHT, TERRACE_SIDES),
      new Color().lerpColors(palette.sunken, palette.lineStrong, i / (TERRACES - 1)),
      new Vector3(MOUNTAIN.x, (i + 0.5) * TERRACE_HEIGHT, MOUNTAIN.z),
      turn,
    );
  }
  builder.shape(new ConeGeometry(0.5, 0.9, 5), palette.streak, new Vector3(MOUNTAIN.x, MOUNTAIN_TOP + 0.45, MOUNTAIN.z));
  for (const [name, angle, scale] of MOUNTAIN_ROCKS) place(name, polar(angle, 4.9).add(MOUNTAIN), angle, scale);

  // Water: the lake with its bank, the waterfall down the mountain, the
  // stream to the rim and its fall into the clouds.
  const water = color('water');
  const bank = color('dirt');
  builder.disc(LAKE, LAKE_SHORE.map(([x, z]) => [LAKE[0] + (x - LAKE[0]) * 1.12, LAKE[1] + (z - LAKE[1]) * 1.12]), BANK_Y, bank);
  builder.disc(LAKE, LAKE_SHORE, WATER_Y, water);
  const left = cascade(-FALL_WIDTH / 2).map((step) => cascadePoint(step, -FALL_WIDTH / 2));
  const right = cascade(FALL_WIDTH / 2).map((step) => cascadePoint(step, FALL_WIDTH / 2));
  for (let i = 0; i < left.length - 1; i++) builder.quad(left[i], right[i], right[i + 1], left[i + 1], water);
  builder.ribbon(STREAM, STREAM_WIDTH + 0.3, BANK_Y, bank);
  builder.ribbon(STREAM, STREAM_WIDTH, WATER_Y, water);
  builder.quad(
    STREAM_END.clone().addScaledVector(STREAM_ACROSS, -STREAM_WIDTH / 2),
    STREAM_END.clone().addScaledVector(STREAM_ACROSS, STREAM_WIDTH / 2),
    new Vector3(STREAM_END.x, FALL_BOTTOM, STREAM_END.z).addScaledVector(STREAM_ACROSS, STREAM_WIDTH / 12),
    new Vector3(STREAM_END.x, FALL_BOTTOM, STREAM_END.z).addScaledVector(STREAM_ACROSS, -STREAM_WIDTH / 12),
    water,
  );

  // The village path (the stream and the bridge lie over it where they cross).
  builder.ribbon(PATH, 0.55, PATH_Y, color('dirt'));

  // SRS path: the stones carry the mastery ramp m0 → m5 (their only colours).
  STONES.forEach((stone, i) => {
    const model = kit?.get(STONE_MODELS[i % STONE_MODELS.length]);
    if (!model) {
      builder.shape(new CylinderGeometry(0.75, 0.85, 0.3, 6), palette.mastery[i], new Vector3(stone.x, 0.15, stone.z));
      return;
    }
    const shade = new Color().lerpColors(palette.mastery[i], palette.ink, 0.18);
    const paint = ROLES.map((role) => (role === 'stoneDark' ? shade : palette.mastery[i]));
    const size = [0, 1, 2].map((axis) => model.max[axis] - model.min[axis]);
    // Stretched to one footprint and to the height the card lands on.
    builder.model(model, paint, new Vector3(stone.x, 0, stone.z), i * 50, [STONE_WIDTH / size[0], stone.y / size[1], STONE_WIDTH / size[2]]);
  });

  // Houses, fronts to the path.
  HOUSES.forEach(([angle, radius, name], i) => {
    const at = polar(angle, radius);
    if (place(name, at, towardsPath(at), HOUSE_SCALE)) return;
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
  place('crop_pumpkin', inField(-1.25, 0.7), 40, 1.1);
  for (const side of [0, 90, 180]) place('fence_simple', FIELD.at, FIELD.turn + side, 1.95);

  TREES.forEach(([angle, radius], i) => {
    const at = polar(angle, radius);
    if (place(TREE_MODELS[i % TREE_MODELS.length], at, i * 67, TREE_SCALE * (0.85 + hash(`tree${i}`) * 0.3))) return;
    // No kit: a trunk and a cone.
    builder.shape(new CylinderGeometry(0.12, 0.15, 0.5, 5), color('woodDark'), new Vector3(at.x, 0.25, at.z));
    builder.shape(new ConeGeometry(0.6, 1.4, 6), color('leaf'), new Vector3(at.x, 1.2, at.z));
  });

  for (const [name, x, z, scale, turn, y] of PROPS) place(name, new Vector3(x, y ?? 0, z), turn, scale);

  return builder.build();
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
  const model = kit?.get('windmill-blades');
  if (!model?.pivot) return null;
  const builder = new Builder();
  builder.model(model, roleColors(palette), new Vector3());
  // The hub's place on the mill, turned and scaled like the mill itself.
  const [px, py, pz] = model.pivot.map((value) => value * WINDMILL.scale);
  const cos = Math.cos(deg(WINDMILL.turn));
  const sin = Math.sin(deg(WINDMILL.turn));
  return {
    geometry: builder.build(),
    position: new Vector3(WINDMILL.at.x + px * cos + pz * sin, py, WINDMILL.at.z - px * sin + pz * cos),
    turn: deg(WINDMILL.turn),
    scale: WINDMILL.scale,
  };
}
