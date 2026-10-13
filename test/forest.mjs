// The forest's shared workings (src/forest.js): tiles of trees, the far share, dot outlines, the distances, and
// the keeper that holds tiles. Drawing (src/forestdraw.js) needs a card and is checked in the Biome Lab.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setZoneReader, loadZones } from '../src/zones.js';
import { defaultRules, tileSeed, COVER } from '../src/biome.js';
import { VIEW_DEFAULTS, thinAt, levelFor, dotBand, reach, makeTrees, prefixBelow, insideRings, makeVines, traceOutline, farLook, ForestKeeper, BANDS } from '../src/forest.js';

setZoneReader(async (row, col) => {
  const f = new URL(`../data/zones/${row}-${col}.bin.gz`, import.meta.url);
  return existsSync(f) ? new Uint8Array(gunzipSync(readFileSync(f))) : null;
});
await loadZones(51.178, -115.571, 51.178, -115.571);
const LIB = JSON.parse(readFileSync(new URL('../library/trees/models.json', import.meta.url)));
const FARM = JSON.parse(readFileSync(new URL('../library/farm/models.json', import.meta.url)));
const V = VIEW_DEFAULTS;

// ---- distances ----
assert.deepEqual(V, { near: 200, fade: 0.35, range: 2500, thinFrom: 2500, dotFade: 0.6, dotRange: 10000 }, 'Jim\'s starting distances');
assert.equal(thinAt(1000, V), 1, 'all dots kept up to thinFrom');
assert.equal(thinAt(5000, V), 1 / 8, 'then (thinFrom / d) cubed');
assert.equal(thinAt(1e6, V), 1 / 64, 'never fewer than 1 in 64');
assert.equal(levelFor(5000, V), 1 / 8);
assert.equal(levelFor(4000, V), 1 / 4, 'rounded up to a power of two');
assert.deepEqual(dotBand(V), [6000, 10000]);
assert.deepEqual(dotBand({ ...V, dotRange: 2000 }), [2500, 2500], 'dots never start melting before the trees have all gone');
assert.equal(reach(V), 10000); assert.equal(reach(V, false), 2500);

// ---- a tile of trees ----
const styles = ['spire', 'pine', 'column', 'round', 'oval', 'spread', 'feather', 'fan'].map((k, ki) => {
  const out = []; for (let i = 1; LIB[`${k}-${i}`]; i++) out.push({ H: 10 + i, W: 4 + i, n: ki * 10 + i }); return out;
});
const ctx = (keep, inside) => ({ seed: tileSeed(16, 11400, 22000), x0: 0, z0: 0, size: 300, keep, inside,
  latLon: (x, z) => [51.178 - z / 111000, -115.571 + x / 70000], ground: (x, z) => 1400 + x * 0.05, grad: () => [0.05, 0], cover: () => COVER.WOOD });
const R = defaultRules();
const all = makeTrees(ctx(1), R, styles);
assert.equal(all.u8.length, all.n * 20, '20 bytes a tree');
assert.ok(all.n > 1000 && all.n < 3000, 'about 250 a hectare on 9 ha: ' + all.n);
assert.deepEqual(makeTrees(ctx(1), R, styles).u8, all.u8, 'same tile, same trees, nothing stored');
for (let i = 1; i < all.n; i++) assert.ok(all.u8[i * 20 + 16] >= all.u8[(i - 1) * 20 + 16], 'sorted by facing number');
const f32 = new Float32Array(all.u8.buffer);
for (let i = 0; i < all.n; i++) assert.ok(Math.abs(f32[i * 5 + 1] - (1400 + f32[i * 5] * 0.05 - 0.3)) < 1e-3, 'each stands on the ground (0.3 m into it)');
const quarter = makeTrees(ctx(0.25), R, styles);
assert.equal(quarter.n, prefixBelow(all, 0.25), 'a quarter-share tile is exactly the full tile\'s front quarter');
assert.deepEqual(quarter.u8, all.u8.subarray(0, quarter.n * 20), '... the same trees, byte for byte');
const half = makeTrees(ctx(1, (x) => x < 150), R, styles);
assert.ok(half.n > all.n * 0.4 && half.n < all.n * 0.6, 'inside() keeps only the trees in the area');
assert.equal(all.tree, true);

// ---- vines ----
const sq = [new Float64Array([0, 0, 100, 0, 100, 60, 0, 60])];
assert.ok(insideRings(sq, 50, 30) && !insideRings(sq, 150, 30));
const shape = { H: 1.8, W: 10, n: 99 };
const v = makeVines({ rings: sq, box: [0, 0, 100, 60], cx: 50, cz: 30, rad: 58 }, 3, { ground: (x, z) => 100 - z * 0.1, grad: () => [0, -0.1], step: 5 }, 2.6, () => shape, () => shape);
assert.ok(v.rows > 30 && v.n > v.rows * 3, 'rows of pieces and caps: ' + v.rows + ' rows, ' + v.n + ' pieces');
assert.equal(v.tree, false);

// ---- dot outlines ----
const spire = traceOutline(LIB['spire-far']), round = traceOutline(LIB['round-far']), column = traceOutline(LIB['column-far']);
assert.equal(spire.hw.length, BANDS); assert.equal(spire.col.length, BANDS * 3);
for (const o of [spire, round, column]) for (const w of o.hw) assert.ok(w >= 0 && w <= 0.5 + 1e-6, 'widths within the shape');
const widest = (o) => o.hw.indexOf(Math.max(...o.hw));
assert.ok(widest(spire) < BANDS / 2, 'a spruce is widest low down');
assert.ok(spire.hw[BANDS - 1] < spire.hw[widest(spire)] * 0.5, '... and comes to a point');
assert.ok(widest(round) >= BANDS / 3, 'a round crown is widest higher up');
assert.ok([...column.hw].filter((w) => w > Math.max(...column.hw) * 0.6).length >= BANDS / 2, 'a column keeps most of its width over most of its height');
for (let i = 0; i < spire.col.length; i++) assert.ok(spire.col[i] >= 0 && spire.col[i] <= 1, 'colours 0..1');
const look = farLook(LIB['spire-far'], [10, 20, 30]);
assert.equal(look.H, 20); assert.ok(look.rgb[1] > look.rgb[0], 'leaf colour: green');
assert.ok(FARM['vine-cap-1'], 'farm shapes readable');

// ---- the keeper ----
{
  const k = new ForestKeeper(); let made = 0;
  const item = (key, d, keep) => ({ key, d, keep, make: () => { made++; return { cx: d, cz: 0, rad: 10, n: 1, keep, tree: true }; } });
  k.want([item('far', 900, 1 / 4), item('near', 100, 1)], [0, 0, 0], () => 1000);
  assert.deepEqual(k.queue.map((q) => q.key), ['near', 'far'], 'nearest first');
  k.makeSome(1000);
  assert.equal(made, 2); assert.equal(k.live.size, 2); assert.equal(k.made.tiles, 2);
  k.want([item('far', 900, 1 / 4), item('near', 100, 1)], [0, 0, 0], () => 1000);
  assert.equal(k.queue.length, 0, 'nothing made twice');
  k.want([item('far', 300, 1), item('near', 100, 1)], [0, 0, 0], () => 1000);
  assert.equal(k.queue.length, 1, 'a tile coming closer is made again with more of its trees');
  k.want([], [5000, 0, 0], () => 1000);
  assert.equal(k.live.size, 0, 'tiles out of reach are dropped');
}
console.log('forest: ok');

// Tiles are made with headroom: past the range, at least the share needed 25% nearer.
{
  const { shareToMake } = await import('../src/forest.js');
  assert.equal(shareToMake(2000, V), 1, 'all trees while it may show trees');
  for (const d of [3000, 4000, 6000, 9000]) assert.ok(shareToMake(d, V) >= thinAt((d - 300) * 0.75, V), 'headroom at ' + d);
  assert.ok(shareToMake(9000, V) < 1, 'still a share far away');
  console.log('forest: headroom ok');
}
