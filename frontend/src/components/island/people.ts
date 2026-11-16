import { BoxGeometry, Color, Group, InstancedMesh, MathUtils, Mesh, MeshLambertMaterial, Object3D, Quaternion, SphereGeometry, Vector3 } from 'three';
import { BRIDGE_DECK, BRIDGE_END, BRIDGE_FLAT, BRIDGES, CAMPFIRE, LAKE_CENTRE, PEOPLE_SPOTS, trailWalk, WALKS } from './geometry';
import type { Palette } from './palette';

/**
 * The people of the village. Eight of them, each doing one thing:
 * someone fishing at the lake, two villagers walking the paths, a hiker on
 * the mountain trail, someone reading under a tree, someone sitting by the
 * campfire, a farmer hoeing the field and someone in the canoe. A click makes
 * a person wave (scene.tsx decides what was clicked).
 *
 * They are round little figures, not models from the kit: every part of a
 * body is a stretched sphere, and all the parts of all the people are one
 * instanced mesh (two draw calls with the book, the same again for their
 * shadows). Where the parts are is worked out anew every frame from a pose:
 * angles for the legs and arms, a lean, a seat.
 */

/** A person's height in world units (a house door is about 0.5). */
const HEIGHT = 0.62;
const PEOPLE = 8;
/** Per person: two legs, the body, two arms, the head, the hair or hat. */
const PARTS = 7;
/** After the people: the fishing rod, its line, its float, the hiker's stick, the farmer's hoe, the paddle. */
const ROD = PEOPLE * PARTS;
const LINE = ROD + 1;
const FLOAT = ROD + 2;
const STICK = ROD + 3;
const HOE = ROD + 4;
const PADDLE = ROD + 5;
const INSTANCES = ROD + 6;

/** Who is who, in this order. */
const FISHER = 0;
const VILLAGER = 1; // and 2: one on each path
const HIKER = 3;
const READER = 4;
const CAMPER = 5;
const FARMER = 6;
const ROWER = 7;

/** A body's proportions, as shares of its height: where the legs and arms hang from. */
const HIP = 0.36;
const HIP_OUT = 0.085;
const SHOULDER = 0.3; // above the hip
const SHOULDER_OUT = 0.2;
const LEG = 0.18; // half its length
const ARM = 0.15;

/** Radians of a step per unit walked. */
const STRIDE = 7;
const WALK_SPEED = 0.28;
/** Seconds the hiker takes up the mountain and back down. */
const HIKE_SECONDS = 300;
/** A greeting lasts this long. */
const GREET_SECONDS = 1.6;

interface Pose {
  /** Left and right; radians forward from hanging straight down. */
  legs: [number, number];
  arms: [number, number];
  /** How far each arm is held out sideways (radians; past a right angle = raised). */
  spread: [number, number];
  /** The upper body bends forward by this much (radians). */
  lean: number;
  /** Sitting: the height of the seat above the person's place (0 = on the ground); null = standing. */
  seat: number | null;
  /** The whole person is this far off the ground (a hop). */
  lift: number;
}

const standing = (): Pose => ({ legs: [0, 0], arms: [0, 0], spread: [0.12, 0.12], lean: 0, seat: null, lift: 0 });

/** A route to walk: its points and how far along each one is. */
interface Route {
  points: Vector3[];
  marks: number[];
  length: number;
}
const routes: Route[] = WALKS.map((points) => {
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
   * theme has got (1 = settled). `canoe` is where the canoe is and which way
   * it points.
   */
  update: (seconds: number, delta: number, blend: number, canoe: Vector3, canoeHeading: number) => void;
  /** Person `index` waves. */
  greet: (index: number) => void;
  /** Where each person is right now (their middle), for clicking on them. */
  spots: Vector3[];
  dispose: () => void;
}

const UP = new Vector3(0, 1, 0);
const dummy = new Object3D();
const turned = new Quaternion();
const along = new Vector3();
const here = new Vector3();
const ahead = new Vector3();

export function createPeople(): People {
  const material = new MeshLambertMaterial();
  const mesh = new InstancedMesh(new SphereGeometry(1, 12, 8), material, INSTANCES);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // The people are all over the island: culling by the sphere's own bounds would hide them.
  mesh.frustumCulled = false;
  const bookMaterial = new MeshLambertMaterial();
  const book = new Mesh(new BoxGeometry(0.2, 0.025, 0.15).scale(HEIGHT, HEIGHT, HEIGHT), bookMaterial);
  book.castShadow = true;
  const group = new Group().add(mesh, book);

  // Colours: what is shown, what it was when the theme last changed, and what it is going to.
  const shown = Array.from({ length: INSTANCES }, () => new Color(1, 1, 1));
  const from = shown.map((color) => color.clone());
  const to = shown.map((color) => color.clone());
  shown.forEach((color, i) => mesh.setColorAt(i, color));
  let painted = false;

  const people = Array.from({ length: PEOPLE }, () => ({ at: new Vector3(), heading: 0, greeting: 0 }));
  const spots = people.map(() => new Vector3());
  // Those who stay where they are: their places and which way they look.
  const facing = (who: number, from: Vector3, towards: Vector3) => {
    people[who].at.copy(from);
    people[who].heading = Math.atan2(towards.x - from.x, towards.z - from.z);
  };
  facing(FISHER, PEOPLE_SPOTS.fisher, LAKE_CENTRE);
  facing(READER, PEOPLE_SPOTS.reader, PEOPLE_SPOTS.readerLooksAt);
  facing(CAMPER, PEOPLE_SPOTS.camper, CAMPFIRE);
  facing(FARMER, PEOPLE_SPOTS.farmer, PEOPLE_SPOTS.farmerLooksAt);

  /** A point of a person's body (shares of their height: sideways, up, forward), in the island's space. */
  const point = (who: number, x: number, y: number, z: number, lift: number, target: Vector3) => {
    const { at, heading } = people[who];
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    return target.set(at.x + (x * cos + z * sin) * HEIGHT, at.y + lift + y * HEIGHT, at.z + (-x * sin + z * cos) * HEIGHT);
  };
  /** One part: a sphere stretched to `size` (shares of the height) around that point, tipped by `tip` forward and `roll` sideways. */
  const part = (slot: number, who: number, x: number, y: number, z: number, lift: number, tip: number, roll: number, sx: number, sy: number, sz: number) => {
    point(who, x, y, z, lift, dummy.position);
    dummy.rotation.set(tip, people[who].heading, roll, 'YXZ');
    dummy.scale.set(sx * HEIGHT, sy * HEIGHT, sz * HEIGHT);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
  };
  /** A thin stick between two points. */
  const stick = (slot: number, start: Vector3, end: Vector3, radius: number) => {
    along.subVectors(end, start);
    const length = along.length();
    dummy.position.copy(start).addScaledVector(along, 0.5);
    dummy.quaternion.copy(turned.setFromUnitVectors(UP, along.divideScalar(length || 1)));
    dummy.scale.set(radius, length / 2, radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
  };

  const hands = [new Vector3(), new Vector3()];
  /** Draws person `who` in that pose, and leaves where their hands are in `hands`. */
  const figure = (who: number, pose: Pose) => {
    const slot = who * PARTS;
    const sitting = pose.seat !== null;
    // Sitting on the ground the hips are just above it; on a seat, just above the seat.
    const hip = pose.seat === null ? HIP : pose.seat / HEIGHT + (pose.seat > 0.1 ? 0.03 : 0.09);
    const lift = pose.lift;
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      const angle = pose.legs[k];
      part(slot + k, who, side * HIP_OUT, hip - Math.cos(angle) * LEG, Math.sin(angle) * LEG, lift, -angle, 0, 0.075, LEG + 0.01, 0.075);
    }
    // The upper body turns about the hips when it leans.
    const cos = Math.cos(pose.lean);
    const sin = Math.sin(pose.lean);
    const upper = (y: number, z: number): [number, number] => [hip + y * cos - z * sin, y * sin + z * cos];
    const [bodyY, bodyZ] = upper(0.17, 0);
    part(slot + 2, who, 0, bodyY, bodyZ, lift, pose.lean, 0, 0.17, 0.2, 0.13);
    const [shoulderY, shoulderZ] = upper(SHOULDER, 0);
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      const angle = pose.arms[k] + pose.lean;
      const out = pose.spread[k];
      // Which way the arm points from the shoulder.
      const [dx, dy, dz] = [side * Math.sin(out), -Math.cos(angle) * Math.cos(out), Math.sin(angle) * Math.cos(out)];
      part(slot + 3 + k, who, side * SHOULDER_OUT + dx * ARM, shoulderY + dy * ARM, shoulderZ + dz * ARM, lift, -angle, side * out, 0.055, ARM + 0.01, 0.055);
      point(who, side * SHOULDER_OUT + dx * ARM * 2, shoulderY + dy * ARM * 2, shoulderZ + dz * ARM * 2, lift, hands[k]);
    }
    const [headY, headZ] = upper(0.48, 0);
    part(slot + 5, who, 0, headY, headZ, lift, pose.lean, 0, 0.135, 0.135, 0.135);
    const [hairY, hairZ] = upper(0.55, -0.02);
    // The farmer's is a hat with a brim.
    const brim = who === FARMER ? 0.2 : 0.14;
    part(slot + 6, who, 0, hairY, hairZ, lift, pose.lean, 0, brim, who === FARMER ? 0.06 : 0.085, brim);
    point(who, 0, hip + (sitting ? 0.2 : 0.15), 0, lift, spots[who]);
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

  /** A walking pose, `step` radians into the stride. */
  const walking = (step: number, pose: Pose) => {
    const swing = Math.sin(step);
    pose.legs = [swing * 0.6, -swing * 0.6];
    pose.arms = [-swing * 0.5, swing * 0.5];
    pose.lift = Math.abs(Math.cos(step)) * 0.012;
    return pose;
  };

  /** Adds the greeting to a pose: the right arm goes up and waves, and those on their feet hop. */
  const greeting = (who: number, pose: Pose, seconds: number) => {
    const left = people[who].greeting;
    if (left <= 0) return pose;
    const strength = MathUtils.smoothstep(left, 0, 0.25) * MathUtils.smoothstep(GREET_SECONDS - left, 0, 0.2);
    pose.arms[1] = MathUtils.lerp(pose.arms[1], 0, strength);
    pose.spread[1] = MathUtils.lerp(pose.spread[1], 2.5 + Math.sin(seconds * 14) * 0.3, strength);
    if (pose.seat === null) pose.lift += Math.abs(Math.sin(((GREET_SECONDS - left) / GREET_SECONDS) * Math.PI * 2)) * 0.09 * strength;
    return pose;
  };

  const float = PEOPLE_SPOTS.float.clone();
  const tip = new Vector3();
  const foot = new Vector3();

  return {
    group,
    spots,

    apply(palette) {
      const mix = (a: Color, b: Color, amount: number) => new Color().lerpColors(a, b, amount);
      // `raised` is a dark surface in the dark theme and `ink` a light text colour: skin and paper take whichever is light.
      const light = palette.dark ? palette.ink : palette.raised;
      const dark = palette.dark ? palette.sunken : palette.ink;
      const skin = mix(palette.streak, light, 0.62);
      const hair = mix(palette.streak, dark, 0.62);
      const shirts = [palette.danger, palette.accent, palette.streak, palette.sun, palette.water, mix(palette.accent, light, 0.5), palette.accentLip, palette.danger];
      const trousers = [0.35, 0.6, 0.45, 0.25, 0.55, 0.4, 0.3, 0.5].map((amount) => mix(palette.muted, dark, amount));
      const hairs = [hair, mix(hair, palette.sun, 0.45), hair, palette.danger, mix(hair, light, 0.5), hair, palette.sun, mix(hair, palette.sun, 0.3)];
      for (let who = 0; who < PEOPLE; who++) {
        const colors = [trousers[who], trousers[who], shirts[who], shirts[who], shirts[who], skin, hairs[who]];
        colors.forEach((color, k) => to[who * PARTS + k].copy(color));
      }
      for (const slot of [ROD, STICK, HOE, PADDLE]) to[slot].copy(hair);
      to[LINE].copy(light);
      to[FLOAT].copy(palette.danger);
      bookMaterial.color.copy(light);
      // The very first colours are simply shown; later ones are eased into (`update`).
      for (let i = 0; i < INSTANCES; i++) from[i].copy(painted ? shown[i] : to[i]);
      painted = true;
    },

    update(seconds, delta, blend, canoe, canoeHeading) {
      for (let i = 0; i < INSTANCES; i++) mesh.setColorAt(i, shown[i].lerpColors(from[i], to[i], blend));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      for (const person of people) person.greeting = Math.max(0, person.greeting - delta);

      // ── Fishing: sitting on the bank, the rod out over the water; now and then a bite ──
      const bite = MathUtils.smoothstep(Math.sin(seconds * 0.7), 0.93, 1);
      figure(FISHER, greeting(FISHER, { legs: [1.35, 1.25], arms: [1.05 + bite * 0.5, 1.05 + bite * 0.5], spread: [-0.25, -0.25], lean: 0.1 - bite * 0.25, seat: 0, lift: 0 }, seconds));
      here.lerpVectors(hands[0], hands[1], 0.5);
      point(FISHER, 0, 0.95 + bite * 0.35, 1.25, 0, tip);
      stick(ROD, here, tip, 0.012);
      float.y = PEOPLE_SPOTS.float.y + Math.sin(seconds * 1.7) * 0.012 - bite * 0.05;
      stick(LINE, tip, float, 0.004);
      dummy.position.copy(float);
      dummy.quaternion.identity();
      dummy.scale.setScalar(0.035);
      dummy.updateMatrix();
      mesh.setMatrixAt(FLOAT, dummy.matrix);

      // ── Two villagers, one on each path, walking to its end and back ──
      routes.forEach((route, k) => {
        const who = VILLAGER + k;
        // There and back in an even swing: slower near the ends, where they turn round.
        const phase = (seconds * WALK_SPEED * Math.PI) / route.length + k * 1.9;
        const walked = route.length * (0.5 - 0.5 * Math.cos(phase));
        let segment = 0;
        while (segment < route.marks.length - 2 && route.marks[segment + 1] < walked) segment++;
        const a = route.points[segment];
        const b = route.points[segment + 1];
        people[who].at.lerpVectors(a, b, (walked - route.marks[segment]) / (route.marks[segment + 1] - route.marks[segment]));
        people[who].at.y = footing(people[who].at);
        const forwards = Math.sin(phase) >= 0 ? 1 : -1;
        face(who, Math.atan2((b.x - a.x) * forwards, (b.z - a.z) * forwards), delta);
        figure(who, greeting(who, walking(walked * STRIDE, standing()), seconds));
      });

      // ── The hiker: up the mountain trail and down again, with a stick ──
      const climb = (seconds * Math.PI * 2) / HIKE_SECONDS + 0.4;
      const height = 0.04 + 0.9 * (0.5 - 0.5 * Math.cos(climb));
      const upwards = Math.sin(climb) >= 0 ? 1 : -1;
      people[HIKER].at.copy(trailWalk(height));
      ahead.copy(trailWalk(height + 0.004 * upwards));
      face(HIKER, Math.atan2(ahead.x - people[HIKER].at.x, ahead.z - people[HIKER].at.z), delta);
      const hike = walking(height * 330, standing());
      hike.lean = 0.12;
      figure(HIKER, greeting(HIKER, hike, seconds));
      point(HIKER, -0.3, 0, 0.12 + Math.sin(height * 330) * 0.1, 0, foot);
      stick(STICK, hands[1], foot, 0.012);

      // ── Reading under a tree: legs out, the book held up; a page is turned now and then ──
      const page = MathUtils.smoothstep(Math.sin(seconds * 0.9 + 1), 0.9, 1);
      figure(READER, greeting(READER, { legs: [1.4, 1.3], arms: [0.85, 0.85 + page * 0.3], spread: [-0.3, -0.3 + page * 0.25], lean: -0.12, seat: 0, lift: 0 }, seconds));
      book.position.lerpVectors(hands[0], hands[1], 0.5);
      book.rotation.set(-1, people[READER].heading, 0, 'YXZ');

      // ── By the campfire, on the stump: hands out to the fire ──
      const rub = Math.sin(seconds * 2.4) * 0.08;
      figure(CAMPER, greeting(CAMPER, { legs: [0.5, 0.55], arms: [1 + rub, 1 - rub], spread: [-0.15, -0.15], lean: 0.18, seat: PEOPLE_SPOTS.seat, lift: 0 }, seconds));

      // ── The farmer: hoeing, bending to each stroke ──
      const stroke = Math.max(0, Math.sin(seconds * 2.1));
      figure(FARMER, greeting(FARMER, { legs: [0.12, -0.12], arms: [0.6 + stroke * 0.5, 0.75 + stroke * 0.5], spread: [-0.2, -0.2], lean: 0.2 + stroke * 0.28, seat: null, lift: 0 }, seconds));
      here.lerpVectors(hands[0], hands[1], 0.5);
      point(FARMER, 0, 0.02 + (1 - stroke) * 0.25, 0.75, 0, foot);
      stick(HOE, here, foot, 0.013);

      // ── In the canoe: sitting, the paddle dipping on one side then the other ──
      people[ROWER].at.set(canoe.x, canoe.y + 0.05, canoe.z);
      people[ROWER].heading = canoeHeading;
      const dip = Math.sin(seconds * 1.6);
      figure(ROWER, greeting(ROWER, { legs: [1.35, 1.35], arms: [0.9 + dip * 0.2, 0.9 - dip * 0.2], spread: [-0.2 + dip * 0.25, -0.2 - dip * 0.25], lean: 0.08, seat: 0, lift: 0 }, seconds));
      here.lerpVectors(hands[0], hands[1], 0.5);
      point(ROWER, dip > 0 ? 0.55 : -0.55, -0.02, 0.35, 0, foot);
      stick(PADDLE, here.addScaledVector(UP, 0.08), foot, 0.014);

      mesh.instanceMatrix.needsUpdate = true;
    },

    greet(index) {
      const person = people[index];
      if (person && person.greeting <= 0) person.greeting = GREET_SECONDS;
    },

    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      book.geometry.dispose();
      bookMaterial.dispose();
    },
  };
}
