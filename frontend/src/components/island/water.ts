import { type BufferGeometry, type Color, DoubleSide, Mesh, MeshLambertMaterial } from 'three';
import { buildWater } from './geometry';

/**
 * The island's water: the lake, the waterfall, the stream and its fall off the
 * rim (geometry.ts, `buildWater`), one mesh. The material is the ordinary matt
 * one, so the water takes light and shadows like the island, with its colour
 * worked out per pixel from the geometry's `flow` and `shore`:
 *
 * The lake has depth. Under the surface there is a bed (sand with darker
 * stones, and the bright wavy lines sunlight makes in shallow water), seen
 * where things under water appear to be, i.e. shifted with the angle of view,
 * more the deeper it is. The deeper, the more the water's own colour covers
 * it. On top: ripples that drift, the sky's colour at a flat angle, and foam
 * that laps at the shore.
 *
 * Running water moves. A broad, slow layer of light and dark bands and a fine,
 * fast layer of foam streaks run along it at different speeds; the stream is
 * shallow enough for its bed to show, the waterfalls are white water. Foam
 * along the edges; a slow swell travels down the sheet; and the fall off the
 * rim breaks up into ragged streaks towards its end (`flow`'s last number).
 *
 * `sky`, `foam` and `bed` are colours owned by the scene (it fades them when
 * the theme changes); the water's own colour is the material's `color`.
 */
export function createWater(colors: { sky: Color; foam: Color; bed: Color }): { mesh: Mesh<BufferGeometry, MeshLambertMaterial>; time: { value: number } } {
  const time = { value: 0 };
  const material = new MeshLambertMaterial({ side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = time;
    shader.uniforms.waterSky = { value: colors.sky };
    shader.uniforms.waterFoam = { value: colors.foam };
    shader.uniforms.waterBed = { value: colors.bed };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 flow;
attribute float shore;
uniform float waterTime;
varying vec4 vFlow;
varying float vShore;
varying vec3 vToEye;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vFlow = flow;
vShore = shore;
// A slow swell travels down running water (not at its edges, which stay on the ground).
transformed += normal * sin(flow.y * 2.6 - waterTime * flow.z * 1.6) * 0.022 * (1.0 - shore) * step(0.001, flow.z);
vToEye = cameraPosition - (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float waterTime;
uniform vec3 waterSky;
uniform vec3 waterFoam;
uniform vec3 waterBed;
varying vec4 vFlow;
varying float vShore;
varying vec3 vToEye;
float waterHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float waterNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(waterHash(cell), waterHash(cell + vec2(1.0, 0.0)), f.x),
    mix(waterHash(cell + vec2(0.0, 1.0)), waterHash(cell + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
// The bright, wavy net of lines that sunlight makes on the bed of shallow water:
// the places where two drifting layers of noise pass through their middle value.
float waterCaustics(vec2 p, float t) {
  float a = waterNoise(p + vec2(t * 0.11, t * 0.07));
  float b = waterNoise(p * 1.7 - vec2(t * 0.09, t * 0.13) + 4.2);
  return pow(1.0 - abs(a + b - 1.0), 9.0);
}
// The bed: sand with darker stones.
vec3 waterBedAt(vec2 p) {
  return waterBed * (1.0 - 0.32 * smoothstep(0.5, 0.75, waterNoise(p * 3.2)));
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  float t = waterTime;
  float speed = vFlow.z;
  vec3 water = diffuseColor.rgb;
  // 0 at the water's edge … 1 in its middle.
  float depth = 1.0 - vShore;
  if (speed < 0.001) {
    // ── The lake ──
    vec3 eye = normalize(vToEye);
    vec2 bedAt = vFlow.xy - eye.xz / max(eye.y, 0.25) * depth * 0.35;
    vec3 bed = waterBedAt(bedAt) + waterFoam * waterCaustics(bedAt * 2.2, t) * 0.4 * (1.0 - depth * 0.7);
    vec3 colour = mix(bed, mix(water, water * water * 1.15, depth), 1.0 - exp(-depth * 3.2));
    vec2 drift = t * vec2(0.07, 0.04);
    float ripple = waterNoise((vFlow.xy + drift) * 2.3) * 0.6 + waterNoise((vFlow.xy - drift * 1.6) * 4.8 + 7.3) * 0.4;
    float glance = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
    colour = mix(colour, waterSky, glance * 0.22);
    colour = mix(colour, waterFoam, smoothstep(0.64, 0.82, ripple) * 0.16);
    float lap = vShore + (ripple - 0.5) * 0.2 + 0.025 * sin(t * 1.3 + vFlow.x * 2.0 + vFlow.y * 1.4);
    colour = mix(colour, waterFoam, smoothstep(0.87, 0.97, lap) * 0.85);
    diffuseColor.rgb = colour;
  } else {
    // ── Running water: 0 = the stream … 1 = a waterfall ──
    float fall = smoothstep(2.0, 2.4, speed);
    vec3 shallow = mix(waterBedAt(vFlow.xy), water, 0.3 + 0.55 * (1.0 - exp(-depth * 3.0)));
    vec3 colour = mix(shallow, mix(water, waterFoam, 0.2), fall);
    float broad = waterNoise(vec2(vFlow.x * 3.0, (vFlow.y - t * speed) * 0.55));
    float fine = waterNoise(vec2(vFlow.x * 7.0 + 3.1, (vFlow.y - t * speed * 1.5) * 1.1));
    colour *= 0.82 + 0.36 * broad;
    colour = mix(colour, waterFoam, smoothstep(0.5, 0.78, broad * 0.55 + fine * 0.45) * mix(0.45, 0.8, fall));
    colour = mix(colour, waterFoam, smoothstep(0.76, 0.96, vShore + (fine - 0.5) * 0.35) * 0.9);
    diffuseColor.rgb = colour;
    // Towards the end of the fall off the rim, more and more of the water is missing.
    if (vFlow.w > 0.0 && waterNoise(vec2(vFlow.x * 6.0, (vFlow.y - t * speed) * 0.9)) < vFlow.w * 1.15 - 0.1) discard;
  }
}`,
      );
  };
  const mesh = new Mesh(buildWater(), material);
  mesh.receiveShadow = true;
  return { mesh, time };
}
