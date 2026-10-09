// The library (library/index.json): every listed object has a shape, every shape
// is listed, shapes are sane, and models.json is what build.mjs makes now, so a
// forgotten bake is caught. A new object or set needs no test changes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../library/', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
const index = read('index.json');
const STATUS = ['approved', 'check', 'rework', 'new'];
const round = (v) => Math.round(v * 1000) / 1000 + 0;   // + 0 turns -0 into 0, as JSON does

assert.ok(Array.isArray(index.sets) && index.sets.length > 0, 'index.json lists the sets');
const seen = new Set();
for (const set of index.sets) {
  const models = read(set.id + '/models.json');
  const listed = set.models.map((e) => e.id);
  assert.deepEqual([...listed].sort(), Object.keys(models).sort(), set.id + ': index.json and models.json name the same shapes');
  for (const e of set.models) {
    const key = set.id + '/' + e.id;
    assert.ok(!seen.has(key), key + ' listed once'); seen.add(key);
    assert.ok(e.name && typeof e.name === 'string', key + ' has a name');
    assert.ok(STATUS.includes(e.status), key + ': status is one of ' + STATUS.join(', '));
    const m = models[e.id];
    assert.equal(m.pos.length % 3, 0);
    assert.equal(m.col.length, m.pos.length, key + ': a colour per corner');
    assert.equal(m.tris, m.idx.length / 3, key + ': triangle count is right');
    const nv = m.pos.length / 3;
    assert.ok(nv < 65536, key + ': fits 16-bit indices');
    assert.ok(m.idx.every((i) => Number.isInteger(i) && i >= 0 && i < nv), key + ': indices in range');
    const ys = m.pos.filter((_, i) => i % 3 === 1);
    assert.ok(Math.min(...ys) >= -0.06, key + ' sits on the ground (slanted legs may dip a few cm in)');
  }
  // models.json must be what build.mjs makes now
  const { build } = await import(new URL(set.id + '/build.mjs', ROOT));
  for (const [id, m] of Object.entries(build())) {
    const b = models[id];
    assert.ok(b, set.id + '/' + id + ' is baked');
    assert.deepEqual(Array.from(m.idx), b.idx, set.id + '/' + id + ': baked triangles match build.mjs (run node tools/bake_library.mjs)');
    assert.deepEqual(Array.from(m.pos, round), b.pos, set.id + '/' + id + ': baked corners match build.mjs (run node tools/bake_library.mjs)');
    assert.deepEqual(Array.from(m.col), b.col, set.id + '/' + id + ': baked colours match build.mjs');
  }
}
console.log('library ok:', seen.size, 'objects');
