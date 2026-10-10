// Road rules: roads built the way road engineers build them.
//
// Today the app drapes each road line over the ground, so a road inherits
// every bump in the height data: it humps over the earth mounds that lead up
// to a bridge and dips into every creek. Engineers work the other way round.
// They choose a design speed for each kind of road, and that speed sets how
// steep the road may be and how gently it must round off over a hilltop or
// through a dip. The road's height line is drawn first, within those limits.
//
// One rule of our own (Jim, 10 October): the ground is truth, within its own
// error. Canada's survey is bare earth, so the real embankments and cuttings
// are already in it; building them again would double them. But it is truth
// only at its own detail (a height every 2 m; the ordinary height tiles, about
// 30 m), and silent about anything smaller. So shapes the data can see are
// never changed; under a road's own footprint the ground may settle by up to
// the data's error (a few tens of centimetres on the survey, more on coarse
// tiles); beyond that the road rides above the ground on a little roadbed, or
// is a bridge. It never cuts deeper than the error (tunnels: later).
//
// This file does the same with what the map and the ground already tell us:
//
//   1. Road pieces from the map tiles are joined into whole roads, across tile
//      edges and through junctions (buildNetwork).
//   2. Where two roads cross without meeting, a few clues settle which is on
//      top: the map's bridge and tunnel tags and layers, the kind of road (a
//      motorway never meets anything level), and the shape of the ground (the
//      earth mounds either side of a bridge). (decideCrossing)
//   3. Each road gets a smooth height line that follows the ground as closely
//      as its rules allow, highest kind of road first, so lower roads give
//      way at junctions and crossings (engineer).
//   4. Where the road runs well above the ground it is a bridge on piers
//      (markStructures). The ground itself is left exactly as it is.
//   5. Every stretch is checked against its rules, so a picture can show
//      where a road (today's draped one, or this one) breaks them (checkProfile).
//
// Positions are local metres round a place's middle: x east, z south, the
// app's way (true metres = mercator metres x cos(latitude of the middle)).
// Heights are metres above sea level. Nothing here fetches or draws.
//
// The numbers are inspired by real design guides (the Transportation
// Association of Canada's Geometric Design Guide, and AASHTO's), simplified.
// They are a starting point to play with in roadlab.html, not law.

import { LINESTRING } from './mvt.js';
import { tileToMerc, tileSizeMerc } from './geo.js';
import { ROAD_STYLE, RAIL_STYLE } from './roads.js';

// ---- kinds of road ------------------------------------------------------------
//
// One set of rules per kind, worldwide; the map's own classes say which kind
// a road is (kindOf). For each:
//   V    design speed, km/h
//   G    steepest grade allowed, per cent
//   Kc   crest: how gently a hilltop must round off. K is metres of road per
//        1% change of grade; bigger is gentler. Sets how far a driver sees
//        over the top.
//   Ks   sag: the same for the bottom of a dip (comfort, headlights at night).
//   rank which gives way to which: the higher keeps its shape, the lower bends
//        to meet it.
//   noLevel  never crosses anything at the same level (motorways).
//   sh   shoulder beyond the drawn road edge, metres, kept level with the road.
//   bed  how far it may ride above the ground on its own bed, metres, to stay
//        smooth. Past that, a slow road follows the bumps instead (slow roads
//        may be bumpy); a fast one (no limit, 0) is a bridge there instead.
export const KINDS = {
  motorway:  { label: 'Motorway',        V: 120, G: 4,  Kc: 95,  Ks: 50, rank: 9, noLevel: true, sh: 3, bed: 0 },
  rail:      { label: 'Main railway',    V: 120, G: 2,  Kc: 150, Ks: 150, rank: 8, sh: 1.5, bed: 0 },
  main:      { label: 'Main road',       V: 90,  G: 5,  Kc: 45,  Ks: 30, rank: 7, sh: 2, bed: 1 },
  secondary: { label: 'Secondary road',  V: 70,  G: 7,  Kc: 20,  Ks: 20, rank: 6, sh: 1.5, bed: 0.5 },
  ramp:      { label: 'Ramp',            V: 60,  G: 6,  Kc: 15,  Ks: 15, rank: 5, sh: 1.5, bed: 0.5 },
  railMinor: { label: 'Siding or tram',  V: 40,  G: 3,  Kc: 40,  Ks: 40, rank: 4, sh: 1, bed: 0.5 },
  local:     { label: 'Local road',      V: 50,  G: 9,  Kc: 7,   Ks: 12, rank: 3, sh: 1, bed: 0.3 },
  minor:     { label: 'Lane or service', V: 30,  G: 12, Kc: 2,   Ks: 6,  rank: 2, sh: 0.5, bed: 0.2 },
  track:     { label: 'Track',           V: 20,  G: 15, Kc: 1,   Ks: 3,  rank: 1, sh: 0.3, bed: 0.1 },
  path:      { label: 'Path',            V: 10,  G: 20, Kc: 0.5, Ks: 1,  rank: 0, sh: 0.2, bed: 0.1 },
};
export const KIND_ORDER = Object.keys(KINDS);

// Settings that are not per kind.
//   hold        how closely a road follows the ground, metres: bumps smaller
//               than about this are smoothed over, bigger ones followed.
//   smooth      how hard the line is smoothed before the limits step in (x).
//   bridgeLift  a road more than this above the ground (metres) is a bridge;
//               less, and it sits on its own bed on the ground.
//   clearance   from one road's surface to the other's where one passes over
//               the other (metres): about 5 m of headroom plus the deck.
//   settleFine  how far the ground under a road may settle, up or down, where
//               it comes from Canada's survey (metres): about its error.
//   settleCoarse  the same on the ordinary height tiles, which know less.
export const SETTINGS = { hold: 1.0, smooth: 1, bridgeLift: 1.5, clearance: 6.5, settleFine: 0.3, settleCoarse: 1.5 };
// Higher than this above the ground, with no bridge on the map, no water and
// no road below: worth a look (a bridge the map does not show, or bad ground).
export const UNTOLD_BRIDGE = 4;
// Metres either side of the map's water within which a road may leave the
// ground for its bridge (the banks).
const NEAR_WATER = 25;

// Fresh copy of every rule, to change freely (the lab's sliders).
export function defaultRules() {
  const kinds = {};
  for (const k of KIND_ORDER) kinds[k] = { ...KINDS[k] };
  return { kinds, ...SETTINGS };
}

// Which kind of road a map feature is, from the map's own classes
// (OpenMapTiles' transportation layer). null: not a road we engineer.
export function kindOf(cls, p = {}) {
  if (p.indoor || (typeof p.level === 'number' && p.level < 0)) return null;
  if (cls === 'rail') return (p.service || (p.subclass && p.subclass !== 'rail')) ? 'railMinor' : 'rail';
  if (cls === 'transit') return p.subclass === 'tram' ? 'local' : 'railMinor';
  const ramp = p.ramp === 1 || p.ramp === true;
  switch (cls) {
    case 'motorway': return ramp ? 'ramp' : 'motorway';
    case 'trunk': return ramp ? 'ramp' : (p.expressway ? 'motorway' : 'main');
    case 'primary': return ramp ? 'ramp' : 'main';
    case 'secondary': case 'tertiary': return ramp ? 'ramp' : 'secondary';
    case 'minor': case 'busway': return 'local';
    case 'service': case 'raceway': return 'minor';
    case 'track': return 'track';
    case 'path': return 'path';
    default: return null;
  }
}

// Width of the drawn road, true metres: the app's own widths (roads.js), a
// railway's stone bed.
export function widthOf(line) {
  if (line.kind === 'rail' || line.kind === 'railMinor') {
    const rs = line.cls === 'transit' && line.subclass === 'tram' ? RAIL_STYLE.tram : RAIL_STYLE.main;
    return Math.max(rs.bed, 3);
  }
  const st = ROAD_STYLE[line.cls] || ROAD_STYLE.minor;
  return st.w[line.oneway ? 1 : 0];
}

// Steepest banking on a curve, and the side friction a driver can use at a
// speed (AASHTO's table, simplified). Together they give the tightest curve
// a speed allows: R = V^2 / (127 (e + f)).
const E_MAX = 0.06;
const FRICTION = [[30, 0.17], [50, 0.16], [70, 0.14], [90, 0.13], [110, 0.11], [130, 0.08]];
function friction(V) {
  if (V <= FRICTION[0][0]) return FRICTION[0][1];
  for (let i = 1; i < FRICTION.length; i++) {
    const [v1, f1] = FRICTION[i], [v0, f0] = FRICTION[i - 1];
    if (V <= v1) return f0 + (f1 - f0) * (V - v0) / (v1 - v0);
  }
  return FRICTION[FRICTION.length - 1][1];
}
export const minRadius = (V) => V * V / (127 * (E_MAX + friction(V)));

// Banking (cross slope, fraction, + = down toward the left) on a curve of
// signed radius R (metres, + = turning left), at speed V. Straight roads keep
// a 2% crown (each half sloping down to its own edge): returns null then.
export const CROWN = 0.02;
export function banking(V, R) {
  if (!Number.isFinite(R) || R === 0) return null;
  const need = V * V / (127 * Math.abs(R)) * 0.6;      // most of the turn carried by banking
  if (need < CROWN) return null;
  return Math.sign(R) * Math.min(E_MAX, need);
}

// ---- map pieces to lines ---------------------------------------------------------

// A frame: where the place's middle is and how big the area is.
//   cmx, cmy  the middle in mercator metres
//   k         true metres per mercator metre there (cos latitude)
//   half      half the area's side, true metres
export function frameFor(cmx, cmy, k, half) { return { cmx, cmy, k, half }; }

// Clip a polyline (flat [x, y, ...]) to a box. Returns the pieces inside.
export function clipPolyline(pts, x0, y0, x1, y1) {
  const out = [];
  let cur = null;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    let ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay;
    let inside = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) { inside = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { inside = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { inside = false; break; } if (r < t1) t1 = r; }
    }
    if (!inside) { if (cur) { out.push(cur); cur = null; } continue; }
    const sx = ax + dx * t0, sy = ay + dy * t0, ex = ax + dx * t1, ey = ay + dy * t1;
    if (!cur) cur = [sx, sy];
    else if (t0 > 0) { out.push(cur); cur = [sx, sy]; }
    cur.push(ex, ey);
    if (t1 < 1) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter((c) => c.length >= 4);
}

// The roads in one map tile's transportation layer, as lines in local metres,
// cut to the tile's own square (tiles carry a margin beyond it, which would
// otherwise give every road twice) and to the area.
// tile = { x, y, z }. Returns [{ pts, kind, cls, subclass, brunnel, layer, oneway }].
export function linesFromLayer(layer, tile, frame, wantKind = kindOf) {
  if (!layer) return [];
  const E = layer.extent, s = tileSizeMerc(tile.z), nw = tileToMerc(tile.x, tile.y, tile.z);
  const { cmx, cmy, k, half } = frame;
  const out = [];
  for (const f of layer.features) {
    if (f.type !== LINESTRING) continue;
    const p = f.props || {};
    const kind = wantKind(f.cls, p);
    if (!kind) continue;
    for (const part of f.parts) {
      for (const c of clipPolyline(part, 0, 0, E, E)) {
        const loc = new Array(c.length);
        for (let i = 0; i < c.length; i += 2) {
          loc[i] = (nw.x + c[i] / E * s - cmx) * k;
          loc[i + 1] = (cmy - (nw.y - c[i + 1] / E * s)) * k;
        }
        for (const piece of clipPolyline(loc, -half, -half, half, half)) {
          out.push({
            pts: piece, kind, cls: f.cls, subclass: p.subclass || null,
            brunnel: p.brunnel || null, layer: typeof p.layer === 'number' ? p.layer : 0,
            oneway: p.oneway === 1 || p.oneway === -1 || p.oneway === true,
          });
        }
      }
    }
  }
  return out;
}

// Waterways (OpenMapTiles' waterway layer) as lines, for spotting where a
// road crosses a river or a creek.
export function waterwaysFromLayer(layer, tile, frame) {
  return linesFromLayer(layer, tile, frame, (cls) => cls || 'stream')
    .map((l) => ({ pts: l.pts, cls: l.kind, culvert: l.brunnel === 'tunnel' }));
}

// ---- joining pieces into whole roads ----------------------------------------------

const SNAP = 0.6;        // metres: points this close are the same point
const T_JOIN = 1.5;      // metres: a road ending this close to another's middle joins it there

// A grid of buckets for finding nearby things quickly.
class Buckets {
  constructor(cell) { this.cell = cell; this.m = new Map(); }
  key(i, j) { return i * 100003 + j; }
  add(x, z, v) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(v);
  }
  addBox(x0, z0, x1, z1, v) {
    const c = this.cell;
    for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) {
      const k = this.key(i, j); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(v);
    }
  }
  near(x, z, r, fn) {
    const c = this.cell;
    for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) {
      const a = this.m.get(this.key(i, j)); if (a) for (const v of a) fn(v);
    }
  }
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t, z = az + dz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}

// Where two segments cross, as fractions along each, or null.
export function segCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const rX = bx - ax, rZ = bz - az, sX = dx - cx, sZ = dz - cz;
  const den = rX * sZ - rZ * sX;
  if (Math.abs(den) < 1e-12) return null;
  const qx = cx - ax, qz = cz - az;
  const t = (qx * sZ - qz * sX) / den, u = (qx * rZ - qz * rX) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

// Joins map lines into whole roads ("chains").
//
// Points closer than SNAP are one point. A line that ends on another line's
// middle (a T junction the map drew without a shared point) is joined there.
// Lines are cut at every point they share with another line (junctions), and
// the pieces are joined back up through each junction along the straightest
// way on for the same kind of road, so a motorway stays one road past its
// ramps and a road keeps going through its own bridge.
//
// Returns { chains, nodes } where each chain is
//   { id, kind, cls, width, pts: [x, z, ...], seg: [{ brunnel, layer, oneway, cls }] per segment,
//     a, b: end node ids (-1 for a closed ring), length }
// and nodes[id] = { x, z, chains: [chain ids] }.
export function buildNetwork(lines) {
  // 1. Points to shared ids.
  const pts = [];          // id -> [x, z]
  const pb = new Buckets(4);
  const idOf = (x, z) => {
    let best = -1, bd = SNAP;
    pb.near(x, z, SNAP, (id) => { const d = Math.hypot(pts[id][0] - x, pts[id][1] - z); if (d < bd) { bd = d; best = id; } });
    if (best >= 0) return best;
    pts.push([x, z]); pb.add(x, z, pts.length - 1);
    return pts.length - 1;
  };
  const L = [];
  for (const l of lines) {
    const ids = [];
    for (let i = 0; i < l.pts.length; i += 2) {
      const id = idOf(l.pts[i], l.pts[i + 1]);
      if (ids[ids.length - 1] !== id) ids.push(id);
    }
    if (ids.length >= 2) L.push({ ...l, ids });
  }

  // 2. T junctions: a loose end close to another line's middle joins it.
  const uses = new Map();
  const use = (id, li) => { let s = uses.get(id); if (!s) uses.set(id, s = new Set()); s.add(li); };
  L.forEach((l, li) => l.ids.forEach((id) => use(id, li)));
  const sb = new Buckets(25);
  L.forEach((l, li) => {
    for (let k = 0; k + 1 < l.ids.length; k++) {
      const [ax, az] = pts[l.ids[k]], [bx, bz] = pts[l.ids[k + 1]];
      sb.addBox(Math.min(ax, bx) - T_JOIN, Math.min(az, bz) - T_JOIN, Math.max(ax, bx) + T_JOIN, Math.max(az, bz) + T_JOIN, [li, k]);
    }
  });
  const inserts = new Map();     // line index -> [{ k, t, id }]
  L.forEach((l, li) => {
    for (const end of [l.ids[0], l.ids[l.ids.length - 1]]) {
      if (uses.get(end).size > 1) continue;
      const [x, z] = pts[end];
      let best = null;
      sb.near(x, z, T_JOIN, ([lj, k]) => {
        if (lj === li) return;
        const m = L[lj], [ax, az] = pts[m.ids[k]], [bx, bz] = pts[m.ids[k + 1]];
        const r = segDist(x, z, ax, az, bx, bz);
        if (r.d < T_JOIN && (!best || r.d < best.d)) best = { lj, k, t: r.t, d: r.d };
      });
      if (!best) continue;
      const m = L[best.lj];
      if (best.t <= 1e-6) { l.ids[l.ids.indexOf(end)] = m.ids[best.k]; continue; }
      if (best.t >= 1 - 1e-6) { l.ids[l.ids.indexOf(end)] = m.ids[best.k + 1]; continue; }
      let a = inserts.get(best.lj); if (!a) inserts.set(best.lj, a = []);
      a.push({ k: best.k, t: best.t, id: end });
    }
  });
  for (const [li, a] of inserts) {
    a.sort((p, q) => p.k - q.k || p.t - q.t);
    const l = L[li], ids = [];
    let j = 0;
    for (let k = 0; k < l.ids.length; k++) {
      ids.push(l.ids[k]);
      while (j < a.length && a[j].k === k) { if (ids[ids.length - 1] !== a[j].id) ids.push(a[j].id); j++; }
    }
    l.ids = ids;
  }

  // 3. Cut lines at every shared point into edges.
  uses.clear();
  L.forEach((l, li) => l.ids.forEach((id) => use(id, li)));
  const count = new Map();
  for (const l of L) for (const id of l.ids) count.set(id, (count.get(id) || 0) + 1);
  const isNode = (l, k) => k === 0 || k === l.ids.length - 1 || count.get(l.ids[k]) > 1;
  const edges = [];
  for (const l of L) {
    let start = 0;
    for (let k = 1; k < l.ids.length; k++) {
      if (!isNode(l, k)) continue;
      const ids = l.ids.slice(start, k + 1);
      let len = 0;
      for (let q = 0; q + 1 < ids.length; q++) len += Math.hypot(pts[ids[q + 1]][0] - pts[ids[q]][0], pts[ids[q + 1]][1] - pts[ids[q]][1]);
      if (len > 0.05) edges.push({ ids, line: l, len });
      start = k;
    }
  }

  // 4. At each node, pair up ends of the same kind of road that carry on
  //    straightest (no more than 45 degrees off straight).
  const ends = new Map();        // node id -> [{ e, end, dx, dz }]
  const dirFrom = (ids, rev) => {
    const seq = rev ? ids.slice().reverse() : ids;
    const [x0, z0] = pts[seq[0]];
    let x = x0, z = z0, acc = 0;
    for (let q = 1; q < seq.length && acc < 12; q++) { const [px, pz] = pts[seq[q]]; acc += Math.hypot(px - x, pz - z); x = px; z = pz; }
    const d = Math.hypot(x - x0, z - z0) || 1;
    return [(x - x0) / d, (z - z0) / d];
  };
  edges.forEach((e, ei) => {
    for (const end of [0, 1]) {
      const id = end ? e.ids[e.ids.length - 1] : e.ids[0];
      const [dx, dz] = dirFrom(e.ids, end === 1);
      let a = ends.get(id); if (!a) ends.set(id, a = []);
      a.push({ e: ei, end, dx, dz });
    }
  });
  const link = new Map();         // 'edge:end' -> 'edge:end'
  const ek = (e, end) => e * 2 + end;
  for (const [, a] of ends) {
    if (a.length < 2) continue;
    const pairs = [];
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      if (a[i].e === a[j].e) continue;
      if (edges[a[i].e].line.kind !== edges[a[j].e].line.kind) continue;
      const dot = a[i].dx * a[j].dx + a[i].dz * a[j].dz;
      if (dot < -0.707) pairs.push([dot, i, j]);
    }
    pairs.sort((p, q) => p[0] - q[0]);
    const taken = new Set();
    for (const [, i, j] of pairs) {
      if (taken.has(i) || taken.has(j)) continue;
      taken.add(i); taken.add(j);
      link.set(ek(a[i].e, a[i].end), ek(a[j].e, a[j].end));
      link.set(ek(a[j].e, a[j].end), ek(a[i].e, a[i].end));
    }
  }

  // 5. Walk the links into chains.
  const used = new Uint8Array(edges.length);
  const chains = [];
  const junction = new Set();
  for (const [id, a] of ends) if (a.length >= 2 || a.length === 1) junction.add(id);
  const walk = (e0, end0) => {
    // Start at edge e0's end `end0` and go away from it.
    const seq = [];
    let e = e0, from = end0;
    for (;;) {
      used[e] = 1;
      seq.push([e, from === 1]);
      const other = ek(e, 1 - from);
      const nx = link.get(other);
      if (nx === undefined) break;
      const ne = nx >> 1, nend = nx & 1;
      if (used[ne]) break;
      e = ne; from = nend;
    }
    return seq;
  };
  const addChain = (seq, closed) => {
    const P = [], seg = [];
    let line0 = edges[seq[0][0]].line;
    for (const [e, rev] of seq) {
      const E = edges[e], ids = rev ? E.ids.slice().reverse() : E.ids;
      const attr = { brunnel: E.line.brunnel, layer: E.line.layer, oneway: E.line.oneway, cls: E.line.cls };
      for (let q = P.length ? 1 : 0; q < ids.length; q++) {
        P.push(ids[q]);
        if (P.length > 1) seg.push(attr);
      }
    }
    const flat = [];
    for (const id of P) flat.push(pts[id][0], pts[id][1]);
    let len = 0;
    const at = [];                 // [node id, distance along] for every junction on it
    for (let q = 0; q < P.length; q++) {
      if (q) len += Math.hypot(flat[2 * q] - flat[2 * q - 2], flat[2 * q + 1] - flat[2 * q - 1]);
      if (junction.has(P[q])) at.push([P[q], len]);
    }
    // The widest piece sets the width (a divided road's two halves are one-way).
    const ow = seg.filter((s) => s.oneway).length > seg.length / 2;
    const c = { id: chains.length, kind: line0.kind, cls: line0.cls, subclass: line0.subclass, oneway: ow,
      pts: flat, seg, a: closed ? -1 : P[0], b: closed ? -1 : P[P.length - 1], length: len, closed, at };
    c.width = widthOf(c);
    chains.push(c);
  };
  for (let ei = 0; ei < edges.length; ei++) {
    if (used[ei]) continue;
    // Find a free end: an end with no link.
    let start = null;
    for (const end of [0, 1]) if (!link.has(ek(ei, end))) { start = end; break; }
    if (start === null) {
      // Maybe the middle of a chain: walk back to its free end first.
      let e = ei, from = 0, guard = 0, ring = false;
      for (;;) {
        const nx = link.get(ek(e, from));
        if (nx === undefined) break;
        const ne = nx >> 1, nend = nx & 1;
        if (ne === ei || ++guard > edges.length) { ring = true; break; }
        e = ne; from = 1 - nend;
      }
      if (ring) { addChain(walk(ei, 0), true); continue; }
      addChain(walk(e, from), false);
      continue;
    }
    addChain(walk(ei, start), false);
  }
  for (let ei = 0; ei < edges.length; ei++) if (!used[ei]) addChain(walk(ei, 0), true);

  // nodes[id] = { x, z, chains: [chain ids], on: [[chain id, distance along]] }
  // for every end and junction, including roads that pass straight through.
  const nodes = {};
  for (const c of chains) {
    for (const [id, s] of c.at) {
      if (!nodes[id]) nodes[id] = { x: pts[id][0], z: pts[id][1], chains: [], on: [] };
      const nd = nodes[id];
      if (!nd.chains.includes(c.id)) nd.chains.push(c.id);
      nd.on.push([c.id, s]);
    }
  }
  return { chains, nodes };
}

// ---- sampling --------------------------------------------------------------------

export const DS = 2;     // metres between samples along a road

// Even samples along each chain: x, z, distance s, and per sample the
// bridge (1), tunnel (2) or ford (3) tag and the map's layer.
export function sampleChains(net, ds = DS) {
  for (const c of net.chains) {
    const n = Math.max(2, Math.ceil(c.length / ds) + 1), step = c.length / (n - 1);
    const x = new Float64Array(n), z = new Float64Array(n), br = new Uint8Array(n), lay = new Int8Array(n), seg = new Int32Array(n);
    let si = 0, acc = 0;
    const P = c.pts, segLen = (i) => Math.hypot(P[2 * i + 2] - P[2 * i], P[2 * i + 3] - P[2 * i + 1]);
    for (let i = 0; i < n; i++) {
      const want = i * step;
      while (si < c.seg.length - 1 && acc + segLen(si) < want) { acc += segLen(si); si++; }
      const L = segLen(si) || 1, t = Math.max(0, Math.min(1, (want - acc) / L));
      x[i] = P[2 * si] + (P[2 * si + 2] - P[2 * si]) * t;
      z[i] = P[2 * si + 1] + (P[2 * si + 3] - P[2 * si + 1]) * t;
      const a = c.seg[si];
      br[i] = a.brunnel === 'bridge' ? 1 : a.brunnel === 'tunnel' ? 2 : a.brunnel === 'ford' ? 3 : 0;
      lay[i] = a.layer || 0;
      seg[i] = si;
    }
    Object.assign(c, { n, ds: step, x, z, br, lay });
    // Plan curvature (signed radius, + = turning left) over a base that grows
    // with speed: the map's line is a chain of straight pieces, and a short
    // base would read every corner as a hairpin.
    const V = KINDS[c.kind].V, half = Math.max(1, Math.round(Math.max(10, V / 2) / step));
    const R = new Float64Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - half), b = Math.min(n - 1, i + half);
      if (b - a < 2) continue;
      const ax = x[a], az = z[a], bx = x[i], bz = z[i], cx = x[b], cz = z[b];
      const cr = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const d = Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az);
      if (Math.abs(cr) > 1e-9) R[i] = -d / (2 * cr);   // z points south, so a left turn is a negative cross
    }
    c.R = R;
  }
  return net;
}

// Where roads cross without meeting: [{ a, b, ia, ib, x, z }] with ia, ib
// fractional sample positions on chains a and b. Crossings within a few
// metres of a junction the two share are the junction itself and skipped.
export function findCrossings(net) {
  const sb = new Buckets(20), out = [];
  for (const c of net.chains) {
    for (let i = 0; i + 1 < c.n; i++) {
      sb.addBox(Math.min(c.x[i], c.x[i + 1]), Math.min(c.z[i], c.z[i + 1]), Math.max(c.x[i], c.x[i + 1]), Math.max(c.z[i], c.z[i + 1]), c.id * 1e6 + i);
    }
  }
  const seen = new Set();
  for (const A of net.chains) {
    for (let i = 0; i + 1 < A.n; i++) {
      const cand = new Set();
      sb.near((A.x[i] + A.x[i + 1]) / 2, (A.z[i] + A.z[i + 1]) / 2, A.ds, (v) => cand.add(v));
      for (const v of cand) {
        const bid = Math.floor(v / 1e6), j = v - bid * 1e6;
        if (bid <= A.id) continue;
        const B = net.chains[bid];
        const r = segCross(A.x[i], A.z[i], A.x[i + 1], A.z[i + 1], B.x[j], B.z[j], B.x[j + 1], B.z[j + 1]);
        if (!r) continue;
        const x = A.x[i] + (A.x[i + 1] - A.x[i]) * r.t, z = A.z[i] + (A.z[i + 1] - A.z[i]) * r.t;
        // A junction the two share nearby: that is where they meet, not a crossing.
        let atNode = false;
        const onB = new Set(B.at.map(([id]) => id));
        for (const [id] of A.at) {
          if (!onB.has(id)) continue;
          const nd = net.nodes[id];
          if (Math.hypot(nd.x - x, nd.z - z) < 6) atNode = true;
        }
        if (atNode) continue;
        const key = A.id + ':' + bid + ':' + Math.round(x / 8) + ':' + Math.round(z / 8);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a: A.id, b: bid, ia: i + r.t, ib: j + r.u, x, z });
      }
    }
  }
  return out;
}

// Where roads cross a river or creek: [{ chain, i, cls, culvert }].
export function findWaterCrossings(net, waterways) {
  const out = [];
  const sb = new Buckets(20);
  waterways.forEach((w, wi) => {
    for (let k = 0; k + 3 < w.pts.length; k += 2) {
      const p = w.pts;
      sb.addBox(Math.min(p[k], p[k + 2]), Math.min(p[k + 1], p[k + 3]), Math.max(p[k], p[k + 2]), Math.max(p[k + 1], p[k + 3]), [wi, k]);
    }
  });
  for (const c of net.chains) {
    for (let i = 0; i + 1 < c.n; i++) {
      const seen = new Set();
      sb.near((c.x[i] + c.x[i + 1]) / 2, (c.z[i] + c.z[i + 1]) / 2, c.ds, ([wi, k]) => {
        if (seen.has(wi * 1e6 + k)) return; seen.add(wi * 1e6 + k);
        const p = waterways[wi].pts;
        const r = segCross(c.x[i], c.z[i], c.x[i + 1], c.z[i + 1], p[k], p[k + 1], p[k + 2], p[k + 3]);
        if (r) out.push({ chain: c.id, i: i + r.t, cls: waterways[wi].cls, culvert: waterways[wi].culvert });
      });
    }
  }
  return out;
}

// ---- the height line --------------------------------------------------------------

// Solves A p = b for a symmetric matrix with two diagonals either side of the
// main one: d0[i] = A[i][i], d1[i] = A[i][i+1], d2[i] = A[i][i+2].
function solveBand(d0, d1, d2, b) {
  const n = d0.length;
  const l0 = new Float64Array(n), l1 = new Float64Array(n), l2 = new Float64Array(n);   // L[i][i], L[i][i-1], L[i][i-2]
  for (let i = 0; i < n; i++) {
    if (i >= 2) l2[i] = d2[i - 2] / l0[i - 2];
    if (i >= 1) l1[i] = (d1[i - 1] - (i >= 2 ? l2[i] * l1[i - 1] : 0)) / l0[i - 1];
    const s = d0[i] - l1[i] * l1[i] - l2[i] * l2[i];
    l0[i] = Math.sqrt(Math.max(s, 1e-12));
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = (b[i] - (i >= 1 ? l1[i] * y[i - 1] : 0) - (i >= 2 ? l2[i] * y[i - 2] : 0)) / l0[i];
  const p = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) p[i] = (y[i] - (i + 1 < n ? l1[i + 1] * p[i + 1] : 0) - (i + 2 < n ? l2[i + 2] * p[i + 2] : 0)) / l0[i];
  return p;
}

// The smoothest height line that follows the ground (targets t, trust w per
// sample) within the kind's limits.
//
//   fixed   Map(sample -> height): must pass exactly (junctions, level crossings)
//   lower   Map(sample -> height): must be at least (passing over something)
//   upper   Map(sample -> height): must be at most (passing under something)
//
// How it works: a line is fitted that balances staying near the ground
// against bending. Ground that is far from the line counts for less each
// round (a mound beside a bridge, a creek bed), so the line does not chase
// it. Wherever the line still bends more sharply than a crest or sag of the
// kind allows, it is stiffened there; wherever it is still steeper than the
// kind allows, it is held to that grade; wherever it breaks a must, that
// point is pinned. Until nothing breaks, or 60 rounds of that.
// floor (optional, per sample): the ground, which the line may not go under
// (-Infinity where it may: a tunnel). Where it would, it is held up there,
// harder each round, so it rides smoothly over what it cannot follow.
// ceil (optional, per sample): the most it may ride above the ground there
// (Infinity: no limit). Where it would ride higher, it is pulled down to it
// and the smoothness rules give way there: the road follows the bumps.
// Returns { p, ok, rounds }.
const FLOOR_GAP = 0.03, FLOOR_SLACK = 0.02;
export function fitProfile(t, w0, ds, kind, rules, fixed = new Map(), lower = new Map(), upper = new Map(), floor = null, ceil = null) {
  const n = t.length;
  if (n < 3) {
    const p = Float64Array.from(t);
    for (const [i, h] of fixed) p[i] = h;
    return { p, ok: true, rounds: 0 };
  }
  const kc = 1 / (100 * kind.Kc), ks = 1 / (100 * kind.Ks), G = kind.G / 100;
  const sig = Math.max(0.05, rules.hold);
  // A first stiffness that smooths over bumps about the size the crest rule
  // could never follow; the rounds then stiffen only where needed.
  const ell = 0.35 * Math.sqrt(100 * Math.min(kind.Kc, kind.Ks) * sig) * (rules.smooth || 1);
  const lam0 = Math.pow(Math.max(1, ell / ds), 4);
  const lam = new Float64Array(n).fill(lam0);
  const gam = new Float64Array(n - 1), gs = new Int8Array(n - 1);
  const fw = new Float64Array(n);          // how hard each point is held up off the ground (0 = not yet)
  const cw = new Float64Array(n);          // how hard each point is held down to its roadbed limit
  const free = new Uint8Array(n);          // near a held-down point: smoothness rules give way
  const pin = new Map(fixed);
  let w = Float64Array.from(w0);
  // With no trusted ground at all, keep a whisper of it so the line is defined.
  let any = false; for (let i = 0; i < n; i++) if (w[i] > 0) { any = true; break; }
  if (!any) w.fill(1e-6);
  let p = null, ok = false, round = 0;
  const ROBUST_ROUNDS = 8;
  for (; round < 120 + ROBUST_ROUNDS; round++) {
    const d0 = new Float64Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n), b = new Float64Array(n);
    for (let i = 0; i < n; i++) { d0[i] += w[i]; b[i] += w[i] * t[i]; }
    for (let i = 0; i < n; i++) {              // held up to the ground
      if (!fw[i]) continue;
      d0[i] += fw[i]; b[i] += fw[i] * (floor[i] + FLOOR_GAP);
    }
    for (let i = 0; i < n; i++) {              // held down to its roadbed limit
      if (!cw[i]) continue;
      d0[i] += cw[i]; b[i] += cw[i] * (ceil[i] - FLOOR_GAP);
    }
    for (let i = 1; i < n - 1; i++) {          // bending at i: p[i-1] - 2 p[i] + p[i+1]
      const L = lam[i];
      d0[i - 1] += L; d0[i] += 4 * L; d0[i + 1] += L;
      d1[i - 1] -= 2 * L; d1[i] -= 2 * L;
      d2[i - 1] += L;
    }
    for (let i = 0; i < n - 1; i++) {          // held to the steepest grade
      if (!gam[i]) continue;
      const g = gam[i], target = gs[i] * G * ds;
      d0[i] += g; d0[i + 1] += g; d1[i] -= g;
      b[i] -= g * target; b[i + 1] += g * target;
    }
    // Pinned points, exactly: their known heights move to the right-hand side.
    for (const [i, h] of pin) {
      const col = (r) => r === i ? d0[i] : r === i - 1 ? d1[i - 1] : r === i + 1 ? d1[i] : r === i - 2 ? d2[i - 2] : r === i + 2 ? d2[i] : 0;
      for (const r of [i - 2, i - 1, i + 1, i + 2]) {
        if (r < 0 || r >= n || pin.has(r)) continue;
        b[r] -= col(r) * h;
      }
      if (i >= 1) d1[i - 1] = 0; if (i < n - 1) d1[i] = 0;
      if (i >= 2) d2[i - 2] = 0; if (i < n - 2) d2[i] = 0;
      d0[i] = 1; b[i] = h;
    }
    p = solveBand(d0, d1, d2, b);
    let broke = false;
    // First, a few rounds that only learn which ground to trust: ground far
    // from the line counts for less. Then the trust is frozen, and the limits
    // are applied. (Doing both at once lets the line drift off the ground
    // altogether: stiffened, it moves away, trusts the ground less, moves
    // further.)
    if (round < ROBUST_ROUNDS) {
      // Only ground below the line is doubted (a creek bed, a ditch): ground
      // above it is a floor the line may not go under anyway.
      for (let i = 0; i < n; i++) { const r = floor ? Math.max(0, p[i] - t[i]) / sig : (p[i] - t[i]) / sig; w[i] = w0[i] / (1 + r * r); }
      if (!any) w.fill(1e-6);
      continue;
    }
    // Riding higher than its roadbed allows: pulled down, and the smoothness
    // rules give way around there (they are relaxed back to the start).
    if (ceil) {
      for (let i = 0; i < n; i++) {
        if (p[i] <= ceil[i] + FLOOR_SLACK || pin.has(i)) continue;
        cw[i] = cw[i] ? Math.min(cw[i] * 4, lam0 * 1e9) : 100;
        for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { free[j] = 1; lam[j] = Math.min(lam[j], lam0); if (j < n - 1) gam[j] = 0; }
        broke = true;
      }
    }
    for (let i = 1; i < n - 1; i++) {
      if (free[i]) continue;
      const k = (p[i - 1] - 2 * p[i] + p[i + 1]) / (ds * ds);
      if (k < -kc * 1.05 || k > ks * 1.05) {
        lam[i] = Math.min(lam[i] * 1.6, lam0 * 1e7);
        broke = true;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      if (free[i] || free[i + 1]) continue;
      const g = (p[i + 1] - p[i]) / ds;
      if (Math.abs(g) > G * 1.02) {
        if (!gam[i] || gs[i] !== Math.sign(g)) { gam[i] = 1e3 * lam0; gs[i] = Math.sign(g); }
        else gam[i] = Math.min(gam[i] * 4, lam0 * 1e9);
        broke = true;
      }
    }
    if (floor) {
      for (let i = 0; i < n; i++) {
        if (p[i] >= floor[i] - FLOOR_SLACK || pin.has(i)) continue;
        fw[i] = fw[i] ? Math.min(fw[i] * 4, lam0 * 1e9) : 100;
        broke = true;
      }
    }
    for (const [i, h] of lower) if (p[i] < h - 0.05 && !pin.has(i)) { pin.set(i, h); broke = true; }
    for (const [i, h] of upper) if (p[i] > h + 0.05 && !pin.has(i)) { pin.set(i, h); broke = true; }
    if (!broke) { ok = true; break; }
  }
  return { p, ok, rounds: round + 1 };
}

const lerpAt = (a, f) => {
  const i = Math.max(0, Math.min(a.length - 1, Math.floor(f))), j = Math.min(a.length - 1, i + 1), u = f - i;
  return a[i] * (1 - u) + a[j] * u;
};

// Settles which of two crossing roads is on top. A has its height line
// already; B is being worked out. Clues, strongest first:
//   tags    the map says one is a bridge or tunnel, or gives them layers;
//   ground  just beyond A's road, B's ground stands well above A (B rides on
//           approach mounds: over) or well below (B is in a cutting: under);
//   kind    a motorway never meets anything level.
// Returns { rel: 'over' | 'under' | 'level', tag, ground, d, guessed, conflict }.
export function decideCrossing(A, ia, B, ib, rules) {
  const kA = rules.kinds[A.kind], kB = rules.kinds[B.kind];
  const hA = lerpAt(A.prof, ia);
  const iA = Math.round(ia), iB = Math.round(ib);
  const bA = A.br[iA], bB = B.br[iB], lA = A.lay[iA], lB = B.lay[iB];
  let tag = null;
  if (bB === 1 || bA === 2 || lB > lA) tag = 'over';
  else if (bB === 2 || bA === 1 || lB < lA) tag = 'under';
  // B's ground from just past A's edge to 25 m further, both sides.
  const off = (A.width / 2 + kA.sh + 6) / B.ds, far = off + 25 / B.ds;
  const vals = [];
  for (const sgn of [-1, 1]) for (let f = off; f <= far; f += 1) {
    const q = ib + sgn * f;
    if (q < 0 || q > B.n - 1) continue;
    vals.push(lerpAt(B.raw, q));
  }
  vals.sort((p, q) => p - q);
  const d = vals.length ? vals[vals.length >> 1] - hA : 0;
  const ground = d > 3 ? 'over' : d < -3 ? 'under' : 'level';
  const noLevel = kA.noLevel || kB.noLevel;
  let rel, guessed = false;
  if (tag) rel = tag;
  else if (ground !== 'level') rel = ground;
  else if (noLevel) { rel = d >= 0 ? 'over' : 'under'; guessed = true; }
  else rel = 'level';
  const conflict = !!(tag && ground !== 'level' && tag !== ground);
  return { rel, tag, ground, d, guessed, conflict, hA };
}

// Works out every road's height line, highest kind first, so each lower road
// meets the ones above it at their height. groundAt(x, z) gives the natural
// ground (NaN where unknown); waterAt(x, z) (optional) says whether a point
// is on the map's water.
// Adds to each chain: raw (ground under it), prof (its height line), ok,
// struct (0 on the ground, 1 bridge, 2 tunnel), why (per sample, what made it a
// structure). Returns { crossings, flags }.
export function engineer(net, groundAt, rules, opt = {}) {
  const { chains } = net;
  const crossings = net.crossings || findCrossings(net);
  const water = opt.waterCrossings || [];
  for (const c of chains) {
    const raw = new Float64Array(c.n);
    let last = NaN;
    for (let i = 0; i < c.n; i++) { const g = groundAt(c.x[i], c.z[i]); raw[i] = g; if (Number.isFinite(g)) last = g; }
    // Unknown ground: the nearest known.
    let lastK = Number.isFinite(raw[0]) ? raw[0] : last;
    for (let i = 0; i < c.n; i++) { if (Number.isFinite(raw[i])) lastK = raw[i]; else raw[i] = Number.isFinite(lastK) ? lastK : 0; }
    c.raw = raw;
    c.w = new Float64Array(c.n).fill(1);
    c.struct = new Uint8Array(c.n);
    c.why = new Array(c.n).fill(null);
    c.known = new Uint8Array(c.n);         // the map gives a reason to be off the ground here
    for (let i = 0; i < c.n; i++) {
      if (c.br[i] === 1) { c.w[i] = 0; c.struct[i] = 1; c.why[i] = 'map: bridge'; }
      else if (c.br[i] === 2) { c.w[i] = 0; c.struct[i] = 2; c.why[i] = 'map: tunnel'; }
      else if (opt.waterAt && opt.waterAt(c.x[i], c.z[i])) { c.w[i] = 0; c.struct[i] = 1; c.why[i] = 'over the map\'s water'; }
      if (c.struct[i]) c.known[i] = 1;
    }
    // Over the map's water at any height, it is a bridge; near the water
    // (the banks) it may leave the ground to reach it, and is not flagged.
    const near = Math.round(NEAR_WATER / c.ds);
    const over = c.struct.map((v, i) => c.why[i] === 'over the map\'s water' ? 1 : 0);
    for (let i = 0; i < c.n; i++) {
      if (!over[i]) continue;
      for (let j = Math.max(0, i - near); j <= Math.min(c.n - 1, i + near); j++) { c.known[j] = 1; c.w[j] = Math.min(c.w[j], 0.2); }
    }
    c.prof = null;
    // How far the ground under it may settle: the data's own error there.
    c.tol = new Float64Array(c.n);
    for (let i = 0; i < c.n; i++) c.tol[i] = opt.tolAt ? opt.tolAt(c.x[i], c.z[i]) : rules.settleFine;
  }
  // Rivers and creeks: the road does not dip into them. Rivers and canals are
  // bridged. Creeks and ditches would really go through a pipe under a bank
  // (a culvert), but the ground is never built up here, so where the road
  // rides high enough over one it is a small bridge.
  for (const wc of water) {
    const c = chains[wc.chain], big = wc.cls === 'river' || wc.cls === 'canal';
    const reach = (big ? 15 : 8) / c.ds;
    for (let i = Math.max(0, Math.floor(wc.i - reach)); i <= Math.min(c.n - 1, Math.ceil(wc.i + reach)); i++) {
      c.w[i] = 0; c.known[i] = 1;
      if (big && !c.struct[i]) c.struct[i] = 1;
      if (!c.why[i]) c.why[i] = 'map: crosses a ' + wc.cls;
    }
  }

  const order = chains.slice().sort((p, q) => rules.kinds[q.kind].rank - rules.kinds[p.kind].rank || q.length - p.length);
  const nodeH = new Map();
  const byChain = new Map();
  for (const x of crossings) {
    for (const id of [x.a, x.b]) { let a = byChain.get(id); if (!a) byChain.set(id, a = []); a.push(x); }
  }
  const flags = [];
  for (const B of order) {
    const kB = rules.kinds[B.kind];
    const fixed = new Map(), lower = new Map(), upper = new Map();
    // Every junction on it whose height a higher road has already set.
    for (const [id, s] of B.at) if (nodeH.has(id)) fixed.set(Math.max(0, Math.min(B.n - 1, Math.round(s / B.ds))), nodeH.get(id));
    B.decisions = [];
    for (const x of byChain.get(B.id) || []) {
      const otherId = x.a === B.id ? x.b : x.a;
      const A = chains[otherId];
      if (!A.prof) continue;                       // A comes later: it decides
      const ia = x.a === A.id ? x.ia : x.ib, ib = x.a === B.id ? x.ia : x.ib;
      const dec = decideCrossing(A, ia, B, ib, rules);
      dec.x = x.x; dec.z = x.z; dec.a = A.id; dec.b = B.id; dec.ia = ia; dec.ib = ib;
      B.decisions.push(dec);
      const i = Math.round(ib);
      if (dec.rel === 'level') { fixed.set(i, dec.hA); }
      else if (dec.rel === 'over') {
        lower.set(i, dec.hA + rules.clearance);
        markDeck(B, ib, A.width / 2 + rules.kinds[A.kind].sh + 3, 'passes over ' + rules.kinds[A.kind].label.toLowerCase());
      } else {
        upper.set(i, dec.hA - rules.clearance);
        markDeck(A, ia, B.width / 2 + kB.sh + 3, 'carries ' + kB.label.toLowerCase() + ' under it');
      }
      if (dec.conflict) flags.push({ x: x.x, z: x.z, kind: 'clue', text: `${kB.label} crossing ${rules.kinds[A.kind].label.toLowerCase()}: the map says ${dec.tag}, the ground says ${dec.ground}. Went with the map.` });
      else if (dec.guessed) flags.push({ x: x.x, z: x.z, kind: 'guess', text: `${kB.label} crossing ${rules.kinds[A.kind].label.toLowerCase()}: no tag and flat ground. Guessed ${dec.rel}.` });
    }
    const t = B.raw, w = B.w;
    // The ground, less its error, is a floor the road may not go under,
    // except in a tunnel.
    const floor = new Float64Array(B.n);
    for (let i = 0; i < B.n; i++) floor[i] = B.struct[i] === 2 ? -Infinity : B.raw[i] - B.tol[i];
    // Its roadbed limit, except where the map says it leaves the ground
    // (a bridge, water, a creek, a road below).
    let ceil = null;
    if (kB.bed > 0) {
      ceil = new Float64Array(B.n);
      for (let i = 0; i < B.n; i++) ceil[i] = B.known[i] ? Infinity : B.raw[i] + Math.max(kB.bed, B.tol[i]);
    }
    const r = fitProfile(t, w, B.ds, kB, rules, fixed, lower, upper, floor, ceil);
    B.prof = r.p; B.ok = r.ok; B.rounds = r.rounds;
    for (const [id, s] of B.at) if (!nodeH.has(id)) nodeH.set(id, lerpAt(B.prof, s / B.ds));
  }

  // Well above the ground: a bridge. Untagged ones high up are worth a look:
  // the map may be missing a bridge, or the ground be wrong. The ground
  // itself is never changed: what is under each road is the ground as found.
  for (const c of chains) {
    // The ground under it after settling: up to the data's error toward the road.
    c.under = new Float64Array(c.n);
    for (let i = 0; i < c.n; i++) c.under[i] = c.raw[i] + Math.max(-c.tol[i], Math.min(c.tol[i], c.prof[i] - SETTLE_SURF - c.raw[i]));
    let run = null;
    const close = () => {
      if (!run) return;
      const i = (run.i0 + run.i1) >> 1;
      if (run.max > UNTOLD_BRIDGE && run.i1 - run.i0 >= 2 && !run.known) flags.push({ x: c.x[i], z: c.z[i], kind: 'bridge',
        text: `${rules.kinds[c.kind].label}: rides ${run.max.toFixed(0)} m above the ground for ${((run.i1 - run.i0) * c.ds).toFixed(0)} m, with no bridge on the map. A missing bridge, or wrong ground?` });
      run = null;
    };
    for (let i = 0; i < c.n; i++) {
      const lift = c.prof[i] - c.under[i];
      let untold = false;
      if (!c.struct[i] && lift > rules.bridgeLift) { c.struct[i] = 1; if (!c.why[i]) c.why[i] = 'above the ground: bridge'; untold = true; }
      if (untold && run) { run.i1 = i; run.max = Math.max(run.max, lift); run.known ||= c.known[i]; }
      else { close(); if (untold) run = { i0: i, i1: i, max: lift, known: c.known[i] }; }
    }
    close();
    if (!c.ok) {
      let worst = 0, wi = 0;
      const sc = checkProfile(c, c.prof, rules.kinds[c.kind]);
      for (let i = 0; i < c.n; i++) if (sc.vert[i] > worst) { worst = sc.vert[i]; wi = i; }
      if (worst > 1.05) flags.push({ x: c.x[wi], z: c.z[wi], kind: 'rules',
        text: `${rules.kinds[c.kind].label}: cannot keep to its rules here (${(worst * 100).toFixed(0)}% of its limit). The roads it must meet disagree.` });
    }
  }
  return { crossings, flags };
}

// Mark a stretch around fractional sample f, `half` metres either way, as a
// deck over something below.
function markDeck(c, f, half, why) {
  const r = half / c.ds;
  for (let i = Math.max(0, Math.floor(f - r)); i <= Math.min(c.n - 1, Math.ceil(f + r)); i++) {
    if (c.struct[i] !== 2) { c.struct[i] = 1; if (!c.why[i]) c.why[i] = why; }
    c.w[i] = 0; c.known[i] = 1;
  }
}

// ---- checking a height line against the rules --------------------------------------

// How hard each sample pushes its kind's limits: 1 = exactly at the limit.
// Measured over 10 m (grade and rounding off) so that tiny steps between
// height samples do not count. vert: steepness and crest/sag together;
// curve: the plan's bends against the speed (the map's line is only a chain
// of straight pieces, so this one is a hint, not a verdict).
export function checkProfile(c, p, kind) {
  const n = c.n, h = Math.max(1, Math.round(5 / c.ds)), B = h * c.ds;
  const G = kind.G / 100, kc = 1 / (100 * kind.Kc), ks = 1 / (100 * kind.Ks), Rmin = minRadius(kind.V);
  const vert = new Float32Array(n), grade = new Float32Array(n), bend = new Float32Array(n), curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h), b = Math.min(n - 1, i + h);
    const g = (p[b] - p[a]) / ((b - a) * c.ds || 1);
    grade[i] = g;
    let r = Math.abs(g) / G;
    if (i - h >= 0 && i + h < n) {
      const k = (p[i + h] - 2 * p[i] + p[i - h]) / (B * B);
      bend[i] = k;
      r = Math.max(r, k < 0 ? -k / kc : k / ks);
    }
    vert[i] = r;
    curve[i] = Number.isFinite(c.R[i]) ? Rmin / Math.abs(c.R[i]) : 0;
  }
  return { vert, curve, grade, bend };
}

// ---- settling the ground under roads ------------------------------------------------

// The ground sits this far under a road's surface where it has settled to it.
const SETTLE_SURF = 0.05;

// The ground with each road's footprint (its width and shoulders) settled
// toward the road, by no more than the data's error there, tolAt(x, z).
// Nothing outside a footprint changes, and nothing under a bridge or tunnel.
//   grid = { N, S, step, h: Float32Array(N*N) }: N x N points, `step` metres
//   apart, row j at z = -S/2 + j*step, column i at x = -S/2 + i*step.
// Lower kinds first, so where footprints overlap the higher road decides.
// Returns { h: new heights, moved: points changed, most: largest change }.
export function settleGround(grid, net, rules, tolAt = () => rules.settleFine) {
  const { N, S, step } = grid, nat = grid.h, h = Float32Array.from(nat);
  const x0 = -S / 2;
  const order = net.chains.slice().sort((p, q) => rules.kinds[p.kind].rank - rules.kinds[q.kind].rank);
  const touched = new Uint8Array(N * N);
  for (const c of order) {
    if (!c.prof) continue;
    const edge = c.width / 2 + (rules.kinds[c.kind].sh || 0);
    for (let i = 0; i + 1 < c.n; i++) {
      if (c.struct[i] && c.struct[i + 1]) continue;
      const ax = c.x[i], az = c.z[i], bx = c.x[i + 1], bz = c.z[i + 1];
      const gi0 = Math.max(0, Math.floor((Math.min(ax, bx) - edge - x0) / step)), gi1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx) + edge - x0) / step));
      const gj0 = Math.max(0, Math.floor((Math.min(az, bz) - edge - x0) / step)), gj1 = Math.min(N - 1, Math.ceil((Math.max(az, bz) + edge - x0) / step));
      for (let gj = gj0; gj <= gj1; gj++) {
        const z = x0 + gj * step;
        for (let gi = gi0; gi <= gi1; gi++) {
          const x = x0 + gi * step;
          const r = segDist(x, z, ax, az, bx, bz);
          if (r.d > edge) continue;
          const q = r.t < 0.5 ? i : i + 1;
          if (c.struct[q]) continue;
          const idx = gj * N + gi, g0 = nat[idx], tol = tolAt(x, z);
          const want = c.prof[i] + (c.prof[i + 1] - c.prof[i]) * r.t - SETTLE_SURF;
          h[idx] = Math.max(g0 - tol, Math.min(g0 + tol, want));
          touched[idx] = 1;
        }
      }
    }
  }
  let moved = 0, most = 0;
  for (let k = 0; k < h.length; k++) if (touched[k]) { const d = Math.abs(h[k] - nat[k]); if (d > 0.02) moved++; if (d > most) most = d; }
  return { h, moved, most };
}

// Everything in one go, for a lab or a test.
export function runAll(lines, waterways, groundAt, rules, opt = {}) {
  const net = sampleChains(buildNetwork(lines));
  net.crossings = findCrossings(net);
  const waterCrossings = findWaterCrossings(net, waterways || []);
  const r = engineer(net, groundAt, rules, { ...opt, waterCrossings });
  return { net, ...r, waterCrossings };
}
