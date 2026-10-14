// Trees in the app: the ground cover grid (src/forestcover.js), one zoom-16 tile planted as the helper does it
// (src/treetile.js), and the shape numbering the helper and the drawer must share (forest.js shapeCatalog).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setZoneReader, loadZones } from '../src/zones.js';
import { COVER, defaultRules } from '../src/biome.js';
import { POLYGON, LINESTRING } from '../src/mvt.js';
import { tileCover, atFraction, fillRings } from '../src/forestcover.js';
import { landCode as coverCode, LAND } from '../src/landuse.js';
import { shapeCatalog } from '../src/forest.js';
import { plantTreeTile } from '../src/treetile.js';
import { mercToTile, lonToMercX, latToMercY } from '../src/geo.js';
import { GRID } from '../src/heightgrid.js';

setZoneReader(async (row, col) => {
  const f = new URL(`../data/zones/${row}-${col}.bin.gz`, import.meta.url);
  return existsSync(f) ? new Uint8Array(gunzipSync(readFileSync(f))) : null;
});
const LIB = { ...JSON.parse(readFileSync(new URL('../library/trees/models.json', import.meta.url))), ...JSON.parse(readFileSync(new URL('../library/farm/models.json', import.meta.url))) };

// ---- cover codes and filling ----
assert.equal(coverCode('landcover', 'wood'), COVER.WOOD);
assert.equal(coverCode('landcover', 'farmland', 'vineyard'), COVER.VINEYARD);
assert.equal(coverCode('landcover', 'grass', 'park'), COVER.PARK);
assert.equal(coverCode('landuse', 'residential'), COVER.YARD, 'houses and their yards');
assert.equal(coverCode('landuse', 'commercial'), COVER.BUILT);
assert.equal(coverCode('sport', 'pitch'), COVER.SPORT);
assert.equal(coverCode('sport', 'residential'), null);
{
  const g = new Uint8Array(100); fillRings(g, 10, [[2, 2, 8, 2, 8, 8, 2, 8]], 5);
  assert.equal(g.filter((v) => v === 5).length, 36, 'a 6 x 6 square fills 36 cells');
}

// ---- one tile's cover ----
const E = 4096, sq = (x0, y0, x1, y1) => [[x0, y0, x1, y0, x1, y1, x0, y1]];
const layers = {
  landcover: { extent: E, features: [{ type: POLYGON, cls: 'wood', props: {}, parts: sq(0, 0, E, E / 2) }] },
  landuse: { extent: E, features: [
    { type: POLYGON, cls: 'residential', parts: sq(0, E / 2, E, E) },
    { type: POLYGON, cls: 'pitch', parts: sq(1000, 1000, 1400, 1400) }] },
  building: { extent: E, features: [{ type: POLYGON, cls: 'building', parts: sq(3000, 3000, 3100, 3100) }] },
  transportation: { extent: E, features: [{ type: LINESTRING, cls: 'primary', parts: [[0, 3500, E, 3500]] }] },
};
const T = tileCover(layers, 2400, 512);
const at = (g, u, v) => atFraction(g, 512, u, v);
assert.equal(at(T.cover, 0.1, 0.1), COVER.WOOD);
assert.equal(at(T.cover, 1200 / E, 1200 / E), COVER.SPORT, 'the pitch');
assert.equal(at(T.plant, 1405 / E, 1200 / E), COVER.SPORT, 'its 10 m margin is kept clear');
assert.equal(at(T.plant, 1600 / E, 1200 / E), COVER.WOOD, '... and no more');
assert.equal(at(T.plant, 3050 / E, 3050 / E), COVER.STRUCT, 'no tree on a building');
assert.equal(at(T.plant, 0.5, 3500 / E), COVER.STRUCT, 'or on a road');
assert.equal(at(T.cover, 0.5, 3500 / E), COVER.YARD, 'the cover itself is unchanged');
// the primary road is 11 m wide: kept clear to 7 m from its middle, then a 4 m strip for its trees
const mE = 2400 / E;
assert.equal(at(T.plant, 0.5, (3500 + 9 / mE) / E), COVER.VERGE, 'a strip beside a town street for its trees');
assert.equal(at(T.plant, 0.5, (3500 - 9 / mE) / E), COVER.VERGE, '... on both sides');
assert.equal(at(T.plant, 0.5, (3500 + 16 / mE) / E), COVER.YARD, 'then yards');
assert.ok(at(T.urban, 0.5, 0.95) > 0.9 && at(T.urban, 0.5, 0.02) < 0.5, 'town in the built half, much less in the wood');
{
  const A = tileCover({
    landcover: { extent: E, features: [{ type: POLYGON, cls: 'grass', props: {}, parts: sq(0, 0, E, E) }] },
    aeroway: { extent: E, features: [{ type: POLYGON, cls: 'aerodrome', parts: sq(0, 0, 2000, 2000) }, { type: LINESTRING, cls: 'runway', parts: [[2500, 0, 2500, E]] }] },
  }, 2400, 512);
  assert.equal(atFraction(A.plant, 512, 0.2, 0.2), COVER.AIRPORT, 'no trees inside an airport');
  assert.equal(atFraction(A.plant, 512, (2500 + 100) / E, 0.5), COVER.AIRPORT, 'nor 60 m from a runway');
  assert.equal(atFraction(A.plant, 512, (2500 + 160) / E, 0.5), COVER.GRASS, '... but 95 m away is fine');
  assert.equal(atFraction(A.cover, 512, 0.2, 0.2), COVER.AIRPORT, 'the map\'s airport outline is airport land');
}
{
  // a street outside the houses' land but next to it still gets its trees; one far from houses does not
  const S = tileCover({
    landuse: { extent: E, features: [{ type: POLYGON, cls: 'residential', parts: sq(0, 0, E, 2000) }] },
    transportation: { extent: E, features: [{ type: LINESTRING, cls: 'minor', parts: [[0, 2010, E, 2010]] }, { type: LINESTRING, cls: 'minor', parts: [[0, 3800, E, 3800]] }] },
  }, 2400, 512);
  assert.equal(atFraction(S.plant, 512, 0.5, (2010 + 6 / mE) / E), COVER.VERGE, 'street at the edge of the houses: trees');
  assert.equal(atFraction(S.plant, 512, 0.5, (3800 + 6 / mE) / E), COVER.NONE, 'country road: no row of trees');
}
// the table decides: unknown land use takes no trees, unknown land cover is nothing mapped
assert.equal(coverCode('landuse', 'something_new'), COVER.BUILT, 'unknown land use: tended, no trees');
assert.equal(coverCode('landcover', 'something_new'), null, 'unknown land cover: nothing mapped');
assert.equal(coverCode('landuse', 'pitch'), null, 'sports fields are laid down in their own turn');
for (const L of LAND) assert.ok(L.id && L.name, 'every kind of land has a name');
console.log('trees_app: cover ok');

// ---- the shape numbering ----
const cat = shapeCatalog(LIB);
let n = 0;
for (const k of cat.kinds) for (const s of k.shapes) assert.equal(s.n, n++, 'shapes numbered in order');
assert.ok(n < 256, 'every shape fits in a byte');
assert.equal(cat.styles.length, 8, 'eight tree styles');
assert.ok(cat.pieceShape(10, 1, 2).n > cat.styles[7].at(-1).n, 'vines after the trees');

// ---- a tile planted as the helper does it (Riverdale Park, Toronto) ----
const lat = 43.6695, lon = -79.3525, t = mercToTile(lonToMercX(lon), latToMercY(lat), 16);
const x = Math.floor(t.x), y = Math.floor(t.y);
await loadZones(lat, lon, lat, lon);
const V = GRID + 1, nodes = new Float32Array(V * V);
for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) nodes[j * V + i] = 100 + i * 0.5;   // rising to the east
const wood = tileCover({ landcover: { extent: E, features: [{ type: POLYGON, cls: 'wood', props: {}, parts: sq(0, 0, E, E) }] } }, 1760, 512);
const R = defaultRules();
const a = plantTreeTile(x, y, 1, nodes, wood, cat.styles, R);
assert.ok(a.n > 2000, 'a wooded zoom-16 tile (about 440 m across here) has thousands of trees: ' + a.n);
assert.deepEqual(plantTreeTile(x, y, 1, nodes, wood, cat.styles, R).u8, a.u8, 'same address, same trees');
assert.ok(Math.abs(a.lat - lat) < 0.01 && Math.abs(a.lon - lon) < 0.01, 'its middle is where it should be');
const f = new Float32Array(a.u8.buffer);
let xmax = 0, zmax = 0;
for (let i = 0; i < a.n; i++) { xmax = Math.max(xmax, Math.abs(f[i * 5])); zmax = Math.max(zmax, Math.abs(f[i * 5 + 2])); }
assert.ok(xmax < 222 && xmax > 200 && zmax < 222 && zmax > 200, 'trees spread over the tile round its middle: ' + xmax.toFixed(0) + ', ' + zmax.toFixed(0));
// heights from the nodes: the tile is the (x & 3)th quarter east of its zoom-14 tile, so its ground rises from there
const g0 = 100 + (x & 3) * 32 * 0.5, g1 = g0 + 32 * 0.5;
for (let i = 0; i < a.n; i++) assert.ok(f[i * 5 + 1] > g0 - 1 && f[i * 5 + 1] < g1 + 1, 'standing on the ground under it');
const q = plantTreeTile(x, y, 0.25, nodes, wood, cat.styles, R);
assert.deepEqual(q.u8, a.u8.subarray(0, q.n * 20), 'a quarter share is the front of the full list');
const none = plantTreeTile(x, y, 1, nodes, tileCover({ landuse: { extent: E, features: [{ type: POLYGON, cls: 'pitch', parts: sq(0, 0, E, E) }] } }, 1760, 512), cat.styles, R);
assert.equal(none.n, 0, 'no trees on a sports field');
// ---- town trees: streets broadleaf; no big conifers in yards, streets or parks ----
{
  const { readSpot, plantTile, KINDS } = await import('../src/biome.js');
  const st = readSpot({ lat, lon, h: 100, slope: 0, sunny: 0, cover: COVER.VERGE }, R);
  assert.ok(st.density > 0 && st.urban === 1, 'street trees, as town trees');
  for (const k of ['spire', 'pine', 'column']) assert.equal(st.mix[KINDS.indexOf(k)], 0, 'no ' + k + ' on a street');
  assert.ok(readSpot({ lat, lon, h: 100, slope: 0, sunny: 0, cover: COVER.PARK }, R).urban >= 0.8, 'a park counts as town');
  for (const cover of [COVER.PARK, COVER.YARD]) {
    const t = plantTile({ seed: 7, x0: 0, z0: 0, size: 600, latLon: () => [lat, lon], ground: () => 100, grad: () => [0, 0], cover: () => cover }, R);
    let big = 0, n = 0;
    for (let i = 0; i < t.length; i += 8) { n++; if (t[i + 2] <= 2 && t[i + 3] > 0.62) big++; }
    assert.ok(n > 100 && big === 0, 'no old conifers (' + n + ' trees, cover ' + cover + ')');
  }
}
console.log('trees_app: tile ok');
