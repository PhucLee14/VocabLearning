import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { WaterStream } from './geometry';

/**
 * Moving water: short streaks of foam that run down the island's waterfalls
 * (the water surfaces themselves are part of the island's static mesh, see
 * geometry.ts). All streaks share one geometry, rewritten every frame: one
 * draw call.
 */

const STREAK_LENGTH = 0.45;
const STREAK_WIDTH = 0.11;
/** Lifted this far off the water's surface so the two don't flicker. */
const LIFT = 0.035;

interface Course {
  stream: WaterStream;
  /** Distance from the start to each point. */
  marks: number[];
  length: number;
}

const point = new Vector3();
const tangent = new Vector3();
const normal = new Vector3();
const corner = new Vector3();

export function createFoam(streams: WaterStream[]): { mesh: Mesh<BufferGeometry, MeshBasicMaterial>; update: (seconds: number) => void } {
  const courses: Course[] = streams.map((stream) => {
    const marks = [0];
    for (let i = 1; i < stream.points.length; i++) marks.push(marks[i - 1] + stream.points[i].distanceTo(stream.points[i - 1]));
    return { stream, marks, length: marks[marks.length - 1] };
  });
  const total = streams.reduce((sum, stream) => sum + stream.streaks, 0);
  const positions = new BufferAttribute(new Float32Array(total * 6 * 3), 3).setUsage(DynamicDrawUsage);
  const mesh = new Mesh(new BufferGeometry().setAttribute('position', positions), new MeshBasicMaterial({ side: DoubleSide }));
  mesh.frustumCulled = false;

  const update = (seconds: number) => {
    let vertex = 0;
    for (const { stream, marks, length } of courses) {
      for (let k = 0; k < stream.streaks; k++) {
        // Each streak keeps its own lane and its own head start; all loop from the top.
        const lane = (((k * 0.618) % 1) - 0.5) * (stream.width - STREAK_WIDTH * 2);
        const travelled = ((seconds * stream.speed) / length + k / stream.streaks + ((k * 0.37) % 0.2)) % 1;
        const distance = travelled * length;
        let segment = 0;
        while (segment < marks.length - 2 && marks[segment + 1] < distance) segment++;
        const from = stream.points[segment];
        const to = stream.points[segment + 1];
        tangent.subVectors(to, from).normalize();
        point.copy(from).addScaledVector(tangent, distance - marks[segment]).addScaledVector(stream.across, lane);
        // Off the surface, towards the open side (up on a ledge, outwards on a wall).
        normal.crossVectors(tangent, stream.across);
        if (normal.y < -0.3 || (Math.abs(normal.y) <= 0.3 && normal.dot(stream.outward) < 0)) normal.negate();
        point.addScaledVector(normal, LIFT);

        const put = (along: number, across: number) => {
          corner.copy(point).addScaledVector(tangent, along * STREAK_LENGTH).addScaledVector(stream.across, across * STREAK_WIDTH);
          positions.setXYZ(vertex++, corner.x, corner.y, corner.z);
        };
        put(-0.5, -0.5);
        put(-0.5, 0.5);
        put(0.5, 0.5);
        put(-0.5, -0.5);
        put(0.5, 0.5);
        put(0.5, -0.5);
      }
    }
    positions.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}
