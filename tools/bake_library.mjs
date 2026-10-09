// Builds the library's shapes and writes library/<set>/models.json.
//   node tools/bake_library.mjs              every set in library/index.json
//   node tools/bake_library.mjs trees        one set
// library/<set>/build.mjs exports build(), returning { id: Mesh, ... }
// (tools/landmarks/mesh.mjs). Each model has the same shape as a landmark's
// model.json: metres, y up, x east, z south, origin at the middle of the base.
import fs from 'node:fs';

const root = new URL('../library/', import.meta.url);
const index = JSON.parse(fs.readFileSync(new URL('index.json', root), 'utf8'));
const only = process.argv[2];

export function toModel(m) {
  return {
    tris: m.idx.length / 3,
    pos: Array.from(m.pos, (v) => Math.round(v * 1000) / 1000 + 0),
    col: Array.from(m.col),
    idx: Array.from(m.idx),
  };
}

for (const set of index.sets) {
  if (only && set.id !== only) continue;
  const dir = new URL(set.id + '/', root);
  const { build } = await import(new URL('build.mjs', dir));
  const out = {};
  for (const [id, m] of Object.entries(build())) out[id] = toModel(m);
  const text = JSON.stringify(out) + '\n';
  fs.writeFileSync(new URL('models.json', dir), text);
  const tris = Object.values(out).reduce((a, m) => a + m.tris, 0);
  console.log(`${set.id.padEnd(12)} ${String(Object.keys(out).length).padStart(3)} shapes, ${tris} triangles, ${(text.length / 1024).toFixed(0)} KB`);
}
