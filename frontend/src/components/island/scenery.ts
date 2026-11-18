import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three';

/**
 * The scenery around the island: the sky (a dome, pale at the horizon and
 * deep blue overhead), a sea of clouds below the island, soft clouds in the
 * distance and two small flocks of birds. The horizon is the fog's colour, so
 * distant scenery melts into it.
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

/** Soft value noise and a few octaves of it, shared by the sky's shaders. */
const NOISE = `
  float skyHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float skyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), f.x), mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float skyFbm(vec2 p) {
    float sum = 0.0;
    float weight = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += weight * skyNoise(p);
      p = p * 2.03 + vec2(17.1, 9.2);
      weight *= 0.5;
    }
    return sum;
  }`;

/** The colour of a cloud or cloud-sea material (its `diffuse` uniform; the scene sets and fades it). */
export const cloudColor = (material: ShaderMaterial) => material.uniforms.diffuse.value as Color;

/**
 * The sky: a dome around the camera, from the horizon's colour (the fog's,
 * so the far cloud sea melts into it) up to a deep, clear blue overhead (dark
 * navy at night), like a sky over a sea of clouds on a fine day (the user's
 * reference photo, 2026-11-18). Drawn first, behind everything.
 * `zenith` is the colour overhead; the scene sets and fades it.
 */
export function createSkyDome(horizon: Color): { mesh: Mesh<SphereGeometry, ShaderMaterial>; zenith: Color } {
  const zenith = new Color();
  const material = new ShaderMaterial({
    uniforms: { horizon: { value: horizon }, zenith: { value: zenith } },
    side: BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 horizon;
      uniform vec3 zenith;
      varying vec3 vDirection;
      void main() {
        float up = normalize(vDirection).y;
        // A thin pale band along the horizon, then the deep blue within a few degrees: the camera
        // only ever looks a few degrees above the horizon (at the top of the screen, about 5°).
        float t = pow(smoothstep(-0.005, 0.08, up), 0.6);
        gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  // Inside the camera's far plane (600) wherever the camera is: the scene keeps it centred on the camera.
  const mesh = new Mesh(new SphereGeometry(520, 32, 16), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, zenith };
}

/** The puffs of one cloud: [along, up, across, diameter], in the cloud's own units. */
const CLOUD_PUFFS: [number, number, number, number][] = [
  [0, 0.35, 0, 3.6],
  [1.9, 0.1, 0.2, 2.8],
  [-1.8, 0.05, -0.1, 2.7],
  [0.9, 1.0, -0.3, 2.5],
  [-0.8, 0.9, 0.2, 2.3],
  [3.3, -0.15, 0, 2],
  [-3.2, -0.2, 0.1, 1.9],
];
const CLOUDS = 14;

/**
 * Clouds drift slowly around the island. They must never pass between the
 * camera and the island, so they sit in a wide ring far behind it, above the
 * cloud sea.
 *
 * Each cloud is a handful of soft puffs: quads that always face the camera,
 * each a round blot with a ragged, see-through edge (noise) and a lit top and
 * shaded underside, so a cloud reads as a soft heap (user feedback
 * 2026-11-18: the clouds made of solid spheres looked hard). One instanced draw
 * call, drawn with the see-through things after the island.
 * The colour is the `diffuse` uniform (`cloudColor`), the drift `time`.
 */
export function createClouds(): InstancedMesh<PlaneGeometry, ShaderMaterial> {
  const random = seeded(7);
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.lights, UniformsLib.fog, { diffuse: { value: new Color() }, time: { value: 0 } }]),
    lights: true,
    fog: true,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      #include <common>
      #include <lights_pars_begin>
      #include <fog_pars_vertex>
      uniform vec3 diffuse;
      varying vec2 vUv;
      varying float vSeed;
      varying vec3 vTop;
      varying vec3 vBottom;
      /** The light a surface facing that way (view space) gets. */
      vec3 lightFrom(vec3 normal) {
        vec3 light = ambientLightColor;
        #if NUM_HEMI_LIGHTS > 0
          light += getHemisphereLightIrradiance(hemisphereLights[0], normal);
        #endif
        #if NUM_DIR_LIGHTS > 0
          float wrap = dot(normal, directionalLights[0].direction) * 0.5 + 0.5;
          light += wrap * wrap * directionalLights[0].color;
        #endif
        return light * RECIPROCAL_PI * diffuse;
      }
      void main() {
        vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float size = length(instanceMatrix[0].xyz) * length(modelMatrix[0].xyz);
        vec4 mvPosition = centre + vec4(position.xy * size, 0.0, 0.0);
        vUv = uv;
        vSeed = fract(dot(instanceMatrix[3].xyz, vec3(0.131, 0.719, 0.377)));
        vec3 up = normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0));
        vTop = lightFrom(up);
        vBottom = lightFrom(normalize(-up * 0.6 + vec3(0.0, 0.0, 0.8)));
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      uniform float time;
      varying vec2 vUv;
      varying float vSeed;
      varying vec3 vTop;
      varying vec3 vBottom;
      ${NOISE}
      void main() {
        float noise = skyFbm(vUv * 2.6 + vSeed * 37.0 + vec2(time * 0.012, 0.0));
        float r = length(vUv - 0.5) * 2.0;
        // A soft but definite, ragged edge; a flatter underside.
        float alpha = smoothstep(1.0, 0.55, r + (noise - 0.5) * 0.5) * smoothstep(0.0, 0.22, vUv.y + (noise - 0.5) * 0.2);
        if (alpha < 0.01) discard;
        // Bright white on top, only a little greyer underneath.
        float up = clamp(vUv.y * 1.2 + (noise - 0.5) * 0.4, 0.0, 1.0);
        gl_FragColor = vec4(mix(mix(vBottom, vTop, 0.6), vTop, up) * 1.06, alpha);
        // Fog after the colour space, as three's own materials do: it hands the fog's colour over in the output's colour space.
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });

  const clouds = new InstancedMesh(new PlaneGeometry(1, 1), material, CLOUDS * CLOUD_PUFFS.length);
  const dummy = new Object3D();
  let index = 0;
  for (let i = 0; i < CLOUDS; i++) {
    const angle = deg(i * (360 / CLOUDS) + random() * 14);
    const radius = 60 + random() * 30;
    const y = -6 + random() * 34;
    const scale = 3.2 + random() * 3.2;
    const turn = random() * Math.PI * 2;
    for (const [along, up, across, size] of CLOUD_PUFFS) {
      const x = along * Math.cos(turn) + across * Math.sin(turn);
      const z = -along * Math.sin(turn) + across * Math.cos(turn);
      dummy.position.set(Math.sin(angle) * radius + x * scale, y + up * scale * 0.6, Math.cos(angle) * radius + z * scale);
      dummy.scale.setScalar(size * scale * (0.9 + random() * 0.2));
      dummy.updateMatrix();
      clouds.setMatrixAt(index++, dummy.matrix);
    }
  }
  clouds.instanceMatrix.needsUpdate = true;
  // The instances span the whole sky: culling by one quad's bounds would hide them.
  clouds.frustumCulled = false;
  return clouds;
}

/** Height of the cloud sea's surface (the tops of its billows rise a few units above it); the island's rock tip ends at about -10. */
const SEA_LEVEL = -26;
const SEA_RADIUS = 320;
/** How high the billows rise, and the width of the big ones (world units). */
const BILLOW_HEIGHT = 7;
const BILLOW_SIZE = 30;

/** The cloud sea's surface: rings around the middle, closer together near the island, where it is seen up close. */
function seaGeometry(): BufferGeometry {
  const rings = 96;
  const around = 160;
  const positions: number[] = [0, 0, 0];
  const indices: number[] = [];
  for (let ring = 1; ring <= rings; ring++) {
    const radius = SEA_RADIUS * (ring / rings) ** 1.8;
    for (let k = 0; k < around; k++) {
      const angle = (k / around) * Math.PI * 2;
      positions.push(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    }
  }
  const at = (ring: number, k: number) => (ring === 0 ? 0 : 1 + (ring - 1) * around + (k % around));
  for (let ring = 0; ring < rings; ring++) {
    for (let k = 0; k < around; k++) {
      if (ring === 0) indices.push(0, at(1, k), at(1, k + 1));
      else indices.push(at(ring, k), at(ring + 1, k), at(ring + 1, k + 1), at(ring, k), at(ring + 1, k + 1), at(ring, k + 1));
    }
  }
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * A sea of clouds under the island, out to where the fog hides it: one
 * smooth surface that rolls in big, soft billows (a few octaves of noise lift
 * it, rounded on top, flat in the hollows), lit softly, with fine wisps
 * drifting over it. The billows and the wisps drift slowly. (It used to be
 * hundreds of flattened spheres: lumpy, and many of them drawn over each
 * other; user feedback 2026-11-18.) One draw call.
 * The colour is the `diffuse` uniform (`cloudColor`), the drift `time`.
 */
export function createCloudSea(): { group: Group; material: ShaderMaterial; dispose: () => void } {
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.lights, UniformsLib.fog, { diffuse: { value: new Color() }, time: { value: 0 } }]),
    lights: true,
    fog: true,
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      uniform float time;
      varying vec3 vNormal;
      varying vec2 vPlace;
      varying float vHeight;
      ${NOISE}
      float billow(vec2 place) {
        float n = skyFbm(place / ${BILLOW_SIZE.toFixed(1)} + vec2(time * 0.008, time * 0.005));
        return pow(smoothstep(0.22, 0.85, n), 1.5);
      }
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        // The surface's slope from its height a step either way: its normal.
        float step = 1.5;
        float height = billow(world.xz);
        float east = billow(world.xz + vec2(step, 0.0));
        float north = billow(world.xz + vec2(0.0, step));
        vec3 normal = normalize(vec3((height - east) * ${BILLOW_HEIGHT.toFixed(1)}, step, (height - north) * ${BILLOW_HEIGHT.toFixed(1)}));
        world.y += height * ${BILLOW_HEIGHT.toFixed(1)};
        vNormal = normalize(mat3(viewMatrix) * normal);
        vPlace = world.xz;
        vHeight = height;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <lights_pars_begin>
      #include <fog_pars_fragment>
      uniform vec3 diffuse;
      uniform float time;
      varying vec3 vNormal;
      varying vec2 vPlace;
      varying float vHeight;
      ${NOISE}
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 light = ambientLightColor;
        #if NUM_HEMI_LIGHTS > 0
          light += getHemisphereLightIrradiance(hemisphereLights[0], normal);
        #endif
        #if NUM_DIR_LIGHTS > 0
          // Wrapped: light reaches round the billows, so there is no hard line where it ends.
          float wrap = dot(normal, directionalLights[0].direction) * 0.5 + 0.5;
          light += wrap * wrap * directionalLights[0].color;
        #endif
        // Fine wisps drifting over the surface, and the hollows a little greyer than the tops.
        float wisp = skyFbm(vPlace * 0.11 + vec2(time * 0.03, -time * 0.02));
        float shade = 0.9 + 0.16 * (wisp - 0.5) + 0.1 * vHeight;
        gl_FragColor = vec4(diffuse * light * RECIPROCAL_PI * shade, 1.0);
        // Fog after the colour space, as three's own materials do: it hands the fog's colour over in the output's colour space.
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const surface = new Mesh(seaGeometry(), material);
  surface.position.y = SEA_LEVEL;
  surface.frustumCulled = false;
  const group = new Group().add(surface);
  const dispose = () => {
    surface.geometry.dispose();
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
