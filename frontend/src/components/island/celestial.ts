import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
} from 'three';
import type { Palette } from './palette';

/**
 * What hangs in the sky: a sun with rays in the light theme; a crescent moon
 * and stars in the dark theme.
 *
 * - The sun and the moon are attached to the camera (`screen`), so they keep
 *   their place on screen while the camera orbits the island; the scene's main
 *   light shines from that side (see scene.tsx). They are drawn after the
 *   cloud sea and before everything else, without depth testing: the island
 *   and the clouds pass in front of them.
 * - The stars are fixed in the world on a big dome (`stars`), so they sweep
 *   past as the camera turns, and set behind the cloud sea.
 * - Everything is flat colour (no blending, no bloom): the glow around the
 *   sun and the moon is one disc of the sky colour mixed with theirs.
 */

/** Draw order (three's `renderOrder`); the cloud sea is 0, clouds 2, the island 3 (scene.tsx). */
const ORDER = { stars: 0.5, glow: 1, rays: 1.1, body: 1.2 };

/** Double-sided: the hand-built ray and crescent triangles don't all wind the same way. */
const flat = () => new MeshBasicMaterial({ fog: false, depthTest: false, depthWrite: false, side: DoubleSide });

function mesh(geometry: BufferGeometry, material: MeshBasicMaterial, order: number): Mesh<BufferGeometry, MeshBasicMaterial> {
  const result = new Mesh(geometry, material);
  result.renderOrder = order;
  return result;
}

/** Twelve thin triangles around a disc of radius 1. */
function rayGeometry(): BufferGeometry {
  const count = 12;
  const positions = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const half = 0.085;
    const inner = 1.32;
    const outer = i % 2 === 0 ? 2 : 1.72;
    positions.set(
      [
        Math.cos(angle - half) * inner, Math.sin(angle - half) * inner, 0,
        Math.cos(angle + half) * inner, Math.sin(angle + half) * inner, 0,
        Math.cos(angle) * outer, Math.sin(angle) * outer, 0,
      ],
      i * 9,
    );
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3));
}

/**
 * A crescent inside a disc of radius 1: the strip between the left arc of that
 * disc and the left arc of a second, smaller disc shifted to the right. Both
 * arcs run between the two points where the circles cross.
 */
function crescentGeometry(): BufferGeometry {
  const shift = 0.5;
  const innerRadius = 0.8;
  const crossX = (shift * shift + 1 - innerRadius * innerRadius) / (2 * shift);
  const crossY = Math.sqrt(1 - crossX * crossX);
  const outerStart = Math.atan2(crossY, crossX);
  const innerStart = Math.atan2(crossY, crossX - shift);

  const steps = 20;
  const positions: number[] = [];
  const point = (t: number) => {
    const outer = outerStart + (2 * Math.PI - 2 * outerStart) * t;
    const inner = innerStart + (2 * Math.PI - 2 * innerStart) * t;
    return [Math.cos(outer), Math.sin(outer), shift + Math.cos(inner) * innerRadius, Math.sin(inner) * innerRadius];
  };
  for (let i = 0; i < steps; i++) {
    const [ax, ay, bx, by] = point(i / steps);
    const [cx, cy, dx, dy] = point((i + 1) / steps);
    positions.push(ax, ay, 0, cx, cy, 0, bx, by, 0, bx, by, 0, cx, cy, 0, dx, dy, 0);
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
}

const STAR_DOME = 480;
const STARS_PER_SET = 500;

/** Stars low over the horizon, where the camera actually looks; denser near the horizon. */
function starGeometry(seed: number): BufferGeometry {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const positions = new Float32Array(STARS_PER_SET * 3);
  for (let i = 0; i < STARS_PER_SET; i++) {
    const around = random() * Math.PI * 2;
    const above = ((-6 + 36 * random() ** 1.5) * Math.PI) / 180;
    positions.set(
      [Math.sin(around) * Math.cos(above) * STAR_DOME, Math.sin(above) * STAR_DOME, Math.cos(around) * Math.cos(above) * STAR_DOME],
      i * 3,
    );
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3));
}

export interface Sky {
  /** Sun and moon. Add to the camera; place it with `position` / `scale` in camera space. */
  screen: Group;
  /** Stars. Add to the scene. */
  stars: Group;
  /** Follow the theme: which bodies show, and their colours. */
  apply: (palette: Palette) => void;
  update: (seconds: number) => void;
  dispose: () => void;
}

export function createSky(): Sky {
  const sunMaterial = flat();
  const sunGlow = flat();
  const moonMaterial = flat();
  const moonGlow = flat();

  const rays = mesh(rayGeometry(), sunMaterial, ORDER.rays);
  const sun = new Group().add(
    mesh(new CircleGeometry(2.7, 36), sunGlow, ORDER.glow),
    rays,
    mesh(new CircleGeometry(1, 28), sunMaterial, ORDER.body),
  );

  const crescent = mesh(crescentGeometry(), moonMaterial, ORDER.body);
  crescent.rotation.z = -0.5;
  const moon = new Group().add(mesh(new CircleGeometry(2.2, 36), moonGlow, ORDER.glow), crescent);

  const screen = new Group().add(sun, moon);

  // Two sets that brighten and dim out of step: a cheap twinkle. Opaque, so the moon is drawn over them.
  const starSets = [11, 29].map((seed) => {
    const points = new Points(starGeometry(seed), new PointsMaterial({ size: 2, sizeAttenuation: false, fog: false }));
    points.renderOrder = ORDER.stars;
    points.frustumCulled = false;
    return points;
  });
  const stars = new Group().add(...starSets);

  const skyColor = new Color();
  const starColor = new Color();

  return {
    screen,
    stars,
    apply(palette) {
      sun.visible = !palette.dark;
      moon.visible = palette.dark;
      stars.visible = palette.dark;
      skyColor.copy(palette.sky);
      starColor.copy(palette.moon);
      sunMaterial.color.copy(palette.sun);
      sunGlow.color.lerpColors(palette.sky, palette.sun, 0.25);
      moonMaterial.color.copy(palette.moon);
      moonGlow.color.lerpColors(palette.sky, palette.moon, 0.1);
    },
    update(seconds) {
      rays.rotation.z = seconds * 0.05;
      starSets.forEach((set, i) => {
        set.material.color.lerpColors(skyColor, starColor, 0.6 + 0.4 * Math.sin(seconds * 1.1 + i * Math.PI));
      });
    },
    dispose() {
      screen.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose();
      });
      for (const material of [sunMaterial, sunGlow, moonMaterial, moonGlow]) material.dispose();
      for (const set of starSets) {
        set.geometry.dispose();
        set.material.dispose();
      }
    },
  };
}
