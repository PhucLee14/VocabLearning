import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MathUtils,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The scenery around the island: a sea of clouds below it, clouds in the
 * distance and two small flocks of birds. The scene draws the sky in its
 * fog's colour (scene.tsx), so distant scenery fades into it. Clouds are round
 * puffs, shaded smooth.
 */

const deg = (d: number) => (d * Math.PI) / 180;

/** Stable pseudo-random numbers in [0, 1), so the sky looks the same on every visit. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * The clouds' material. Matt and lit by the scene's lights like the stock
 * one, but the light is worked out at the corners and blended across each
 * triangle, not worked out again for every pixel. On round, smooth puffs the
 * two look the same, and the clouds cover most of the screen. Measured
 * 2026-11-15 on an integrated GPU at 1920×1080 ×1.5: about a tenth more
 * frames per second, together with the coarser far puffs of the cloud sea.
 * (Most of what the clouds cost is filling the screen at all, which no
 * material changes: without the cloud sea the same scene ran twice as fast.)
 * The colour is the `diffuse` uniform: see `cloudColor`.
 */
function cloudMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.lights, UniformsLib.fog, { diffuse: { value: new Color() } }]),
    lights: true,
    fog: true,
    vertexShader: `
      #include <common>
      #include <lights_pars_begin>
      #include <fog_pars_vertex>
      uniform vec3 diffuse;
      varying vec3 vLit;
      void main() {
        vec3 turned = normal;
        vec4 mvPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          // A stretched puff's normals lean the other way: undo the scale.
          mat3 instance = mat3(instanceMatrix);
          turned /= vec3(dot(instance[0], instance[0]), dot(instance[1], instance[1]), dot(instance[2], instance[2]));
          turned = instance * turned;
          mvPosition = instanceMatrix * mvPosition;
        #endif
        turned = normalize(normalMatrix * turned);
        mvPosition = modelViewMatrix * mvPosition;
        vec3 light = ambientLightColor;
        #if NUM_HEMI_LIGHTS > 0
          light += getHemisphereLightIrradiance(hemisphereLights[0], turned);
        #endif
        #if NUM_DIR_LIGHTS > 0
          light += max(dot(turned, directionalLights[0].direction), 0.0) * directionalLights[0].color;
        #endif
        vLit = light * RECIPROCAL_PI * diffuse;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      varying vec3 vLit;
      void main() {
        gl_FragColor = vec4(vLit, 1.0);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** The colour of a material made by `cloudMaterial` (the scene sets and fades it). */
export const cloudColor = (material: ShaderMaterial) => material.uniforms.diffuse.value as Color;

/** One cloud: a few flattened round puffs. */
function cloudGeometry(): BufferGeometry {
  const puffs: [x: number, y: number, z: number, radius: number][] = [
    [0, 0, 0, 1.6],
    [1.7, -0.2, 0.3, 1.2],
    [-1.6, -0.25, -0.2, 1.1],
    [0.5, 0.55, -0.6, 1],
  ];
  const parts = puffs.map(([x, y, z, radius]) => new SphereGeometry(radius, 14, 9).translate(x, y, z));
  const merged = mergeGeometries(parts, false).scale(1, 0.6, 1);
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * Clouds drift slowly around the island. They must never pass between the
 * camera and the island, so they sit in a wide ring far behind it, above the
 * cloud sea.
 */
export function createClouds(): InstancedMesh<BufferGeometry, ShaderMaterial> {
  const random = seeded(7);
  const placements: { angle: number; radius: number; y: number; scale: number }[] = [];
  for (let i = 0; i < 14; i++) {
    placements.push({ angle: i * (360 / 14) + random() * 14, radius: 60 + random() * 30, y: -6 + random() * 34, scale: 3.2 + random() * 3.2 });
  }

  const clouds = new InstancedMesh(cloudGeometry(), cloudMaterial(), placements.length);
  const dummy = new Object3D();
  placements.forEach(({ angle, radius, y, scale }, i) => {
    dummy.position.set(Math.sin(deg(angle)) * radius, y, Math.cos(deg(angle)) * radius);
    dummy.rotation.y = random() * Math.PI * 2;
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    clouds.setMatrixAt(i, dummy.matrix);
  });
  clouds.instanceMatrix.needsUpdate = true;
  // The instances span the whole sky: culling by the geometry's own bounds would hide them.
  clouds.frustumCulled = false;
  return clouds;
}

/** Height of the cloud sea's surface; the island's rock tip ends at about -10. */
const SEA_LEVEL = -24;
const SEA_RADIUS = 240;
const SEA_PUFFS = 460;
/** Puffs nearer the island's axis than this are drawn round; the rest, small on screen, with a quarter of the triangles. */
const SEA_NEAR = 80;

/**
 * A sea of clouds under the island, out to where the fog hides it: hundreds of
 * big flattened puffs over a flat disc of the same colour that closes the gaps
 * between them. It turns very slowly as a whole.
 *
 * Two instanced draw calls: the puffs near the island, which are big on
 * screen, are finer spheres than the many far ones, which are a few pixels
 * across and need no more.
 */
export function createCloudSea(): { group: Group; material: ShaderMaterial; dispose: () => void } {
  const random = seeded(23);
  const material = cloudMaterial();
  const near: Matrix4[] = [];
  const far: Matrix4[] = [];
  const dummy = new Object3D();
  for (let i = 0; i < SEA_PUFFS; i++) {
    // Denser near the island, sparser towards the fog.
    const radius = SEA_RADIUS * random() ** 0.7;
    const angle = random() * Math.PI * 2;
    const size = 7 + random() * 9;
    dummy.position.set(Math.sin(angle) * radius, SEA_LEVEL - size * 0.2 + random() * 2.5, Math.cos(angle) * radius);
    dummy.rotation.set(random() * 0.5, random() * Math.PI * 2, random() * 0.5);
    dummy.scale.set(size, size * (0.32 + random() * 0.14), size);
    dummy.updateMatrix();
    (radius < SEA_NEAR ? near : far).push(dummy.matrix.clone());
  }
  const puffs = [
    { matrices: near, sphere: new SphereGeometry(1, 16, 10) },
    { matrices: far, sphere: new SphereGeometry(1, 8, 6) },
  ].map(({ matrices, sphere }) => {
    const mesh = new InstancedMesh(sphere, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    // The instances span the whole sea: culling by the sphere's own bounds would hide them.
    mesh.frustumCulled = false;
    return mesh;
  });

  const floor = new Mesh(new CircleGeometry(SEA_RADIUS + 60, 24).rotateX(-Math.PI / 2), material);
  floor.position.y = SEA_LEVEL - 2;

  const group = new Group().add(...puffs, floor);
  const dispose = () => {
    for (const mesh of puffs) mesh.geometry.dispose();
    floor.geometry.dispose();
    material.dispose();
  };
  return { group, material, dispose };
}

interface Bird {
  /** Orbit around the island's axis. */
  radius: number;
  height: number;
  /** Radians per second; negative flies the other way. */
  speed: number;
  /** Starting angle on the orbit, radians. */
  offset: number;
  flapOffset: number;
}

/**
 * Two flocks in a loose V: five birds circling just above the mountain top,
 * three higher up. Both orbits stay well inside the camera's path (the camera
 * is never closer than about 20 units to the island's axis), so a bird never
 * flies through the lens or fills the view.
 */
const BIRDS: Bird[] = [
  ...[0, 1, 2, 3, 4].map((i) => {
    const rank = Math.ceil(i / 2);
    const wing = i % 2 === 0 ? 1 : -1;
    return { radius: 9 + rank * wing * 0.6, height: 10 + rank * 0.2, speed: 0.3, offset: -rank * 0.09, flapOffset: i * 1.7 };
  }),
  ...[0, 1, 2].map((i) => {
    const rank = Math.ceil(i / 2);
    const wing = i % 2 === 0 ? 1 : -1;
    return { radius: 14 + rank * wing * 0.8, height: 20 + rank * 0.3, speed: -0.18, offset: 2 + rank * 0.08, flapOffset: i * 2.3 };
  }),
];

/** A bird's shape (island units): body from beak to tail, half its width, and the two parts of each wing. */
const NOSE = 0.2;
const TAIL = -0.22;
const BODY_HALF = 0.045;
const WING_INNER = 0.2;
const WING_OUTER = 0.25;
/** Per bird: the body (2 triangles) and each wing, an inner quad and an outer triangle (3 each). */
const VERTICES_PER_BIRD = 24;
/**
 * How light each corner is (times the material's colour): the wing tips and
 * the tail darker, so a bird reads as a shape and not a flat cut-out. In the
 * order the corners are written in `update`.
 */
const SHADES = [
  // Body: beak, one shoulder, tail; beak, tail, other shoulder.
  0.86, 0.9, 0.72, 0.86, 0.72, 0.9,
  // A wing: root front, root back, elbow back; root front, elbow back, elbow front; elbow front, elbow back, tip.
  ...[1, 1, 0.94, 1, 0.94, 0.94, 0.94, 0.94, 0.7],
  ...[1, 1, 0.94, 1, 0.94, 0.94, 0.94, 0.94, 0.7],
];

const centre = new Vector3();
const heading = new Vector3();
const side = new Vector3();
const across = new Vector3();
const lift = new Vector3();
const point = new Vector3();
const UP = new Vector3(0, 1, 0);

export interface Birds {
  mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  /**
   * `scatter` (0–1) throws every bird off its place in the flock, each its own
   * way, and makes it flap harder: 1 right after a fright, back to 0 as the
   * flock gathers again.
   */
  update: (seconds: number, scatter?: number) => void;
  /** Where the lower flock's leader is at that moment (for clicking on the flock). */
  leader: (seconds: number, target: Vector3) => Vector3;
}

/**
 * All birds share one geometry, rewritten every frame. Each wing bends at the
 * elbow, and its outer half follows the inner one a moment late, so a beat
 * is a wave along the wing rather than a hinge flipping (user feedback
 * 2026-11-16: the birds looked stiff). A bird flaps for a while and then
 * glides with its wings held a little up, bobbing against its own beats, and
 * leans into the circle it flies.
 */
export function createBirds(): Birds {
  const positions = new BufferAttribute(new Float32Array(BIRDS.length * VERTICES_PER_BIRD * 3), 3).setUsage(DynamicDrawUsage);
  const shades = new Float32Array(BIRDS.length * VERTICES_PER_BIRD * 3);
  for (let i = 0; i < BIRDS.length * VERTICES_PER_BIRD; i++) shades.fill(SHADES[i % VERTICES_PER_BIRD], i * 3, i * 3 + 3);
  const geometry = new BufferGeometry().setAttribute('position', positions).setAttribute('color', new BufferAttribute(shades, 3));
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide, vertexColors: true }));
  mesh.frustumCulled = false;

  const place = (bird: Bird, seconds: number, target: Vector3) => {
    const angle = bird.offset + seconds * bird.speed;
    return target.set(Math.sin(angle) * bird.radius, bird.height + Math.sin(seconds * 0.6 + bird.flapOffset) * 0.3, Math.cos(angle) * bird.radius);
  };

  const update = (seconds: number, scatter = 0) => {
    BIRDS.forEach((bird, i) => {
      const angle = bird.offset + seconds * bird.speed;
      const direction = Math.sign(bird.speed);
      place(bird, seconds, centre);
      heading.set(Math.cos(angle) * direction, 0, -Math.sin(angle) * direction);
      // Outwards, away from the island's axis.
      side.set(Math.sin(angle), 0, Math.cos(angle));
      if (scatter > 0) {
        // Each bird's own way out: sideways, up and along, from its place in the list.
        centre
          .addScaledVector(side, Math.sin(i * 2.4 + 1) * 4 * scatter)
          .addScaledVector(heading, Math.cos(i * 1.7) * 2.5 * scatter);
        centre.y += (1.5 + (i % 3)) * scatter;
      }

      // Flapping (1) or gliding (0), in spells of a few seconds; a fright makes every bird flap hard.
      const flapping = Math.max(scatter, MathUtils.smoothstep(Math.sin(seconds * 0.42 + bird.flapOffset * 1.7), -0.35, 0.35));
      const beat = seconds * (6.2 + 8 * scatter) + bird.flapOffset;
      const glide = (1 - flapping) * 0.05 * Math.sin(seconds * 1.3 + bird.flapOffset);
      const inner = 0.16 + flapping * 0.6 * Math.sin(beat) + glide;
      const outer = inner + flapping * 0.5 * Math.sin(beat - 0.9) - (1 - flapping) * 0.1;
      // The body dips as the wings go up, and rises on the downstroke.
      centre.y -= flapping * 0.045 * Math.sin(beat);

      // Leaning into the turn: the wing on the inside of the circle lower.
      const roll = 0.26 + 0.08 * Math.sin(seconds * 0.7 + bird.flapOffset) + scatter * 0.35 * Math.sin(i * 1.9);
      across.copy(side).multiplyScalar(Math.cos(roll)).addScaledVector(UP, Math.sin(roll));
      lift.copy(UP).multiplyScalar(Math.cos(roll)).addScaledVector(side, -Math.sin(roll));

      let vertex = i * VERTICES_PER_BIRD;
      const put = (along: number, out: number, up: number) => {
        point.copy(centre).addScaledVector(heading, along).addScaledVector(across, out).addScaledVector(lift, up);
        positions.setXYZ(vertex++, point.x, point.y, point.z);
      };
      put(NOSE, 0, 0);
      put(0.02, BODY_HALF, 0);
      put(TAIL, 0, 0.01);
      put(NOSE, 0, 0);
      put(TAIL, 0, 0.01);
      put(0.02, -BODY_HALF, 0);
      for (const sign of [1, -1]) {
        const elbowOut = sign * (BODY_HALF + WING_INNER * Math.cos(inner));
        const elbowUp = WING_INNER * Math.sin(inner);
        const tipOut = elbowOut + sign * WING_OUTER * Math.cos(outer);
        const tipUp = elbowUp + WING_OUTER * Math.sin(outer);
        put(0.08, sign * BODY_HALF, 0);
        put(-0.09, sign * BODY_HALF, 0);
        put(-0.11, elbowOut, elbowUp);
        put(0.08, sign * BODY_HALF, 0);
        put(-0.11, elbowOut, elbowUp);
        put(0.05, elbowOut, elbowUp);
        put(0.05, elbowOut, elbowUp);
        put(-0.11, elbowOut, elbowUp);
        // The tip sweeps back.
        put(-0.17, tipOut, tipUp);
      }
    });
    positions.needsUpdate = true;
  };
  update(0);
  return { mesh, update, leader: (seconds, target) => place(BIRDS[0], seconds, target) };
}
