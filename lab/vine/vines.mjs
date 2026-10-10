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
const E1 = outline(PROFILE), E2 = outline(PROFILE);
let m = new Mesh(); rounded(m, E1, E2, SHADES, true);
// Far: the same, with the barn-roof bend dropped (ground, widest, ridge).
const drop = (E) => E.filter((_, i) => i !== 2 && i !== 4);
const far = new Mesh(); rounded(far, drop(E1), drop(E2), [SHADES[0], SHADES[1], SHADES[3]], true);
out.vineD = { key: 'vineD', name: 'Vine D: rounded', like: 'One vine, 1 m of row', stages: ['vine'], status: 'testing',
  models: { 'vineD-1': done(m), 'vineD-far': done(far) } };

for (const [k, p] of Object.entries(out)) {
  fs.writeFileSync(path.join(plots, `vine-${k}.json`), JSON.stringify(p));
  console.log(k.padEnd(6), Object.entries(p.models).map(([id, x]) => `${id} ${x.tris}`).join(', '));
}
