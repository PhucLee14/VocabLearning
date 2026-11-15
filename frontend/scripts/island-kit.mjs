/**
 * Bakes the 3D models of the landing page's island into one small binary:
 * `public/models/island-kit.bin`, read by `src/components/island/kit.ts`.
 *
 * Sources (all CC0, see docs/ASSETS.md): Kenney's "City Kit (Suburban)" 2.0
 * for the houses, "Nature Kit" 2.1 for trees, rocks, plants and props, and
 * "Hexagon Kit" 2.0 for the windmill. Download and unzip them, then run:
 *
 *   npm run island:kit -- --city "<City Kit>" --nature "<Nature Kit>" --hexagon "<Hexagon Kit>"
 *
 * Why bake instead of loading the .glb files in the browser:
 * - no glTF loader in the bundle and no texture: each vertex keeps a position
 *   and a "role" (wall, roof, leaf, …). The scene turns roles into the
 *   theme's colours, so the models follow the light and dark themes like the
 *   rest of the UI;
 * - the scene draws flat-shaded (face normals come from the shader), so
 *   normals and UVs are dropped and equal vertices are welded: the file is a
 *   fraction of the source models' size.
 *
 * File layout: "GDK1", header length (uint32 LE), header JSON (padded to 4
 * bytes), then for each model: positions (uint16 x3 per vertex, spread over
 * the model's bounds), roles (uint8 per vertex, padded to 2 bytes), triangle
 * indices (uint16).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

/** Order matters: the index is what the binary stores. Keep in sync with ROLES in src/components/island/kit.ts. */
const ROLES = [
  'wall', 'wallShade', 'trim', 'trimDark', 'dark',
  'roof', 'roofMid', 'roofDark',
  'wood', 'woodDark', 'woodLight', 'glass',
  'leaf', 'leafDark', 'leafFall',
  'stone', 'stoneDark', 'grass', 'dirt', 'dirtDark',
  'red', 'yellow', 'purple', 'white', 'water',
];

/**
 * City Kit: every model samples one palette texture, so a vertex's role is the
 * role whose reference colour is nearest to the colour under its UV
 * (`paletteRoles`).
 */
const CITY_COLORS = {
  wall: '#f5f5f9', wallShade: '#cacadd', trim: '#787d94', trimDark: '#60657d', dark: '#464957',
  roof: '#5bc588', roofMid: '#42ac7c', roofDark: '#258f6e',
  wood: '#dc8660', woodDark: '#b76646', glass: '#8fb4e8',
};

/** Nature Kit: models have one named material per colour. */
const NATURE_MATERIALS = {
  grass: 'grass', dirt: 'dirt', dirtDark: 'dirtDark', stone: 'stone', stoneDark: 'stoneDark',
  leafsGreen: 'leaf', leafsDark: 'leafDark', leafsFall: 'leafFall',
  // Bark (tree trunks) is the dark wood; planks, poles and doors are the light one.
  woodBark: 'woodDark', woodBarkDark: 'woodDark', woodDark: 'woodDark', wood: 'wood',
  woodBirch: 'woodLight', woodInner: 'woodLight', colorTan: 'woodLight',
  water: 'water', colorRed: 'red', colorRedDark: 'red', colorYellow: 'yellow', corn: 'yellow',
  colorPurple: 'purple', colorWhite: 'white', _defaultMat: 'white',
};

/** Hexagon Kit: also one palette texture, with its own colours (blue roofs, orange timber). */
const HEXAGON_COLORS = {
  wall: '#f2bf99', wood: '#e58c63', woodDark: '#b06041',
  roof: '#84b2fc', roofMid: '#7880f3', stone: '#b5bee4', trim: '#7c8299', trimDark: '#62677f',
};

const CITY_MODELS = 'abcdfhkmp'.split('').map((letter) => [`building-type-${letter}`, `house-${letter}`]);

const NATURE_MODELS = [
  'tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_cone', 'tree_simple', 'tree_small', 'tree_tall',
  'tree_pineRoundA', 'tree_pineRoundC', 'tree_pineDefaultA', 'tree_pineSmallA', 'tree_pineTallA',
  'rock_largeA', 'rock_largeC', 'rock_tallA', 'rock_tallD', 'rock_smallA', 'rock_smallC',
  'stone_smallFlatA', 'stone_smallFlatB', 'stone_smallFlatC', 'stone_largeA', 'stone_tallB', 'stone_tallE',
  'plant_bush', 'plant_bushLarge', 'plant_bushDetailed', 'plant_bushSmall',
  'flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass_large', 'mushroom_redGroup',
  'sign', 'log_stack', 'tent_detailedOpen', 'campfire_stones',
  'bridge_wood', 'canoe', 'lily_large', 'lily_small', 'plant_flatTall',
  'crops_dirtRow', 'crop_pumpkin', 'crops_cornStageC', 'fence_simple',
].map((name) => [name, name]);

/**
 * The windmill is one model with a child node for its blades (`rotate-x`):
 * baked as two models, so the scene can spin the blades.
 */
const HEXAGON_MODELS = [
  ['unit-mill', 'windmill', { skip: 'rotate-x' }],
  ['unit-mill', 'windmill-blades', { only: 'rotate-x' }],
];

// ── Arguments ──

function argument(name) {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1 || !process.argv[at + 1]) {
    console.error('Usage: npm run island:kit -- --city "<unzipped City Kit (Suburban)>" --nature "<unzipped Nature Kit>" --hexagon "<unzipped Hexagon Kit>"');
    process.exit(1);
  }
  return process.argv[at + 1];
}
const cityDir = join(argument('city'), 'Models', 'GLB format');
const natureDir = join(argument('nature'), 'Models', 'GLTF format');
const hexagonDir = join(argument('hexagon'), 'Models', 'GLB format');

// ── PNG (the City Kit's palette texture) ──

/** Decodes an 8-bit, non-interlaced PNG (palette, RGB or RGBA) to RGB triples. */
function readPng(file) {
  const data = readFileSync(file);
  let width = 0;
  let height = 0;
  let colorType = 0;
  let palette = null;
  const compressed = [];
  for (let at = 8; at < data.length; ) {
    const length = data.readUInt32BE(at);
    const type = data.toString('latin1', at + 4, at + 8);
    const body = data.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9];
      if (body[8] !== 8 || body[12] !== 0 || ![2, 3, 6].includes(colorType)) throw new Error(`${file}: unsupported PNG format`);
    } else if (type === 'PLTE') palette = body;
    else if (type === 'IDAT') compressed.push(body);
    at += 12 + length;
  }
  const channels = { 2: 3, 3: 1, 6: 4 }[colorType];
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [a, b, c] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predicted = a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      pixels[y * stride + x] = (value + predicted) & 255;
    }
  }
  const rgb = (x, y) => {
    const at = y * stride + x * channels;
    return colorType === 3 ? [palette[pixels[at] * 3], palette[pixels[at] * 3 + 1], palette[pixels[at] * 3 + 2]] : [pixels[at], pixels[at + 1], pixels[at + 2]];
  };
  return { width, height, rgb };
}

// ── glTF binary ──

const COMPONENT = {
  5120: [1, (b, o) => b.readInt8(o)],
  5121: [1, (b, o) => b.readUInt8(o)],
  5122: [2, (b, o) => b.readInt16LE(o)],
  5123: [2, (b, o) => b.readUInt16LE(o)],
  5125: [4, (b, o) => b.readUInt32LE(o)],
  5126: [4, (b, o) => b.readFloatLE(o)],
};
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const NORMALIZED_MAX = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

function readGlb(file) {
  const data = readFileSync(file);
  if (data.toString('latin1', 0, 4) !== 'glTF') throw new Error(`${file}: not a GLB file`);
  const jsonLength = data.readUInt32LE(12);
  const gltf = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = data.subarray(20 + jsonLength + 8);
  if (gltf.extensionsRequired?.length) throw new Error(`${file}: needs ${gltf.extensionsRequired}`);

  const accessor = (index) => {
    const a = gltf.accessors[index];
    const view = gltf.bufferViews[a.bufferView];
    const [bytes, read] = COMPONENT[a.componentType];
    const size = TYPE_SIZE[a.type];
    const stride = view.byteStride ?? bytes * size;
    const scale = a.normalized ? 1 / NORMALIZED_MAX[a.componentType] : 1;
    const out = [];
    for (let i = 0; i < a.count; i++) {
      const at = (view.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * stride;
      for (let c = 0; c < size; c++) out.push(read(bin, at + c * bytes) * scale);
    }
    return out;
  };
  return { gltf, accessor };
}

/** Column-major 4x4 matrices, as in glTF. */
function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return out;
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * All triangles of a model in its own space, as { positions: [x, y, z, …],
 * roles: [role per vertex], indices }. `roleOf(material, u, v)` names a
 * vertex's role. `skip` leaves out the node of that name (and its children);
 * `only` keeps just that node, around its own origin, and reports where the
 * node sits on the model as `pivot`.
 */
function readModel(file, roleOf, { only, skip } = {}) {
  const { gltf, accessor } = readGlb(file);
  const positions = [];
  const roles = [];
  const indices = [];

  let pivot;
  const visit = (nodeIndex, parent, active) => {
    const node = gltf.nodes[nodeIndex];
    if (node.name === skip) return;
    let matrix = multiply(parent, nodeMatrix(node));
    if (node.name === only) {
      pivot = [matrix[12], matrix[13], matrix[14]];
      matrix = IDENTITY;
      active = true;
    }
    if (active && node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        if ((primitive.mode ?? 4) !== 4) continue;
        const material = gltf.materials?.[primitive.material] ?? {};
        const points = accessor(primitive.attributes.POSITION);
        const uvs = primitive.attributes.TEXCOORD_0 !== undefined ? accessor(primitive.attributes.TEXCOORD_0) : null;
        const transform = material.pbrMetallicRoughness?.baseColorTexture?.extensions?.KHR_texture_transform;
        const base = positions.length / 3;
        for (let i = 0; i < points.length / 3; i++) {
          const [x, y, z] = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
          positions.push(
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
          );
          let u = uvs ? uvs[i * 2] : 0;
          let v = uvs ? uvs[i * 2 + 1] : 0;
          if (transform) {
            u = u * (transform.scale?.[0] ?? 1) + (transform.offset?.[0] ?? 0);
            v = v * (transform.scale?.[1] ?? 1) + (transform.offset?.[1] ?? 0);
          }
          roles.push(roleOf(material, u, v));
        }
        const list = primitive.indices !== undefined ? accessor(primitive.indices) : points.map((_, i) => i).slice(0, points.length / 3);
        for (const index of list) indices.push(base + index);
      }
    }
    for (const child of node.children ?? []) visit(child, matrix, active);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, IDENTITY, only === undefined);
  return { positions, roles, indices, pivot };
}

// ── Roles ──

const hexToRgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

function paletteRoles(texture, colors) {
  const references = Object.entries(colors).map(([role, hex]) => [ROLES.indexOf(role), hexToRgb(hex)]);
  const wrap = (value) => value - Math.floor(value);
  return (_material, u, v) => {
    const [r, g, b] = texture.rgb(Math.min(texture.width - 1, Math.floor(wrap(u) * texture.width)), Math.min(texture.height - 1, Math.floor(wrap(v) * texture.height)));
    let best = references[0];
    let bestDistance = Infinity;
    for (const reference of references) {
      const [cr, cg, cb] = reference[1];
      const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (distance < bestDistance) [best, bestDistance] = [reference, distance];
    }
    return best[0];
  };
}

function natureRoles(file) {
  return (material) => {
    const role = NATURE_MATERIALS[material.name];
    if (!role) throw new Error(`${file}: no role for material "${material.name}"`);
    return ROLES.indexOf(role);
  };
}

// ── Bake ──

/** Welds equal vertices (same quantised position and role) and drops collapsed triangles. */
function pack({ positions, roles, indices }) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    min[i % 3] = Math.min(min[i % 3], positions[i]);
    max[i % 3] = Math.max(max[i % 3], positions[i]);
  }
  const quantised = [];
  const packedRoles = [];
  const seen = new Map();
  const remap = [];
  for (let i = 0; i < roles.length; i++) {
    const q = [0, 1, 2].map((axis) => Math.round(((positions[i * 3 + axis] - min[axis]) / (max[axis] - min[axis] || 1)) * 65535));
    const key = `${q.join(',')},${roles[i]}`;
    if (!seen.has(key)) {
      seen.set(key, packedRoles.length);
      quantised.push(...q);
      packedRoles.push(roles[i]);
    }
    remap.push(seen.get(key));
  }
  const triangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [remap[indices[i]], remap[indices[i + 1]], remap[indices[i + 2]]];
    if (a !== b && b !== c && a !== c) triangles.push(a, b, c);
  }
  if (packedRoles.length > 65535) throw new Error('model has more than 65535 vertices');
  return { min, max, positions: quantised, roles: packedRoles, indices: triangles };
}

const cityRoles = paletteRoles(readPng(join(cityDir, 'Textures', 'colormap.png')), CITY_COLORS);
const hexagonRoles = paletteRoles(readPng(join(hexagonDir, 'Textures', 'colormap.png')), HEXAGON_COLORS);
const sources = [
  ...CITY_MODELS.map(([file, name]) => [name, join(cityDir, `${file}.glb`), cityRoles]),
  ...NATURE_MODELS.map(([file, name]) => [name, join(natureDir, `${file}.glb`), natureRoles(file)]),
  ...HEXAGON_MODELS.map(([file, name, options]) => [name, join(hexagonDir, `${file}.glb`), hexagonRoles, options]),
];

const header = { version: 1, roles: ROLES, models: [] };
const chunks = [];
let offset = 0;
let triangles = 0;
for (const [name, file, roleOf, options] of sources) {
  const source = readModel(file, roleOf, options);
  const model = pack(source);
  const vertices = model.roles.length;
  const positions = Buffer.from(new Uint16Array(model.positions).buffer);
  const roles = Buffer.alloc(vertices + (vertices % 2));
  roles.set(model.roles);
  const indices = Buffer.from(new Uint16Array(model.indices).buffer);
  header.models.push({
    name,
    vertices,
    indices: model.indices.length,
    offset,
    min: model.min.map((n) => +n.toFixed(4)),
    max: model.max.map((n) => +n.toFixed(4)),
    ...(source.pivot && { pivot: source.pivot.map((n) => +n.toFixed(4)) }),
  });
  chunks.push(positions, roles, indices);
  offset += positions.length + roles.length + indices.length;
  triangles += model.indices.length / 3;
}

let json = JSON.stringify(header);
json += ' '.repeat((4 - (Buffer.byteLength(json) % 4)) % 4);
const prefix = Buffer.alloc(8);
prefix.write('GDK1', 0, 'latin1');
prefix.writeUInt32LE(Buffer.byteLength(json), 4);
const output = Buffer.concat([prefix, Buffer.from(json), ...chunks]);

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'island-kit.bin');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, output);
console.log(`${header.models.length} models, ${triangles} triangles, ${(output.length / 1024).toFixed(0)} KB → ${target}`);
