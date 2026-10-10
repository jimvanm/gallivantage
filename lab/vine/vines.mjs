// Run: node lab/vine/vines.mjs   then   node lab/stand/make.mjs
// Trial vines for the Tree Stand. Writes lab/stand/plots/vine-*.json; delete those files to retire them.
// Earlier tries (A: today's vine with a post every metre; B: posts every 5 m; C: one piece per 5 m) were
// set aside on 10 October: Jim asked for no trunk, no posts, and a rounded vine, one at a time.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Mesh, mixc } from '../../library/shapes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const plots = path.join(here, '..', 'stand', 'plots');
const LEAF_D = [62, 96, 40], LEAF_L = [112, 148, 62];

// Same rounding as tools/bake_library.mjs (not imported: importing it bakes the whole library).
const done = (m) => ({ tris: m.idx.length / 3, pos: m.pos.map((v) => Math.round(v * 1000) / 1000 + 0), col: [...m.col], idx: [...m.idx] });


// D: one rounded vine, 1 m of row, standing on the ground. No trunk, no post.
// Across the row it is one outline, pulled 1 m along the row: narrow at the ground, rising up and out
// to its widest point, then a barn roof (two slopes each side) to a ridge.
// The two ends have slightly different outlines (heights a few cm apart, each side on its own), so the
// long lines along the vine are never quite level. To make a row, each vine starts with the outline the
// one before it ended with: keep a few end outlines and a vine for each pair, and the row joins exactly
// while its lines wander. Costs nothing: the same triangles as a level vine.
// Profile across the row: [half-width, height] from the ground up one side; mirrored for the other.
const PROFILE = [[.06, 0], [.3, 1.0], [.22, 1.42], [0, 1.7]];
const SHADES = [mixc(LEAF_D, [40, 54, 30], .5), LEAF_D, mixc(LEAF_D, LEAF_L, .6), LEAF_L];
let js = 3; const jr = () => { js = (js * 16807) % 2147483647; return js / 2147483647 - .5; };
// An end outline: the ground stays put; widest and knee move up to +/-4 cm up and +/-2.5 cm out, each side
// on its own; the ridge up to +/-4 cm up and +/-2 cm sideways. Listed left side up, ridge, right side down.
function outline(prof) {
  const side = () => prof.slice(0, -1).map(([w, h], i) => i === 0 ? [w, h] : [w + .05 * jr(), h + .08 * jr()]);
  const L = side(), R = side(), [rw, rh] = prof[prof.length - 1];
  return [...L.map(([w, h]) => [-w, h]), [rw + .04 * jr(), rh + .08 * jr()], ...R.reverse().map(([w, h]) => [w, h])];
}
function rounded(m, A, B, cols, caps) {
  const c = [...cols, ...cols.slice(0, -1).reverse()];
  const ring = (x, P) => P.map(([z, y], i) => m.v(x, y, z, c[i]));
  const a = ring(-.5, A), b = ring(.5, B);
  for (let k = 0; k < A.length - 1; k++) m.idx.push(a[k], b[k], b[k + 1], a[k], b[k + 1], a[k + 1]);
  if (caps) for (const r of [a, b]) for (let k = 1; k < r.length - 1; k++) m.idx.push(r[0], r[k], r[k + 1]);
}
const out = {};
const E1 = outline(PROFILE), E2 = outline(PROFILE), O = [E1, E2, outline(PROFILE)];
let m = new Mesh(); rounded(m, E1, E2, SHADES, true);
// Far: the same, with the barn-roof bend dropped (ground, widest, ridge).
const drop = (E) => E.filter((_, i) => i !== 2 && i !== 4);
const far = new Mesh(); rounded(far, drop(E1), drop(E2), [SHADES[0], SHADES[1], SHADES[3]], true);
out.vineD = { key: 'vineD', name: 'Vine D: rounded', like: 'One vine, 1 m of row', stages: ['vine'], status: 'testing',
  models: { 'vineD-1': done(m), 'vineD-far': done(far) } };

out.vineD.vineyard = { layout: 'chain', outlines: O.length };

// Rows: one piece for every pair of end outlines (start i, end j), without end faces, since inside a row
// they are hidden. A row starts with outline i, and each next piece starts with the outline the last one
// ended with, so the row joins exactly while its lines wander. Row ends get a flat cap of that outline.
// These only appear in rows (rowOnly), not on their own in the styles scene.
O.forEach((A, i) => O.forEach((B, j) => {
  const near = new Mesh(); rounded(near, A, B, SHADES, false);
  const f = new Mesh(); rounded(f, drop(A), drop(B), [SHADES[0], SHADES[1], SHADES[3]], false);
  out[`vrow${i}${j}`] = { key: `vrow${i}${j}`, name: `Vine D row piece ${i}${j}`, like: 'Row piece', stages: ['vine'], status: 'testing', rowOnly: true,
    models: { [`vrow${i}${j}-1`]: done(near), [`vrow${i}${j}-far`]: done(f) } };
}));
const caps = {};
O.forEach((A, i) => { const m = new Mesh(); const c = [...SHADES, ...SHADES.slice(0, -1).reverse()];
  const r = A.map(([z, y], k) => m.v(0, y, z, c[k])); for (let k = 1; k < r.length - 1; k++) m.idx.push(r[0], r[k], r[k + 1]);
  caps[`vcap-${i + 1}`] = done(m); });
caps['vcap-far'] = { tris: 0, pos: [], col: [], idx: [] };
out.vcap = { key: 'vcap', name: 'Vine row end', like: 'Row end cap', stages: O.map((_, i) => `outline ${i}`), status: 'testing', rowOnly: true, models: caps };

// Longer row pieces, for big vineyards: 10 m and 3 m, made of 1 m steps with a fresh random outline at every
// inner step (so the lines wander along the whole piece), starting and ending on the shared outlines like the
// 1 m pieces. Same 12 triangles a metre; a tenth as many pieces to place. Far: just the two end outlines with
// the barn-roof bend dropped (8 triangles however long). A row uses 10s, then 3s, then 1s for what is left.
function longPiece(m, A, B, len, cols) {
  const c = [...cols, ...cols.slice(0, -1).reverse()];
  const secs = [A]; for (let k = 1; k < len; k++) secs.push(outline(PROFILE)); secs.push(B);
  const rings = secs.map((P, k) => P.map(([z, y], i) => m.v(k - len / 2, y, z, c[i])));
  for (let k = 0; k < len; k++) { const a = rings[k], b = rings[k + 1];
    for (let i = 0; i < A.length - 1; i++) m.idx.push(a[i], b[i], b[i + 1], a[i], b[i + 1], a[i + 1]); }
}
function longFar(m, A, B, len) {
  const cols = [SHADES[0], SHADES[1], SHADES[3]], c = [...cols, ...cols.slice(0, -1).reverse()];
  const a = drop(A).map(([z, y], i) => m.v(-len / 2, y, z, c[i])), b = drop(B).map(([z, y], i) => m.v(len / 2, y, z, c[i]));
  for (let i = 0; i < a.length - 1; i++) m.idx.push(a[i], b[i], b[i + 1], a[i], b[i + 1], a[i + 1]);
}
for (const len of [10, 3]) O.forEach((A, i) => O.forEach((B, j) => {
  const near = new Mesh(); longPiece(near, A, B, len, SHADES);
  const f = new Mesh(); longFar(f, A, B, len);
  const key = `vl${len}x${i}${j}`;
  out[key] = { key, name: `Vine D ${len} m piece ${i}${j}`, like: 'Row piece', stages: ['vine'], status: 'testing', rowOnly: true,
    models: { [`${key}-1`]: done(near), [`${key}-far`]: done(f) } };
}));

for (const [k, p] of Object.entries(out)) {
  fs.writeFileSync(path.join(plots, `vine-${k}.json`), JSON.stringify(p));
  console.log(k.padEnd(6), Object.entries(p.models).map(([id, x]) => `${id} ${x.tris}`).join(', '));
}
