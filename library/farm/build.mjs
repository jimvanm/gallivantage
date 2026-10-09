// Farm: a grape vine, as trained on wires in a vineyard row. One vine is 1 m of
// row, so vines set 1 m apart along a line make a continuous green hedge.
// Metres, y up, x along the row, z across it, origin at the middle of the base.
import { Mesh } from '../../tools/landmarks/mesh.mjs';
import { reseed, jr, stem, mixc } from '../shapes.mjs';

const POST = [150, 140, 120], WOOD = [96, 72, 50], LEAF_D = [62, 96, 40], LEAF_L = [112, 148, 62];

// A box of foliage with an uneven top and no bottom (10 triangles).
function hedge(m, x0, x1, y0, y1, hz) {
  const b = [[x0, -hz], [x1, -hz], [x1, hz], [x0, hz]].map(([x, z]) => m.v(x, y0, z, LEAF_D));
  const t = [[x0, -hz], [x1, -hz], [x1, hz], [x0, hz]].map(([x, z]) => m.v(x, y1 + .08 * jr(), z * (1 + .15 * jr()), mixc(LEAF_D, LEAF_L, .8)));
  for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; m.idx.push(b[k], b[k2], t[k2], b[k], t[k2], t[k]); }
  m.idx.push(t[0], t[1], t[2], t[0], t[2], t[3]);
}

export function build() {
  const out = {};
  reseed(); let m = new Mesh();
  stem(m, [[-.5, 0, 0], [-.5, 1.75, 0]], [.035, .03], 4, POST);
  stem(m, [[0, 0, 0], [.03, .6, 0]], [.04, .03], 3, WOOD);
  hedge(m, -.5, .5, .55, 1.5, .22);
  out.vine = m;
  reseed(); m = new Mesh();
  hedge(m, -.5, .5, .55, 1.5, .22);
  out['vine-far'] = m;
  return out;
}
