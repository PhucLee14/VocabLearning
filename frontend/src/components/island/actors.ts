import {
  type BufferGeometry,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  MathUtils,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PointLight,
  Vector3,
} from 'three';
import { buildModel, CAMPFIRE, fadeFrom, LAKE_CENTRE, LAKE_OPEN_RADIUS, MUSHROOMS } from './geometry';
import type { Kit } from './kit';
import type { Palette } from './palette';

/**
 * The village's moving parts that react to the visitor (scene.tsx decides
 * what was clicked): the canoe, the fish in the lake, the campfire's flame,
 * the hidden mushrooms and, at night, a lantern light.
 *
 * All of it hangs in one group that goes into the island's group. The canoe
 * and the mushrooms are kit models (hidden without the kit); the fish and the
 * flame are plain shapes.
 */

const CANOE_ORBIT = 1.05;
const CANOE_SCALE = 1.6;
/** Seconds for one lap of the lake. */
const CANOE_LAP = 9;
/** The kit's nature models sit 0.05 below their own origin. */
const SUNK = 0.05;

const JUMP_SECONDS = 0.9;
const JUMP_LENGTH = 0.9;
const JUMP_HEIGHT = 0.9;

const FOUND_SECONDS = 0.5;

/** The lantern hangs this high over the ground it lights. */
const LANTERN_HEIGHT = 1.5;
const LANTERN_POWER = 48;

export interface Actors {
  group: Group;
  /** Follow the theme and the kit (call again whenever either changes). */
  apply: (palette: Palette, kit: Kit | null) => void;
  /**
   * `seconds` is the scene's clock (it stands still while motion is reduced),
   * `delta` the real time since the last frame. `lively` allows what happens
   * by itself (a fish jumping now and then); reactions to a click always play.
   */
  update: (seconds: number, delta: number, lively: boolean) => void;
  /** The canoe paddles one lap of the lake. */
  paddle: () => void;
  /** A fish jumps at that spot of the lake. */
  jump: (at: Vector3) => void;
  /** The campfire flares up for a few seconds. */
  stoke: () => void;
  /** Picks mushroom `index`; false when it was found before. */
  pick: (index: number) => boolean;
  /** At night: light this spot of the ground; null puts the light back at the campfire. */
  lantern: (spot: Vector3 | null) => void;
  /** Where the canoe is (island space), for clicking on it; and which way its bow points (radians around y). */
  canoe: Vector3;
  canoeHeading: () => number;
  dispose: () => void;
}

/** `shared` is the island's own material (vertex colours, theme fade): kit models are painted like the island. */
export function createActors(shared: Material): Actors {
  const group = new Group();

  // ── Canoe ──
  const canoe = new Mesh<BufferGeometry, Material>(undefined, shared);
  canoe.castShadow = true;
  canoe.scale.setScalar(CANOE_SCALE);
  canoe.visible = false;
  let canoeAngle = MathUtils.degToRad(60);
  let lap = 1; // 0 → 1 while paddling; 1 = at rest

  // ── Fish ──
  const fishMaterial = new MeshLambertMaterial({ flatShading: true });
  const fish = new Group().add(
    new Mesh(new OctahedronGeometry(1).scale(0.09, 0.13, 0.3), fishMaterial),
    new Mesh(new ConeGeometry(0.12, 0.2, 4).rotateX(-Math.PI / 2).scale(0.5, 1, 1).translate(0, 0, -0.36), fishMaterial),
  );
  for (const part of fish.children) part.castShadow = true;
  fish.visible = false;
  const jumpFrom = new Vector3();
  const jumpTo = new Vector3();
  let jumpTime = -1; // seconds into the jump; negative = in the water
  let nextIdleJump = 5;
  let idleJumps = 0;

  // ── Campfire ──
  const flameMaterial = new MeshBasicMaterial();
  const flame = new Mesh(new ConeGeometry(0.2, 0.6, 5).translate(0, 0.3, 0), flameMaterial);
  flame.position.set(CAMPFIRE.x, 0.08, CAMPFIRE.z);
  let stoked = 0; // 1 right after a click, back to 0 in a few seconds

  // ── Mushrooms ──
  const mushrooms = MUSHROOMS.map(([, position, scale]) => {
    const mesh = new Mesh<BufferGeometry, Material>(undefined, shared);
    mesh.castShadow = true;
    mesh.position.set(position.x, position.y + SUNK * scale, position.z);
    mesh.scale.setScalar(scale);
    mesh.visible = false;
    return { mesh, scale, baseY: mesh.position.y, found: false, leaving: -1 };
  });

  // ── Lantern (night only) ──
  const light = new PointLight(0xffffff, 0, 9, 1.2);
  const glow = new Mesh(new IcosahedronGeometry(0.11, 0), flameMaterial);
  const fireside = new Vector3(CAMPFIRE.x, 0.9, CAMPFIRE.z);
  const lanternTarget = fireside.clone();
  let carried = false;
  let night = false;
  light.position.copy(fireside);

  group.add(canoe, fish, flame, light, glow, ...mushrooms.map((mushroom) => mushroom.mesh));

  const placeCanoe = (seconds: number) => {
    canoe.position.set(
      LAKE_CENTRE.x + Math.sin(canoeAngle) * CANOE_ORBIT,
      LAKE_CENTRE.y + SUNK * CANOE_SCALE - 0.03 + Math.sin(seconds * 1.3) * 0.015,
      LAKE_CENTRE.z + Math.cos(canoeAngle) * CANOE_ORBIT,
    );
    // The model's bow is its +z end; it points along the circle.
    canoe.rotation.set(0, canoeAngle + Math.PI / 2, Math.sin(seconds * 1.1) * 0.04);
  };
  placeCanoe(0);

  /** The kit models in use, by name, as built for the current theme. */
  let models = new Map<string, BufferGeometry | null>();

  const jump = (at: Vector3) => {
    if (jumpTime >= 0) return;
    // Kept on open water, and heading for the middle so it lands in the lake too.
    const reach = Math.hypot(at.x - LAKE_CENTRE.x, at.z - LAKE_CENTRE.z);
    const limit = LAKE_OPEN_RADIUS - 0.15;
    const scale = reach > limit ? limit / reach : 1;
    jumpFrom.set(LAKE_CENTRE.x + (at.x - LAKE_CENTRE.x) * scale, LAKE_CENTRE.y, LAKE_CENTRE.z + (at.z - LAKE_CENTRE.z) * scale);
    jumpTo.subVectors(LAKE_CENTRE, jumpFrom).setY(0);
    if (jumpTo.lengthSq() < 0.01) jumpTo.set(1, 0, 0);
    jumpTo.setLength(JUMP_LENGTH).add(jumpFrom);
    jumpTime = 0;
  };

  return {
    group,
    canoe: canoe.position,
    canoeHeading: () => canoe.rotation.y,

    apply(palette, kit) {
      // Built anew in the theme's colours, each one fading from what it was (see fadeFrom).
      const before = models;
      models = new Map();
      const model = (name: string) => {
        if (!models.has(name)) {
          const geometry = buildModel(palette, kit, name);
          models.set(name, geometry && fadeFrom(geometry, before.get(name)));
        }
        return models.get(name) ?? null;
      };
      const canoeGeometry = model('canoe');
      canoe.visible = canoeGeometry !== null;
      if (canoeGeometry) canoe.geometry = canoeGeometry;
      mushrooms.forEach((mushroom, i) => {
        const geometry = model(MUSHROOMS[i][0]);
        mushroom.mesh.visible = geometry !== null && !mushroom.found;
        if (geometry) mushroom.mesh.geometry = geometry;
      });
      for (const geometry of before.values()) geometry?.dispose();

      fishMaterial.color.copy(palette.streak);
      flameMaterial.color.lerpColors(palette.sun, palette.streak, 0.25);
      night = palette.dark;
      light.color.copy(palette.sun);
    },

    update(seconds, delta, lively) {
      // Canoe: at rest it only rocks; on a lap it eases in and out.
      if (lap < 1) {
        const before = MathUtils.smootherstep(lap, 0, 1);
        lap = Math.min(1, lap + delta / CANOE_LAP);
        canoeAngle += (MathUtils.smootherstep(lap, 0, 1) - before) * Math.PI * 2;
      }
      placeCanoe(seconds);

      // Fish: now and then one jumps by itself, somewhere new each time.
      if (lively && jumpTime < 0 && seconds > nextIdleJump) {
        idleJumps++;
        const angle = idleJumps * 2.4;
        const distance = LAKE_OPEN_RADIUS * (0.25 + ((idleJumps * 0.37) % 0.6));
        jump(new Vector3(LAKE_CENTRE.x + Math.sin(angle) * distance, 0, LAKE_CENTRE.z + Math.cos(angle) * distance));
      }
      if (jumpTime >= 0) {
        jumpTime += delta;
        const t = jumpTime / JUMP_SECONDS;
        if (t >= 1) {
          jumpTime = -1;
          fish.visible = false;
          nextIdleJump = seconds + 6 + ((idleJumps * 1.7) % 4);
        } else {
          fish.visible = true;
          fish.position.lerpVectors(jumpFrom, jumpTo, t);
          fish.position.y = LAKE_CENTRE.y - 0.1 + Math.sin(t * Math.PI) * JUMP_HEIGHT;
          // Nose along the arc: up on the way out, down on the way in.
          const ahead = Math.min(1, t + 0.05);
          fish.lookAt(
            group.localToWorld(
              new Vector3().lerpVectors(jumpFrom, jumpTo, ahead).setY(LAKE_CENTRE.y - 0.1 + Math.sin(ahead * Math.PI) * JUMP_HEIGHT),
            ),
          );
        }
      }

      // Flame: flickers; bigger at night and right after a click.
      stoked = Math.max(0, stoked - delta / 4);
      const size = (night ? 1 : 0.7) * (1 + 1.3 * stoked);
      flame.scale.set(size * (1 + Math.sin(seconds * 9) * 0.08), size * (1 + Math.sin(seconds * 13 + 1) * 0.16), size * (1 + Math.cos(seconds * 11) * 0.08));

      // Mushrooms that were just found hop and shrink away.
      for (const mushroom of mushrooms) {
        if (mushroom.leaving < 0) continue;
        mushroom.leaving += delta;
        const t = Math.min(1, mushroom.leaving / FOUND_SECONDS);
        mushroom.mesh.position.y = mushroom.baseY + Math.sin(t * Math.PI) * 0.6;
        mushroom.mesh.scale.setScalar(mushroom.scale * (1 - t * t));
        mushroom.mesh.rotation.y = t * 6;
        if (t >= 1) {
          mushroom.leaving = -1;
          mushroom.mesh.visible = false;
        }
      }

      // Lantern: at night a warm light, carried over the ground under the pointer or resting at the fire.
      light.position.x = MathUtils.damp(light.position.x, lanternTarget.x, 8, delta);
      light.position.y = MathUtils.damp(light.position.y, lanternTarget.y, 8, delta);
      light.position.z = MathUtils.damp(light.position.z, lanternTarget.z, 8, delta);
      light.intensity = night ? LANTERN_POWER * (carried ? 1 : 0.55 + 0.6 * stoked) * (1 + Math.sin(seconds * 10) * 0.04) : 0;
      glow.visible = night && carried;
      glow.position.copy(light.position);
    },

    paddle() {
      if (lap >= 1) lap = 0;
    },

    jump,

    stoke() {
      stoked = 1;
    },

    pick(index) {
      const mushroom = mushrooms[index];
      if (!mushroom || mushroom.found) return false;
      mushroom.found = true;
      mushroom.leaving = 0;
      return true;
    },

    lantern(spot) {
      carried = spot !== null;
      if (spot) lanternTarget.set(spot.x, spot.y + LANTERN_HEIGHT, spot.z);
      else lanternTarget.copy(fireside);
    },

    dispose() {
      for (const geometry of models.values()) geometry?.dispose();
      for (const part of fish.children) (part as Mesh).geometry.dispose();
      flame.geometry.dispose();
      glow.geometry.dispose();
      fishMaterial.dispose();
      flameMaterial.dispose();
    },
  };
}
