// Reading the road from the ground.
//
// Canada's survey is bare earth: trees and buildings are taken out, but the
// ground under a road is kept. So the road's real bed is already in it: a
// strip about as wide as the road, flat and nearly level across, often with
// a bank or a ditch at its edges. This file looks for that strip across each
// road every few metres, and measures it: where its middle is, how wide it
// is, how it slopes across, and whether its edges are clear.
//
// What the ground shows is usually wider than the pavement: the whole graded
// street corridor (road, boulevards, sidewalks, verges). Ontario's standard
// road allowance is 66 feet, about 20 m, and that is about what the survey
// shows in Campbellford. So it says whether the map's road lies on it:
//   fits      the map's road lies within the ground's flat strip
//   hangs     part of the map's road hangs off the strip's edge (by more than
//             half a metre): the map's line is off, or the strip is not it
//   narrow    the strip is narrower than the road itself
//   unclear   no strip with clear edges: flat open ground (any line would
//             do), ground too rough, too coarse (30 m tiles), or a bridge
//
// It changes nothing. It is for seeing how much of the road the ground
// already knows. Positions are local metres (x east, z south), as in
// roadrules.js.

export const READ_EVERY = 4;        // metres between cross-sections
const STEP = 0.5;                    // metres between points across
const REACH = 8;                     // metres either side beyond the road's half-width
const FLAT_RMS = 0.06;               // metres: how far from a straight line across the strip may be
const MAX_CROSS = 0.08;              // steepest slope across a road strip (banking included)
const EDGE_BREAK = 0.04;             // a change of slope this big just outside makes a clear edge
const MIN_WIDTH = 2.5;               // metres: narrower than this is no road strip
export const READ_CLASSES = ['fits', 'hangs', 'narrow', 'unclear'];
const WIDEST = 30;                   // metres: a flat strip wider than this is open ground, not a street

// One cross-section: the ground at points across, -U..U. Returns the best
// strip { a, b (metres from the line, a < b), slope, rms, edges (0..2) } or null.
function bestStrip(h, U, near) {
  const n = h.length, at = (k) => -U + k * STEP;
  let best = null;
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, m = 0;
    for (let j = i; j < n; j++) {
      const x = at(j), y = h[j];
      if (!Number.isFinite(y)) break;
      sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; m++;
      if (m < 3) continue;
      const den = m * sxx - sx * sx, slope = (m * sxy - sx * sy) / den, icpt = (sy - slope * sx) / m;
      const sse = syy - 2 * slope * sxy - 2 * icpt * sy + slope * slope * sxx + 2 * slope * icpt * sx + m * icpt * icpt;
      const rms = Math.sqrt(Math.max(0, sse) / m);
      if (rms > FLAT_RMS || Math.abs(slope) > MAX_CROSS) break;
      const a = at(i), b = at(j), w = b - a;
      if (w < MIN_WIDTH) continue;
      const mid = (a + b) / 2;
      if (Math.abs(mid) > near) continue;
      // Prefer the widest; between near equals, the one nearer the map's line.
      const score = w - 0.1 * Math.abs(mid);
      if (!best || score > best.score) best = { a, b, slope, icpt, rms, score };
    }
  }
  if (!best) return null;
  // Clear edges: just outside, the slope across changes sharply (a bank or a
  // ditch), not gradually as open ground curves. Measured from 0.5 to 2.5 m
  // beyond the edge. A strip running into the window's ends has no edge there.
  const hAt = (x) => { const k = Math.round((x + U) / STEP); return k >= 0 && k < h.length ? h[k] : NaN; };
  let edges = 0;
  for (const [x, dir] of [[best.a, -1], [best.b, 1]]) {
    const p = x + dir * 0.5, q = x + dir * 2.5;
    if (Math.abs(q) > U) continue;
    const hp = hAt(p), hq = hAt(q);
    if (!Number.isFinite(hp) || !Number.isFinite(hq)) continue;
    const out = (hq - hp) / (q - p);                 // slope across, in the same direction as best.slope
    if (Math.abs(out - best.slope) >= EDGE_BREAK) edges++;
  }
  best.edges = edges;
  return best;
}

// Reads every road. groundAt(x, z): ground height. Only roads on the ground
// are read (not bridges, tunnels or junction areas). Adds c.read = { at:
// sample indices, cls (per sample, an index into READ_CLASSES), off (strip
// middle from the map's line, + = left), width, edgeL / edgeR (points of the
// strip's edges, x z pairs, NaN where none) } and returns a summary by class
// and by kind of road.
export function readGroundRoads(net, groundAt, rules) {
  const sum = { len: {}, byKind: {} };
  for (const k of READ_CLASSES) sum.len[k] = 0;
  for (const c of net.chains) {
    c.read = null;
    if (c.kind === 'path' || c.kind === 'track') continue;
    const n = c.n, every = Math.max(1, Math.round(READ_EVERY / c.ds));
    // The map's own line (before any move onto the flat strip).
    const X = c.x0 || c.x, Z = c.z0 || c.z;
    const hw = c.width / 2, sh = (rules.kinds[c.kind].sh || 0);
    const U = hw + sh + REACH, near = Math.min(6, hw + 3);
    const cls = new Uint8Array(n).fill(3), off = new Float32Array(n).fill(NaN), width = new Float32Array(n).fill(NaN);
    const edges = [];
    for (let i = 0; i < n; i += every) {
      if ((c.struct && c.struct[i]) || (c.inJ && c.inJ[i])) continue;
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = X[b] - X[a], dz = Z[b] - Z[a], L = Math.hypot(dx, dz) || 1;
      const lx = dz / L, lz = -dx / L;
      const m = Math.round(2 * U / STEP) + 1, h = new Array(m);
      for (let k = 0; k < m; k++) { const u = -U + k * STEP; h[k] = groundAt(X[i] + lx * u, Z[i] + lz * u); }
      const s = bestStrip(h, U, near);
      let k = 3;
      if (s && s.edges >= 1) {
        const w = s.b - s.a, mid = (s.a + s.b) / 2;
        const over = Math.max(0, s.a + hw, hw - s.b);     // how far the map's road hangs off the strip
        if (w > Math.max(WIDEST, 2.5 * (c.width + 2 * sh))) k = 3;   // open ground, not a street
        else if (w < 0.9 * c.width) k = 2;
        else k = over > 0.5 ? 1 : 0;
        if (k !== 3) {
          off[i] = mid; width[i] = w;
          edges.push([i, X[i] + lx * s.a, Z[i] + lz * s.a, X[i] + lx * s.b, Z[i] + lz * s.b]);
        }
      }
      for (let q = Math.max(0, i - (every >> 1)); q <= Math.min(n - 1, i + (every >> 1)); q++) cls[q] = k;
    }
    c.read = { cls, off, width, edges };
    const kind = sum.byKind[c.kind] || (sum.byKind[c.kind] = { len: 0, widths: [], mapWidth: c.width });
    for (let i = 0; i < n; i++) {
      if ((c.struct && c.struct[i]) || (c.inJ && c.inJ[i])) continue;
      sum.len[READ_CLASSES[cls[i]]] += c.ds;
      kind.len += c.ds;
      if (i % every === 0 && Number.isFinite(width[i])) kind.widths.push(width[i]);
    }
  }
  for (const k of Object.values(sum.byKind)) {
    const w = k.widths.sort((p, q) => p - q);
    k.median = w.length ? w[w.length >> 1] : NaN;
    delete k.widths;
  }
  return sum;
}

// Colours for each class.
export const READ_COLOURS = { fits: [64, 168, 96], hangs: [70, 120, 220], narrow: [222, 170, 40], unclear: [150, 150, 150] };
