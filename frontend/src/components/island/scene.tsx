'use client';

import { type RefObject, useEffect, useRef } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  type BufferGeometry,
  DirectionalLight,
  Fog,
  Group,
  MathUtils,
  Mesh,
  type MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createSky, type Sky } from './celestial';
import { buildIsland, STONES } from './geometry';
import { type Palette, usePalette } from './palette';
import { createBirds, createClouds, createCloudSea } from './scenery';

/**
 * Plain three.js, no @react-three/fiber: the scene is a handful of meshes and
 * a camera, and fiber imports all of three (`import * as THREE`), which
 * defeats tree-shaking (measured 2026-11-14: 245 KB gzip with fiber).
 */

/**
 * Camera stops, one per page section ("floor"), in the order of ISLAND_STOPS
 * in stop.tsx. The camera orbits the island: every stop shows the WHOLE
 * island, turned so that the floor's subject faces the viewer. (Close-ups
 * were tried and dropped: the rest of the island then sat under the text
 * panel.) The distance is worked out from the screen so the island always
 * fits the free part of it.
 *
 * Angles are degrees around the island from the front (+z) towards +x, like
 * the layout in geometry.ts; elevation is degrees above the horizon. Keep the
 * elevation at about 22° or less: higher, and the top of the screen (where
 * the sun, the moon and the stars are) shows cloud sea instead of sky.
 */
interface CameraStop {
  angle: number;
  elevation: number;
  /** Height of the point the camera looks at, on the island's axis. */
  lookAtY: number;
  /** Radius that must fit on screen, in world units (the island's is about 10.5). */
  radius: number;
}
const STOPS: CameraStop[] = [
  // Hero: the island from the front.
  { angle: 0, elevation: 12.5, lookAtY: -0.8, radius: 11 },
  // Try a card: low, with the first stepping stone and its card in front.
  { angle: 32, elevation: 9, lookAtY: -0.6, radius: 10.8 },
  // How it works: from above the stepping-stone path.
  { angle: 62, elevation: 21, lookAtY: -1.2, radius: 10.8 },
  // Levels: low behind the mountain, so it towers.
  { angle: 140, elevation: 9, lookAtY: -0.2, radius: 10.8 },
  // Topics: from above the district.
  { angle: 262, elevation: 22, lookAtY: -1.2, radius: 10.8 },
  // Call to action: back to the front (345° = a full turn minus 15°).
  { angle: 345, elevation: 14, lookAtY: -0.8, radius: 11 },
];
const LAST_STOP = STOPS.length - 1;

/** The card hops along the stones while the page moves from "try a card" (stop 1) to "how it works" (stop 2). */
const CARD_START = 1;
const CARD_SPAN = 1;

const FOV = 35;
const HALF_FOV_TAN = Math.tan(MathUtils.degToRad(FOV / 2));
const MAX_DPR = 1.5;
/** From this width the text is a side column and the island sits beside it (Tailwind `xl`, see stop.tsx). */
const WIDE_LAYOUT = 1280;
/** Wide layout: the island's centre is this far from the screen centre, as a fraction of the width. */
const SIDE_SHIFT = 0.235;
/** Stacked layout: the island's centre is this far above the screen centre, as a fraction of the height. */
const UP_SHIFT = 0.22;
/** How quickly the camera catches up with the scroll position: about 1.3 s to settle after a floor change. */
const CAMERA_EASE = 3.2;

/**
 * The sun or moon, in camera space: where on screen (fractions of the half
 * width / height from the centre of the view, which the view offset has
 * already moved to the island) and how big (fraction of the half height).
 * On wide screens it sits above the outer side of the island and changes sides
 * with it; on narrow screens it stays at the top left, clear of the mountain.
 */
const SKY_BODY = {
  wide: { x: 0.3, y: 0.62, size: 0.1 },
  stacked: { x: -0.45, y: 0.26, size: 0.075 },
};
const SKY_BODY_DISTANCE = 10;

/** Wide layout: the island is on the right on even floors and on the left on odd ones (the text is opposite). */
const islandSide = (stop: number) => (stop % 2 === 0 ? 1 : -1);

export interface SceneProps {
  /** Scroll progress in stops (0 = hero … 5 = call to action), written by the page. */
  progress: RefObject<number>;
  topicSlugs: string[];
  reducedMotion: boolean;
  /** Debug read-out (fps, draw calls, triangles) twice a second; lab page only. */
  onStats?: (text: string) => void;
  /** No WebGL, or the context was lost: the page should show its fallback. */
  onContextLost: () => void;
}

interface Stage {
  island: Mesh<BufferGeometry, MeshLambertMaterial>;
  clouds: MeshLambertMaterial;
  sea: MeshLambertMaterial;
  birds: MeshBasicMaterial;
  fog: Fog;
  sky: Sky;
  ambient: AmbientLight;
  /** Sunlight in the light theme, moonlight in the dark theme. */
  skyLight: DirectionalLight;
}

export default function IslandScene({ progress, topicSlugs, reducedMotion, onStats, onContextLost }: SceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const palette = usePalette();

  // Latest props for the render loop, so the renderer is created only once.
  const live = useRef({ palette, reducedMotion, onStats, onContextLost });
  useEffect(() => {
    live.current = { palette, reducedMotion, onStats, onContextLost };
  });

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      live.current.onContextLost();
      return;
    }
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    container.appendChild(canvas);
    const lost = () => live.current.onContextLost();
    canvas.addEventListener('webglcontextlost', lost);

    const scene = new Scene();
    // Distant scenery fades into the sky colour, so the cloud sea has no visible edge.
    const fog = new Fog(0xffffff, 60, 250);
    scene.fog = fog;
    // Ambient light plus one directional light that shines from wherever the
    // sun or the moon is on screen; colours and strengths follow the theme.
    const ambient = new AmbientLight();
    const skyLight = new DirectionalLight();
    scene.add(ambient, skyLight);

    const group = new Group();
    const island = new Mesh<BufferGeometry, MeshLambertMaterial>(
      undefined,
      new MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    const card = new Mesh(new BoxGeometry(1.1, 1.5, 0.1), new MeshLambertMaterial({ flatShading: true }));
    group.add(island, card);
    const clouds = createClouds();
    const sea = createCloudSea();
    const birds = createBirds();
    const sky = createSky();
    // Draw order: cloud sea (0), stars, sun / moon (see celestial.ts), clouds, then the island and the birds.
    clouds.renderOrder = 2;
    island.renderOrder = card.renderOrder = birds.mesh.renderOrder = 3;

    const camera = new PerspectiveCamera(FOV, 1, 0.5, 600);
    camera.add(sky.screen);
    scene.add(camera, group, clouds, sea.group, birds.mesh, sky.stars);
    stage.current = { island, clouds: clouds.material, sea: sea.material, birds: birds.mesh.material, fog, sky, ambient, skyLight };
    let width = 0;
    let height = 0;
    let wide = false;
    /** Camera distance per unit of subject radius, for the current screen. */
    let distancePerRadius = 4;

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      if (!width || !height) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
      renderer.setSize(width, height, false);
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      camera.aspect = width / height;
      wide = width >= WIDE_LAYOUT;

      // The part of the screen the island may fill, as half-extents in
      // fractions of the height and the width: beside the text column on wide
      // screens, the window above the text panel otherwise.
      const fitHeight = wide ? 0.4 : 0.24;
      const fitWidth = wide ? 0.245 : 0.46;
      distancePerRadius = Math.max(1 / (2 * HALF_FOV_TAN * fitHeight), 1 / (2 * HALF_FOV_TAN * fitWidth * camera.aspect));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    // Mouse parallax: the camera leans a little towards the pointer.
    const pointer = { x: 0, y: 0 };
    const lean = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const position = new Vector3();
    const lookAt = new Vector3();
    const right = new Vector3();
    const up = new Vector3(0, 1, 0);
    let smoothed: number | null = null;
    let last = performance.now();
    let clock = 0;
    let frames = 0;
    let statsSince = last;
    let frame = 0;

    // requestAnimationFrame stops by itself while the tab is hidden.
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!width || !height || !island.geometry.attributes.position) return;
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      const { palette: colors, reducedMotion: still, onStats: report } = live.current;
      // Reduced motion: no fly-through (one still view per floor) and a frozen sky.
      if (!still) clock += delta;

      const target = still ? Math.round(progress.current) : progress.current;
      const p = MathUtils.clamp(
        smoothed === null || still ? target : MathUtils.damp(smoothed, target, CAMERA_EASE, delta),
        0,
        LAST_STOP,
      );
      smoothed = p;

      // Between two floors: everything about the view moves evenly from one stop to the next.
      const floor = Math.min(Math.floor(p), LAST_STOP - 1);
      const between = p - floor;
      const a = STOPS[floor];
      const b = STOPS[floor + 1];

      // The island changes sides from one floor to the next.
      const side = MathUtils.lerp(islandSide(floor), islandSide(floor + 1), MathUtils.smoothstep(between, 0, 1));
      camera.setViewOffset(
        width,
        height,
        wide ? -SIDE_SHIFT * side * width : 0,
        wide ? 0 : UP_SHIFT * height,
        width,
        height,
      );

      // Orbit: angle, elevation and distance are interpolated, so the camera
      // keeps its distance while it turns (a straight line between two stops
      // would cut close to the island).
      const angle = MathUtils.degToRad(MathUtils.lerp(a.angle, b.angle, between));
      const elevation = MathUtils.degToRad(MathUtils.lerp(a.elevation, b.elevation, between));
      const distance = MathUtils.lerp(a.radius, b.radius, between) * distancePerRadius;
      lookAt.set(0, MathUtils.lerp(a.lookAtY, b.lookAtY, between), 0);
      position
        .set(Math.sin(angle) * Math.cos(elevation), Math.sin(elevation), Math.cos(angle) * Math.cos(elevation))
        .multiplyScalar(distance)
        .add(lookAt);

      lean.x = still ? 0 : MathUtils.damp(lean.x, pointer.x, 3, delta);
      lean.y = still ? 0 : MathUtils.damp(lean.y, pointer.y, 3, delta);
      right.subVectors(lookAt, position).cross(up).normalize();
      position.addScaledVector(right, lean.x * distance * 0.04);
      position.y -= lean.y * distance * 0.025;

      camera.position.copy(position);
      camera.lookAt(lookAt);
      // The island itself stays clear; the fog starts behind it.
      fog.near = distance + 25;
      fog.far = distance + 150;

      // The sun or moon: a fixed place on screen, on the outer side of the island.
      const body = wide ? SKY_BODY.wide : SKY_BODY.stacked;
      const bodySide = wide ? side : -1;
      const halfHeight = SKY_BODY_DISTANCE * HALF_FOV_TAN;
      sky.screen.position.set(Math.abs(body.x) * bodySide * halfHeight * camera.aspect, body.y * halfHeight, -SKY_BODY_DISTANCE);
      sky.screen.scale.setScalar(body.size * halfHeight);
      sky.update(clock);
      // Its light comes from that side: from above, a little towards the viewer.
      right.subVectors(lookAt, position).cross(up).normalize();
      skyLight.position
        .subVectors(position, lookAt)
        .normalize()
        .multiplyScalar(0.5)
        .addScaledVector(right, 0.9 * bodySide)
        .addScaledVector(up, 1)
        .multiplyScalar(60)
        .add(lookAt);

      // The island bobs only on the first and last floor.
      const wideShot = Math.max(0, 1 - 2 * Math.min(p, LAST_STOP - p));
      group.position.y = Math.sin(clock * 0.9) * 0.2 * wideShot;

      placeCard(card, p, clock, colors, camera.position);
      // Starts turned so that no cloud sits in front of the sun or moon on the first screen.
      clouds.rotation.y = 0.6 + clock * 0.008;
      sea.group.rotation.y = -clock * 0.004;
      birds.update(clock);
      renderer.render(scene, camera);

      if (report) {
        frames++;
        const elapsed = (now - statsSince) / 1000;
        if (elapsed >= 0.5) {
          const { calls, triangles } = renderer.info.render;
          report(`${Math.round(frames / elapsed)} fps · ${calls} calls · ${triangles} tris · dpr ${renderer.getPixelRatio()}`);
          frames = 0;
          statsSince = now;
        }
      }
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('webglcontextlost', lost);
      stage.current = null;
      for (const mesh of [island, card, clouds, birds.mesh]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      sea.dispose();
      sky.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [progress]);

  // Colours follow the theme: the island is rebuilt, the scenery is recoloured.
  useEffect(() => {
    const current = stage.current;
    if (!current) return;
    current.island.geometry.dispose();
    current.island.geometry = buildIsland(palette, topicSlugs);
    current.clouds.color.copy(palette.raised);
    current.sea.color.copy(palette.raised);
    current.birds.color.copy(palette.muted);
    current.fog.color.copy(palette.sky);
    current.sky.apply(palette);
    // Warm sunlight by day, cooler and softer moonlight by night. Together a
    // face turned to the light is about as bright as its token colour.
    current.skyLight.color.setScalar(1).lerp(palette.dark ? palette.moon : palette.sun, palette.dark ? 0.5 : 0.3);
    current.skyLight.intensity = palette.dark ? 2.6 : 2.2;
    current.ambient.intensity = palette.dark ? 1.5 : 1.75;
  }, [palette, topicSlugs]);

  return <div ref={host} className="h-full w-full" />;
}

/** Moves the card from stone to stone with a hop; its colour follows the mastery ramp. */
function placeCard(
  card: Mesh<BoxGeometry, MeshLambertMaterial>,
  progress: number,
  seconds: number,
  palette: Palette,
  cameraPosition: Vector3,
) {
  const along = MathUtils.clamp((progress - CARD_START) / CARD_SPAN, 0, 1) * (STONES.length - 1);
  const i = Math.min(Math.floor(along), STONES.length - 2);
  const f = along - i;
  card.position.lerpVectors(STONES[i], STONES[i + 1], f);
  card.position.y += 1 + Math.sin(f * Math.PI) * 0.9 + Math.sin(seconds * 1.5) * 0.05;
  card.lookAt(cameraPosition);
  card.material.color.lerpColors(palette.mastery[i], palette.mastery[i + 1], f);
}
