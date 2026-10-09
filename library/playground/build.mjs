// Playground pieces: stand-in models for OpenStreetMap's playground=* tags.
// Same shape format as a landmark (tools/landmarks/mesh.mjs): metres, y up,
// x east, z south, origin at the middle of the base. Nothing moves.
import { Mesh } from '../../tools/landmarks/mesh.mjs';

const FRAME = [47, 111, 184];   // painted steel
const RUNG = [226, 70, 44];
const RAMP = [244, 190, 28];
const CHAIN = [110, 115, 120];
const SEAT = [38, 38, 38];
const TIMBER = [156, 107, 63];
const SAND = [226, 204, 147];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Six-sided block from 8 corners: bottom ring a0..a3, top ring b0..b3.
// Shared corners: the app shades each face from screen slopes, so no normals.
function block(m, A, B, c, ends = true) {
  const a = A.map((p) => m.v(p[0], p[1], p[2], c)), b = B.map((p) => m.v(p[0], p[1], p[2], c));
  for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; m.idx.push(a[k], a[k2], b[k2], a[k], b[k2], b[k]); }
  if (ends) m.idx.push(a[0], a[1], a[2], a[0], a[2], a[3], b[0], b[2], b[1], b[0], b[3], b[2]);
}
// Square bar from p to q, w thick. Thin bars leave their ends open (8 triangles).
function bar(m, p, q, w, c, ends = false) {
  const d = norm(sub(q, p)), ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = mul(norm(cross(d, ref)), w / 2), v = mul(norm(cross(d, u)), w / 2);
  const off = [add(u, v), sub(v, u), mul(add(u, v), -1), sub(u, v)];
  block(m, off.map((o) => add(p, o)), off.map((o) => add(q, o)), c, ends);
}
const box = (m, x0, y0, z0, x1, y1, z1, c) =>
  block(m, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], c);

// The one ladder: two rails from p to q, `width` apart across `side`,
// a rung every `step` metres between the ends.
function ladder(m, p, q, side, width = 0.5, step = 0.4) {
  const h = mul(norm(side), width / 2);
  bar(m, sub(p, h), sub(q, h), 0.05, FRAME);
  bar(m, add(p, h), add(q, h), 0.05, FRAME);
  const len = Math.hypot(...sub(q, p)), n = Math.round(len / step);
  for (let i = 1; i < n; i++) {
    const c = add(p, mul(sub(q, p), i / n));
    bar(m, sub(c, h), add(c, h), 0.035, RUNG);
  }
}

// playground=swing: A-frame, beam 2.3 m up, two seats.
function swing() {
  const m = new Mesh();
  box(m, -1.85, 2.25, -0.045, 1.85, 2.34, 0.045, FRAME);
  for (const x of [-1.65, 1.65]) for (const z of [-0.85, 0.85]) bar(m, [x, 2.3, 0], [x + Math.sign(x) * 0.12, 0, z], 0.08, FRAME);
  for (const x of [-0.75, 0.75]) {
    for (const dx of [-0.2, 0.2]) bar(m, [x + dx, 2.26, 0], [x + dx, 0.47, 0], 0.025, CHAIN);
    box(m, x - 0.23, 0.42, -0.1, x + 0.23, 0.47, 0.1, SEAT);
  }
  return m;
}
// playground=slide: a ladder up to 1.5 m and a 45-degree ramp down.
function slide() {
  const m = new Mesh(), H = 1.5, w = 0.25;
  ladder(m, [-0.75, 0, 0], [-0.75, H, 0], [0, 0, 1], 2 * w);
  block(m, [[-0.75, H - 0.04, -w], [-0.75, H - 0.04, w], [0.75, -0.04, w], [0.75, -0.04, -w]],
           [[-0.75, H, -w], [-0.75, H, w], [0.75, 0, w], [0.75, 0, -w]], RAMP);
  return m;
}
// playground=climbingframe: two upright ladders 2 m apart, a third across the top.
function climber() {
  const m = new Mesh(), S = 1, H = 2, across = [0, 0, 1];
  ladder(m, [-S, 0, 0], [-S, H, 0], across);
  ladder(m, [S, 0, 0], [S, H, 0], across);
  ladder(m, [-S, H, 0], [S, H, 0], across);
  return m;
}
// playground=sandpit: timber edging round 2.4 m of sand.
function sandpit() {
  const m = new Mesh(), a = 1.2, t = 0.12, h = 0.28;
  box(m, -a - t, 0, -a - t, a + t, h, -a, TIMBER);
  box(m, -a - t, 0, a, a + t, h, a + t, TIMBER);
  box(m, -a - t, 0, -a, -a, h, a, TIMBER);
  box(m, a, 0, -a, a + t, h, a, TIMBER);
  const s = [[-a, 0.14, -a], [a, 0.14, -a], [a, 0.14, a], [-a, 0.14, a]].map((p) => m.v(p[0], p[1], p[2], SAND));
  m.idx.push(s[0], s[1], s[2], s[0], s[2], s[3]);
  return m;
}

// One shape per OpenStreetMap value of playground=*.
export function build() {
  return { swing: swing(), slide: slide(), climbingframe: climber(), sandpit: sandpit() };
}
