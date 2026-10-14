// What covers the ground in one map tile, for planting trees (src/biome.js COVER codes): a grid over the tile, read
// from the map's land use, land cover and water, then sports fields (with a 10 m margin), buildings and roads (which
// the app draws, so no tree may stand on them). Also how built up the land around each cell is (urban, 0..1).
//
// Everything here is plain arithmetic on the map tile's own numbers, so it runs in a helper or in the tests.
// The grid: N x N cells over the tile, row 0 at its north edge; cell (i, j) covers tile fraction
// [i / N, (i + 1) / N) east and [j / N, (j + 1) / N) south.

import { POLYGON, LINESTRING } from './mvt.js';
import { COVER } from './biome.js';
import { ROAD_STYLE } from './roads.js';

export const COVER_N = 512;

const BUILT_USE = new Set(['residential', 'commercial', 'industrial', 'retail', 'railway', 'garages', 'school', 'university', 'college',
  'kindergarten', 'library', 'hospital', 'military', 'stadium', 'bus_station', 'dam']);
const GREEN_USE = new Set(['cemetery', 'zoo', 'theme_park']);
const SPORT_USE = new Set(['pitch', 'playground', 'track']);

// The cover code for one map shape, or null for none.
export function coverCode(layer, cls, sub) {
  if (layer === 'water') return COVER.WATER;
  if (layer === 'sport') return SPORT_USE.has(cls) ? COVER.SPORT : null;
  if (layer === 'landuse') return BUILT_USE.has(cls) ? COVER.BUILT : GREEN_USE.has(cls) ? COVER.PARK : cls === 'quarry' ? COVER.ROCK : null;
  if (cls === 'wood' || cls === 'forest') return COVER.WOOD;
  if (cls === 'farmland') return sub === 'vineyard' ? COVER.VINEYARD : sub === 'orchard' ? COVER.ORCHARD : COVER.FARM;
  if (cls === 'grass') return ['scrub', 'heath', 'fell'].includes(sub) ? COVER.SCRUB : ['park', 'garden', 'village_green', 'recreation_ground'].includes(sub) ? COVER.PARK : COVER.GRASS;
  return { rock: COVER.ROCK, ice: COVER.ICE, sand: COVER.SAND, wetland: COVER.WETLAND }[cls] ?? null;
}

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
  const polys = (layer, src, codeOf) => {
    const L = layers[src]; if (!L) return;
    const k = N / L.extent;
    for (const f of L.features) {
      if (f.type !== POLYGON) continue;
      const code = codeOf(f); if (code === null) continue;
      fillRings(cover, N, f.parts.map((ring) => ring.map((v) => v * k)), code);
    }
  };
  // land use first, then land cover over it, then sports fields (the map lays park grass over them), then water
  polys('landuse', 'landuse', (f) => coverCode('landuse', f.cls));
  polys('landcover', 'landcover', (f) => coverCode('landcover', f.cls, f.props && f.props.subclass));
  polys('sport', 'landuse', (f) => coverCode('sport', f.cls));
  polys('water', 'water', () => COVER.WATER);
  const plant = cover.slice();
  // trees keep 10 m back from sports fields
  const rs = Math.max(1, Math.round(10 / m));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (cover[j * N + i] !== COVER.SPORT) continue;
    for (let dj = -rs; dj <= rs; dj++) for (let di = -rs; di <= rs; di++) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < N && jj < N && di * di + dj * dj <= rs * rs && plant[jj * N + ii] !== COVER.WATER) plant[jj * N + ii] = COVER.SPORT;
    }
  }
  // buildings and roads: drawn by the app, so no tree on them (roads with a metre and a half to spare each side)
  const structure = new Uint8Array(N * N);
  if (layers.building) {
    const k = N / layers.building.extent;
    for (const f of layers.building.features) if (f.type === POLYGON) fillRings(structure, N, f.parts.map((ring) => ring.map((v) => v * k)), 1);
  }
  if (layers.transportation) {
    const k = N / layers.transportation.extent;
    for (const f of layers.transportation.features) {
      if (f.type !== LINESTRING) continue;
      const st = ROAD_STYLE[f.cls] || (f.cls === 'rail' || f.cls === 'transit' ? { w: [6, 6] } : null);
      if (!st) continue;
      const r = (st.w[0] / 2 + 1.5) / m;
      for (const line of f.parts) for (let i = 2; i < line.length; i += 2) stampLine(structure, N, line[i - 2] * k, line[i - 1] * k, line[i] * k, line[i + 1] * k, r, 1);
    }
  }
  for (let c = 0; c < N * N; c++) if (structure[c]) plant[c] = COVER.STRUCT;
  // How built up the land around each cell is: the share of the ground within about 500 m that is built-up land
  // use, buildings or roads, 15% counting as none and 50% or more as fully a town. (Within this tile only.)
  const sum = new Float64Array((N + 1) * (N + 1)), urban = new Float32Array(N * N), r = Math.max(1, Math.round(500 / m));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = j * N + i, b = cover[c] === COVER.BUILT || structure[c] ? 1 : 0;
    sum[(j + 1) * (N + 1) + i + 1] = b + sum[j * (N + 1) + i + 1] + sum[(j + 1) * (N + 1) + i] - sum[j * (N + 1) + i];
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const i0 = Math.max(0, i - r), i1 = Math.min(N, i + r + 1), j0 = Math.max(0, j - r), j1 = Math.min(N, j + r + 1);
    const share = (sum[j1 * (N + 1) + i1] - sum[j0 * (N + 1) + i1] - sum[j1 * (N + 1) + i0] + sum[j0 * (N + 1) + i0]) / ((i1 - i0) * (j1 - j0));
    urban[j * N + i] = Math.max(0, Math.min(1, (share - 0.15) / 0.35));
  }
  return { cover, plant, urban, N };
}

// The value at tile fraction (u east, v south), nearest cell.
export function atFraction(grid, N, u, v) {
  const i = Math.min(N - 1, Math.max(0, Math.floor(u * N))), j = Math.min(N - 1, Math.max(0, Math.floor(v * N)));
  return grid[j * N + i];
}
