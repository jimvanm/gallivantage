// What covers the ground in one map tile, for planting trees: a grid over the tile of the kinds of land in
// landuse.js, read from the map's areas and lines as that table says, with the ground each kind keeps clear; then
// buildings and roads (the app draws them, so no tree may stand on them) and the strips beside town streets, where
// street trees stand. Also how built up the land around each cell is (urban, 0..1).
//
// Everything here is plain arithmetic on the map tile's own numbers, so it runs in a helper or in the tests.
// The grid: N x N cells over the tile, row 0 at its north edge; cell (i, j) covers tile fraction
// [i / N, (i + 1) / N) east and [j / N, (j + 1) / N) south.

import { POLYGON, LINESTRING } from './mvt.js';
import { LAND, COVER, LAYER_ORDER, LAND_LINES, landCode } from './landuse.js';
import { ROAD_STYLE } from './roads.js';

export const COVER_N = 512;

// What land counts towards a town: tended land with no trees of its own planted (land use, houses, airports).
const TENDED = LAND.map((L) => L.town === 1 && L.id !== 'SPORT' && L.id !== 'VERGE');
const STREET_CLASSES = new Set(['primary', 'secondary', 'tertiary', 'minor']);   // town streets that have trees along them

// Fill rings (flat [x0, y0, x1, y1, ...] in grid units) into the grid, odd-even, row by row through cell middles.
export function fillRings(grid, N, rings, code) {
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (let i = 1; i < r.length; i += 2) { y0 = Math.min(y0, r[i]); y1 = Math.max(y1, r[i]); }
  const xs = [];
  for (let j = Math.max(0, Math.ceil(y0 - 0.5)); j <= Math.min(N - 1, Math.floor(y1 - 0.5)); j++) {
    const yc = j + 0.5;
    xs.length = 0;
    for (const r of rings) for (let i = 0, n = r.length; i < n; i += 2) {
      const ax = r[i], ay = r[i + 1], bx = r[(i + 2) % n], by = r[(i + 3) % n];
      if ((ay <= yc) !== (by <= yc)) xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) for (let i = Math.max(0, Math.ceil(xs[q] - 0.5)); i <= Math.min(N - 1, Math.floor(xs[q + 1] - 0.5)); i++) grid[j * N + i] = code;
  }
}

// Mark every cell within r cells of the line a-b (grid units) with code.
function stampLine(grid, N, ax, ay, bx, by, r, code) {
  const len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(len / Math.max(0.5, r * 0.7))), R = Math.ceil(r), r2 = r * r;
  for (let s = 0; s <= steps; s++) {
    const x = ax + (bx - ax) * s / steps, y = ay + (by - ay) * s / steps, ci = Math.floor(x), cj = Math.floor(y);
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const dx = i + 0.5 - x, dy = j + 0.5 - y;
      if (dx * dx + dy * dy <= r2) grid[j * N + i] = code;
    }
  }
}

// The cover grid of one map tile. layers: decoded map layers (mvt.js), with landcover's subclass (fullProps);
// tileMetres: the tile's width on the ground. Returns { cover (what the map says, for colouring), plant (what the
// planting sees: cover plus the margins round sports fields, buildings and roads), urban (0..1), N }.
export function tileCover(layers, tileMetres, N = COVER_N) {
  const cover = new Uint8Array(N * N), m = tileMetres / N;          // m: metres a cell
  const scaled = (L, f) => f.parts.map((ring) => ring.map((v) => v * N / L.extent));
  // the map's areas, each kind of land laid over the last (landuse.js LAYER_ORDER)
  for (const layer of LAYER_ORDER) {
    const L = layers[layer === 'sport' ? 'landuse' : layer]; if (!L) continue;
    for (const f of L.features) {
      if (f.type !== POLYGON) continue;
      const code = landCode(layer, f.cls, f.props && f.props.subclass);
      if (code !== null) fillRings(cover, N, scaled(L, f), code);
    }
  }
  const plant = cover.slice();
  // land that keeps ground clear round it (sports fields: 10 m), never over water
  LAND.forEach((row, code) => {
    if (!row.clear) return;
    const rs = Math.max(1, Math.round(row.clear / m));
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (cover[j * N + i] !== code) continue;
      for (let dj = -rs; dj <= rs; dj++) for (let di = -rs; di <= rs; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < N && jj < N && di * di + dj * dj <= rs * rs && plant[jj * N + ii] !== COVER.WATER) plant[jj * N + ii] = code;
      }
    }
  });
  // map lines that mark land, with ground kept clear each side (runways, taxiways)
  for (const [name, L] of Object.entries(layers)) {
    for (const f of L.features) {
      const mark = f.type === LINESTRING && LAND_LINES.get(`${name}|${f.cls}`);
      if (!mark) continue;
      const k = N / L.extent;
      for (const line of f.parts) for (let i = 2; i < line.length; i += 2) stampLine(plant, N, line[i - 2] * k, line[i - 1] * k, line[i] * k, line[i + 1] * k, mark[1] / m, mark[0]);
    }
  }
  // buildings and roads: drawn by the app, so no tree on them (roads with a metre and a half to spare each side)
  const structure = new Uint8Array(N * N);
  if (layers.building) {
    const L = layers.building;
    for (const f of L.features) if (f.type === POLYGON) fillRings(structure, N, scaled(L, f), 1);
  }
  // The strip beside a town street, where its trees stand: from the road's margin out another 4 m.
  const verge = new Uint8Array(N * N);
  if (layers.transportation) {
    const k = N / layers.transportation.extent;
    for (const f of layers.transportation.features) {
      if (f.type !== LINESTRING) continue;
      const st = ROAD_STYLE[f.cls] || (f.cls === 'rail' || f.cls === 'transit' ? { w: [6, 6] } : null);
      if (!st) continue;
      const r = (st.w[0] / 2 + 1.5) / m, street = STREET_CLASSES.has(f.cls);
      for (const line of f.parts) for (let i = 2; i < line.length; i += 2) {
        const ax = line[i - 2] * k, ay = line[i - 1] * k, bx = line[i] * k, by = line[i + 1] * k;
        stampLine(structure, N, ax, ay, bx, by, r, 1);
        if (street) stampLine(verge, N, ax, ay, bx, by, r + 4 / m, 1);
      }
    }
  }
  // Houses' land often stops at the street's edge: a street counts as a town street within 20 m of it.
  const yards = new Float64Array((N + 1) * (N + 1)), ry = Math.max(1, Math.round(20 / m));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) yards[(j + 1) * (N + 1) + i + 1] = (cover[j * N + i] === COVER.YARD ? 1 : 0) + yards[j * (N + 1) + i + 1] + yards[(j + 1) * (N + 1) + i] - yards[j * (N + 1) + i];
  const nearYard = (c) => {
    const i = c % N, j = (c - i) / N, i0 = Math.max(0, i - ry), i1 = Math.min(N, i + ry + 1), j0 = Math.max(0, j - ry), j1 = Math.min(N, j + ry + 1);
    return yards[j1 * (N + 1) + i1] - yards[j0 * (N + 1) + i1] - yards[j1 * (N + 1) + i0] + yards[j0 * (N + 1) + i0] > 0;
  };
  for (let c = 0; c < N * N; c++) {
    if (structure[c]) plant[c] = COVER.STRUCT;
    else if (verge[c] && (plant[c] === COVER.YARD || plant[c] === COVER.NONE && cover[c] === COVER.NONE && nearYard(c))) plant[c] = COVER.VERGE;
  }
  // How built up the land around each cell is: the share of the land (not water) within about 500 m that is
  // built-up land use, houses, buildings or roads, 15% counting as none and 50% or more as fully a town. Taken over
  // land only, so a shore or an island park beside a city counts as the city's. (Within this tile only.)
  const W = N + 1, sum = new Float64Array(W * W), land = new Float64Array(W * W), urban = new Float32Array(N * N), r = Math.max(1, Math.round(500 / m));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = j * N + i, b = TENDED[plant[c]] || structure[c] ? 1 : 0, l = cover[c] === COVER.WATER && !structure[c] ? 0 : 1;
    sum[(j + 1) * W + i + 1] = b + sum[j * W + i + 1] + sum[(j + 1) * W + i] - sum[j * W + i];
    land[(j + 1) * W + i + 1] = l + land[j * W + i + 1] + land[(j + 1) * W + i] - land[j * W + i];
  }
  const box = (g, i0, i1, j0, j1) => g[j1 * W + i1] - g[j0 * W + i1] - g[j1 * W + i0] + g[j0 * W + i0];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const i0 = Math.max(0, i - r), i1 = Math.min(N, i + r + 1), j0 = Math.max(0, j - r), j1 = Math.min(N, j + r + 1);
    const share = box(sum, i0, i1, j0, j1) / Math.max(1, box(land, i0, i1, j0, j1));
    urban[j * N + i] = Math.max(0, Math.min(1, (share - 0.15) / 0.35));
  }
  return { cover, plant, urban, N };
}

// The value at tile fraction (u east, v south), nearest cell.
export function atFraction(grid, N, u, v) {
  const i = Math.min(N - 1, Math.max(0, Math.floor(u * N))), j = Math.min(N - 1, Math.max(0, Math.floor(v * N)));
  return grid[j * N + i];
}
