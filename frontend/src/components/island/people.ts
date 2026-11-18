import {
  BoxGeometry,
  Color,
  Euler,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { BRIDGE_DECK, BRIDGE_END, BRIDGE_FLAT, BRIDGES, CAMPFIRE, LAKE_CENTRE, PEOPLE_SPOTS, trailWalk, WALKS } from './geometry';
import type { Palette } from './palette';

/**
 * The people of the village. Eight of them, each busy with one thing that
 * reads from a distance (user feedback 2026-11-17: the first figures were too
 * plain and what they did was unclear):
 * - the fisher sits on the bank and goes through a whole catch: waits, gets a
 *   bite, strikes, reels a fish in, holds it up, lets it go and casts again;
 * - two villagers walk the paths (one with a basket), slowing at the ends to
 *   look around before turning back;
 * - the hiker climbs the mountain trail with a backpack and a walking stick;
 * - the reader sits against a tree with an open book and turns its pages;
 * - the camper sits by the fire toasting something on a stick, and now and
 *   then pulls it back to blow on it;
 * - the farmer swings a hoe up over their head and down into the field;
 * - the rower paddles the canoe round the lake, switching sides every few
 *   strokes (harder while the canoe does a lap).
 * A click makes a person wave (scene.tsx decides what was clicked).
 *
 * They are made in code, not from a kit: round parts (stretched spheres) with
 * knees, elbows, hands, shoes, eyes, hair and hats, plus a few flat things
 * (boxes: the book, the hoe's blade, the paddle's blade, a backpack, a basket,
 * a bucket). All spheres of all people are one instanced mesh and all boxes
 * another: two draw calls, and the same again for their shadows. Each frame a
 * pose (leg angles, knees, lean, twist, where the head looks, and either arm
 * angles or a point a hand must reach, solved with a bending elbow) is turned
 * into the parts' matrices.
 */

/**
 * A person's height in world units, head included. A little taller than a
 * house's door (about 0.5): at the true size they were too small to see what
 * they were doing. Everything below is a share of it.
 */
const HEIGHT = 0.68;
const ANKLE = 0.035;
const SHIN = 0.15;
const THIGH = 0.16;
const HIP_OUT = 0.07;
/** Sitting: the hips are this far above the seat. */
const SIT = 0.06;
const TORSO = 0.25;
const SHOULDER_OUT = 0.15;
const UPPER_ARM = 0.13;
const FOREARM = 0.125;
const NECK = 0.165;
const HEAD = 0.15;

const PEOPLE = 8;
/** Who is who, in this order (PEOPLE_WORDS in parts.ts follows it). */
const FISHER = 0;
const VILLAGER = 1; // and 2: one on each path
const HIKER = 3;
const READER = 4;
const CAMPER = 5;
const FARMER = 6;
const ROWER = 7;

/** Each person's spheres: thighs, shins, shoes, torso, upper arms, forearms, hands, head, hair, eyes, hat (left before right). */
const P = { thigh: 0, shin: 2, shoe: 4, torso: 6, upperArm: 7, forearm: 9, hand: 11, head: 13, hair: 14, eye: 15, hat: 17 } as const;
const PARTS = 18;
/** Then the round props: fishing rod, line, float, fish, walking stick, hoe handle, paddle shaft, toasting stick, what is on it. */
const PROP = PEOPLE * PARTS;
const ROD = PROP;
const LINE = PROP + 1;
const FLOAT = PROP + 2;
const FISH = PROP + 3;
const STICK = PROP + 4;
const HOE = PROP + 5;
const PADDLE = PROP + 6;
const SKEWER = PROP + 7;
const TREAT = PROP + 8;
const SPHERES = PROP + 9;
/** The flat things. */
const BOOK_LEFT = 0;
const BOOK_RIGHT = 1;
const PAGE = 2;
const HOE_BLADE = 3;
const PADDLE_BLADE = 4;
const PACK = 5;
const BASKET = 6;
const BUCKET = 7;
const BOXES = 8;

/** Hair (or a hat's crown) and a hat (or its brim): offset from the head's middle and radii, in the head's own frame. */
type Shape = readonly [x: number, y: number, z: number, rx: number, ry: number, rz: number];
const SHORT_HAIR: Shape = [0, 0.04, -0.025, 0.158, 0.135, 0.158];
const LOOKS: { hair: Shape; hat: Shape | null; sleeves: 'long' | 'short' }[] = [
  // Fisher: a bucket hat.
  { hair: [0, 0.075, -0.005, 0.152, 0.1, 0.152], hat: [0, 0.07, 0, 0.215, 0.035, 0.215], sleeves: 'long' },
  // Villager with a bun.
  { hair: SHORT_HAIR, hat: [0, 0.1, -0.13, 0.065, 0.065, 0.065], sleeves: 'long' },
  { hair: [0, 0.05, -0.02, 0.155, 0.12, 0.155], hat: null, sleeves: 'short' },
  // Hiker: a cap with a peak.
  { hair: [0, 0.06, -0.01, 0.158, 0.11, 0.158], hat: [0, 0.055, 0.13, 0.11, 0.022, 0.1], sleeves: 'short' },
  // Reader: long hair.
  { hair: [0, 0.02, -0.04, 0.165, 0.17, 0.165], hat: null, sleeves: 'long' },
  // Camper: a beanie with a pompom.
  { hair: [0, 0.07, -0.01, 0.158, 0.12, 0.158], hat: [0, 0.2, -0.01, 0.045, 0.045, 0.045], sleeves: 'long' },
  // Farmer: a straw hat.
  { hair: [0, 0.1, 0, 0.12, 0.08, 0.12], hat: [0, 0.075, 0, 0.27, 0.03, 0.27], sleeves: 'short' },
  { hair: SHORT_HAIR, hat: null, sleeves: 'short' },
];

/** Walking: radians of a step per unit walked, and units per second. */
const STRIDE = 16;
const WALK_SPEED = 0.28;
/** Seconds the hiker takes up the mountain and back down. */
const HIKE_SECONDS = 300;
/** A greeting lasts this long. */
const GREET_SECONDS = 1.6;
/** One whole catch, from waiting for a bite to the cast that starts the next wait. */
const CATCH_SECONDS = 16;
/** One swing of the hoe; every fourth swing the farmer straightens up and looks round instead. */
const HOE_SECONDS = 1.9;

interface Pose {
  /** Per leg (left, right): radians forward from hanging straight down, and how far the knee bends back. */
  legs: [number, number];
  knees: [number, number];
  /** Per arm: radians forward from hanging down, held out sideways, and how far the elbow bends forward. */
  arms: [number, number];
  spread: [number, number];
  elbows: [number, number];
  /** Per arm: a point (the person's own space, in shares) the hand must reach instead; the elbow bends to get there. */
  reach: [Vector3 | null, Vector3 | null];
  /** The upper body bends forward at the hips, and turns (radians). */
  lean: number;
  twist: number;
  /** The head nods down and turns (radians, on top of the body). */
  nod: number;
  turn: number;
  /** Sitting: the seat's height above the person's place (world units; 0 = on the ground); null = standing. */
  seat: number | null;
  /** The whole person is this far off the ground (a hop; world units). */
  lift: number;
}

const pose = (): Pose => ({
  legs: [0, 0],
  knees: [0, 0],
  arms: [0, 0],
  spread: [0.12, 0.12],
  elbows: [0.2, 0.2],
  reach: [null, null],
  lean: 0,
  twist: 0,
  nod: 0,
  turn: 0,
  seat: null,
  lift: 0,
});

/** A route to walk: its points and how far along each one is. */
const routes = WALKS.map((points) => {
  const marks = [0];
  for (let i = 1; i < points.length; i++) marks.push(marks[i - 1] + points[i].distanceTo(points[i - 1]));
  return { points, marks, length: marks[marks.length - 1] };
});

export interface People {
  group: Group;
  /** Colours follow the theme; they ease over while `blend` (see `update`) goes from 0 to 1. */
  apply: (palette: Palette) => void;
  /**
   * `seconds` is the scene's clock (it stands still while motion is reduced),
   * `delta` the real time since the last frame, `blend` how far a change of
   * theme has got (1 = settled). `canoe` is where the canoe is, `canoeHeading`
   * which way it points and `pace` how hard it is being paddled (0–1).
   */
  update: (seconds: number, delta: number, blend: number, canoe: Vector3, canoeHeading: number, pace: number) => void;
  /** Person `index` waves. */
  greet: (index: number) => void;
  /** Where each person is right now (their middle), for clicking on them. */
  spots: Vector3[];
  dispose: () => void;
}

const UP = new Vector3(0, 1, 0);
const HIDDEN = new Matrix4().makeScale(0, 0, 0);
const dummy = new Object3D();
const turned = new Quaternion();
const spin = new Quaternion();
const euler = new Euler(0, 0, 0, 'YXZ');
const basis = new Matrix4();
const along = new Vector3();
const across = new Vector3();
const facingWay = new Vector3();
const pole = new Vector3();
const direction = new Vector3();
const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
/** Kept apart from a, b, c: `figure` uses those, and these must survive a call to it. */
const toolStart = new Vector3();
const toolWay = new Vector3();

export function createPeople(): People {
  const material = new MeshLambertMaterial();
  const spheres = new InstancedMesh(new SphereGeometry(1, 12, 9), material, SPHERES);
  const boxMaterial = new MeshLambertMaterial();
  const boxes = new InstancedMesh(new BoxGeometry(1, 1, 1), boxMaterial, BOXES);
  for (const mesh of [spheres, boxes]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // The people are all over the island: culling by one part's bounds would hide them.
    mesh.frustumCulled = false;
  }
  const group = new Group().add(spheres, boxes);

  // Colours: what is shown, what it was when the theme last changed, and what it is going to.
  const makeColors = (count: number) => {
    const shown = Array.from({ length: count }, () => new Color(1, 1, 1));
    return { shown, from: shown.map((color) => color.clone()), to: shown.map((color) => color.clone()) };
  };
  const sphereColors = makeColors(SPHERES);
  const boxColors = makeColors(BOXES);
  let painted = false;

  const people = Array.from({ length: PEOPLE }, () => ({ at: new Vector3(), heading: 0, greeting: 0, hip: 0 }));
  const spots = people.map(() => new Vector3());
  const reaches = people.map(() => [new Vector3(), new Vector3()] as const);
  // Those who stay where they are: their places and which way they look.
  const facing = (who: number, from: Vector3, towards: Vector3) => {
    people[who].at.copy(from);
    people[who].heading = Math.atan2(towards.x - from.x, towards.z - from.z);
  };
  facing(FISHER, PEOPLE_SPOTS.fisher, LAKE_CENTRE);
  facing(READER, PEOPLE_SPOTS.reader, PEOPLE_SPOTS.readerLooksAt);
  facing(CAMPER, PEOPLE_SPOTS.camper, CAMPFIRE);
  facing(FARMER, PEOPLE_SPOTS.farmer, PEOPLE_SPOTS.farmerLooksAt);

  /** A point of a person's own space (shares: x to their left, y up, z forward) in the island's space. */
  const world = (who: number, local: Vector3, lift: number, target: Vector3) => {
    const { at, heading } = people[who];
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    return target.set(at.x + (local.x * cos + local.z * sin) * HEIGHT, at.y + lift + local.y * HEIGHT, at.z + (-local.x * sin + local.z * cos) * HEIGHT);
  };
  /** A sphere stretched to radii (shares) around a point of the person's space, turned by `tip` (forward) and `yaw` (on top of the heading). */
  const blob = (slot: number, who: number, local: Vector3, lift: number, tip: number, yaw: number, rx: number, ry: number, rz: number) => {
    world(who, local, lift, dummy.position);
    dummy.rotation.set(tip, people[who].heading + yaw, 0, 'YXZ');
    dummy.scale.set(rx * HEIGHT, ry * HEIGHT, rz * HEIGHT);
    dummy.updateMatrix();
    spheres.setMatrixAt(slot, dummy.matrix);
  };
  /** A rounded rod between two points of the island's space (radius in world units), reaching a little past both ends. */
  const rod = (slot: number, start: Vector3, end: Vector3, radius: number, overhang = 0) => {
    along.subVectors(end, start);
    const length = along.length();
    dummy.position.copy(start).addScaledVector(along, 0.5);
    dummy.quaternion.copy(turned.setFromUnitVectors(UP, along.divideScalar(length || 1)));
    dummy.scale.set(radius, length / 2 + overhang, radius);
    dummy.updateMatrix();
    spheres.setMatrixAt(slot, dummy.matrix);
  };
  const aWorld = new Vector3();
  const bWorld = new Vector3();
  /** A limb between two points of the person's space; radius in shares. */
  const limb = (slot: number, who: number, from: Vector3, to: Vector3, radius: number, lift: number) => {
    rod(slot, world(who, from, lift, aWorld), world(who, to, lift, bWorld), radius * HEIGHT, radius * HEIGHT * 0.45);
  };
  /** A box centred on a point of the island's space, its axes along `x`, `y`, `z` (unit vectors), sized in world units. */
  const box = (slot: number, centre: Vector3, x: Vector3, y: Vector3, z: Vector3, sx: number, sy: number, sz: number) => {
    basis.makeBasis(x, y, z);
    dummy.position.copy(centre);
    dummy.quaternion.setFromRotationMatrix(basis);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    boxes.setMatrixAt(slot, dummy.matrix);
  };
  /** Axes for a flat thing whose long side runs along `long` (island space), its face turned as near as it can to `face`. */
  const axesAlong = (long: Vector3, face: Vector3) => {
    b.copy(long).normalize();
    c.copy(face).addScaledVector(b, -face.dot(b));
    if (c.lengthSq() < 1e-6) c.set(0, 1, 0).addScaledVector(b, -b.y);
    c.normalize();
    a.crossVectors(b, c);
    return [a, b, c] as const;
  };

  /** Where the elbow goes for a hand at `hand` (the person's space): it bends down, outwards and back. A hand out of reach stops short. */
  const elbowFor = (shoulder: Vector3, hand: Vector3, side: number, out: Vector3) => {
    const longest = (UPPER_ARM + FOREARM) * 0.999;
    direction.subVectors(hand, shoulder);
    let distance = direction.length();
    if (distance > longest) {
      hand.copy(shoulder).addScaledVector(direction, longest / distance);
      distance = longest;
    }
    direction.divideScalar(distance || 1);
    const along = (UPPER_ARM ** 2 - FOREARM ** 2 + distance ** 2) / (2 * distance || 1);
    const off = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - along ** 2));
    pole.set(side * 0.5, -0.6, -0.5);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    return out.copy(shoulder).addScaledVector(direction, along).addScaledVector(pole, off);
  };

  const hands = [new Vector3(), new Vector3()];
  const head = new Vector3();
  const upper = { twist: 0, lean: 0, hip: 0 };
  /** A point of the upper body (the person's space before turning and bending at the hips; y from the hips) to where it is now. */
  const body = (x: number, y: number, z: number, out: Vector3) => {
    const ct = Math.cos(upper.twist);
    const st = Math.sin(upper.twist);
    const cl = Math.cos(upper.lean);
    const sl = Math.sin(upper.lean);
    const tx = x * ct + z * st;
    const tz = -x * st + z * ct;
    return out.set(tx, upper.hip + y * cl - tz * sl, y * sl + tz * cl);
  };

  const hip = new Vector3();
  const knee = new Vector3();
  const ankle = new Vector3();
  const toe = new Vector3();
  const shoulder = new Vector3();
  const elbow = new Vector3();
  const hand = new Vector3();
  const offset = new Vector3();
  /** Draws person `who` in that pose; leaves where their hands are (island space) in `hands` and their head's middle in `head`. */
  const figure = (who: number, p: Pose) => {
    const slot = who * PARTS;
    // Standing, the lower leg reaches the ground; sitting, the hips are just above the seat.
    let hipY = ANKLE;
    if (p.seat === null) {
      for (let k = 0; k < 2; k++) hipY = Math.max(hipY, ANKLE + THIGH * Math.cos(p.legs[k]) + SHIN * Math.cos(p.legs[k] - p.knees[k]));
    } else hipY = p.seat / HEIGHT + SIT;
    people[who].hip = hipY;
    const { lift } = p;

    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      const thigh = p.legs[k];
      const shin = thigh - p.knees[k];
      hip.set(side * HIP_OUT, hipY, 0);
      knee.set(side * HIP_OUT, hipY - Math.cos(thigh) * THIGH, Math.sin(thigh) * THIGH);
      ankle.set(side * HIP_OUT, knee.y - Math.cos(shin) * SHIN, knee.z + Math.sin(shin) * SHIN);
      limb(slot + P.thigh + k, who, hip, knee, 0.064, lift);
      limb(slot + P.shin + k, who, knee, ankle, 0.054, lift);
      // The shoe points forward from the ankle, square to the shin (so it points up when the legs are out in front).
      toe.set(ankle.x, ankle.y + Math.sin(shin) * 0.1 - 0.012, ankle.z + Math.cos(shin) * 0.1);
      limb(slot + P.shoe + k, who, ankle, toe, 0.045, lift);
    }

    upper.twist = p.twist;
    upper.lean = p.lean;
    upper.hip = hipY;
    blob(slot + P.torso, who, body(0, 0.13, 0, offset), lift, p.lean, p.twist, 0.135, 0.155, 0.1);

    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      body(side * SHOULDER_OUT, TORSO - 0.02, 0, shoulder);
      const target = p.reach[k];
      if (target) {
        hand.copy(target);
        elbowFor(shoulder, hand, side, elbow);
      } else {
        // Swung forward, held out, bent at the elbow: worked out before the body turns and bends, then turned and bent with it.
        const out = p.spread[k];
        const towards = (angle: number, target: Vector3) =>
          target.set(side * Math.sin(out), -Math.cos(angle) * Math.cos(out), Math.sin(angle) * Math.cos(out));
        towards(p.arms[k], a);
        towards(p.arms[k] + p.elbows[k], b);
        const sx = side * SHOULDER_OUT;
        const sy = TORSO - 0.02;
        body(sx + a.x * UPPER_ARM, sy + a.y * UPPER_ARM, a.z * UPPER_ARM, elbow);
        body(sx + a.x * UPPER_ARM + b.x * FOREARM, sy + a.y * UPPER_ARM + b.y * FOREARM, a.z * UPPER_ARM + b.z * FOREARM, hand);
      }
      limb(slot + P.upperArm + k, who, shoulder, elbow, 0.046, lift);
      limb(slot + P.forearm + k, who, elbow, hand, 0.041, lift);
      blob(slot + P.hand + k, who, hand, lift, 0, 0, 0.047, 0.047, 0.047);
      world(who, hand, lift, hands[k]);
    }

    // The head, and what is on it, in the head's own frame.
    const tip = p.lean + p.nod;
    const yaw = p.twist + p.turn;
    body(0, TORSO + NECK, 0, offset);
    blob(slot + P.head, who, offset, lift, tip, yaw, HEAD, HEAD * 1.02, HEAD * 0.96);
    world(who, offset, lift, head);
    euler.set(tip, yaw, 0, 'YXZ');
    const onHead = (shape: Shape | readonly number[], target: number) => {
      const [x, y, z, rx, ry, rz] = shape;
      a.set(x, y, z).applyEuler(euler).add(offset);
      blob(target, who, a, lift, tip, yaw, rx, ry, rz);
    };
    const look = LOOKS[who];
    onHead(look.hair, slot + P.hair);
    if (look.hat) onHead(look.hat, slot + P.hat);
    else spheres.setMatrixAt(slot + P.hat, HIDDEN);
    for (let k = 0; k < 2; k++) onHead([(k === 0 ? 1 : -1) * 0.055, 0.0, HEAD * 0.9, 0.022, 0.028, 0.014], slot + P.eye + k);

    spots[who].copy(world(who, a.set(0, hipY + 0.2, 0), lift, spots[who]));
  };

  /** Turns a person towards a heading, the short way round, a little each frame. */
  const face = (who: number, heading: number, delta: number) => {
    const person = people[who];
    const turn = Math.atan2(Math.sin(heading - person.heading), Math.cos(heading - person.heading));
    person.heading += turn * (1 - Math.exp(-7 * delta));
  };

  /** How high someone at that place stands: on the ground, or on a bridge's deck. */
  const footing = (at: Vector3) => {
    let height = 0;
    for (const bridge of BRIDGES) {
      // 1 on the deck, 0 from the bridge's end outwards. (three's smoothstep wants its smaller bound first.)
      const onDeck = 1 - MathUtils.smoothstep(Math.hypot(at.x - bridge.x, at.z - bridge.z), BRIDGE_FLAT, BRIDGE_END);
      height = Math.max(height, BRIDGE_DECK * onDeck);
    }
    return height;
  };

  /** A walking pose, `step` radians into the stride: thighs swing, knees bend as a leg comes forward, arms swing against the legs. */
  const walking = (step: number, p: Pose, swing = 1) => {
    for (let k = 0; k < 2; k++) {
      const phase = step + k * Math.PI;
      p.legs[k] = 0.45 * swing * Math.sin(phase);
      p.knees[k] = 0.85 * swing * Math.max(0, Math.cos(phase)) ** 1.5;
      p.arms[k] = -0.5 * swing * Math.sin(phase);
      p.elbows[k] = 0.3 + 0.25 * swing * Math.max(0, -Math.sin(phase));
    }
    p.twist = 0.08 * swing * Math.sin(step);
    p.lift = 0.006 * swing * Math.abs(Math.sin(step));
    return p;
  };

  /** Adds the greeting to a pose: the right hand goes up and waves, and those on their feet hop. */
  const greeting = (who: number, p: Pose, seconds: number) => {
    const left = people[who].greeting;
    if (left <= 0) return p;
    const strength = MathUtils.smoothstep(left, 0, 0.25) * MathUtils.smoothstep(GREET_SECONDS - left, 0, 0.2);
    if (strength > 0.4) {
      p.reach[1] = reaches[who][1].set(-SHOULDER_OUT - 0.07 + 0.06 * Math.sin(seconds * 14), (p.seat === null ? people[who].hip : p.seat / HEIGHT + SIT) + TORSO + 0.3, 0.05);
      p.turn = 0;
      p.nod = -0.1;
    }
    if (p.seat === null) p.lift += Math.abs(Math.sin(((GREET_SECONDS - left) / GREET_SECONDS) * Math.PI * 2)) * 0.06 * strength;
    return p;
  };

  // The fisher's things: where the float is, and the fish.
  const floatAt = new Vector3();
  const fishAt = new Vector3();
  const tipAt = new Vector3();
  const butt = new Vector3();
  const rodDirection = new Vector3();
  let strokes = 0;

  return {
    group,
    spots,

    apply(palette) {
      const mix = (x: Color, y: Color, amount: number) => new Color().lerpColors(x, y, amount);
      // `raised` is a dark surface in the dark theme and `ink` a light text colour: skin and paper take whichever is light.
      const light = palette.dark ? palette.ink : palette.raised;
      const dark = palette.dark ? palette.sunken : palette.ink;
      const skin = mix(palette.streak, light, 0.62);
      const hair = mix(palette.streak, dark, 0.62);
      const wood = mix(palette.streak, dark, 0.45);
      const shoes = mix(palette.muted, dark, 0.7);
      const shirts = [palette.danger, palette.accent, palette.streak, palette.sun, palette.water, mix(palette.accent, light, 0.5), palette.accentLip, mix(palette.sun, palette.danger, 0.45)];
      const trousers = [0.35, 0.6, 0.45, 0.25, 0.55, 0.4, 0.3, 0.5].map((amount) => mix(palette.muted, dark, amount));
      const hairs = [hair, mix(hair, palette.sun, 0.45), hair, palette.danger, mix(palette.streak, dark, 0.35), hair, palette.sun, mix(hair, palette.sun, 0.3)];
      // Hats: the crown takes the hair's slot (bucket hat, cap, beanie, straw hat); the bun is hair.
      const straw = mix(palette.sun, palette.streak, 0.35);
      const crowns = [mix(palette.water, light, 0.35), hairs[1], hairs[2], palette.danger, hairs[4], palette.accentLip, straw, hairs[7]];
      const hats = [crowns[0], hairs[1], hair, crowns[3], hair, light, straw, hair];
      const to = sphereColors.to;
      for (let who = 0; who < PEOPLE; who++) {
        const slot = who * PARTS;
        const set = (part: number, color: Color) => to[slot + part].copy(color);
        for (const part of [P.thigh, P.thigh + 1, P.shin, P.shin + 1]) set(part, trousers[who]);
        set(P.shoe, shoes);
        set(P.shoe + 1, shoes);
        for (const part of [P.torso, P.upperArm, P.upperArm + 1]) set(part, shirts[who]);
        const sleeve = LOOKS[who].sleeves === 'long' ? shirts[who] : skin;
        set(P.forearm, sleeve);
        set(P.forearm + 1, sleeve);
        for (const part of [P.hand, P.hand + 1, P.head]) set(part, skin);
        set(P.hair, crowns[who]);
        set(P.eye, dark);
        set(P.eye + 1, dark);
        set(P.hat, hats[who]);
      }
      for (const slot of [ROD, STICK, HOE, PADDLE, SKEWER]) to[slot].copy(wood);
      to[LINE].copy(light);
      to[FLOAT].copy(palette.danger);
      to[FISH].copy(mix(palette.water, palette.muted, 0.4));
      to[TREAT].copy(light);
      const boxTo = boxColors.to;
      // The book's covers are what shows from most sides: a colour of their own; the page being turned is paper.
      boxTo[BOOK_LEFT].copy(palette.danger);
      boxTo[BOOK_RIGHT].copy(palette.danger);
      boxTo[PAGE].copy(light);
      boxTo[HOE_BLADE].copy(mix(palette.muted, light, 0.25));
      boxTo[PADDLE_BLADE].copy(wood);
      boxTo[PACK].copy(palette.accentLip);
      boxTo[BASKET].copy(mix(palette.streak, palette.sun, 0.4));
      boxTo[BUCKET].copy(mix(palette.water, palette.muted, 0.3));
      // The very first colours are simply shown; later ones are eased into (`update`).
      for (const colors of [sphereColors, boxColors]) {
        colors.shown.forEach((color, i) => colors.from[i].copy(painted ? color : colors.to[i]));
      }
      painted = true;
    },

    update(seconds, delta, blend, canoe, canoeHeading, pace) {
      for (const [mesh, colors] of [[spheres, sphereColors], [boxes, boxColors]] as const) {
        colors.shown.forEach((color, i) => mesh.setColorAt(i, color.lerpColors(colors.from[i], colors.to[i], blend)));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      for (const person of people) person.greeting = Math.max(0, person.greeting - delta);

      // ── The fisher: sitting on the bank, a whole catch every CATCH_SECONDS ──
      {
        const t = (seconds + 3) % CATCH_SECONDS;
        const between = (from: number, to: number) => MathUtils.smoothstep(t, from, to);
        // The rod's angle above the horizontal, as the catch goes on.
        let pitch = 0.45 + 0.03 * Math.sin(seconds * 1.3);
        let lean = 0.12;
        let nod = 0.18;
        let reel = 0;
        // 0 = the float on the water, 1 = the fish hanging under the rod's tip.
        let landed = 0;
        let fishShown = false;
        let fishFall = 0;
        let flight = -1;
        let dip = 0.012 * Math.sin(seconds * 1.7);
        if (t > 4.4 && t < 5) dip -= 0.02 * Math.sin(((t - 4.4) / 0.6) * Math.PI); // a nibble
        if (t >= 8 && t < 9) {
          // A bite: the float goes under, the rod's tip is tugged down.
          dip = -0.06;
          pitch = 0.36 + 0.04 * Math.sin(t * 32);
          nod = 0.25;
        } else if (t >= 9 && t < 9.5) {
          // The strike.
          pitch = MathUtils.lerp(0.4, 1.15, between(9, 9.35));
          lean = -0.12;
        } else if (t >= 9.5 && t < 12) {
          // Reeling in.
          pitch = 1.05;
          lean = -0.05;
          reel = t;
          landed = between(9.5, 12);
          fishShown = true;
        } else if (t >= 12 && t < 13.2) {
          // Holding it up for a look.
          pitch = 1.25;
          lean = -0.1;
          nod = -0.15;
          landed = 1;
          fishShown = true;
        } else if (t >= 13.2 && t < 13.8) {
          // Letting it go.
          pitch = 1.2;
          landed = 1;
          fishShown = true;
          fishFall = between(13.2, 13.8);
        } else if (t >= 13.8 && t < 15) {
          // The rod goes back over the shoulder…
          pitch = MathUtils.lerp(1.2, 2.3, between(13.8, 14.7));
          lean = -0.18;
          landed = 1;
        } else if (t >= 15 && t < CATCH_SECONDS) {
          // …and flicks forward: the float flies out.
          pitch = MathUtils.lerp(2.3, 0.45, between(15, 15.3));
          lean = MathUtils.lerp(0.3, 0.12, between(15.3, 16));
          flight = between(15.15, 15.9);
          landed = 1 - flight;
        }
        const p = pose();
        p.seat = 0;
        p.legs = [1.42, 1.36];
        p.knees = [0.18, 0.28];
        p.lean = lean;
        p.nod = nod;
        people[FISHER].hip = SIT;
        butt.set(0.02, SIT + 0.12, 0.2);
        rodDirection.set(0, Math.sin(pitch), Math.cos(pitch));
        const [leftHand, rightHand] = reaches[FISHER];
        leftHand.copy(butt).addScaledVector(rodDirection, 0.22);
        rightHand.copy(butt).addScaledVector(rodDirection, 0.03);
        if (reel) rightHand.add(a.set(-0.05 + 0.035 * Math.cos(reel * 9), 0.035 * Math.sin(reel * 9), 0));
        p.reach = [leftHand, rightHand];
        figure(FISHER, greeting(FISHER, p, seconds));
        world(FISHER, butt, 0, a);
        world(FISHER, b.copy(butt).addScaledVector(rodDirection, 1.5), 0, tipAt);
        rod(ROD, a, tipAt, 0.011, 0);
        // The float: on the water, pulled to the rod's tip with the fish, or flying out on a cast.
        floatAt.copy(PEOPLE_SPOTS.float);
        floatAt.y += dip;
        c.copy(tipAt).setY(tipAt.y - 0.2);
        floatAt.lerp(c, landed);
        if (flight >= 0) floatAt.y += Math.sin(flight * Math.PI) * 0.35;
        rod(LINE, tipAt, floatAt, 0.0035, 0);
        dummy.position.copy(floatAt);
        dummy.quaternion.identity();
        dummy.scale.setScalar(0.03);
        dummy.updateMatrix();
        spheres.setMatrixAt(FLOAT, dummy.matrix);
        // The fish hangs under the float, wriggling; let go, it drops back into the lake.
        if (fishShown) {
          fishAt.copy(floatAt).setY(Math.max(PEOPLE_SPOTS.float.y - 0.05, floatAt.y - 0.03));
          a.copy(fishAt).setY(fishAt.y - 0.14);
          a.x += 0.04 * Math.sin(seconds * 13);
          if (fishFall > 0) {
            fishAt.y -= fishFall * fishFall * 0.6;
            a.y -= fishFall * fishFall * 0.6;
          }
          rod(FISH, fishAt, a, 0.03, 0.01);
        } else spheres.setMatrixAt(FISH, HIDDEN);
        // A bucket beside them.
        world(FISHER, b.set(0.26, 0.055, 0.04), 0, c);
        box(BUCKET, c, a.set(1, 0, 0), b.set(0, 1, 0), facingWay.set(0, 0, 1), 0.05, 0.055, 0.05);
      }

      // ── Two villagers, one on each path, walking to its end and back, looking round at the ends ──
      routes.forEach((route, k) => {
        const who = VILLAGER + k;
        // There and back in an even swing: slower near the ends, where they turn round.
        const phase = (seconds * WALK_SPEED * Math.PI) / route.length + k * 1.9;
        const walked = route.length * (0.5 - 0.5 * Math.cos(phase));
        const speed = Math.abs(Math.sin(phase));
        let segment = 0;
        while (segment < route.marks.length - 2 && route.marks[segment + 1] < walked) segment++;
        const from = route.points[segment];
        const to = route.points[segment + 1];
        people[who].at.lerpVectors(from, to, (walked - route.marks[segment]) / (route.marks[segment + 1] - route.marks[segment]));
        people[who].at.y = footing(people[who].at);
        const forwards = Math.sin(phase) >= 0 ? 1 : -1;
        face(who, Math.atan2((to.x - from.x) * forwards, (to.z - from.z) * forwards), delta);
        const p = walking((walked * STRIDE) / HEIGHT / 2, pose(), Math.min(1, speed * 3));
        p.turn = (1 - Math.min(1, speed * 4)) * 0.8 * Math.sin(seconds * 1.6 + k);
        if (k === 0) {
          // A basket in the crook of the left arm.
          p.arms[0] = 0.25;
          p.elbows[0] = 1.5;
          p.spread[0] = 0.25;
        }
        figure(who, greeting(who, p, seconds));
        if (k === 0) {
          c.copy(hands[0]);
          c.y -= 0.035;
          box(BASKET, c, a.set(Math.cos(people[who].heading), 0, -Math.sin(people[who].heading)), b.set(0, 1, 0), facingWay.set(Math.sin(people[who].heading), 0, Math.cos(people[who].heading)), 0.07, 0.05, 0.055);
        }
      });

      // ── The hiker: up the mountain trail and down again, with a backpack and a walking stick ──
      {
        const climb = (seconds * Math.PI * 2) / HIKE_SECONDS + 0.4;
        const height = 0.04 + 0.9 * (0.5 - 0.5 * Math.cos(climb));
        const upwards = Math.sin(climb) >= 0 ? 1 : -1;
        people[HIKER].at.copy(trailWalk(height));
        b.copy(trailWalk(height + 0.004 * upwards));
        face(HIKER, Math.atan2(b.x - people[HIKER].at.x, b.z - people[HIKER].at.z), delta);
        const step = height * 700;
        const p = walking(step, pose());
        // Bent into the climb, upright on the way down.
        p.lean = upwards > 0 ? 0.22 : 0.02;
        // The stick is planted ahead, swinging forward with the right leg.
        const ground = c.set(-0.2, 0, 0.2 + 0.14 * Math.sin(step));
        const top = reaches[HIKER][1].copy(ground).add(a.set(0.03, 0.55, -0.1));
        p.reach[1] = top;
        figure(HIKER, greeting(HIKER, p, seconds));
        if (p.reach[1] === top) {
          world(HIKER, ground, 0, a);
          rod(STICK, a, hands[1], 0.013, 0.02);
        } else spheres.setMatrixAt(STICK, HIDDEN);
        // The backpack.
        upper.lean = p.lean;
        upper.twist = p.twist;
        upper.hip = people[HIKER].hip;
        world(HIKER, body(0, 0.15, -0.14, c), p.lift, c);
        const heading = people[HIKER].heading + p.twist;
        a.set(Math.cos(heading), 0, -Math.sin(heading));
        b.set(0, Math.cos(p.lean), 0).addScaledVector(facingWay.set(Math.sin(heading), 0, Math.cos(heading)), Math.sin(p.lean));
        facingWay.crossVectors(a, b);
        box(PACK, c, a, b, facingWay, 0.11, 0.13, 0.06);
      }

      // ── The reader: against a tree, knees up, an open book; now and then a page is turned ──
      {
        const t = (seconds + 2) % 7;
        const turning = MathUtils.smoothstep(t, 5.8, 6.6);
        const lookUp = MathUtils.smoothstep(Math.sin(seconds * 0.55), 0.85, 0.98);
        const p = pose();
        p.seat = 0;
        p.legs = [2.15, 2.1];
        p.knees = [2.35, 2.3];
        p.lean = -0.18;
        p.nod = MathUtils.lerp(0.42, -0.05, lookUp);
        p.turn = 0.25 * lookUp;
        people[READER].hip = SIT;
        // The book, on the knees, its spine upright and its top tipped away.
        const spine = c.set(0, SIT + 0.31, 0.27);
        const [leftHand, rightHand] = reaches[READER];
        leftHand.copy(spine).add(a.set(0.14, -0.05, -0.05));
        // The right hand holds the right page, or follows it over.
        const pageAngle = MathUtils.lerp(-0.55, -(Math.PI - 0.55), turning);
        rightHand.set(spine.x - Math.cos(pageAngle) * 0.14, spine.y - 0.05, spine.z + Math.sin(pageAngle) * 0.14 - 0.05);
        if (turning <= 0) rightHand.set(spine.x - 0.14, spine.y - 0.05, spine.z - 0.05);
        p.reach = [leftHand, rightHand];
        figure(READER, greeting(READER, p, seconds));
        world(READER, spine, 0, b);
        const spineAt = b.clone();
        const heading = people[READER].heading;
        const half = (slot: number, angle: number, sideways: number) => {
          // A half of the book turns about the spine (upright, tipped back by 0.55).
          euler.set(0.35, heading, 0, 'YXZ');
          turned.setFromEuler(euler);
          spin.setFromAxisAngle(UP, angle);
          turned.multiply(spin);
          a.set(sideways * 0.08 * HEIGHT, 0, 0).applyQuaternion(turned).add(spineAt);
          dummy.position.copy(a);
          dummy.quaternion.copy(turned);
          dummy.scale.set(0.16 * HEIGHT, 0.21 * HEIGHT, 0.02 * HEIGHT);
          dummy.updateMatrix();
          boxes.setMatrixAt(slot, dummy.matrix);
        };
        half(BOOK_LEFT, 0.55, 1);
        half(BOOK_RIGHT, -0.55, -1);
        if (turning > 0 && turning < 1) half(PAGE, pageAngle + Math.PI, 1);
        else boxes.setMatrixAt(PAGE, HIDDEN);
      }

      // ── The camper: on the ground by the fire, toasting something on a stick; now and then blowing on it ──
      {
        const blowing = MathUtils.smoothstep(Math.sin(seconds * 0.7 + 1), 0.82, 0.95);
        const p = pose();
        p.seat = 0;
        p.legs = [1.3, 1.25];
        p.knees = [0.95, 0.9];
        p.lean = MathUtils.lerp(0.18, 0.05, blowing);
        p.nod = MathUtils.lerp(0.2, 0.35, blowing);
        people[CAMPER].hip = SIT;
        const reachFire = people[CAMPER].at.distanceTo(c.set(CAMPFIRE.x, 0, CAMPFIRE.z)) / HEIGHT;
        const start = toolStart.set(0, SIT + 0.16, 0.17);
        // Out over the flames, or drawn back up to the face.
        // To just short of the flames (inside them it would be hidden), a little above the ground.
        const out = reachFire - start.z - 0.32;
        toolWay.set(0, 0.42 - start.y, out).normalize();
        facingWay.set(0, 0.75, 0.35).normalize();
        toolWay.lerp(facingWay, blowing).normalize();
        const length = MathUtils.lerp(Math.hypot(out, 0.42 - start.y), 0.45, blowing);
        const [leftHand, rightHand] = reaches[CAMPER];
        rightHand.copy(start);
        leftHand.copy(start).addScaledVector(toolWay, 0.15);
        p.reach = [leftHand, rightHand];
        figure(CAMPER, greeting(CAMPER, p, seconds));
        world(CAMPER, start, 0, c);
        world(CAMPER, facingWay.copy(start).addScaledVector(toolWay, length), 0, b);
        rod(SKEWER, c, b, 0.009, 0);
        dummy.position.copy(b);
        dummy.quaternion.identity();
        dummy.scale.set(0.03, 0.036, 0.03);
        dummy.updateMatrix();
        spheres.setMatrixAt(TREAT, dummy.matrix);
      }

      // ── The farmer: the hoe up over the head, down into the ground, a pull; every fourth swing a rest ──
      {
        const swings = seconds / HOE_SECONDS;
        const u = swings % 1;
        const resting = Math.floor(swings) % 4 === 3;
        let angle: number;
        let lean: number;
        if (resting) {
          angle = -1.2;
          lean = 0;
        } else if (u < 0.5) {
          // Up, slowly.
          const up = MathUtils.smootherstep(u, 0, 0.5);
          angle = MathUtils.lerp(-0.5, 1.85, up);
          lean = MathUtils.lerp(0.32, -0.05, up);
        } else if (u < 0.62) {
          // Down, fast.
          const down = ((u - 0.5) / 0.12) ** 2;
          angle = MathUtils.lerp(1.85, -0.45, down);
          lean = MathUtils.lerp(-0.05, 0.4, down);
        } else {
          // A short pull through the soil.
          const pull = MathUtils.smoothstep(u, 0.62, 1);
          angle = MathUtils.lerp(-0.45, -0.5, pull);
          lean = MathUtils.lerp(0.4, 0.32, pull);
        }
        const p = pose();
        p.legs = [0.18, -0.12];
        p.knees = [0.12, 0.05];
        p.lean = lean;
        p.nod = resting ? 0 : 0.25;
        p.turn = resting ? 0.7 * Math.sin(u * Math.PI * 2) : 0;
        // The handle: from the hands outwards, at that angle above the horizontal.
        const raised = MathUtils.clamp((angle + 0.5) / 2.35, 0, 1);
        const grip = toolStart.set(-0.04, MathUtils.lerp(0.42, 0.52, raised), MathUtils.lerp(0.16, 0.1, raised));
        if (resting) grip.set(-0.02, 0.52, 0.18);
        toolWay.set(0, Math.sin(angle), Math.cos(angle));
        const [leftHand, rightHand] = reaches[FARMER];
        rightHand.copy(grip);
        leftHand.copy(grip).addScaledVector(toolWay, resting ? 0.08 : 0.24);
        p.reach = [leftHand, rightHand];
        figure(FARMER, greeting(FARMER, p, seconds));
        const end = world(FARMER, b.copy(grip).addScaledVector(toolWay, 1), 0, new Vector3());
        world(FARMER, b.copy(grip).addScaledVector(toolWay, -0.08), 0, c);
        rod(HOE, c, end, 0.013, 0);
        along.subVectors(end, c);
        const [x, y, z] = axesAlong(along, facingWay.set(Math.sin(people[FARMER].heading), 0, Math.cos(people[FARMER].heading)));
        box(HOE_BLADE, end, x, y, z, 0.09, 0.016, 0.07);
      }

      // ── The rower: sitting in the canoe, paddling, switching sides every three strokes ──
      {
        // On the canoe's seat, high enough to be seen over its side.
        people[ROWER].at.set(canoe.x, canoe.y + 0.09, canoe.z);
        people[ROWER].heading = canoeHeading;
        strokes += delta * MathUtils.lerp(0.45, 1.1, pace);
        const u = strokes % 1;
        const side = Math.floor(strokes / 3) % 2 === 0 ? 1 : -1;
        // In the water from the catch to the end of the pull, then out and forward again.
        const pull = MathUtils.smoothstep(u, 0, 0.55);
        const recover = MathUtils.smoothstep(u, 0.55, 1);
        const sweep = u < 0.55 ? pull : 1 - recover;
        const p = pose();
        p.seat = 0;
        p.legs = [1.45, 1.45];
        p.knees = [0.55, 0.55];
        p.lean = MathUtils.lerp(0.32, 0.02, sweep);
        p.twist = side * MathUtils.lerp(0.3, -0.1, sweep);
        people[ROWER].hip = SIT;
        // The top hand over the shoulder on the other side; the shaft points down to the paddling side.
        const grip = toolStart.set(-side * 0.04, SIT + MathUtils.lerp(0.44, 0.4, sweep), MathUtils.lerp(0.22, -0.02, sweep));
        const out = u < 0.55 ? 0 : Math.sin(recover * Math.PI) * 0.45;
        // Out over the canoe's side: the blade must clear the hull, which is about as wide as the rower.
        toolWay.set(side * (0.78 + out), -1 + out * 0.8, MathUtils.lerp(0.55, -0.3, sweep)).normalize();
        const [leftHand, rightHand] = reaches[ROWER];
        const top = side > 0 ? rightHand : leftHand;
        const bottom = side > 0 ? leftHand : rightHand;
        top.copy(grip);
        bottom.copy(grip).addScaledVector(toolWay, 0.3);
        p.reach = [leftHand, rightHand];
        figure(ROWER, greeting(ROWER, p, seconds));
        world(ROWER, b.copy(grip).addScaledVector(toolWay, -0.06), 0, facingWay);
        const bladeAt = world(ROWER, b.copy(grip).addScaledVector(toolWay, 0.9), 0, new Vector3());
        rod(PADDLE, facingWay, bladeAt, 0.013, 0);
        along.subVectors(bladeAt, facingWay);
        const [x, y, z] = axesAlong(along, across.set(Math.sin(canoeHeading), 0, Math.cos(canoeHeading)));
        box(PADDLE_BLADE, bladeAt, x, y, z, 0.075, 0.17, 0.014);
      }

      spheres.instanceMatrix.needsUpdate = true;
      boxes.instanceMatrix.needsUpdate = true;
    },

    greet(index) {
      const person = people[index];
      if (person && person.greeting <= 0) person.greeting = GREET_SECONDS;
    },

    dispose() {
      spheres.geometry.dispose();
      material.dispose();
      boxes.geometry.dispose();
      boxMaterial.dispose();
    },
  };
}
