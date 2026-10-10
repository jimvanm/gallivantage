// Vineyards: the map gives an outline only; these fill it with rows of the
// library's vine (library/farm), worked out on the spot from the outline.
//
// Rows run down the slope (or along the outline's long side where it is
// flat), snapped to the 256 facings so every piece of a row lines up. Each
// row is a chain of 10, 3 and 1 m pieces from three shared end outlines:
// a piece starts on the outline the last one ended with, and a cap closes
// each end. Pieces sit on the ground at their middle, sheared to the slope
// along them; one sink depth per row so neighbours never step. All as in
// the Tree Stand's approved stress test (LIBRARY.md, "The vine").

import { rng } from './biome.js';

// Rows for one parcel. inside(x, z): is the spot in the parcel. box: [x0, z0, x1, z1].
// grad: the parcel's average rise [east, south]. Returns [{ x0, z0, yb, L }].
export function parcelRows(inside, box, grad, spacing, minLen = 3) {
  const [bx0, bz0, bx1, bz1] = box;
  let ax, az;
  if (Math.hypot(grad[0], grad[1]) > 0.02) { ax = -grad[0]; az = -grad[1]; }      // down the slope
  else {
    // flat: along the parcel's long side (its main axis, from a rough sample)
    let sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, n = 0;
    const st = Math.max(2, Math.min(bx1 - bx0, bz1 - bz0) / 20);
    for (let z = bz0; z <= bz1; z += st) for (let x = bx0; x <= bx1; x += st) if (inside(x, z)) { sx += x; sz += z; sxx += x * x; szz += z * z; sxz += x * z; n++; }
    if (!n) return [];
    const mx = sx / n, mz = sz / n, cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz;
    const a = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    ax = Math.cos(a); az = Math.sin(a);
  }
  const yb = ((Math.round(Math.atan2(az, ax) / (2 * Math.PI) * 256) % 256) + 256) % 256;
  const a = yb / 256 * 2 * Math.PI, dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
  // the box's corners measured along (u) and across (v) the rows
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of [[bx0, bz0], [bx1, bz0], [bx0, bz1], [bx1, bz1]]) {
    const u = x * dx + z * dz, v = x * nx + z * nz;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const rows = [];
  // rows on a fixed lattice (multiples of the spacing), so a parcel cut in two by a map tile edge keeps its rows in line
  for (let v = Math.ceil(v0 / spacing) * spacing; v <= v1; v += spacing) {
    let start = null;
    for (let u = Math.floor(u0); u <= u1 + 1; u += 1) {
      const x = u * dx + v * nx, z = u * dz + v * nz, inn = u <= u1 && inside(x, z);
      if (inn && start === null) start = u;
      if (!inn && start !== null) {
        const L = Math.floor(u - start - 0.5);
        if (L >= minLen) rows.push({ x0: start * dx + v * nx + dx * 0.5, z0: start * dz + v * nz + dz * 0.5, yb, L });
        start = null;
      }
    }
  }
  return rows;
}

// One row as pieces and caps, standing on ground(x, z). seed: a number fixed for this row.
// Returns { pieces: [{ x, y, z, len, from, to, slope }], caps: [{ x, y, z, outline }] }.
export function rowPieces(ground, row, seed) {
  const r = rng(seed), { x0, z0, yb, L } = row;
  const a = yb / 256 * 2 * Math.PI, dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
  const mx = x0 + dx * L / 2, mz = z0 + dz * L / 2;
  const sink = 0.03 + 0.3 * Math.abs(ground(mx + nx * 0.3, mz + nz * 0.3) - ground(mx - nx * 0.3, mz - nz * 0.3)) / 0.6;
  const pieces = [], caps = [];
  let e = Math.floor(r() * 3), t = 0;
  caps.push({ x: x0, y: ground(x0, z0) - 0.04, z: z0, outline: e });
  while (L - t >= 1) {
    const len = [10, 3, 1].find((l) => l <= L - t), to = Math.floor(r() * 3), c = t + len / 2, x = x0 + dx * c, z = z0 + dz * c;
    const h0 = ground(x - dx * len / 2, z - dz * len / 2), h1 = ground(x + dx * len / 2, z + dz * len / 2);
    pieces.push({ x, y: (h0 + h1) / 2 - sink, z, len, from: e, to, slope: Math.max(-1, Math.min(1, (h1 - h0) / len)) });
    t += len; e = to;
  }
  const xe = x0 + dx * t, ze = z0 + dz * t;
  caps.push({ x: xe, y: ground(xe, ze) - 0.04, z: ze, outline: e });
  return { pieces, caps };
}
