/**
 * Mesh work on plain arrays (no three.js): what turns faceted models into
 * rounder ones. Everything here works on a "soup" of triangles: three corners
 * per triangle, nothing shared, so `positions` holds 9 numbers per triangle.
 */

const WELD = 2000; // positions closer than half a millimetre are one point

/** A number per corner: the same for corners at the same place. Also returns how many places there are. */
export function weld(positions: Float32Array): { ids: Uint32Array; count: number } {
  const corners = positions.length / 3;
  const ids = new Uint32Array(corners);
  const buckets = new Map<number, number[]>();
  let count = 0;
  for (let c = 0; c < corners; c++) {
    const x = Math.round(positions[c * 3] * WELD);
    const y = Math.round(positions[c * 3 + 1] * WELD);
    const z = Math.round(positions[c * 3 + 2] * WELD);
    const key = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0;
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = []));
    // The bucket holds one corner per place that landed on this key (nearly always one).
    let found = -1;
    for (const other of bucket) {
      if (
        Math.round(positions[other * 3] * WELD) === x &&
        Math.round(positions[other * 3 + 1] * WELD) === y &&
        Math.round(positions[other * 3 + 2] * WELD) === z
      ) {
        found = ids[other];
        break;
      }
    }
    if (found === -1) {
      bucket.push(c);
      found = count++;
    }
    ids[c] = found;
  }
  return { ids, count };
}

/**
 * A normal per corner. Where faces meet at less than their crease angle the
 * normals are averaged, so the edge is shaded as a curve; sharper edges stay
 * edges. `crease` is the cosine of that angle, one per triangle or one for all.
 */
export function creasedNormals(positions: Float32Array, crease: Float32Array | number): Float32Array {
  const triangles = positions.length / 9;
  // Per triangle: its normal scaled by its area (so big faces weigh more), and the unit normal.
  const scaled = new Float32Array(triangles * 3);
  const unit = new Float32Array(triangles * 3);
  for (let t = 0; t < triangles; t++) {
    const p = t * 9;
    const ux = positions[p + 3] - positions[p];
    const uy = positions[p + 4] - positions[p + 1];
    const uz = positions[p + 5] - positions[p + 2];
    const vx = positions[p + 6] - positions[p];
    const vy = positions[p + 7] - positions[p + 1];
    const vz = positions[p + 8] - positions[p + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    scaled.set([nx, ny, nz], t * 3);
    if (length > 1e-12) unit.set([nx / length, ny / length, nz / length], t * 3);
  }

  // The triangles around each place.
  const { ids, count } = weld(positions);
  const starts = new Uint32Array(count + 1);
  for (let c = 0; c < ids.length; c++) starts[ids[c] + 1]++;
  for (let i = 0; i < count; i++) starts[i + 1] += starts[i];
  const around = new Uint32Array(ids.length);
  const filled = new Uint32Array(count);
  for (let c = 0; c < ids.length; c++) around[starts[ids[c]] + filled[ids[c]]++] = Math.floor(c / 3);

  const normals = new Float32Array(positions.length);
  for (let c = 0; c < ids.length; c++) {
    const t = Math.floor(c / 3);
    const limit = typeof crease === 'number' ? crease : crease[t];
    let [nx, ny, nz] = [0, 0, 0];
    for (let k = starts[ids[c]]; k < starts[ids[c] + 1]; k++) {
      const other = around[k];
      const same = unit[t * 3] * unit[other * 3] + unit[t * 3 + 1] * unit[other * 3 + 1] + unit[t * 3 + 2] * unit[other * 3 + 2];
      if (other !== t && same < limit) continue;
      nx += scaled[other * 3];
      ny += scaled[other * 3 + 1];
      nz += scaled[other * 3 + 2];
    }
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.set([nx / length, ny / length, nz / length], c * 3);
  }
  return normals;
}

export interface Soup {
  positions: Float32Array;
  normals: Float32Array;
  /** Whatever else each corner carries, one number each (a role, a shade, …). A new corner on an edge takes the mean of the edge's ends, or with `pick` the first end's value. */
  extras: { values: Float32Array | Uint8Array; pick?: boolean }[];
}

/** How far a new corner moves from the middle of its edge towards the curved surface (1 = all the way). */
const ROUNDING = 0.75;

/**
 * Splits every triangle for which `chosen(t)` holds into four, and moves the
 * new corners out to where a curved surface through the old ones would be
 * (Phong tessellation: the corners' normals say how it curves). So a six-sided
 * tree top becomes a twelve-sided one, and rounder.
 *
 * An edge's new corner only moves when every triangle on that edge is split
 * and they agree on the normals at its ends; otherwise it stays on the edge,
 * and no gap can open between neighbours.
 */
export function tessellate(soup: Soup, chosen: (triangle: number) => boolean): Soup {
  const { positions, normals } = soup;
  const triangles = positions.length / 9;
  const { ids, count } = weld(positions);
  const picked = new Uint8Array(triangles);
  let extra = 0;
  for (let t = 0; t < triangles; t++) {
    if (chosen(t)) {
      picked[t] = 1;
      extra += 3;
    }
  }

  // Per edge (a pair of places): the corners that first described it, and whether everyone agrees.
  const edges = new Map<number, { a: number; b: number; round: boolean }>();
  const edgeKey = (a: number, b: number) => (ids[a] < ids[b] ? ids[a] * count + ids[b] : ids[b] * count + ids[a]);
  const agree = (a: number, b: number) => normals[a * 3] * normals[b * 3] + normals[a * 3 + 1] * normals[b * 3 + 1] + normals[a * 3 + 2] * normals[b * 3 + 2] > 0.999;
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const a = t * 3 + k;
      const b = t * 3 + ((k + 1) % 3);
      const key = edgeKey(a, b);
      const edge = edges.get(key);
      if (!edge) edges.set(key, { a, b, round: picked[t] === 1 });
      else if (!picked[t]) edge.round = false;
      else if (edge.round) {
        // The same edge seen from another triangle, possibly the other way round.
        const [mine, other] = ids[a] === ids[edge.a] ? [a, b] : [b, a];
        if (!agree(mine, edge.a) || !agree(other, edge.b)) edge.round = false;
      }
    }
  }

  const total = (triangles + extra) * 3;
  const out: Soup = {
    positions: new Float32Array(total * 3),
    normals: new Float32Array(total * 3),
    extras: soup.extras.map(({ values, pick }) => ({ values: values instanceof Uint8Array ? new Uint8Array(total) : new Float32Array(total), pick })),
  };
  let next = 0;
  /** Writes a corner that is `a` (when b is -1) or the new corner on the edge a–b. */
  const put = (a: number, b: number) => {
    const at = next * 3;
    if (b === -1) {
      for (let k = 0; k < 3; k++) {
        out.positions[at + k] = positions[a * 3 + k];
        out.normals[at + k] = normals[a * 3 + k];
      }
      soup.extras.forEach(({ values }, i) => {
        out.extras[i].values[next] = values[a];
      });
    } else {
      let [mx, my, mz] = [0, 1, 2].map((k) => (positions[a * 3 + k] + positions[b * 3 + k]) / 2);
      let [nx, ny, nz] = [0, 1, 2].map((k) => normals[a * 3 + k] + normals[b * 3 + k]);
      const length = Math.hypot(nx, ny, nz) || 1;
      [nx, ny, nz] = [nx / length, ny / length, nz / length];
      if (edges.get(edgeKey(a, b))?.round) {
        // How far the middle is from the two planes that touch the surface at the ends.
        let [fromA, fromB] = [0, 0];
        for (let k = 0; k < 3; k++) {
          const middle = [mx, my, mz][k];
          fromA += (middle - positions[a * 3 + k]) * normals[a * 3 + k];
          fromB += (middle - positions[b * 3 + k]) * normals[b * 3 + k];
        }
        mx -= ROUNDING * 0.5 * (fromA * normals[a * 3] + fromB * normals[b * 3]);
        my -= ROUNDING * 0.5 * (fromA * normals[a * 3 + 1] + fromB * normals[b * 3 + 1]);
        mz -= ROUNDING * 0.5 * (fromA * normals[a * 3 + 2] + fromB * normals[b * 3 + 2]);
      }
      out.positions.set([mx, my, mz], at);
      out.normals.set([nx, ny, nz], at);
      soup.extras.forEach(({ values, pick }, i) => {
        out.extras[i].values[next] = pick ? values[a] : (values[a] + values[b]) / 2;
      });
    }
    next++;
  };

  for (let t = 0; t < triangles; t++) {
    const [a, b, c] = [t * 3, t * 3 + 1, t * 3 + 2];
    if (!picked[t]) {
      put(a, -1);
      put(b, -1);
      put(c, -1);
      continue;
    }
    // Four triangles: one at each corner and one in the middle.
    for (const [p, q, r] of [
      [[a, -1], [a, b], [c, a]],
      [[a, b], [b, -1], [b, c]],
      [[c, a], [b, c], [c, -1]],
      [[a, b], [b, c], [c, a]],
    ]) {
      put(p[0], p[1]);
      put(q[0], q[1]);
      put(r[0], r[1]);
    }
  }
  return out;
}
