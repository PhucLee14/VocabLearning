import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The scenery around the island: a sea of clouds below it, low-poly clouds in
 * the distance and two small flocks of birds. The sky itself is plain CSS
 * (`--sky` behind the transparent canvas), and the scene's fog fades distant
 * scenery into that colour.
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

/** One cloud: a few flattened, faceted puffs. */
function cloudGeometry(): BufferGeometry {
  const puffs: [x: number, y: number, z: number, radius: number][] = [
    [0, 0, 0, 1.6],
    [1.7, -0.2, 0.3, 1.2],
    [-1.6, -0.25, -0.2, 1.1],
    [0.5, 0.55, -0.6, 1],
  ];
  const parts = puffs.map(([x, y, z, radius]) => new IcosahedronGeometry(radius, 0).translate(x, y, z));
  const merged = mergeGeometries(parts, false).scale(1, 0.6, 1);
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * Clouds drift slowly around the island. They must never pass between the
 * camera and the island, so they sit in a wide ring far behind it, above the
 * cloud sea.
 */
export function createClouds(): InstancedMesh<BufferGeometry, MeshLambertMaterial> {
  const random = seeded(7);
  const placements: { angle: number; radius: number; y: number; scale: number }[] = [];
  for (let i = 0; i < 14; i++) {
    placements.push({ angle: i * (360 / 14) + random() * 14, radius: 60 + random() * 30, y: -6 + random() * 34, scale: 3.2 + random() * 3.2 });
  }

  const clouds = new InstancedMesh(cloudGeometry(), new MeshLambertMaterial({ flatShading: true }), placements.length);
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

/**
 * A sea of clouds under the island, out to where the fog hides it: hundreds of
 * big flattened puffs (one instanced draw call) over a flat disc of the same
 * colour that closes the gaps between them. It turns very slowly as a whole.
 */
export function createCloudSea(): { group: Group; material: MeshLambertMaterial; dispose: () => void } {
  const random = seeded(23);
  const material = new MeshLambertMaterial({ flatShading: true });
  // Detail 1 (80 faces): rounder than the distant clouds, so the sea reads as billows, not ice.
  const puffs = new InstancedMesh(new IcosahedronGeometry(1, 1), material, SEA_PUFFS);
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
    puffs.setMatrixAt(i, dummy.matrix);
  }
  puffs.instanceMatrix.needsUpdate = true;
  puffs.frustumCulled = false;

  const floor = new Mesh(new CircleGeometry(SEA_RADIUS + 60, 24).rotateX(-Math.PI / 2), material);
  floor.position.y = SEA_LEVEL - 2;

  const group = new Group().add(puffs, floor);
  const dispose = () => {
    puffs.geometry.dispose();
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

const WING_SPAN = 0.45;
const BODY_LENGTH = 0.32;

const centre = new Vector3();
const heading = new Vector3();
const side = new Vector3();
const point = new Vector3();

/**
 * All birds share one geometry, rewritten every frame: each bird is two
 * triangles (wings) hinged on its body line.
 */
export function createBirds(): { mesh: Mesh<BufferGeometry, MeshBasicMaterial>; update: (seconds: number) => void } {
  const positions = new BufferAttribute(new Float32Array(BIRDS.length * 6 * 3), 3).setUsage(DynamicDrawUsage);
  const geometry = new BufferGeometry().setAttribute('position', positions);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.frustumCulled = false;

  const update = (seconds: number) => {
    BIRDS.forEach((bird, i) => {
      const angle = bird.offset + seconds * bird.speed;
      const direction = Math.sign(bird.speed);
      centre.set(Math.sin(angle) * bird.radius, bird.height + Math.sin(seconds * 0.6 + bird.flapOffset) * 0.3, Math.cos(angle) * bird.radius);
      heading.set(Math.cos(angle) * direction, 0, -Math.sin(angle) * direction);
      side.set(Math.sin(angle), 0, Math.cos(angle));
      const flap = Math.sin(seconds * 7 + bird.flapOffset) * 0.6;
      const reach = Math.cos(flap) * WING_SPAN;
      const lift = Math.sin(flap) * WING_SPAN;

      let vertex = i * 6;
      const put = (along: number, across: number, up: number) => {
        point.copy(centre).addScaledVector(heading, along).addScaledVector(side, across);
        positions.setXYZ(vertex++, point.x, point.y + up, point.z);
      };
      // Left wing, then right wing: nose, tail, wing tip.
      put(BODY_LENGTH, 0, 0);
      put(-BODY_LENGTH * 0.6, 0, 0);
      put(-0.1, reach, lift);
      put(BODY_LENGTH, 0, 0);
      put(-0.1, -reach, lift);
      put(-BODY_LENGTH * 0.6, 0, 0);
    });
    positions.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}
