// Farm: the grape vine, approved by Jim on 10 October 2026 (built in the Tree Stand, lab/stand).
// Metres, y up, x along the row, z across it, origin at the middle of the base.
//
// A vine is 1 m of row standing on the ground: no trunk, no posts. Across the row it is one outline,
// pulled along the row: narrow at the ground, rising up and out to its widest point (60 cm across,
// 1 m up), then a barn roof (two slopes each side) to a ridge at 1.7 m.
//
// The long lines along a vine are never quite level: each end's outline is moved a few cm, each side
// on its own. Rows are chains of pieces that each start on the outline the last one ended with:
//   vine-<len>-<i><j>  a piece len metres long (10, 3 or 1), starting on outline i, ending on outline j
//                      (three shared outlines, 0 to 2). Inner steps of long pieces get their own random
//                      outline, so the lines wander the whole way. 12 triangles a metre, no end faces.
//   vine-<len>-far     the far shape for every piece of that length: the plain outline with the barn-roof
//                      bend dropped, level. 8 triangles however long.
//   vine-cap-<n>       a flat end for a row on outline n-1 (5 triangles). Not drawn far away.
// A row uses 10 m pieces, then 3 m, then 1 m for what is left. Each piece sits on the ground at its
// middle and is sheared (not turned) to the ground's slope along it, so the vines stay upright.
// `vine` and `vine-far` are one vine on its own, with end faces: the picture on the library page.
import { Mesh } from '../../tools/landmarks/mesh.mjs';
import { mixc } from '../shapes.mjs';

const LEAF_D = [62, 96, 40], LEAF_L = [112, 148, 62];
// Profile across the row: [half-width, height] from the ground up one side; mirrored for the other.
const PROFILE = [[.06, 0], [.3, 1.0], [.22, 1.42], [0, 1.7]];
const SHADES = [mixc(LEAF_D, [40, 54, 30], .5), LEAF_D, mixc(LEAF_D, LEAF_L, .6), LEAF_L];
const FAR_SHADES = [SHADES[0], SHADES[1], SHADES[3]];
export const LENGTHS = [10, 3, 1], OUTLINES = 3;

let js = 3; const jr = () => { js = (js * 16807) % 2147483647; return js / 2147483647 - .5; };
// An end outline: the ground stays put; widest and knee move up to +/-4 cm up and +/-2.5 cm out, each side
// on its own; the ridge up to +/-4 cm up and +/-2 cm sideways. Listed left side up, ridge, right side down.
function outline() {
  const side = () => PROFILE.slice(0, -1).map(([w, h], i) => i === 0 ? [w, h] : [w + .05 * jr(), h + .08 * jr()]);
  const L = side(), R = side(), [rw, rh] = PROFILE[PROFILE.length - 1];
  return [...L.map(([w, h]) => [-w, h]), [rw + .04 * jr(), rh + .08 * jr()], ...R.reverse().map(([w, h]) => [w, h])];
}
const level = () => [...PROFILE.map(([w, h]) => [-w, h]), ...PROFILE.slice(0, -1).reverse().map(([w, h]) => [w, h])];
const drop = (E) => E.filter((_, i) => i !== 2 && i !== 4);   // the barn-roof bend, both sides
const mirror = (cols) => [...cols, ...cols.slice(0, -1).reverse()];

// Sections along x, each an outline; strips between them; optionally the two end faces.
function loft(m, secs, xs, cols, caps) {
  const c = mirror(cols);
  const rings = secs.map((P, k) => P.map(([z, y], i) => m.v(xs[k], y, z, c[i])));
  for (let k = 0; k < rings.length - 1; k++) { const a = rings[k], b = rings[k + 1];
    for (let i = 0; i < a.length - 1; i++) m.idx.push(a[i], b[i], b[i + 1], a[i], b[i + 1], a[i + 1]); }
  if (caps) for (const r of [rings[0], rings[rings.length - 1]]) for (let k = 1; k < r.length - 1; k++) m.idx.push(r[0], r[k], r[k + 1]);
  return m;
}

export function build() {
  js = 3;
  const out = {};
  // The three shared outlines. The order of random draws matches the Tree Stand trials Jim approved.
  const O = [outline(), outline(), outline()];
  out.vine = loft(new Mesh(), [O[0], O[1]], [-.5, .5], SHADES, true);
  out['vine-far'] = loft(new Mesh(), [drop(O[0]), drop(O[1])], [-.5, .5], FAR_SHADES, true);
  for (const len of LENGTHS) {
    O.forEach((A, i) => O.forEach((B, j) => {
      const secs = [A]; for (let k = 1; k < len; k++) secs.push(outline()); secs.push(B);
      out[`vine-${len}-${i}${j}`] = loft(new Mesh(), secs, secs.map((_, k) => k - len / 2), SHADES, false);
    }));
    out[`vine-${len}-far`] = loft(new Mesh(), [drop(level()), drop(level())], [-len / 2, len / 2], FAR_SHADES, false);
  }
  O.forEach((A, i) => { const m = new Mesh(), c = mirror(SHADES), r = A.map(([z, y], k) => m.v(0, y, z, c[k]));
    for (let k = 1; k < r.length - 1; k++) m.idx.push(r[0], r[k], r[k + 1]); out[`vine-cap-${i + 1}`] = m; });
  return out;
}
