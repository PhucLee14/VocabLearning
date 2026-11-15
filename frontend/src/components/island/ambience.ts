import { AdditiveBlending, BufferAttribute, BufferGeometry, type Color, DynamicDrawUsage, Points, ShaderMaterial } from 'three';
import { CAMPFIRE, LAKE_CENTRE, SPLASHES } from './geometry';

/**
 * Small things that make the village feel lived in and that nobody clicks on:
 * smoke rising from the campfire, spray where water falls, and fireflies at
 * night. All are points drawn as soft round dots by tiny shaders of their own:
 * one draw call each.
 *
 * `pixels`, wherever it is asked for, turns a size in world units into pixels:
 * the drawing's height in pixels over twice the tangent of half the camera's
 * angle of view.
 */

interface Puffs {
  points: Points<BufferGeometry, ShaderMaterial>;
  /** Puff i: where it is, its size in world units and how solid it is (0 … 1). */
  set: (i: number, x: number, y: number, z: number, size: number, solid: number) => void;
  /** Call once per frame, after the puffs were set. */
  commit: (pixels: number) => void;
}

/** `count` soft, see-through dots of one colour (the scene's to set), moved every frame. */
function createPuffs(count: number, color: Color): Puffs {
  const positions = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
  const puffs = new BufferAttribute(new Float32Array(count * 2), 2).setUsage(DynamicDrawUsage);
  const geometry = new BufferGeometry().setAttribute('position', positions).setAttribute('puff', puffs);
  const uniforms = { pixels: { value: 1 }, color: { value: color } };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec2 puff;
      uniform float pixels;
      varying float vSolid;
      void main() {
        vec4 seen = modelViewMatrix * vec4(position, 1.0);
        vSolid = puff.y;
        gl_PointSize = puff.x * pixels / -seen.z;
        gl_Position = projectionMatrix * seen;
      }`,
    fragmentShader: `
      uniform vec3 color;
      varying float vSolid;
      void main() {
        float away = length(gl_PointCoord - 0.5) * 2.0;
        gl_FragColor = vec4(color, smoothstep(1.0, 0.25, away) * vSolid);
        #include <colorspace_fragment>
      }`,
  });
  const points = new Points(geometry, material);
  // The puffs move every frame: never culled by where they started.
  points.frustumCulled = false;
  return {
    points,
    set(i, x, y, z, size, solid) {
      positions.setXYZ(i, x, y, z);
      puffs.setXY(i, size, solid);
    },
    commit(pixels) {
      uniforms.pixels.value = pixels;
      positions.needsUpdate = true;
      puffs.needsUpdate = true;
    },
  };
}

const SMOKE_PUFFS = 9;
/** Seconds for a puff to rise and thin out, and how high it gets. */
const SMOKE_SECONDS = 7;
const SMOKE_HEIGHT = 3;

/** Smoke: a few soft puffs that leave the campfire one after another, grow, lean with the wind and fade out. */
export function createSmoke(color: Color): { points: Points<BufferGeometry, ShaderMaterial>; update: (seconds: number, pixels: number) => void } {
  const puffs = createPuffs(SMOKE_PUFFS, color);
  const update = (seconds: number, pixels: number) => {
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const age = (seconds / SMOKE_SECONDS + i / SMOKE_PUFFS) % 1;
      // Straight up at first, then more and more with the wind.
      const sideways = age * age;
      puffs.set(
        i,
        CAMPFIRE.x + sideways * 1.1 + Math.sin(seconds * 0.7 + i * 2.1) * 0.1 * age,
        0.6 + age * SMOKE_HEIGHT,
        CAMPFIRE.z + sideways * 0.4 + Math.cos(seconds * 0.6 + i * 1.3) * 0.1 * age,
        // Thin and small as it leaves the fire, wide and faint at the top.
        0.3 + age * 0.9,
        0.5 * Math.min(1, age * 6) * (1 - age) ** 1.5,
      );
    }
    puffs.commit(pixels);
  };
  update(0, 1);
  return { points: puffs.points, update };
}

/**
 * Spray where falling water lands (`SPLASHES` in geometry.ts): at each place a
 * handful of puffs are thrown up one after another, spread out and fall back;
 * where `rise` is negative they drift down and away instead, as mist.
 */
export function createSpray(color: Color): { points: Points<BufferGeometry, ShaderMaterial>; update: (seconds: number, pixels: number) => void } {
  // Stable pseudo-random numbers: the same spray on every visit.
  let state = 57;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const drops = SPLASHES.flatMap((splash) =>
    Array.from({ length: splash.count }, (_, k) => {
      const angle = random() * Math.PI * 2;
      const reach = splash.reach * (0.3 + 0.7 * random());
      return { splash, start: k / splash.count + random() * 0.08, x: Math.sin(angle) * reach, z: Math.cos(angle) * reach, lift: 0.6 + 0.4 * random() };
    }),
  );
  const puffs = createPuffs(drops.length, color);
  const update = (seconds: number, pixels: number) => {
    drops.forEach(({ splash, start, x, z, lift }, i) => {
      const age = (seconds / splash.seconds + start) % 1;
      const mist = splash.rise < 0;
      // A splash goes up and comes down again; mist keeps sinking.
      const y = mist ? splash.rise * age : splash.rise * lift * 4 * age * (1 - age);
      const out = mist ? 0.3 + age : 0.25 + 0.75 * age;
      puffs.set(
        i,
        splash.at.x + x * out,
        splash.at.y + y,
        splash.at.z + z * out,
        splash.size * (0.5 + age),
        (mist ? 0.3 : 0.75) * Math.min(1, age * 8) * (1 - age) ** 1.2,
      );
    });
    puffs.commit(pixels);
  };
  update(0, 1);
  return { points: puffs.points, update };
}

/** Where fireflies gather: [x, z, how far they spread, how many]. Over the lake's shore, the field, the camp and the village's edge. */
const SWARMS: [number, number, number, number][] = [
  [LAKE_CENTRE.x, LAKE_CENTRE.z, 2.6, 12],
  [CAMPFIRE.x + 1.2, CAMPFIRE.z + 1.4, 1.6, 6],
  [-3, -4.4, 1.8, 7],
  [-7, 0, 1.6, 6],
  [3.5, 7, 1.8, 6],
];
/** A firefly's size in world units. */
const FIREFLY_SIZE = 0.16;

export interface Fireflies {
  points: Points<BufferGeometry, ShaderMaterial>;
  /** `night`: 0 by day (nothing is drawn) … 1 at night. */
  update: (seconds: number, night: number, pixels: number) => void;
}

/**
 * Fireflies: points of light that wander around their own spot and blink,
 * each to its own beat, added on top of the picture (`color` is the scene's
 * to set).
 */
export function createFireflies(color: Color): Fireflies {
  const total = SWARMS.reduce((sum, swarm) => sum + swarm[3], 0);
  const positions = new Float32Array(total * 3);
  const seeds = new Float32Array(total * 4);
  let i = 0;
  // Stable pseudo-random numbers: the same fireflies on every visit.
  let state = 91;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (const [x, z, spread, count] of SWARMS) {
    for (let k = 0; k < count; k++, i++) {
      const angle = random() * Math.PI * 2;
      const distance = spread * Math.sqrt(random());
      positions.set([x + Math.sin(angle) * distance, 0.35 + random() * 1.3, z + Math.cos(angle) * distance], i * 3);
      // Its own phase, pace, reach and blinking beat.
      seeds.set([random() * 6.28, 0.25 + random() * 0.35, 0.25 + random() * 0.45, random()], i * 4);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new BufferAttribute(seeds, 4));

  const uniforms = { time: { value: 0 }, night: { value: 0 }, pixels: { value: 1 }, color: { value: color } };
  const material = new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `
      attribute vec4 seed;
      uniform float time;
      uniform float night;
      uniform float pixels;
      varying float vLight;
      void main() {
        float pace = time * seed.y;
        vec3 place = position + vec3(sin(pace + seed.x), 0.35 * sin(pace * 1.7 + seed.x * 2.0), cos(pace * 0.8 + seed.x * 1.3)) * seed.z;
        vec4 seen = modelViewMatrix * vec4(place, 1.0);
        float blink = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(time * (0.9 + seed.w * 1.4) + seed.x * 5.0));
        vLight = night * blink;
        gl_PointSize = ${FIREFLY_SIZE.toFixed(2)} * pixels / -seen.z;
        gl_Position = projectionMatrix * seen;
      }`,
    fragmentShader: `
      uniform vec3 color;
      varying float vLight;
      void main() {
        // A bright middle with a soft halo.
        float away = length(gl_PointCoord - 0.5) * 2.0;
        float glow = smoothstep(1.0, 0.0, away);
        gl_FragColor = vec4(color * (glow * glow + smoothstep(0.35, 0.0, away)) * vLight, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const points = new Points(geometry, material);
  // They wander off their starting places; never culled by them.
  points.frustumCulled = false;
  points.visible = false;
  return {
    points,
    update(seconds, night, pixels) {
      points.visible = night > 0.01;
      uniforms.time.value = seconds;
      uniforms.night.value = night;
      uniforms.pixels.value = pixels;
    },
  };
}
