// Layer 4, drawing: which ground tiles to fetch and which to draw.
//
// The world is a tree of tiles: each tile splits into four finer ones. Each
// frame we walk down from the coarsest tiles and split a tile when its grid
// squares would look bigger on screen than `detailPx` pixels.
//
// Three separate decisions (Terrain Walker learned this the hard way):
//   FETCH  every finer tile we want and do not have;
//   DRAW   the finest tiles we already hold that cover the view;
//   HOLD   a coarser tile is drawn until ALL its wanted finer tiles have
//          arrived, so nothing is replaced by a hole.
//
// Tiles behind the Earth (past the horizon) or outside the view are skipped.
// The coarsest tiles (zoom ROOT_Z) are always wanted, so there is always a
// floor to fall back on.

import { toEarth, tileLat, tileLon, B } from '../geo/earth.js';

export const ROOT_Z = 2;
const D2R = Math.PI / 180;
const HIGHEST = 8900, LOWEST = -500;       // metres: the most a tile not yet loaded can hold

// What we know about a tile before (or after) it loads: its middle, how far
// its corners reach from the middle (in angle and in metres), its height
// range, and the ground size of its grid squares.
export function tileInfo(z, x, y, loaded, N) {
  const minH = loaded ? loaded.minH : LOWEST, maxH = loaded ? loaded.maxH : HIGHEST;
  const lat = tileLat(y + 0.5, z), lon = tileLon(x + 0.5, z);
  const mid = toEarth(lat, lon, (minH + maxH) / 2);
  const dir = toEarth(lat, lon, 0), dl = Math.hypot(...dir);
  let radius = 0, ang = 0;
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]) {
    const la = tileLat(y + v, z), lo = tileLon(x + u, z);
    for (const h of [minH, maxH]) {
      const p = toEarth(la, lo, h);
      radius = Math.max(radius, Math.hypot(p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]));
    }
    const q = toEarth(la, lo, 0);
    const c = (q[0] * dir[0] + q[1] * dir[1] + q[2] * dir[2]) / (Math.hypot(...q) * dl);
    ang = Math.max(ang, Math.acos(Math.min(1, c)));
  }
  // Ground size of one grid square: the tile's longer side over N.
  const wide = (tileLon(x + 1, z) - tileLon(x, z)) * D2R * 6371000 * Math.cos(lat * D2R);
  const tall = (tileLat(y, z) - tileLat(y + 1, z)) * D2R * 6371000;
  return { mid, dirUnit: [dir[0] / dl, dir[1] / dl, dir[2] / dl], radius, ang, maxH, cell: Math.max(wide, tall) / N };
}

// Could any of this tile be seen past the curve of the Earth? Seen from
// height h, the horizon is acos(r / (r + h)) away round the curve; a peak of
// height H pokes over it from acos(r / (r + H)) further on.
export function pastHorizon(info, camDir, camH) {
  // Measured from the deepest the ground goes (the ocean floor, 11 km down),
  // and the Earth's smaller radius: both make the horizon farther, so the test
  // errs on the side of drawing. A camera below sea level (the Dead Sea, a
  // valley under the made-up sea of a test) still sees round it.
  const r = B - 11000;
  const reach = Math.acos(r / (B + Math.max(-10000, camH))) + Math.acos(r / (B + Math.max(0, info.maxH))) + info.ang;
  const c = camDir[0] * info.dirUnit[0] + camDir[1] * info.dirUnit[1] + camDir[2] * info.dirUnit[2];
  return Math.acos(Math.max(-1, Math.min(1, c))) > reach;
}

// view: { cam: [x,y,z] earth-centred, camDir: unit, camH: metres above the
//         ellipsoid, planes: [[a,b,c,d] x 6] in camera-relative metres (a
//         point p is inside when a*p.x + b*p.y + c*p.z + d >= 0 for all),
//         pxPerRadian: screen height / field of view, detailPx, maxZ, N }
// tiles:  Map key -> loaded tile (needs minH, maxH)
// Returns { draw: [keys], fetch: [{ key, z, x, y, dist }], keep: Set of keys }
//   keep: every tile held that this view still needs: those drawn, the
//   coarser ones above them, and finer ones waiting for their brothers and
//   sisters to arrive. Throwing one of those away means fetching it again,
//   and a coarse tile waiting for four finer ones that keep being thrown
//   away flickers for ever.
export function selectTiles(view, tiles, infoCache = new Map()) {
  const draw = [], fetch = [], keep = new Set();
  const key = (z, x, y) => z + '/' + x + '/' + y;
  const info = (z, x, y) => {
    const k = key(z, x, y), t = tiles.get(k);
    let i = infoCache.get(k);
    if (!i || i.loaded !== !!t) { i = tileInfo(z, x, y, t, view.N); i.loaded = !!t; infoCache.set(k, i); }
    return i;
  };
  const dist = (i) => Math.max(1, Math.hypot(i.mid[0] - view.cam[0], i.mid[1] - view.cam[1], i.mid[2] - view.cam[2]) - i.radius);
  const seen = (i) => {
    if (pastHorizon(i, view.camDir, view.camH)) return false;
    const px = i.mid[0] - view.cam[0], py = i.mid[1] - view.cam[1], pz = i.mid[2] - view.cam[2];
    for (const p of view.planes) if (p[0] * px + p[1] * py + p[2] * pz + p[3] < -i.radius) return false;
    return true;
  };
  const want = (z, x, y, i) => { if (!tiles.has(key(z, x, y))) fetch.push({ key: key(z, x, y), z, x, y, dist: dist(i) }); };

  const visit = (z, x, y) => {
    const i = info(z, x, y);
    if (!seen(i)) return;
    if (tiles.has(key(z, x, y))) keep.add(key(z, x, y));
    const split = z < view.maxZ && i.cell / dist(i) * view.pxPerRadian > view.detailPx;
    if (split) {
      const kids = [];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const kx = 2 * x + dx, ky = 2 * y + dy, ki = info(z + 1, kx, ky);
        // Kept even when out of sight: its real heights are what show it is
        // out of sight. Thrown away, it might reach 8,900 m, would count as
        // in sight and missing, and its parent would stop going finer.
        if (tiles.has(key(z + 1, kx, ky))) keep.add(key(z + 1, kx, ky));
        if (!seen(ki)) continue;
        kids.push([kx, ky]);
        want(z + 1, kx, ky, ki);
      }
      // HOLD: go finer only once every child that is needed has arrived.
      if (kids.every(([kx, ky]) => tiles.has(key(z + 1, kx, ky)))) {
        for (const [kx, ky] of kids) visit(z + 1, kx, ky);
        return;
      }
    }
    if (tiles.has(key(z, x, y))) draw.push(key(z, x, y));
  };

  const n = 2 ** ROOT_Z;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Roots: always fetched, seen or not, so there is always a floor.
      if (!tiles.has(key(ROOT_Z, x, y))) fetch.push({ key: key(ROOT_Z, x, y), z: ROOT_Z, x, y, dist: 0 });
      else keep.add(key(ROOT_Z, x, y));
      visit(ROOT_Z, x, y);
    }
  }
  // Coarse first (they unlock the finer ones), then nearest first.
  fetch.sort((a, b) => a.z - b.z || a.dist - b.dist);
  return { draw, fetch, keep };
}

