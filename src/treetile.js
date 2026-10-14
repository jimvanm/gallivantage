// One zoom-16 tile of trees for the app, made in a helper (nearworker.js). Nothing is stored: the same tile always
// gives the same trees (biome.js tileSeed), from the map's ground cover (forestcover.js), the climate (zones.js) and
// the drawn ground's own heights (the same height nodes the buildings stand on).
//
// The tile's trees are in its own local axes: metres east (x) and south (z) of the tile's middle, at that point on
// the round Earth (globe.js), y the height above the ellipsoid as the height tiles give it. The main thread places the
// tile as the buildings' tiles are placed.

import { tileSizeMerc, tileToMerc, tileCentreMerc, mercYToLat, mercXToLon } from './geo.js';
import { mercScales } from './globe.js';
import { nodeHeightAt } from './heightgrid.js';
import { tileSeed } from './biome.js';
import { makeTrees } from './forest.js';
import { atFraction } from './forestcover.js';

export const TREE_Z = 16;        // trees are planted per zoom-16 tile, as in the Biome Lab
export const COVER_Z = 14;       // ... from the cover and heights of the zoom-14 tile holding it

// x, y: the zoom-16 tile; keep: the share of its trees wanted (forest.js shareToMake); nodes: the zoom-14 tile's
// height nodes (heightgrid.js meshNodes); area: its tileCover; styles and rules as for makeTrees.
// Returns a batch (forest.js makeTrees) with lat and lon: where its middle is.
export function plantTreeTile(x, y, keep, nodes, area, styles, rules) {
  const d = TREE_Z - COVER_Z, nw = tileToMerc(x >> d, y >> d, COVER_Z), s14 = tileSizeMerc(COVER_Z);
  const c = tileCentreMerc(x, y, TREE_Z), lat = mercYToLat(c.y), lon = mercXToLon(c.x);
  const [sE, sS] = mercScales(lat), size = tileSizeMerc(TREE_Z) * sE;
  // Planting runs in a square frame (metres east, both ways); south is put right after (sS / sE, at most 0.3%).
  const uOf = (x) => (c.x + x / sE - nw.x) / s14, vOf = (z) => (nw.y - c.y + z / sE) / s14;
  const ground = (x, z) => nodeHeightAt(nodes, uOf(x), vOf(z));
  const T = makeTrees({
    seed: tileSeed(TREE_Z, x, y), x0: -size / 2, z0: -size / 2, size, keep,
    latLon: (x, z) => [mercYToLat(c.y - z / sE), mercXToLon(c.x + x / sE)],
    ground,
    grad: (x, z) => [(ground(x + 1, z) - ground(x - 1, z)) / 2, (ground(x, z + 1) - ground(x, z - 1)) / 2],
    cover: (x, z) => atFraction(area.plant, area.N, uOf(x), vOf(z)),
    urban: (x, z) => atFraction(area.urban, area.N, uOf(x), vOf(z)),
  }, rules, styles);
  const f = new Float32Array(T.u8.buffer), k = sS / sE;
  for (let i = 0; i < T.n; i++) f[i * 5 + 2] *= k;
  return { ...T, cx: 0, cz: 0, lat, lon };
}
