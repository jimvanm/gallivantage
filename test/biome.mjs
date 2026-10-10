// Trees from climate, height and slope (src/zones.js, src/biome.js) and vine
// rows (src/vines.js). The zone map is read from data/zones on disk.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setZoneReader, loadZones, rawZone, landZone, ZONES } from '../src/zones.js';
import { defaultRules, readSpot, plantTile, tileSeed, sunnyFrom, COVER, KINDS, TREE_STRIDE } from '../src/biome.js';
import { parcelRows, rowPieces } from '../src/vines.js';

setZoneReader(async (row, col) => {
  const f = new URL(`../data/zones/${row}-${col}.bin.gz`, import.meta.url);
  return existsSync(f) ? new Uint8Array(gunzipSync(readFileSync(f))) : null;
});
const zone = (lat, lon) => ZONES[landZone(lat, lon).zone];
const R = defaultRules();

// ---- the zone map ----
const PLACES = { banff: [51.178, -115.571], saba: [17.635, -63.232], naramata: [49.59, -119.59], campbellford: [44.30, -77.80],
  niagara: [43.20, -79.15], toronto: [43.65, -79.38], oahu: [21.47, -157.98], quito: [-0.22, -78.51], sahara: [23.4, 5.5], iqaluit: [63.75, -68.52] };
for (const [lat, lon] of Object.values(PLACES)) await loadZones(lat, lon, lat, lon);
assert.equal(ZONES[rawZone(...PLACES.campbellford)], 'Dfb', 'Campbellford: cold winter, warm summer');
assert.equal(ZONES[rawZone(...PLACES.banff)], 'Dfc', 'Banff town: cold, short summer');
assert.equal(ZONES[rawZone(...PLACES.naramata)], 'BSk', 'Naramata: dry steppe');
assert.equal(ZONES[rawZone(...PLACES.sahara)], 'BWh', 'the Sahara: hot desert');
assert.equal(ZONES[rawZone(...PLACES.saba)], 'sea', 'Saba is too small for the raw map');
assert.equal(zone(...PLACES.saba), 'Af', 'so it takes the latitude rule: tropical');
assert.equal(landZone(...PLACES.saba).how, 'latitude');
assert.ok(zone(...PLACES.oahu)[0] === 'A', 'Oahu: tropical, by latitude');
assert.ok(zone(...PLACES.iqaluit) === 'ET', 'Iqaluit: lowland tundra stays tundra');
// Banff's peaks are tundra on the raw map, but trees answer to the valley's zone there.
assert.equal(ZONES[rawZone(51.2, -115.62)] === 'ET' ? zone(51.2, -115.62) : 'Dfc', 'Dfc', 'a tundra pixel among Banff\'s peaks takes the valley zone');
assert.equal(rawZone(10, 200 - 360), rawZone(10, -160), 'longitude wraps');

// ---- the rules ----
const spot = (lat, lon, h, extra = {}) => readSpot({ lat, lon, h, slope: 0.1, sunny: 0, cover: COVER.WOOD, ...extra }, R);
const share = (s, ...kinds) => kinds.reduce((a, k) => a + (s.mix ? s.mix[KINDS.indexOf(k)] : 0), 0);
// Saba: tropical right to the top, no conifers anywhere.
for (const h of [20, 300, 600, 887]) {
  const s = spot(17.635, -63.232, h);
  assert.ok(s.density > 0.5, `Saba ${h} m: forest`);
  assert.equal(share(s, 'spire', 'pine', 'column'), 0, `Saba ${h} m: no conifers`);
}
assert.ok(share(spot(17.635, -63.232, 30), 'feather') > 0.1, 'Saba shore: palms');
assert.equal(share(spot(17.635, -63.232, 700), 'feather', 'fan'), 0, 'Saba high up: no palms');
// Banff: treeline a bit above 2,000 m; conifers; bare and snowy tops.
const b = spot(51.178, -115.571, 1400);
assert.ok(b.treeline > 1950 && b.treeline < 2350, 'Banff treeline ' + b.treeline);
assert.ok(share(b, 'spire', 'pine', 'column') > 0.8, 'Banff valley: mostly conifers');
assert.equal(share(b, 'feather', 'fan'), 0, 'no palms in Banff');
assert.equal(spot(51.178, -115.571, 2600).density, 0, 'no trees on Banff\'s tops');
assert.ok(b.snowline < 3000, 'Banff\'s 3,000 m peaks reach the snow');
assert.ok(share(spot(51.178, -115.571, 2000), 'spire') > share(b, 'spire'), 'spruce and fir take over near the treeline');
const sunnyLine = spot(51.178, -115.571, 1400, { sunny: 1 }).treeline, shadyLine = spot(51.178, -115.571, 1400, { sunny: -1 }).treeline;
assert.ok(sunnyLine > shadyLine, 'in the cold, the treeline is higher on the sunny side');
// The tropics: the treeline is far higher.
assert.ok(spot(-0.22, -78.51, 2800).treeline > 3500, 'near the equator the treeline is above 3,500 m');
// Okanagan: dry, open, pine; shady slopes hold more trees.
const o = spot(49.59, -119.59, 400, { cover: COVER.NONE });
assert.ok(o.density < 0.15, 'Okanagan open land: few trees ' + o.density);
assert.ok(share(o, 'pine') > 0.5, 'Okanagan: pines');
assert.ok(spot(49.59, -119.59, 400, { sunny: -1 }).density > spot(49.59, -119.59, 400, { sunny: 1 }).density, 'dry places: shady side denser');
// Cover and slope.
assert.equal(spot(44.3, -77.8, 150, { cover: COVER.GRASS }).density < spot(44.3, -77.8, 150).density, true, 'meadows: fewer than forest');
assert.equal(spot(44.3, -77.8, 150, { slope: 1.2 }).density, 0, 'no trees on cliffs');
assert.equal(spot(23.4, 5.5, 300, { cover: COVER.NONE }).density < 0.02, true, 'desert: almost none');
assert.ok(sunnyFrom(0, -0.3, 45) > 0.9 && sunnyFrom(0, -0.3, -45) < -0.9, 'a slope falling south faces the sun in the north, not in the south');

// ---- planting: the same tile gives the same trees, nothing kept ----
const ctx = (seed, cover = COVER.WOOD) => ({ seed, x0: 0, z0: 0, size: 300, latLon: (x, z) => [51.178 - z / 111000, -115.571 + x / 70000],
  ground: (x, z) => 1400 + x * 0.05, grad: () => [0.05, 0], cover: () => cover });
const t1 = plantTile(ctx(tileSeed(16, 11400, 22000)), R), t2 = plantTile(ctx(tileSeed(16, 11400, 22000)), R);
assert.deepEqual(t1, t2, 'same tile, same trees');
const n = t1.length / TREE_STRIDE;
assert.ok(n > 300 && n < 1200, 'about 100 trees a hectare in a forest: ' + n + ' on 9 ha');
assert.notDeepEqual(plantTile(ctx(tileSeed(16, 11401, 22000)), R), t1, 'another tile, other trees');
assert.equal(plantTile(ctx(1, COVER.FARM), R).length, 0, 'no trees in fields');
for (let i = 0; i < t1.length; i += TREE_STRIDE) assert.ok(t1[i] >= 0 && t1[i] <= 300 && t1[i + 1] >= 0 && t1[i + 1] <= 300, 'trees stay in their tile');
// Changing one rule moves no other tree: fewer trees, and every one of them was there before.
const thin = plantTile(ctx(tileSeed(16, 11400, 22000)), { ...R, density: 0.5 });
const keyOf = (a, i) => a[i].toFixed(3) + ',' + a[i + 1].toFixed(3);
const all = new Set(); for (let i = 0; i < t1.length; i += TREE_STRIDE) all.add(keyOf(t1, i));
for (let i = 0; i < thin.length; i += TREE_STRIDE) assert.ok(all.has(keyOf(thin, i)), 'thinning only removes trees');

// ---- vines ----
const square = (x, z) => x >= 0 && x <= 100 && z >= 0 && z <= 60;
const rows = parcelRows(square, [0, 0, 100, 60], [0, -0.1], 2.5);
assert.ok(rows.length >= 35 && rows.length <= 42, 'rows 2.5 m apart across 100 m: ' + rows.length);
for (const r of rows) assert.ok(r.L >= 55 && r.L <= 60, 'rows run down the slope (south to north here), the parcel\'s 60 m');
const flat = parcelRows(square, [0, 0, 100, 60], [0, 0], 2.5);
assert.ok(flat.every((r) => r.L > 90), 'flat ground: rows along the long side');
assert.ok(rows.every((r) => r.yb === rows[0].yb), 'one facing for the parcel');
const { pieces, caps } = rowPieces((x, z) => 100 - z * 0.1, rows[3], 7);
assert.equal(pieces.reduce((a, p) => a + p.len, 0), rows[3].L, 'pieces fill the row exactly');
assert.equal(caps.length, 2);
for (let i = 1; i < pieces.length; i++) assert.equal(pieces[i].from, pieces[i - 1].to, 'each piece starts on the outline the last one ended with');
assert.deepEqual(rowPieces((x, z) => 0, rows[3], 7), rowPieces((x, z) => 0, rows[3], 7), 'same row, same pieces');
console.log('biome: ok');
