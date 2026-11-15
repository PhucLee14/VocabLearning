import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
} from 'three';
import type { Palette } from './palette';
import { THEME_SECONDS } from './parts';

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
 * - Sun and moon sit at opposite ends of an unseen wheel. Whichever belongs to
 *   the theme is at the top, at full size; the other is at the bottom, shrunk
 *   to nothing. When the theme changes the wheel makes half a turn: one sets
 *   towards the island while the other rises from the outer side.
 */

const WHITE = new Color(1, 1, 1);

/** The wheel's radius, in sun radii. Its half turn takes THEME_SECONDS. */
const WHEEL = 8.4;

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
  /** Follow the theme: which body is up (they swap with half a turn of their wheel), and the colours. */
  apply: (palette: Palette) => void;
  /**
   * `seconds` is the scene's clock, `delta` the real time since the last frame.
   * `outward` is the outer side of the screen, away from the island (1 =
   * right, -1 = left): the bodies rise from there and set the other way.
   * `still` (reduced motion) swaps them at once. `sky` is the sky's colour
   * right now and `night` how far it is night (0 = day … 1 = night): both
   * ease over after a theme change, and the glows and the stars follow them.
   */
  update: (seconds: number, delta: number, outward: number, still: boolean, sky: Color, night: number) => void;
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

  const starColor = new Color();

  /**
   * The wheel's angle: the sun is up at even multiples of π, the moon at odd
   * ones. It only ever turns forwards, from `from` to `goal`; `swap` is how far
   * through that turn it is (1 = at rest).
   */
  let turn = 0;
  let from = 0;
  let goal = 0;
  let swap = 1;
  let started = false;

  /**
   * Puts a body where the wheel has carried it: at the top it is full size and
   * upright. The wheel turns so that a body sets inwards, towards the island
   * (behind the mountain), and rises from the outer side of the screen. (The
   * other way round was tried first: the sun slid off the screen's edge, which
   * read as backwards.)
   */
  const carry = (body: Group, angle: number, outward: number) => {
    const height = Math.cos(angle);
    const size = MathUtils.smoothstep(height, -0.35, 0.8);
    body.visible = size > 0.01;
    body.position.set(-Math.sin(angle) * WHEEL * outward, (height - 1) * WHEEL, 0);
    body.scale.setScalar(size);
    body.rotation.z = angle * outward;
  };

  return {
    screen,
    stars,
    apply(palette) {
      const up = palette.dark ? 1 : 0;
      if (!started) {
        // The first time there is nothing to swap: the right one is simply up.
        started = true;
        turn = from = goal = up * Math.PI;
      } else if (Math.round(goal / Math.PI) % 2 !== up) {
        from = turn;
        goal += Math.PI;
        swap = 0;
      }
      starColor.copy(palette.moon);
      sunMaterial.color.copy(palette.sun);
      moonMaterial.color.copy(palette.moon);
    },
    update(seconds, delta, outward, still, sky, night) {
      if (swap < 1) {
        swap = still ? 1 : Math.min(1, swap + delta / THEME_SECONDS);
        turn = MathUtils.lerp(from, goal, MathUtils.smootherstep(swap, 0, 1));
      }
      carry(sun, turn, outward);
      carry(moon, turn + Math.PI, outward);
      rays.rotation.z = seconds * 0.05;
      // The glows are the sky's colour of the moment mixed with the body's. The
      // sun's starts from a paler sky (mixed with plain sky blue it turns grey-green).
      sunGlow.color.copy(sky).lerp(WHITE, 0.6).lerp(sunMaterial.color, 0.3);
      moonGlow.color.lerpColors(sky, moonMaterial.color, 0.1);
      // The stars come out as it gets dark, and twinkle.
      stars.visible = night > 0.02;
      starSets.forEach((set, i) => {
        set.material.color.lerpColors(sky, starColor, night * (0.6 + 0.4 * Math.sin(seconds * 1.1 + i * Math.PI)));
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
