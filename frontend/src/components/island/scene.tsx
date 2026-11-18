'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { type Actors, createActors } from './actors';
import { createFireflies, createSmoke, createSpray } from './ambience';
import { createSky, type Sky } from './celestial';
import {
  buildBlades,
  buildIsland,
  CAMPFIRE,
  fadeFrom,
  HOUSE_SPOTS,
  ISLAND_RADIUS,
  LAKE_CENTRE,
  LAKE_OPEN_RADIUS,
  LEVEL_FLAGS,
  MOUNTAIN,
  BRIDGES,
  FIELD_SPOT,
  groundAt,
  MUSHROOMS,
  STONES,
  TENT_SPOT,
  TREE_SPOTS,
  WATERFALL,
  WINDMILL,
} from './geometry';
import { type Kit, loadKit } from './kit';
import { type Palette, usePalette } from './palette';
import { createPeople, type People } from './people';
import { createWords } from './words';
import { PARTS_OF_SPEECH, PARTS_OF_SPEECH_VI, PEOPLE_WORDS, THEME_SECONDS, WORDS, ZOOM_EVENT, ZOOM_STEPS } from './parts';
import { cloudColor, createBirds, createClouds, createCloudSea } from './scenery';
import { createWater } from './water';

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
  { angle: 0, elevation: 12.5, lookAtY: -0.4, radius: 11 },
  // Try a card: low, with the first stepping stone and its card in front.
  { angle: 32, elevation: 9, lookAtY: -0.2, radius: 10.8 },
  // How it works: from above the stepping-stone path.
  { angle: 62, elevation: 21, lookAtY: -0.8, radius: 10.8 },
  // Levels: beside the mountain, where the stairs and their flags show.
  { angle: 200, elevation: 10, lookAtY: 0.4, radius: 10.8 },
  // Topics: from above the village.
  { angle: 262, elevation: 22, lookAtY: -0.8, radius: 10.8 },
  // Call to action: back to the front (345° = a full turn minus 15°).
  { angle: 345, elevation: 14, lookAtY: -0.4, radius: 11 },
];
const LAST_STOP = STOPS.length - 1;

/** The card hops along the stones while the page moves from "try a card" (stop 1) to "how it works" (stop 2). */
const CARD_START = 1;
const CARD_SPAN = 1;

const FOV = 35;
const HALF_FOV_TAN = Math.tan(MathUtils.degToRad(FOV / 2));
/**
 * The picture's pixels per CSS pixel are capped at the first of these. When
 * frames keep coming slowly (under SLOW_FPS for SLOW_SECONDS in a row) the
 * scene moves on to the next cap, and after the last one it drops the
 * shadows: a slightly softer picture instead of a jerky one. It never goes
 * back up, so it cannot flip to and fro.
 */
const DPR_CAPS = [1.5, 1.25, 1, 0.8];
const SLOW_FPS = 40;
const SLOW_SECONDS = 4;
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
  wide: { x: 0.35, y: 0.62, size: 0.1 },
  stacked: { x: -0.45, y: 0.26, size: 0.075 },
};
const SKY_BODY_DISTANCE = 10;
/**
 * The sun's or moon's light comes from this far away, and its shadow map
 * covers this far around the island's axis: the island and the rocks floating
 * around it.
 */
const LIGHT_DISTANCE = 60;
/** How much of the light's direction is "from the viewer" (the rest: 1 from the sun's side, 1 from above). */
const LIGHT_FROM_VIEWER = 0.2;
const SHADOW_REACH = 16.5;


// ── Interaction ──

/** Dragging sideways turns the island: degrees per pixel, and how far it may turn from the floor's own view. */
const DRAG_TURN = 0.22;
const DRAG_LIMIT = 75;
/** A press that moves less than this many pixels is a click, not a drag. */
const CLICK_SLOP = 6;
/** A click on the windmill adds this much spin (radians per second), which then dies down. */
const BLADE_SPEED = 1.1;
const BLADE_BOOST = 9;
/**
 * Zooming in looks at this spot of the island unless the visitor double-clicked
 * another: between the lake, the windmill and the mountain.
 */
const ZOOM_FOCUS = new Vector3(-1, 0.8, 1);
/**
 * Ctrl + wheel over the island zooms, one step per this much wheel (a mouse's
 * notch is about 100). A pinch on a trackpad arrives as the same event, in
 * many small pieces. The plain wheel is not used: it moves from floor to
 * floor (floor-scroll.ts), and an island that swallowed it would trap
 * everyone who scrolls with the pointer resting on it.
 */
const WHEEL_PER_ZOOM_STEP = 60;
/** A double click zooms in to this step (and back out from it). */
const DOUBLE_CLICK_ZOOM = 2;
/** On a touch screen there is no hover: a tapped label stays this long. */
const TAP_LABEL_MS = 2600;

/**
 * What the pointer can hit, as spheres in the island's own space (the scene
 * draws one merged mesh, so there is nothing finer to test against). "rock" is
 * the mountain's bulk: it stops clicks from reaching what is behind it, and
 * like the ground it can be double-clicked to zoom in on it.
 */
type Kind =
  | 'house'
  | 'level'
  | 'windmill'
  | 'campfire'
  | 'canoe'
  | 'mushroom'
  | 'person'
  | 'birds'
  | 'tree'
  | 'tent'
  | 'bridge'
  | 'field'
  | 'stone'
  | 'waterfall'
  | 'lake'
  | 'ground'
  | 'sky'
  | 'rock';
interface Target {
  kind: Kind;
  index: number;
  centre: Vector3;
  radius: number;
}
const FIXED_TARGETS: Target[] = [
  // Kept inside the rock (the mountain is uneven and leans), so nothing that stands on it ends up inside one.
  ...[
    [1.4, 3.4],
    [3.9, 2.3],
    [6.2, 1.2],
  ].map(([y, radius]): Target => ({ kind: 'rock', index: 0, centre: new Vector3(MOUNTAIN.x, y, MOUNTAIN.z), radius })),
  ...HOUSE_SPOTS.map((centre, index): Target => ({ kind: 'house', index, centre, radius: 1 })),
  ...LEVEL_FLAGS.map((centre, index): Target => ({ kind: 'level', index, centre, radius: 0.6 })),
  { kind: 'windmill', index: 0, centre: new Vector3(WINDMILL.at.x, 1.5, WINDMILL.at.z), radius: 1.5 },
  { kind: 'campfire', index: 0, centre: new Vector3(CAMPFIRE.x, 0.3, CAMPFIRE.z), radius: 0.65 },
  // Things that only float up their word.
  ...TREE_SPOTS.map((spot, index): Target => ({ kind: 'tree', index, centre: spot.clone().setY(1.05), radius: 0.6 })),
  { kind: 'tent', index: 0, centre: TENT_SPOT.clone().setY(0.35), radius: 0.55 },
  ...BRIDGES.map((spot, index): Target => ({ kind: 'bridge', index, centre: spot.clone().setY(0.25), radius: 0.7 })),
  { kind: 'field', index: 0, centre: FIELD_SPOT.clone().setY(0.3), radius: 0.9 },
  ...STONES.map((stone, index): Target => ({ kind: 'stone', index, centre: stone.clone().setY(0.15), radius: 0.7 })),
  ...WATERFALL.map((point, index): Target => ({ kind: 'waterfall', index, centre: point, radius: 0.45 })),
];
/** These react to a click (the pointer shows a hand over them); houses and flags only have a label. */
const CLICKABLE: Kind[] = ['house', 'level', 'windmill', 'campfire', 'canoe', 'mushroom', 'person', 'birds', 'tree', 'tent', 'bridge', 'field', 'stone', 'waterfall', 'lake', 'sky'];

/** Anything in front of the island that the pointer is really on: the island must not react through it. */
function overPage(target: EventTarget | null): boolean {
  return !(target instanceof Element) || target.closest('a, button, input, select, textarea, [data-island-ui], header, footer') !== null;
}

/** Texts for the labels that appear over the island, already in the page's language. */
export interface SceneLabels {
  /** One per house, in the order of PARTS_OF_SPEECH. */
  houses: string[];
  /** One per level flag, A1 … C2. */
  levels: string[];
  /** On the sun and on the moon: what a click does. */
  toNight: string;
  toDay: string;
  /** The words that float up from a clicked thing also show their Vietnamese meaning (the Vietnamese page). */
  glosses: boolean;
}

export interface SceneProps {
  /** Scroll progress in stops (0 = hero … 5 = call to action), written by the page. */
  progress: RefObject<number>;
  /**
   * Wide layout: which side the island is on at each stop (1 = right, -1 =
   * left), opposite the text. Written by the page (island.tsx): the floors
   * alternate by their order on the page, and a floor can be left out.
   */
  sides: RefObject<number[]>;
  reducedMotion: boolean;
  labels: SceneLabels;
  /** A label to show at that place of the screen, or null to hide it. */
  onLabel: (text: string | null, x: number, y: number) => void;
  /** A hidden mushroom was found: how many so far, out of how many. */
  onMushroom: (found: number, total: number) => void;
  /** The sun or the moon was clicked. */
  onToggleTheme: (toDark: boolean) => void;
  /** The zoom changed: which step of ZOOM_STEPS it is on now. */
  onZoom: (step: number) => void;
  /** A mouse is over the bare island for the first time: a good moment to say how to zoom. */
  onZoomHint: () => void;
  /** Debug read-out (fps, draw calls, triangles) twice a second; lab page only. */
  onStats?: (text: string) => void;
  /** No WebGL, or the context was lost: the page should show its fallback. */
  onContextLost: () => void;
}

/**
 * A theme change eases in over THEME_SECONDS instead of cutting: the colours
 * and light levels of the scenery go from what they were (`from`) to the new
 * theme's (`to`), and the island's material blends its two sets of vertex
 * colours with `blend`.
 */
interface ThemeFade {
  /** 0 → 1 after a theme change; 1 = settled. */
  progress: number;
  /** The same, eased: a uniform of the island's material. */
  blend: { value: number };
  /** In this order: fog, clouds, cloud sea, birds, foam, the sun's / moon's light, the sky's light from above and from below, water, smoke, the lake's bed. */
  colors: { color: Color; from: Color; to: Color }[];
  /** In this order: the sun's / moon's light, the sky's light. */
  levels: { set: (value: number) => void; now: number; from: number; to: number }[];
  /** The theme on show; null before the first one. */
  dark: boolean | null;
}

interface Stage {
  theme: ThemeFade;
  group: Group;
  island: Mesh<BufferGeometry, MeshLambertMaterial>;
  /** The windmill's blades, spinning inside a hub that sits and faces like the mill. */
  blades: Mesh<BufferGeometry, MeshLambertMaterial>;
  bladesHub: Group;
  actors: Actors;
  people: People;
  sky: Sky;
  /** The fireflies' colour (they only show at night). */
  fireflies: Color;
}

export default function IslandScene(props: SceneProps) {
  const { progress, sides } = props;
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const palette = usePalette();
  // The kit of models: undefined while it loads, null when it could not be loaded (the island then uses plain shapes).
  const [kit, setKit] = useState<Kit | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    loadKit().then(
      (loaded) => current && setKit(loaded),
      () => current && setKit(null),
    );
    return () => {
      current = false;
    };
  }, []);

  // Latest props for the render loop, so the renderer is created only once.
  const live = useRef({ ...props, palette });
  useEffect(() => {
    live.current = { ...props, palette };
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
    renderer.shadowMap.enabled = true;
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    container.appendChild(canvas);
    const lost = () => live.current.onContextLost();
    canvas.addEventListener('webglcontextlost', lost);

    const scene = new Scene();
    // Distant scenery fades into the sky colour, so the cloud sea has no visible edge.
    const fog = new Fog(0xffffff, 60, 250);
    scene.fog = fog;
    // The sky is drawn by the scene, in the fog's colour: when the theme changes the two
    // fade as one. (The page's own sky colour, behind the canvas, only shows until the scene has loaded.)
    scene.background = fog.color;
    // Light from the whole sky (one colour from above, a dimmer one from the
    // ground below), plus one directional light that shines from wherever the
    // sun or the moon is on screen and casts the shadows; colours and
    // strengths follow the theme.
    const ambient = new HemisphereLight();
    const skyLight = new DirectionalLight();
    skyLight.castShadow = true;
    // A smaller shadow map on phones and tablets.
    skyLight.shadow.mapSize.setScalar(window.matchMedia('(pointer: coarse)').matches ? 1024 : 2048);
    Object.assign(skyLight.shadow.camera, {
      left: -SHADOW_REACH,
      right: SHADOW_REACH,
      top: SHADOW_REACH,
      bottom: -SHADOW_REACH,
      near: LIGHT_DISTANCE - 28,
      far: LIGHT_DISTANCE + 28,
    });
    skyLight.shadow.camera.updateProjectionMatrix();
    // Flat things lie right on the ground: without these the ground would shade itself in stripes.
    skyLight.shadow.bias = -0.0004;
    skyLight.shadow.normalBias = 0.035;
    scene.add(ambient, skyLight);

    const group = new Group();
    const island = new Mesh<BufferGeometry, MeshLambertMaterial>(
      undefined,
      new MeshLambertMaterial({ vertexColors: true }),
    );
    island.castShadow = true;
    island.receiveShadow = true;
    // The island's material does three things the stock one does not (the
    // geometry's `colorFrom` and `extra` are described in geometry.ts):
    // - it shows a mix of two sets of vertex colours, the last theme's
    //   (`colorFrom`) and the current one's (`color`), see ThemeFade;
    // - what has a sway (`extra.x`: trees, plants, pennants) moves in the wind;
    // - what glows (`extra.y`: windows) gives off its own colour at night.
    const blend = { value: 1 };
    const wind = { value: 0 };
    const glow = { value: 0 };
    island.material.onBeforeCompile = (shader) => {
      shader.uniforms.themeBlend = blend;
      shader.uniforms.windTime = wind;
      shader.uniforms.nightGlow = glow;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec3 colorFrom;\nattribute vec2 extra;\nuniform float themeBlend;\nuniform float windTime;\nvarying float vGlow;',
        )
        .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(colorFrom, vColor.rgb, themeBlend);\nvGlow = extra.y;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
float gust = windTime * 1.5 + position.x * 0.55 + position.z * 0.8;
transformed.x += extra.x * (sin(gust) + 0.4 * sin(gust * 2.7 + 1.3)) * 0.045;
transformed.z += extra.x * cos(gust * 0.8 + 0.6) * 0.03;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float nightGlow;\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * nightGlow;');
    };
    const card = new Mesh(new BoxGeometry(1.1, 1.5, 0.1), new MeshLambertMaterial({ flatShading: true }));
    card.castShadow = true;
    const bladesHub = new Group();
    const blades = new Mesh<BufferGeometry, MeshLambertMaterial>(undefined, island.material);
    blades.castShadow = true;
    bladesHub.add(blades);
    bladesHub.visible = false;
    // The water shows the sky's colour: the same colour object as the fog's, so they fade together.
    const foamColor = new Color();
    const bedColor = new Color();
    const water = createWater({ sky: fog.color, foam: foamColor, bed: bedColor });
    const spray = createSpray(foamColor);
    const smokeColor = new Color();
    const smoke = createSmoke(smokeColor);
    const fireflyColor = new Color();
    const fireflies = createFireflies(fireflyColor);
    const actors = createActors(island.material);
    // The floating words are HTML on a layer over the canvas (see words.ts).
    const wordLayer = document.createElement('div');
    wordLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
    container.appendChild(wordLayer);
    const words = createWords(wordLayer, (point) => group.localToWorld(point));
    // The sun's and the moon's words are given in the camera's space, like the sun and the moon themselves:
    // in the island's space the camera's lean towards the pointer would slide them away.
    const skyWords = createWords(wordLayer, (point) => camera.localToWorld(point));
    const people = createPeople();
    group.add(island, water.mesh, card, bladesHub, actors.group, people.group, spray.points, smoke.points, fireflies.points);
    // Hidden until the island is built (the sky and the clouds show meanwhile).
    group.visible = false;
    const clouds = createClouds();
    const sea = createCloudSea();
    const birds = createBirds();
    // The sun's and the moon's halos fade into the sky's colour: the fog's colour object, like the sky itself.
    const sky = createSky(fog.color);
    // Draw order: cloud sea (0), stars, sun / moon (see celestial.ts), clouds, then the island and everything on it.
    clouds.renderOrder = 2;
    birds.mesh.renderOrder = 3;
    group.traverse((object) => {
      object.renderOrder = 3;
    });

    const camera = new PerspectiveCamera(FOV, 1, 0.5, 600);
    camera.add(sky.screen);
    scene.add(camera, group, clouds, sea.group, birds.mesh, sky.stars);
    const tone = (color: Color) => ({ color, from: color.clone(), to: color.clone() });
    const level = (set: (value: number) => void) => ({ set, now: 1, from: 1, to: 1 });
    const theme: ThemeFade = {
      progress: 1,
      blend,
      colors: [
        fog.color,
        cloudColor(clouds.material),
        cloudColor(sea.material),
        birds.mesh.material.color,
        foamColor,
        skyLight.color,
        ambient.color,
        ambient.groundColor,
        water.mesh.material.color,
        smokeColor,
        bedColor,
      ].map(tone),
      levels: [
        level((value) => {
          skyLight.intensity = value;
        }),
        level((value) => {
          ambient.intensity = value;
        }),
      ],
      dark: null,
    };
    stage.current = {
      theme,
      group,
      island,
      blades,
      bladesHub,
      actors,
      people,
      sky,
      fireflies: fireflyColor,
    };
    let width = 0;
    let height = 0;
    let wide = false;
    /** Which of DPR_CAPS is in force (see there). */
    let quality = 0;
    /** Camera distance per unit of subject radius, for the current screen. */
    let distancePerRadius = 4;

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      if (!width || !height) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, DPR_CAPS[quality]));
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

    /** Frames have kept coming slowly: draw fewer pixels, or at the end do without shadows. */
    const lowerQuality = () => {
      // The next cap that really is lower than what is drawn now (a screen at 1× is not helped by a cap of 1.25).
      let next = quality + 1;
      while (next < DPR_CAPS.length && DPR_CAPS[next] >= renderer.getPixelRatio()) next++;
      if (next < DPR_CAPS.length) {
        quality = next;
        resize();
      } else skyLight.castShadow = false;
    };
    const pace = { since: performance.now(), frames: 0, slow: 0, started: performance.now() };

    // ── Pointer: where it is, what it presses, how far it has dragged ──
    const pointer = {
      /** Screen position, and the same as -1…1 across the window (for the parallax). */
      x: 0,
      y: 0,
      leanX: 0,
      leanY: 0,
      /** It is over the bare island, not over a panel, a link or the header. */
      free: false,
      mouse: false,
      /** Set by any move: the scene looks up what is under it on the next frame. */
      moved: false,
    };
    let press: { id: number; x: number; y: number; lastX: number; dragged: boolean } | null = null;
    /** A click to handle on the next frame (the frame knows where everything is). */
    let click: { x: number; y: number; touch: boolean } | null = null;
    /** Likewise a double click, which zooms in on that spot. */
    let doubleClick: { x: number; y: number } | null = null;
    /** Likewise a step of zoom asked for with Ctrl + wheel, in (1) or out (-1), with the pointer at that place. */
    let wheelZoom: { x: number; y: number; step: 1 | -1 } | null = null;
    /** How much wheel has piled up towards the next step, and when the last of it came. */
    let wheelSum = 0;
    let wheelAt = 0;
    let hinted = false;
    /** Zoom: the step asked for, how far in the camera is right now, and the spot it looks at (island space). */
    let zoomStep = 0;
    let zoom = 1;
    const focus = ZOOM_FOCUS.clone();
    const focusGoal = ZOOM_FOCUS.clone();
    const zoomTo = (step: number) => {
      const next = MathUtils.clamp(step, 0, ZOOM_STEPS.length - 1);
      if (next === zoomStep) return;
      zoomStep = next;
      live.current.onZoom(next);
    };
    /** How far the visitor has turned the island by dragging, in degrees: where it is and where it is going. */
    let turn = 0;
    let turnGoal = 0;

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.mouse = event.pointerType === 'mouse';
      pointer.free = !overPage(event.target);
      pointer.moved = true;
      if (pointer.mouse) {
        pointer.leanX = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.leanY = (event.clientY / window.innerHeight) * 2 - 1;
      }
      if (press && event.pointerId === press.id) {
        if (!press.dragged && Math.abs(event.clientX - press.x) > CLICK_SLOP) press.dragged = true;
        // Not `movementX`: some browsers leave it at 0 for touch.
        if (press.dragged) turnGoal = MathUtils.clamp(turnGoal + (event.clientX - press.lastX) * DRAG_TURN, -DRAG_LIMIT, DRAG_LIMIT);
        press.lastX = event.clientX;
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || overPage(event.target)) return;
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, dragged: false };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (!press.dragged && moved <= CLICK_SLOP) click = { x: event.clientX, y: event.clientY, touch: event.pointerType !== 'mouse' };
      press = null;
    };
    const onPointerCancel = () => {
      press = null;
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (!overPage(event.target)) doubleClick = { x: event.clientX, y: event.clientY };
    };
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || overPage(event.target)) return;
      // Ours: the browser must not zoom the whole page with it.
      event.preventDefault();
      const now = performance.now();
      // After a pause it is a new gesture: what was left of the last one does not count.
      if (now - wheelAt > 400) wheelSum = 0;
      wheelAt = now;
      // Wheel away from the user (negative) zooms in. Some browsers count in lines, not pixels.
      wheelSum -= event.deltaY * (event.deltaMode === 1 ? 33 : 1);
      if (Math.abs(wheelSum) < WHEEL_PER_ZOOM_STEP) return;
      wheelZoom = { x: event.clientX, y: event.clientY, step: wheelSum > 0 ? 1 : -1 };
      wheelSum = 0;
    };
    const onZoomRequest = (event: Event) => zoomTo(zoomStep + (event as CustomEvent<number>).detail);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });
    window.addEventListener('dblclick', onDoubleClick);
    // Not passive: the handler cancels the browser's own zoom.
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener(ZOOM_EVENT, onZoomRequest);

    // ── Picking: what is under a point of the screen ──
    const rayOrigin = new Vector3();
    const rayDirection = new Vector3();
    const offset = new Vector3();
    const bodyOnScreen = new Vector3();
    const hitPoint = new Vector3();
    const targets: Target[] = [
      ...FIXED_TARGETS,
      { kind: 'canoe', index: 0, centre: actors.canoe, radius: 0.8 },
      ...MUSHROOMS.map(([, centre], index): Target => ({ kind: 'mushroom', index, centre: centre.clone().setY(centre.y + 0.2), radius: 0.42 })),
      ...people.spots.map((centre, index): Target => ({ kind: 'person', index, centre, radius: 0.38 })),
    ];
    /** The flock's leader, in the island's space like the other targets (the birds themselves are not on the island). */
    const flock: Target = { kind: 'birds', index: 0, centre: new Vector3(), radius: 2.2 };
    targets.push(flock);
    const found = MUSHROOMS.map(() => false);

    /** Distance along the ray to a sphere (island space), or Infinity. */
    const reach = (centre: Vector3, radius: number): number => {
      offset.subVectors(centre, rayOrigin);
      const along = offset.dot(rayDirection);
      if (along < 0) return Infinity;
      const off = offset.lengthSq() - along * along;
      return off > radius * radius ? Infinity : along - Math.sqrt(radius * radius - off);
    };
    /** Where the ray meets the level at height `y` (island space), or false. */
    const onLevel = (y: number): boolean => {
      if (rayDirection.y >= -0.01) return false;
      hitPoint.copy(rayOrigin).addScaledVector(rayDirection, (y - rayOrigin.y) / rayDirection.y);
      return true;
    };

    /** What is under that point of the screen; `hitPoint` is then where on the island (island space). */
    const pick = (clientX: number, clientY: number): { kind: Kind; index: number; centre?: Vector3; radius?: number } | null => {
      const x = (clientX / width) * 2 - 1;
      const y = -(clientY / height) * 2 + 1;

      // The sun or moon is not in the world: it is tested where it is on screen.
      const body = wide ? SKY_BODY.wide : SKY_BODY.stacked;
      sky.screen.getWorldPosition(bodyOnScreen).project(camera);
      if (Math.hypot((x - bodyOnScreen.x) * camera.aspect, y - bodyOnScreen.y) < body.size * 1.9) return { kind: 'sky', index: 0 };

      // The ray, in the island's own space (the island only ever moves up and down).
      rayDirection.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
      rayOrigin.copy(camera.position).sub(group.position);

      let best: Target | null = null;
      let nearest = Infinity;
      for (const target of targets) {
        if (target.kind === 'mushroom' && found[target.index]) continue;
        const distance = reach(target.centre, target.radius);
        if (distance < nearest) [best, nearest] = [target, distance];
      }
      if (best) {
        hitPoint.copy(rayOrigin).addScaledVector(rayDirection, nearest);
        return best;
      }
      if (onLevel(LAKE_CENTRE.y) && Math.hypot(hitPoint.x - LAKE_CENTRE.x, hitPoint.z - LAKE_CENTRE.z) < LAKE_OPEN_RADIUS + 0.3) return { kind: 'lake', index: 0 };
      if (onLevel(0.3) && Math.hypot(hitPoint.x, hitPoint.z) < ISLAND_RADIUS) return { kind: 'ground', index: 0 };
      return null;
    };

    // Lab aid (the lab page is the one that asks for stats): where every target
    // is on screen right now, so a test can point at them.
    const lab = window as { __islandTargets?: () => { kind: Kind; index: number; x: number; y: number }[] };
    if (live.current.onStats) {
      lab.__islandTargets = () => {
        const onScreen = (point: Vector3) => ({ x: ((point.x + 1) / 2) * width, y: ((1 - point.y) / 2) * height });
        return [
          ...targets.map(({ kind, index, centre }) => ({ kind, index, ...onScreen(offset.copy(centre).add(group.position).project(camera)) })),
          { kind: 'lake' as const, index: 0, ...onScreen(offset.copy(LAKE_CENTRE).add(group.position).project(camera)) },
          { kind: 'sky' as const, index: 0, ...onScreen(sky.screen.getWorldPosition(offset).project(camera)) },
        ];
      };
    }

    /** Floats up the word of what was clicked, from where it is. */
    const wordAt = new Vector3();
    const floatWord = (hit: { kind: Kind; index: number; centre?: Vector3; radius?: number }, night: boolean) => {
      let entry: readonly [string, string];
      if (hit.kind === 'house') entry = [PARTS_OF_SPEECH[hit.index], PARTS_OF_SPEECH_VI[hit.index]];
      else if (hit.kind === 'person') entry = PEOPLE_WORDS[hit.index];
      else if (hit.kind === 'level') entry = WORDS.flag;
      else if (hit.kind === 'rock') entry = WORDS.mountain;
      else if (hit.kind === 'ground') entry = WORDS[groundAt(hitPoint)];
      else if (hit.kind === 'sky') entry = night ? WORDS.moon : WORDS.sun;
      else entry = WORDS[hit.kind];
      // From the top of the thing; from the point itself on the ground and the water. From under the sun or
      // the moon, rising only a little: they are much nearer the camera than the island, so the same rise
      // would carry the word off the top of the screen.
      const [english, vietnamese] = entry;
      const gloss = live.current.labels.glosses ? vietnamese : '';
      if (hit.kind === 'sky') {
        wordAt.copy(sky.screen.position);
        wordAt.y -= sky.screen.scale.y * 1.6;
        skyWords.show('sky', english, gloss, wordAt, 0.12);
        return;
      }
      if (hit.centre && hit.radius && hit.kind !== 'rock') wordAt.copy(hit.centre).setY(hit.centre.y + hit.radius * 0.6);
      else wordAt.copy(hitPoint);
      words.show(`${hit.kind}:${hit.index}`, english, gloss, wordAt);
    };

    const labelFor = (hit: { kind: Kind; index: number } | null): string | null => {
      const { labels, palette: colors } = live.current;
      if (hit?.kind === 'house') return labels.houses[hit.index] ?? null;
      if (hit?.kind === 'level') return labels.levels[hit.index] ?? null;
      if (hit?.kind === 'sky') return colors.dark ? labels.toDay : labels.toNight;
      return null;
    };

    const position = new Vector3();
    const lookAt = new Vector3();
    const right = new Vector3();
    const up = new Vector3(0, 1, 0);
    const lean = { x: 0, y: 0 };
    let smoothed: number | null = null;
    let last = performance.now();
    let clock = 0;
    let bladeAngle = 0;
    let bladeBoost = 0;
    let scatter = 0;
    /** The label on show: its text, and until when if it came from a tap. */
    let label: string | null = null;
    let labelUntil = 0;
    let cursor = '';
    /** The theme the labels were last worked out for. */
    let night: boolean | null = null;
    let frames = 0;
    let statsSince = last;
    let frame = 0;

    // requestAnimationFrame stops by itself while the tab is hidden.
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!width || !height) return;
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
      // A floor change takes the island back to that floor's own view.
      if (Math.abs(target - p) > 0.05) {
        turnGoal = MathUtils.damp(turnGoal, 0, 4, delta);
        zoomTo(0);
      }
      zoom = still ? ZOOM_STEPS[zoomStep] : MathUtils.damp(zoom, ZOOM_STEPS[zoomStep], 4, delta);
      focus.lerp(focusGoal, still ? 1 : 1 - Math.exp(-6 * delta));
      turn = still ? turnGoal : MathUtils.damp(turn, turnGoal, 9, delta);
      smoothed = p;

      // Between two floors: everything about the view moves evenly from one stop to the next.
      const floor = Math.min(Math.floor(p), LAST_STOP - 1);
      const between = p - floor;
      const a = STOPS[floor];
      const b = STOPS[floor + 1];

      // The island changes sides from one floor to the next.
      const islandSide = (stop: number) => sides.current[stop] ?? (stop % 2 === 0 ? 1 : -1);
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
      // would cut close to the island). Dragging the island to the right moves
      // the camera to the left.
      const angle = MathUtils.degToRad(MathUtils.lerp(a.angle, b.angle, between) - turn);
      const elevation = MathUtils.degToRad(MathUtils.lerp(a.elevation, b.elevation, between));
      const distance = MathUtils.lerp(a.radius, b.radius, between) * distancePerRadius;
      lookAt.set(0, MathUtils.lerp(a.lookAtY, b.lookAtY, between), 0);
      // Zoomed in, the camera looks at the chosen spot and comes closer; it still turns around that spot when dragged.
      lookAt.lerp(focus, MathUtils.clamp((zoom - 1) / (ZOOM_STEPS[1] - 1), 0, 1));
      position
        .set(Math.sin(angle) * Math.cos(elevation), Math.sin(elevation), Math.cos(angle) * Math.cos(elevation))
        .multiplyScalar(distance / zoom)
        .add(lookAt);

      // Mouse parallax: the camera leans a little towards the pointer.
      lean.x = still ? 0 : MathUtils.damp(lean.x, pointer.leanX, 3, delta);
      lean.y = still ? 0 : MathUtils.damp(lean.y, pointer.leanY, 3, delta);
      right.subVectors(lookAt, position).cross(up).normalize();
      position.addScaledVector(right, (lean.x * distance * 0.04) / zoom);
      position.y -= (lean.y * distance * 0.025) / zoom;

      camera.position.copy(position);
      camera.lookAt(lookAt);
      camera.updateMatrixWorld();
      // The island itself stays clear; the fog starts behind it.
      fog.near = distance + 25;
      fog.far = distance + 150;

      // The sun or moon: a fixed place on screen, on the outer side of the island.
      const body = wide ? SKY_BODY.wide : SKY_BODY.stacked;
      const bodySide = wide ? side : -1;
      const halfHeight = SKY_BODY_DISTANCE * HALF_FOV_TAN;
      sky.screen.position.set(Math.abs(body.x) * bodySide * halfHeight * camera.aspect, body.y * halfHeight, -SKY_BODY_DISTANCE);
      sky.screen.scale.setScalar(body.size * halfHeight);
      const settled = MathUtils.smoothstep(theme.progress, 0, 1);
      /** 0 by day … 1 at night; in between while the theme changes. */
      const dusk = theme.dark ? settled : 1 - settled;
      sky.update(clock, delta, bodySide, still, dusk, renderer.getPixelRatio());
      // Its light comes from that side, from above and only a little from the
      // viewer's side: shadows then fall across the ground, where they can be
      // seen, not behind the things that cast them. It always shines at the
      // island's middle, which the shadow map is laid around.
      right.subVectors(lookAt, position).cross(up).normalize();
      skyLight.position
        .subVectors(position, lookAt)
        .normalize()
        .multiplyScalar(LIGHT_FROM_VIEWER)
        .addScaledVector(right, bodySide)
        .addScaledVector(up, 1)
        .normalize()
        .multiplyScalar(LIGHT_DISTANCE);

      // The island bobs only on the first and last floor.
      const wideShot = Math.max(0, 1 - 2 * Math.min(p, LAST_STOP - p));
      group.position.y = Math.sin(clock * 0.9) * 0.2 * wideShot;

      // ── The visitor: a click, then what the pointer is over ──
      birds.leader(clock, flock.centre).sub(group.position);
      if (doubleClick) {
        // Zoom in on what was double-clicked; again to go back out.
        const hit = pick(doubleClick.x, doubleClick.y);
        doubleClick = null;
        if (zoomStep >= DOUBLE_CLICK_ZOOM) zoomTo(0);
        else if (hit && hit.kind !== 'sky' && hit.kind !== 'birds') {
          focusGoal.copy(hitPoint);
          zoomTo(DOUBLE_CLICK_ZOOM);
        }
      }
      if (wheelZoom) {
        const { x, y, step } = wheelZoom;
        wheelZoom = null;
        // Zooming in goes towards what the pointer is on.
        if (step > 0 && zoomStep < ZOOM_STEPS.length - 1) {
          const hit = pick(x, y);
          if (hit && hit.kind !== 'sky' && hit.kind !== 'birds') focusGoal.copy(hitPoint);
        }
        zoomTo(zoomStep + step);
      }
      if (click) {
        const hit = pick(click.x, click.y);
        const { x, y, touch } = click;
        click = null;
        if (hit?.kind === 'windmill') bladeBoost = BLADE_BOOST;
        else if (hit?.kind === 'campfire') actors.stoke();
        else if (hit?.kind === 'canoe') actors.paddle();
        else if (hit?.kind === 'person') people.greet(hit.index);
        else if (hit?.kind === 'lake') actors.jump(hitPoint);
        else if (hit?.kind === 'birds') scatter = 1;
        else if (hit?.kind === 'sky') live.current.onToggleTheme(!colors.dark);
        else if (hit?.kind === 'mushroom' && actors.pick(hit.index)) {
          found[hit.index] = true;
          live.current.onMushroom(found.filter(Boolean).length, found.length);
        }
        // Whatever was clicked floats up its word. (`colors.dark` is still the theme from before a click on the sun or moon.)
        // The pointer's label makes way for it until the pointer moves on.
        if (hit) {
          floatWord(hit, colors.dark);
          if (label && !labelUntil) {
            label = null;
            live.current.onLabel(null, 0, 0);
          }
          // A move that came with the click (same frame) must not bring the label straight back.
          pointer.moved = false;
        }
        // No hover on a touch screen: a tap on a flag shows its label for a moment. (Not on a house:
        // its word says the same. Not on the sun or moon: the tap has just changed what their label would say.)
        const text = touch && hit?.kind !== 'sky' && hit?.kind !== 'house' ? labelFor(hit) : null;
        if (text) {
          label = text;
          labelUntil = now + TAP_LABEL_MS;
          live.current.onLabel(text, x, y);
        }
      }
      if (label && labelUntil && now > labelUntil) {
        label = null;
        labelUntil = 0;
        live.current.onLabel(null, 0, 0);
      }
      // The theme changed, perhaps by a click on the sun with the pointer still on it:
      // its label says something else now, so look again at what the pointer is over.
      // (Only while a label is up: right after a click the label has made way for the clicked thing's word.)
      if (colors.dark !== night) {
        night = colors.dark;
        if (label) pointer.moved = true;
      }
      if (pointer.moved) {
        pointer.moved = false;
        if (!hinted && pointer.mouse && pointer.free) {
          hinted = true;
          live.current.onZoomHint();
        }
        const hit = pointer.mouse && pointer.free && !press?.dragged ? pick(pointer.x, pointer.y) : null;
        const text = labelFor(hit);
        if (pointer.mouse && (text !== label || text)) {
          label = text;
          labelUntil = 0;
          live.current.onLabel(text, pointer.x, pointer.y);
        }
        const wanted = press?.dragged ? 'grabbing' : hit && CLICKABLE.includes(hit.kind) ? 'pointer' : '';
        if (wanted !== cursor) {
          cursor = wanted;
          document.documentElement.style.cursor = wanted;
        }
        // At night the pointer carries a lantern over the island.
        actors.lantern(hit && hit.kind !== 'sky' && hit.kind !== 'birds' && colors.dark ? hitPoint : null);
      }

      // A theme change eases in.
      if (theme.progress < 1) {
        theme.progress = still ? 1 : Math.min(1, theme.progress + delta / THEME_SECONDS);
        const eased = MathUtils.smoothstep(theme.progress, 0, 1);
        blend.value = eased;
        for (const each of theme.colors) each.color.lerpColors(each.from, each.to, eased);
        for (const each of theme.levels) {
          each.now = MathUtils.lerp(each.from, each.to, eased);
          each.set(each.now);
        }
      }

      placeCard(card, p, clock, colors, camera.position);
      bladeBoost = MathUtils.damp(bladeBoost, 0, 0.7, delta);
      bladeAngle += delta * ((still ? 0 : BLADE_SPEED) + bladeBoost);
      blades.rotation.x = bladeAngle;
      scatter = MathUtils.damp(scatter, 0, 0.9, delta);
      actors.update(clock, delta, !still);
      people.update(clock, delta, blend.value, actors.canoe, actors.canoeHeading(), actors.canoePace());
      // The clock stands still while motion is reduced: no wind, no ripples, the smoke hangs.
      wind.value = clock;
      water.time.value = clock;
      // Sizes in world units to pixels, for the things drawn as points.
      const pixels = (height * renderer.getPixelRatio()) / (2 * HALF_FOV_TAN);
      smoke.update(clock, pixels);
      spray.update(clock, pixels);
      glow.value = dusk;
      fireflies.update(clock, dusk, pixels);
      // Starts turned so that no cloud sits in front of the sun or moon on the first screen.
      clouds.rotation.y = 0.6 + clock * 0.008;
      sea.group.rotation.y = -clock * 0.004;
      birds.update(clock, scatter);
      words.update(delta, still, camera, width, height);
      skyWords.update(delta, still, camera, width, height);
      renderer.render(scene, camera);

      // Quality: count the frames of each second. A much longer "second" means the tab
      // was hidden or the page was busy with something else, which says nothing about the scene.
      pace.frames++;
      const span = now - pace.since;
      if (span >= 1000) {
        pace.slow = span < 1500 && (pace.frames * 1000) / span < SLOW_FPS ? pace.slow + 1 : 0;
        pace.frames = 0;
        pace.since = now;
        // Not during the first seconds, while the page and the kit are still loading.
        if (pace.slow >= SLOW_SECONDS && now - pace.started > 5000) {
          pace.slow = 0;
          lowerQuality();
        }
      }

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
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('dblclick', onDoubleClick);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener(ZOOM_EVENT, onZoomRequest);
      document.documentElement.style.cursor = '';
      delete lab.__islandTargets;
      canvas.removeEventListener('webglcontextlost', lost);
      stage.current = null;
      blades.geometry.dispose();
      for (const mesh of [island, water.mesh, card, clouds, birds.mesh, spray.points, smoke.points, fireflies.points]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      actors.dispose();
      people.dispose();
      words.dispose();
      skyWords.dispose();
      wordLayer.remove();
      sea.dispose();
      sky.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [progress, sides]);

  // Colours follow the theme: the island is rebuilt, the scenery is recoloured.
  useEffect(() => {
    const current = stage.current;
    if (!current) return;
    if (kit !== undefined) {
      // Rebuilt in the new colours, each geometry keeping the old ones to fade from.
      const island = fadeFrom(buildIsland(palette, kit), current.island.geometry);
      current.island.geometry.dispose();
      current.island.geometry = island;
      const blades = buildBlades(palette, kit);
      if (blades) fadeFrom(blades.geometry, current.blades.geometry);
      current.blades.geometry.dispose();
      current.bladesHub.visible = blades !== null;
      if (blades) {
        current.blades.geometry = blades.geometry;
        current.bladesHub.position.copy(blades.position);
        current.bladesHub.rotation.y = blades.turn;
        current.bladesHub.scale.setScalar(blades.scale);
      }
      current.actors.apply(palette, kit);
      current.group.visible = true;
    }
    current.sky.apply(palette);
    current.people.apply(palette);
    current.fireflies.lerpColors(palette.sun, palette.accent, 0.3);

    // Light from the sky: by day the sky's own blue, much paler; at night a cool grey.
    const skyGlow = new Color().setScalar(1).lerp(palette.dark ? palette.water : palette.sky, palette.dark ? 0.35 : 0.55);
    // Where the scenery's colours and the light are going (the order of ThemeFade's lists).
    const colors = [
      palette.sky,
      palette.raised,
      palette.raised,
      palette.muted,
      // Foam is white by day; at night a pale, moonlit shade of the water.
      palette.dark ? new Color().lerpColors(palette.water, palette.moon, 0.45) : palette.raised,
      // Warm sunlight by day, cooler and softer moonlight by night. With the
      // sky's light, ground in the open is about as bright as its token colour,
      // and ground in a shadow a little over a third of that.
      new Color().setScalar(1).lerp(palette.dark ? palette.moon : palette.sun, palette.dark ? 0.5 : 0.3),
      skyGlow,
      // From below: what the grass throws back, dimmer.
      skyGlow.clone().lerp(palette.accentSoft, 0.35).multiplyScalar(0.5),
      palette.water,
      // Smoke: pale by day, dark against the night sky.
      new Color().lerpColors(palette.muted, palette.raised, palette.dark ? 0.15 : 0.55),
      // The bed of the lake and the stream: the banks' earth, seen through a little water.
      new Color().lerpColors(palette.lineStrong, palette.streak, 0.22).lerp(palette.water, 0.3),
    ];
    const levels = [palette.dark ? 2.8 : 2.9, palette.dark ? 1.1 : 1.25];
    const { theme } = current;
    // The very first theme is simply shown; after that a change of theme fades in from whatever is on show.
    const first = theme.dark === null;
    theme.colors.forEach((each, i) => {
      if (first) each.color.copy(colors[i]);
      each.from.copy(each.color);
      each.to.copy(colors[i]);
    });
    theme.levels.forEach((each, i) => {
      if (first) {
        each.now = levels[i];
        each.set(levels[i]);
      }
      each.from = each.now;
      each.to = levels[i];
    });
    if (!first && theme.dark !== palette.dark) {
      theme.progress = 0;
      theme.blend.value = 0;
    }
    theme.dark = palette.dark;
  }, [palette, kit]);

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
