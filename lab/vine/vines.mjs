// Run: node lab/vine/vines.mjs   then   node lab/stand/make.mjs
// Trial vines for the Tree Stand's vineyard scene. Three ways to plant a row:
//   A  today's library vine: a post on every 1 m piece.
//   B  the same vine without its post; a plain post every 5 m, a heavier one at each row end.
//   C  "bays": one 5 m piece (five trunks, one long hedge, one post), so one model per 5 m.
//      Its far shape is one 5 m box. Leftover metres at a row's end are filled with B's vine.
// Posts get no far shape: past the detailed range they are not drawn at all.
// Writes lab/stand/plots/vine-*.json; delete those files to retire the rows.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Mesh, reseed, jr, stem, mixc } from '../../library/shapes.mjs';
import { build as farm } from '../../library/farm/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const plots = path.join(here, '..', 'stand', 'plots');
const POST = [150, 140, 120], WOOD = [96, 72, 50], LEAF_D = [62, 96, 40], LEAF_L = [112, 148, 62];

// A hedge from x0 to x1 in n segments, uneven top, no bottom: 6 triangles a segment + 4 for the ends.
function hedge(m, x0, x1, n, y0, y1, hz) {
  const cs = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, edge = i === 0 || i === n, top = mixc(LEAF_D, LEAF_L, .8);
    const ty = y1 + (edge ? 0 : .08 * jr()), w = hz * (1 + (edge ? 0 : .15 * jr()));
    cs.push([m.v(x, y0, -hz, LEAF_D), m.v(x, y0, hz, LEAF_D), m.v(x, ty, w, top), m.v(x, ty, -w, top)]);
  }
  for (let i = 0; i < n; i++) {
    const a = cs[i], b = cs[i + 1];
    for (let k = 0; k < 4; k++) { if (k === 0) continue; // no bottom
      const k2 = (k + 1) % 4; m.idx.push(a[k], b[k], b[k2], a[k], b[k2], a[k2]); }
  }
  const e = (c) => m.idx.push(c[0], c[1], c[2], c[0], c[2], c[3]);
  e(cs[0]); e(cs[n]);
}
const trunk = (m, x) => stem(m, [[x, 0, 0], [x + .03, .6, 0]], [.04, .03], 3, WOOD);
const post = (m, x, r, h) => stem(m, [[x, 0, 0], [x, h, 0]], [r, r * .85], 4, POST);
// Same rounding as tools/bake_library.mjs (not imported: importing it bakes the whole library).
const done = (m) => ({ tris: m.idx.length / 3, pos: m.pos.map((v) => Math.round(v * 1000) / 1000 + 0), col: [...m.col], idx: [...m.idx] });

const lib = farm();
const out = {};

// A: today's vine, unchanged.
out.vineA = { key: 'vineA', name: 'Vines A: today', like: 'Post on every metre', stages: ['vine'], status: 'testing',
  vineyard: { layout: 'metre' }, models: { 'vineA-1': done(lib.vine), 'vineA-far': done(lib['vine-far']) } };

// B: the vine without its post.
reseed(); let m = new Mesh(); trunk(m, 0); hedge(m, -.5, .5, 1, .55, 1.5, .22);
out.vineB = { key: 'vineB', name: 'Vines B: posts apart', like: 'Post every 5 m', stages: ['vine'], status: 'testing',
  vineyard: { layout: 'posts' }, models: { 'vineB-1': done(m), 'vineB-far': done(lib['vine-far']) } };

// C: a 5 m bay.
reseed(5); m = new Mesh(); post(m, -2.5, .035, 1.75); for (let x = -2; x <= 2; x++) trunk(m, x); hedge(m, -2.5, 2.5, 5, .55, 1.5, .22);
const far = new Mesh(); hedge(far, -2.5, 2.5, 1, .55, 1.5, .22);
out.vineC = { key: 'vineC', name: 'Vines C: 5 m bays', like: 'One piece per 5 m', stages: ['bay'], status: 'testing',
  vineyard: { layout: 'bays' }, models: { 'vineC-1': done(m), 'vineC-far': done(far) } };

// Posts: plain, and a heavier one for row ends. No far shape.
const p1 = new Mesh(); post(p1, 0, .035, 1.75);
const p2 = new Mesh(); post(p2, 0, .06, 1.9);
out.vpost = { key: 'vpost', name: 'Vineyard post', like: 'Row post, end post', stages: ['post', 'end post'], status: 'testing',
  models: { 'vpost-1': done(p1), 'vpost-2': done(p2), 'vpost-far': { tris: 0, pos: [], col: [], idx: [] } } };

for (const [k, p] of Object.entries(out)) {
  fs.writeFileSync(path.join(plots, `vine-${k}.json`), JSON.stringify(p));
  console.log(k.padEnd(6), Object.entries(p.models).map(([id, x]) => `${id} ${x.tris}`).join(', '));
}
