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
// to its widest point, then a barn roof (two slopes each side) to a ridge. Both ends have the same
// outline and no jitter, so vines set 1 m apart join into one smooth hedge.
// Profile across the row: [half-width, height] from the ground up one side; mirrored for the other.
const PROFILE = [[.06, 0], [.3, 1.0], [.22, 1.42], [0, 1.7]];
const SHADES = [mixc(LEAF_D, [40, 54, 30], .5), LEAF_D, mixc(LEAF_D, LEAF_L, .6), LEAF_L];
function rounded(m, prof, cols, caps) {
  const pts = [...prof.map((p, i) => [-p[0], p[1], cols[i]]), ...prof.slice(0, -1).reverse().map((p, i, a) => [p[0], p[1], cols[a.length - 1 - i]])];
  const ring = (x) => pts.map(([z, y, c]) => m.v(x, y, z, c));
  const a = ring(-.5), b = ring(.5);
  for (let k = 0; k < pts.length - 1; k++) m.idx.push(a[k], b[k], b[k + 1], a[k], b[k + 1], a[k + 1]);
  if (caps) for (const r of [a, b]) for (let k = 1; k < r.length - 1; k++) m.idx.push(r[0], r[k], r[k + 1]);
}
const out = {};
let m = new Mesh(); rounded(m, PROFILE, SHADES, true);
// Far: the same outline with the barn-roof knee dropped (ground, widest, ridge).
const far = new Mesh(); rounded(far, [PROFILE[0], PROFILE[1], PROFILE[3]], [SHADES[0], SHADES[1], SHADES[3]], true);
out.vineD = { key: 'vineD', name: 'Vine D: rounded', like: 'One vine, 1 m of row', stages: ['vine'], status: 'testing',
  models: { 'vineD-1': done(m), 'vineD-far': done(far) } };

for (const [k, p] of Object.entries(out)) {
  fs.writeFileSync(path.join(plots, `vine-${k}.json`), JSON.stringify(p));
  console.log(k.padEnd(6), Object.entries(p.models).map(([id, x]) => `${id} ${x.tris}`).join(', '));
}
