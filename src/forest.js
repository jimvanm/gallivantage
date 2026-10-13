// The forest, worked out on the spot: nothing to do with drawing, so it runs anywhere (the lab, the app, a
// helper thread, the tests). What grows where is src/biome.js; this turns it into trees ready to draw.
//
// - makeTrees: one tile's trees from the tile's address, as 20-byte records (the same layout the labs and
//   forestdraw.js use), sorted by facing number so that "every tree whose facing number is below a share" is
//   simply the front of the list. Far away only that front share is made at all.
// - traceOutline: a far shape's outline and colours at 16 heights, for its dot.
// - the distance settings (VIEW_DEFAULTS) and what follows from them: how far trees and dots reach, the share of
//   dots kept far away, the dots' band.
// - ForestKeeper: which tiles are held, made nearest first a few milliseconds at a time, dropped when far.
//
// A tree record (20 bytes): x, y, z (float32, metres); height, width (uint16, centimetres); facing (0..255, also
// the far-share number); shade; warmth (or, for vine pieces, the slope along the piece); shape number.

import { plantTile, TREE_STRIDE, rng, tileSeed } from './biome.js';
import { parcelRows, rowPieces } from './vines.js';

export const TREE_BYTES = 20;

// The distances, near to far. Metres, or shares of a distance where said. Jim's starting settings.
export const VIEW_DEFAULTS = {
  near: 200,         // detailed tree shapes out to here; simple (far) shapes beyond
  fade: 0.35,        // trees start turning into dots at this share of `range`
  range: 2500,       // the last trees have turned into dots by here
  thinFrom: 2500,    // dots get fewer and wider past here
  dotFade: 0.6,      // dots start melting into the canopy at this share of `dotRange`
  dotRange: 10000,   // the last dots have melted into the canopy by here
};

// The share of trees kept as dots at distance d: all of them up to thinFrom, then (thinFrom / d) cubed, at least 1/64.
export const thinAt = (d, V) => d <= V.thinFrom ? 1 : Math.max(1 / 64, (V.thinFrom / d) ** 3);
// The share a tile must hold to serve its nearest point d away: thinAt rounded up to a power of two, so a tile
// passing back and forth is not made again for every step.
export const levelFor = (d, V) => Math.min(1, 2 ** Math.ceil(Math.log2(thinAt(Math.max(1, d), V))));
// The share to make a tile with, its nearest point d away: all of it while it may show trees (within the range plus
// 300 m); past that, enough for 25% nearer than it is (about one step richer), so as you fly towards it the tile is
// made again well before its square would show sparser than its neighbours.
export const shareToMake = (d, V) => d <= V.range + 300 ? 1 : levelFor(Math.max(1, (d - 300) * 0.75), V);
// The dots' band: where they melt into the canopy (never starting before the trees have all gone).
export const dotBand = (V) => { const D = Math.max(V.dotRange, V.range); return [Math.max(V.range, D * V.dotFade), D]; };
// How far trees are worked out: the dots' reach, or the trees' when there are no dots.
export const reach = (V, dots = true) => dots ? Math.max(V.dotRange, V.range) : V.range;

export function writeTree(u8, f32, u16, i, x, y, z, h, w, yaw, shade, warm, shape) {
  f32[i * 5] = x; f32[i * 5 + 1] = y; f32[i * 5 + 2] = z;
  u16[i * 10 + 6] = Math.min(65535, Math.round(h * 100)); u16[i * 10 + 7] = Math.min(65535, Math.round(w * 100));
  u8[i * 20 + 16] = yaw; u8[i * 20 + 17] = shade; u8[i * 20 + 18] = warm; u8[i * 20 + 19] = shape;
}
export function records(n) { const buf = new ArrayBuffer(n * TREE_BYTES); return { u8: new Uint8Array(buf), f32: new Float32Array(buf), u16: new Uint16Array(buf) }; }

// One tile's trees. ctx: biome.js's plantTile context (seed, x0, z0, size, latLon, ground, grad, cover), plus
// keep (the share to make; 1 for all) and inside(x, z) (optional: drop trees outside the area held).
// styles[k]: the growth-stage shapes of tree style k, each { H, W, n } (n: its shape number when drawn).
// Returns a batch: { cx, cz, rad, n, u8, u32, keep, tree: true }.
export function makeTrees(ctx, rules, styles) {
  const keep = ctx.keep ?? 1;
  const T = plantTile({ ...ctx, keep: keep < 1 ? keep : undefined }, rules);
  const B = records(T.length / TREE_STRIDE);
  let m = 0;
  for (let i = 0; i < T.length; i += TREE_STRIDE) {
    const x = T[i], z = T[i + 1];
    if (ctx.inside && !ctx.inside(x, z)) continue;
    const st = styles[T[i + 2]], sh = st[Math.min(st.length - 1, Math.floor(T[i + 3] * st.length))], size = T[i + 4];
    const yaw = T[i + 6], shade = T[i + 7], warm = ((yaw * 13.7) % 1) < 0.15 ? 200 : ((yaw * 7.3) % 1) * 60;
    writeTree(B.u8, B.f32, B.u16, m++, x, ctx.ground(x, z) - 0.3, z, sh.H * size, sh.W * size * T[i + 5], Math.floor(yaw * 256), Math.floor(shade * 255), warm, sh.n);
  }
  // sorted by facing number, so the share kept far away is always the front of the list
  const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => B.u8[a * 20 + 16] - B.u8[b * 20 + 16]);
  const u8 = new Uint8Array(m * TREE_BYTES);
  order.forEach((o, i) => u8.set(B.u8.subarray(o * 20, o * 20 + 20), i * 20));
  return { cx: ctx.x0 + ctx.size / 2, cz: ctx.z0 + ctx.size / 2, rad: ctx.size * 0.71, n: m, u8, u32: new Uint32Array(u8.buffer), keep, tree: true };
}

// How many of a batch's trees (sorted) have a facing number below share f.
export function prefixBelow(b, f) {
  const lim = f * 256; let lo = 0, hi = b.n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (b.u8[m * 20 + 16] < lim) lo = m + 1; else hi = m; }
  return lo;
}

// Is (x, z) inside rings (flat [x0, z0, x1, z1, ...] arrays), odd-even.
export function insideRings(rings, x, z) {
  let c = false;
  for (const r of rings) for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
    if ((r[i + 1] > z) !== (r[j + 1] > z) && x < (r[j] - r[i]) * (z - r[i + 1]) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
  }
  return c;
}

// One vineyard's rows. p: { rings, box, cx, cz, rad }; pi: a number fixed for this parcel; ctx: { ground, grad,
// inside (optional), step (metres between ground samples) }; spacing: metres between rows;
// pieceShape(len, from, to) and capShape(outline): the shapes to draw, each { H, W, n }.
// Returns a batch: { cx, cz, rad, n, u8, u32, rows, tree: false }.
export function makeVines(p, pi, ctx, spacing, pieceShape, capShape) {
  let gx = 0, gz = 0, c = 0;
  const [bx0, bz0, bx1, bz1] = p.box, st = Math.max(ctx.step, Math.min(bx1 - bx0, bz1 - bz0) / 12);
  for (let z = bz0; z <= bz1; z += st) for (let x = bx0; x <= bx1; x += st) if (insideRings(p.rings, x, z)) { const g = ctx.grad(x, z); gx += g[0]; gz += g[1]; c++; }
  const rows = parcelRows((x, z) => (!ctx.inside || ctx.inside(x, z)) && insideRings(p.rings, x, z), p.box, c ? [gx / c, gz / c] : [0, 0], spacing);
  const out = [], r = rng(tileSeed(17, Math.round(p.cx), Math.round(p.cz)));
  rows.forEach((row, ri) => {
    const { pieces, caps } = rowPieces(ctx.ground, row, tileSeed(18, pi, ri)), shade = 110 + r() * 36;
    for (const q of pieces) { const sh = pieceShape(q.len, q.from, q.to); out.push([q.x, q.y, q.z, sh.H, sh.W, row.yb, shade, Math.round((q.slope + 1) / 2 * 255), sh.n]); }
    for (const q of caps) { const sh = capShape(q.outline); out.push([q.x, q.y, q.z, sh.H, sh.W, row.yb, shade, 128, sh.n]); }
  });
  const B = records(out.length);
  out.forEach((v, i) => writeTree(B.u8, B.f32, B.u16, i, ...v));
  return { cx: p.cx, cz: p.cz, rad: p.rad, n: out.length, u8: B.u8, u32: new Uint32Array(B.u8.buffer), rows: rows.length, tree: false };
}

// A far shape's dot: cut at BANDS heights (unit height and width, as drawn), the widest the cut reaches either side,
// seen from 16 directions and averaged, is the dot's half width there (0..0.5); the colour is the average of the
// corners near that height (0..1). model: { pos, col, idx } in the library's format.
export const BANDS = 16;
export function traceOutline(m) {
  let H = 0, W = 0;
  for (let i = 0; i < m.pos.length; i += 3) { H = Math.max(H, m.pos[i + 1]); W = Math.max(W, Math.abs(m.pos[i]), Math.abs(m.pos[i + 2])); }
  W *= 2;
  const X = (i) => m.pos[i * 3] / W, Y = (i) => m.pos[i * 3 + 1] / H, Z = (i) => m.pos[i * 3 + 2] / W;
  const hw = new Float32Array(BANDS), col = new Float32Array(BANDS * 3), cn = new Float32Array(BANDS);
  for (let b = 0; b < BANDS; b++) {
    const y = (b + 0.5) / BANDS, pts = [];
    for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = m.idx[t + e], c = m.idx[t + (e + 1) % 3], ya = Y(a), yc = Y(c);
      if ((ya - y) * (yc - y) <= 0 && ya !== yc) { const f = (y - ya) / (yc - ya); pts.push([X(a) + (X(c) - X(a)) * f, Z(a) + (Z(c) - Z(a)) * f]); }
    }
    if (pts.length) { let s = 0; for (let k = 0; k < 16; k++) { const an = k / 16 * Math.PI, ca = Math.cos(an), sa = Math.sin(an); let mx = 0; for (const [x, z] of pts) mx = Math.max(mx, Math.abs(x * ca + z * sa)); s += mx; } hw[b] = s / 16; }
  }
  for (let i = 0; i < m.pos.length / 3; i++) { const b = Math.min(BANDS - 1, Math.max(0, Math.floor(Y(i) * BANDS))); for (let q = 0; q < 3; q++) col[b * 3 + q] += m.col[i * 3 + q]; cn[b]++; }
  for (let b = 0; b < BANDS; b++) if (cn[b]) for (let q = 0; q < 3; q++) col[b * 3 + q] /= cn[b] * 255;
  for (let b = 0; b < BANDS; b++) if (!cn[b]) for (let k = 1; k < BANDS; k++) { const n = [b - k, b + k].find((j) => j >= 0 && j < BANDS && cn[j]); if (n !== undefined) { for (let q = 0; q < 3; q++) col[b * 3 + q] = col[n * 3 + q]; break; } }
  return { hw, col };
}

// A style's look from afar, for the canopy: the leaf colour of its far shape (green corners only, as the dots use)
// and its usual grown height (the average of its stages). model: the far shape; stageHeights: metres.
export function farLook(model, stageHeights) {
  const c = [0, 0, 0], all = [0, 0, 0]; let n = 0;
  for (let i = 0; i < model.col.length; i += 3) {
    for (let q = 0; q < 3; q++) all[q] += model.col[i + q];
    if (model.col[i + 1] > model.col[i] * 1.05) { for (let q = 0; q < 3; q++) c[q] += model.col[i + q]; n++; }
  }
  return { rgb: n ? c.map((v) => v / n) : all.map((v) => v / (model.col.length / 3)), H: stageHeights.reduce((t, h) => t + h, 0) / stageHeights.length };
}

// Which batches are held. want() is given every tile or parcel that should be held now, each
// { key, d (metres to its nearest point), keep (share needed; undefined for vines), make: () => batch };
// it queues what is missing (nearest first) and drops what is beyond `hold(key)` metres plus 300.
// makeSome(ms) makes queued batches for at most ms milliseconds. dirty: something changed since the last list.
export class ForestKeeper {
  constructor() { this.live = new Map(); this.queue = []; this.dirty = true; this.farDirty = true; this.made = { tiles: 0, trees: 0, ms: 0, rows: 0 }; }
  clear() { this.live.clear(); this.queue = []; this.made = { tiles: 0, trees: 0, ms: 0, rows: 0 }; this.dirty = true; this.farDirty = true; }
  want(items, eye, hold) {
    const keep = new Set(), todo = [];
    for (const it of items) {
      keep.add(it.key);
      const have = this.live.get(it.key);
      if (it.keep === undefined ? !have : (!have || have.keep < it.keep)) todo.push(it);
    }
    for (const [key, b] of this.live) if (!keep.has(key) && Math.hypot(b.cx - eye[0], b.cz - eye[2]) - b.rad > hold(key) + 300) { this.live.delete(key); this.dirty = true; this.farDirty = true; }
    this.queue = todo.sort((p, q) => p.d - q.d);
  }
  makeSome(budgetMs) {
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const job = this.queue.shift(), have = this.live.get(job.key);
      if (have && (job.keep === undefined || have.keep >= job.keep)) continue;
      const t = performance.now(), b = job.make();
      this.live.set(job.key, b); this.dirty = true; this.farDirty = true;
      if (b.tree) { this.made.tiles++; this.made.trees += b.n; this.made.ms += performance.now() - t; } else this.made.rows += b.rows;
    }
  }
}
