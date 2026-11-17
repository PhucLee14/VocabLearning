import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CustomBlending,
  Group,
  MathUtils,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  ShaderMaterial,
  SrcAlphaFactor,
  ZeroFactor,
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
 * - Each is one disc, drawn by a small shader of its own, so nothing about
 *   them has a hard edge or stands still (user feedback 2026-11-16: the flat
 *   discs and triangles looked stiff). The sun: a disc that is paler in the
 *   middle, rays that turn slowly and grow and shrink out of step, a halo
 *   that breathes. The moon: a ball lit from one side (a crescent with a soft
 *   edge that slowly swells and thins, a few craters, the dark part just
 *   visible) and a halo beside its lit edge.
 * - Their halos and soft edges are blended with what is behind them (sky,
 *   cloud sea, stars). Not with `transparent: true`, though: three.js draws
 *   transparent things after everything solid, i.e. on top of the island.
 *   They keep their place in the solid list (after the sea, before the clouds
 *   and the island) and blend there, which three.js does for a material with
 *   custom blending factors.
 * - The stars are fixed in the world on a big dome (`stars`), so they sweep
 *   past as the camera turns, and set behind the cloud sea. Each twinkles to
 *   its own beat.
 * - Sun and moon sit at opposite ends of an unseen wheel. Whichever belongs to
 *   the theme is at the top, at full size; the other is at the bottom, shrunk
 *   to nothing. When the theme changes the wheel makes half a turn: one sets
 *   towards the island while the other rises from the outer side.
 */

/** The wheel's radius, in sun radii. Its half turn takes THEME_SECONDS. */
const WHEEL = 8.4;

/** Draw order (three's `renderOrder`); the cloud sea is 0, clouds 2, the island 3 (scene.tsx). */
const ORDER = { stars: 0.5, body: 1.2 };

/** How far the halos reach, in radii of the sun's and the moon's own disc. */
const SUN_REACH = 3.4;
const MOON_REACH = 2.9;

const BODY_VERTEX = `
  varying vec2 vAt;
  void main() {
    vAt = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/** One layer of colour laid over another (colour, and how much of it there is). */
const OVER = `
  vec4 over(vec4 top, vec4 under) {
    float all = top.a + under.a * (1.0 - top.a);
    return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / max(all, 0.0001), all);
  }`;

/** `vAt` is the place on the disc, in radii of the sun itself (1 = its edge). */
const SUN_FRAGMENT = `
  uniform vec3 body;
  uniform float time;
  varying vec2 vAt;
  ${OVER}
  void main() {
    float r = length(vAt);
    // Twelve rays that turn slowly; every other one is longer, and each grows and shrinks to its own beat.
    float turns = (atan(vAt.y, vAt.x) + time * 0.05) / 6.2831853 * 12.0;
    float ray = mod(floor(turns + 0.5), 12.0);
    float across = abs(turns - floor(turns + 0.5));
    float reach = 1.72 + 0.3 * mod(ray, 2.0) + 0.16 * sin(time * 1.3 + ray * 2.4);
    float along = (r - 1.2) / (reach - 1.2);
    float width = 0.2 * (1.0 - along * 0.85);
    float rays = smoothstep(width, width - 0.07, across) * smoothstep(-0.02, 0.1, along) * smoothstep(1.0, 0.8, along);
    // A halo that thins out to nothing and breathes.
    float breath = 1.0 + 0.05 * sin(time * 0.8);
    float halo = exp(-max(r - 1.0, 0.0) * 1.5 / breath) * smoothstep(${SUN_REACH.toFixed(1)}, ${(SUN_REACH - 0.9).toFixed(1)}, r);
    vec4 colour = vec4(mix(body, vec3(1.0), 0.45), halo * 0.6);
    colour = over(vec4(mix(body, vec3(1.0), 0.12), rays * 0.95), colour);
    // The disc: paler in the middle, a soft edge that swells a little.
    float disc = smoothstep(1.0, 0.96, r / (1.0 + 0.012 * sin(time * 0.9)));
    gl_FragColor = over(vec4(mix(body, vec3(1.0), 0.3 * (1.0 - r * r)), disc), colour);
    #include <colorspace_fragment>
  }`;

const MOON_FRAGMENT = `
  uniform vec3 body;
  uniform float time;
  varying vec2 vAt;
  ${OVER}
  float crater(vec2 at, float size) {
    return smoothstep(size, size * 0.55, length(vAt - at));
  }
  void main() {
    float r = length(vAt);
    // A ball lit from the left and a little from behind: a crescent, whose soft inner edge slowly moves in and out.
    vec3 light = normalize(vec3(-1.0, 0.28, -0.3 + 0.1 * sin(time * 0.23)));
    vec3 normal = vec3(vAt, sqrt(max(0.0, 1.0 - r * r)));
    float lit = smoothstep(-0.02, 0.22, dot(normal, light));
    float craters = max(max(crater(vec2(-0.62, 0.3), 0.2), crater(vec2(-0.74, -0.22), 0.13)), crater(vec2(-0.42, -0.62), 0.17));
    vec3 bright = body * (1.0 - 0.14 * craters);
    // The halo is strongest beside the lit edge.
    float breath = 1.0 + 0.06 * sin(time * 0.6);
    float beside = 0.55 + 0.45 * max(0.0, dot(vAt / max(r, 0.001), normalize(light.xy)));
    float halo = exp(-max(r - 1.0, 0.0) * 1.9 / breath) * smoothstep(${MOON_REACH.toFixed(1)}, ${(MOON_REACH - 0.8).toFixed(1)}, r) * beside;
    vec4 colour = vec4(body, halo * 0.32);
    // The unlit part of the ball is a faint veil of the moon's own colour: just there, over sky and cloud alike.
    float disc = smoothstep(1.0, 0.96, r);
    gl_FragColor = over(vec4(bright, disc * mix(0.09, 1.0, lit)), colour);
    #include <colorspace_fragment>
  }`;

const STAR_DOME = 480;
const STARS = 1000;

/** Stars low over the horizon, where the camera actually looks; denser near the horizon. Each with its own beat and size. */
function starGeometry(): BufferGeometry {
  let state = 11;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const positions = new Float32Array(STARS * 3);
  /** Per star: where in its twinkle it starts, how fast it twinkles (radians per second), its size in CSS pixels. */
  const beats = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const around = random() * Math.PI * 2;
    const above = ((-6 + 36 * random() ** 1.5) * Math.PI) / 180;
    positions.set(
      [Math.sin(around) * Math.cos(above) * STAR_DOME, Math.sin(above) * STAR_DOME, Math.cos(around) * Math.cos(above) * STAR_DOME],
      i * 3,
    );
    // A few big ones, many small.
    beats.set([random() * Math.PI * 2, 0.6 + random() * 1.8, 1.6 + 2.2 * random() ** 3], i * 3);
  }
  return new BufferGeometry().setAttribute('position', new BufferAttribute(positions, 3)).setAttribute('beat', new BufferAttribute(beats, 3));
}

export interface Sky {
  /** Sun and moon. Add to the camera; place it with `position` / `scale` in camera space. */
  screen: Group;
  /** Stars. Add to the scene. */
  stars: Points<BufferGeometry, ShaderMaterial>;
  /** Follow the theme: which body is up (they swap with half a turn of their wheel), and the colours. */
  apply: (palette: Palette) => void;
  /**
   * `seconds` is the scene's clock, `delta` the real time since the last frame.
   * `outward` is the outer side of the screen, away from the island (1 =
   * right, -1 = left): the bodies rise from there and set the other way.
   * `still` (reduced motion) swaps them at once. `night` is how far it is
   * night (0 = day … 1 = night): it eases over after a theme change, and the
   * stars follow it. `pixelRatio` is the drawing's pixels per CSS pixel.
   */
  update: (seconds: number, delta: number, outward: number, still: boolean, night: number, pixelRatio: number) => void;
  dispose: () => void;
}

/** `sky` is the sky's colour as it is drawn (the scene's fog colour object: it eases over on a theme change). */
export function createSky(sky: Color): Sky {
  const time = { value: 0 };
  const body = (fragmentShader: string, reach: number) => {
    const material = new ShaderMaterial({
      uniforms: { sky: { value: sky }, body: { value: new Color() }, time },
      vertexShader: BODY_VERTEX,
      fragmentShader,
      fog: false,
      depthTest: false,
      depthWrite: false,
      // Blended, yet drawn in its turn among the solid things (see the note at the top).
      // The canvas's own alpha is left alone, or the page would show through the halo.
      blending: CustomBlending,
      blendSrc: SrcAlphaFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
    });
    const mesh = new Mesh(new CircleGeometry(reach, 48), material);
    mesh.renderOrder = ORDER.body;
    return mesh;
  };
  const sunDisc = body(SUN_FRAGMENT, SUN_REACH);
  const moonDisc = body(MOON_FRAGMENT, MOON_REACH);
  // The crescent leans back a little.
  moonDisc.rotation.z = -0.5;
  const sun = new Group().add(sunDisc);
  const moon = new Group().add(moonDisc);
  const screen = new Group().add(sun, moon);

  // Round dots that brighten and dim, each to its own beat. Not blended (the moon is drawn over them): dim = nearer the sky's colour.
  const starUniforms = { sky: { value: sky }, star: { value: new Color() }, time, night: { value: 0 }, pixelRatio: { value: 1 } };
  const stars = new Points(
    starGeometry(),
    new ShaderMaterial({
      uniforms: starUniforms,
      fog: false,
      vertexShader: `
        attribute vec3 beat;
        uniform float time;
        uniform float night;
        uniform float pixelRatio;
        varying float vShine;
        void main() {
          vShine = night * (0.3 + 0.7 * (0.5 + 0.5 * sin(time * beat.y + beat.x)));
          gl_PointSize = beat.z * pixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 sky;
        uniform vec3 star;
        varying float vShine;
        void main() {
          float away = length(gl_PointCoord - 0.5) * 2.0;
          if (away > 1.0) discard;
          gl_FragColor = vec4(mix(sky, star, vShine * smoothstep(1.0, 0.35, away)), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  stars.renderOrder = ORDER.stars;
  stars.frustumCulled = false;

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
  const carry = (group: Group, angle: number, outward: number) => {
    const height = Math.cos(angle);
    const size = MathUtils.smoothstep(height, -0.35, 0.8);
    group.visible = size > 0.01;
    group.position.set(-Math.sin(angle) * WHEEL * outward, (height - 1) * WHEEL, 0);
    group.scale.setScalar(size);
    group.rotation.z = angle * outward;
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
      starUniforms.star.value.copy(palette.moon);
      sunDisc.material.uniforms.body.value.copy(palette.sun);
      moonDisc.material.uniforms.body.value.copy(palette.moon);
    },
    update(seconds, delta, outward, still, night, pixelRatio) {
      if (swap < 1) {
        swap = still ? 1 : Math.min(1, swap + delta / THEME_SECONDS);
        turn = MathUtils.lerp(from, goal, MathUtils.smootherstep(swap, 0, 1));
      }
      carry(sun, turn, outward);
      carry(moon, turn + Math.PI, outward);
      // Neither hangs quite still: the sun drifts a little, the moon drifts and rocks.
      sun.position.y += Math.sin(seconds * 0.3) * 0.05;
      moon.position.y += Math.sin(seconds * 0.35) * 0.07;
      moon.rotation.z += Math.sin(seconds * 0.45) * 0.06;
      time.value = seconds;
      // The stars come out as it gets dark.
      stars.visible = night > 0.02;
      starUniforms.night.value = night;
      starUniforms.pixelRatio.value = pixelRatio;
    },
    dispose() {
      for (const mesh of [sunDisc, moonDisc, stars]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
  };
}
