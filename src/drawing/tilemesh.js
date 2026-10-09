// Layer 4, drawing: one height tile as a piece of the round Earth.
//
// The tile's grid points are laid on the ellipsoid at their own latitude,
// longitude and height, worked out in full precision, then stored relative
// to the tile's middle. The middle itself stays in full precision on the main
// thread, so the graphics card only ever sees small numbers (see earth.js).
//
// Around the edge hangs a "skirt": a strip dropping straight down, so where a
// coarse tile meets a fine one the small mismatch shows as ground, not as a
// crack of sky.
//
// Grid points are evenly spaced in the tile's own (map) coordinates, so a
// point's place in the grid says exactly where it is: heightAt() below uses
// that to answer "how high is the ground here?" from the same numbers drawn.

import { toEarth, localFrame, tileLat, tileLon, metresPerDegree } from '../geo/earth.js';
import { PX, sample } from '../sources/terrarium.js';

export const GRID = 64;                     // squares along each tile edge

// One vertex: x, y, z (float, metres from the tile's middle), height (float,
// metres, for the colour), normal (3 signed bytes + 1 spare). 20 bytes.
export const STRIDE = 20;

// heights: 256 x 256 (or null for a flat tile at sea level).
// Returns { vertices (ArrayBuffer), indices (Uint16Array), centre [x,y,z],
// radius, minH, maxH, nodes (Float32Array of (GRID+1)^2 heights), size }.
export function buildTileMesh(z, x, y, heights, N = GRID) {
  const V = N + 1;
  const nodes = new Float32Array(V * V);
  let minH = Infinity, maxH = -Infinity;
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const h = heights ? sample(heights, (i / N) * (PX - 1), (j / N) * (PX - 1)) : 0;
      nodes[j * V + i] = h;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
  }

  // The middle: halfway across in map terms, at the middle height.
  const lonMid = tileLon(x + 0.5, z), latMid = tileLat(y + 0.5, z);
  const centre = toEarth(latMid, lonMid, (minH + maxH) / 2);

  // Every grid point in earth-centred metres, full precision.
  const pos = new Float64Array(V * V * 3);
  const lons = new Float64Array(V), lats = new Float64Array(V);
  for (let i = 0; i < V; i++) lons[i] = tileLon(x + i / N, z);
  for (let j = 0; j < V; j++) lats[j] = tileLat(y + j / N, z);
  const p = [0, 0, 0];
  let radius = 0;
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      toEarth(lats[j], lons[i], nodes[j * V + i], p);
      const k = (j * V + i) * 3;
      pos[k] = p[0] - centre[0]; pos[k + 1] = p[1] - centre[1]; pos[k + 2] = p[2] - centre[2];
      radius = Math.max(radius, Math.hypot(pos[k], pos[k + 1], pos[k + 2]));
    }
  }

  // Size of one grid square on the ground, and so how deep the skirt hangs:
  // enough to cover the mismatch with a coarser neighbour.
  const m = metresPerDegree(latMid);
  const size = Math.max((tileLon(x + 1, z) - tileLon(x, z)) * m.east, (tileLat(y, z) - tileLat(y + 1, z)) * m.north);
  const skirt = Math.min(50000, 30 + 2 * size / N);

  const skirtCount = 4 * V;
  const total = V * V + skirtCount;
  const buf = new ArrayBuffer(total * STRIDE);
  const f = new Float32Array(buf), b = new Int8Array(buf);
  const put = (v, x0, y0, z0, h, nx, ny, nz) => {
    const o = v * STRIDE / 4;
    f[o] = x0; f[o + 1] = y0; f[o + 2] = z0; f[o + 3] = h;
    const bo = v * STRIDE + 16;
    b[bo] = Math.round(nx * 127); b[bo + 1] = Math.round(ny * 127); b[bo + 2] = Math.round(nz * 127);
  };

  // Normals from the neighbouring points (one-sided at the edges).
  const nrm = new Float32Array(V * V * 3);
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const a = (j * V + Math.min(N, i + 1)) * 3, c = (j * V + Math.max(0, i - 1)) * 3;
      const d = (Math.min(N, j + 1) * V + i) * 3, e = (Math.max(0, j - 1) * V + i) * 3;
      const ex = pos[a] - pos[c], ey = pos[a + 1] - pos[c + 1], ez = pos[a + 2] - pos[c + 2];   // eastward
      const sx = pos[d] - pos[e], sy = pos[d + 1] - pos[e + 1], sz = pos[d + 2] - pos[e + 2];   // southward
      // east x south points down; south x east points up.
      let nx = sy * ez - sz * ey, ny = sz * ex - sx * ez, nz = sx * ey - sy * ex;
      const l = Math.hypot(nx, ny, nz) || 1;
      const k = (j * V + i) * 3;
      nrm[k] = nx / l; nrm[k + 1] = ny / l; nrm[k + 2] = nz / l;
    }
  }
  for (let v = 0; v < V * V; v++) {
    put(v, pos[3 * v], pos[3 * v + 1], pos[3 * v + 2], nodes[v], nrm[3 * v], nrm[3 * v + 1], nrm[3 * v + 2]);
  }

  // Skirt: a copy of each edge point, dropped straight down.
  let s = V * V;
  const edges = [];
  for (const edge of ['n', 's', 'w', 'e']) {
    edges.push(s);
    for (let t = 0; t < V; t++) {
      const src = edge === 'n' ? t : edge === 's' ? N * V + t : edge === 'w' ? t * V : t * V + N;
      const j = Math.floor(src / V), i = src % V;
      const up = localFrame(lats[j], lons[i]).up;
      put(s++, pos[3 * src] - up[0] * skirt, pos[3 * src + 1] - up[1] * skirt, pos[3 * src + 2] - up[2] * skirt,
        nodes[src] - skirt, nrm[3 * src], nrm[3 * src + 1], nrm[3 * src + 2]);   // its height goes down too, so under the sea it counts as under
    }
  }

  const idx = new Uint16Array((2 * N * N + 8 * N) * 3);
  let o = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * V + i, bb = a + 1, c = a + V, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = bb;
      idx[o++] = bb; idx[o++] = c; idx[o++] = d;
    }
  }
  ['n', 's', 'w', 'e'].forEach((edge, q) => {
    const k0 = edges[q];
    for (let t = 0; t < N; t++) {
      let s0, s1;
      if (edge === 'n') { s0 = t; s1 = t + 1; }
      else if (edge === 's') { s0 = N * V + t; s1 = s0 + 1; }
      else if (edge === 'w') { s0 = t * V; s1 = s0 + V; }
      else { s0 = t * V + N; s1 = s0 + V; }
      idx[o++] = s0; idx[o++] = k0 + t; idx[o++] = s1;
      idx[o++] = s1; idx[o++] = k0 + t; idx[o++] = k0 + t + 1;
    }
  });

  return { vertices: buf, indices: idx, centre, radius: radius + skirt, minH, maxH, nodes, size };
}

// Ground height at tile fractions (u east, v south, 0..1), on the same
// triangles the mesh draws: each square is cut a-c-b / b-c-d, so the diagonal
// runs b-c. Interpolating any other way would float or bury things on slopes.
export function heightAt(nodes, u, v, N = GRID) {
  const V = N + 1;
  const fu = Math.max(0, Math.min(N, u * N)), fv = Math.max(0, Math.min(N, v * N));
  const i = Math.min(N - 1, Math.floor(fu)), j = Math.min(N - 1, Math.floor(fv));
  const tx = fu - i, ty = fv - j;
  const a = nodes[j * V + i], b = nodes[j * V + i + 1], c = nodes[(j + 1) * V + i], d = nodes[(j + 1) * V + i + 1];
  if (tx + ty <= 1) return a + (b - a) * tx + (c - a) * ty;
  return d + (c - d) * (1 - tx) + (b - d) * (1 - ty);
}
