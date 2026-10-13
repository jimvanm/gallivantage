// Road rules: roads built the way road engineers build them.
//
// Today the app drapes each road line over the ground, so a road inherits
// every bump in the height data: it humps over the earth mounds that lead up
// to a bridge and dips into every creek. Engineers work the other way round.
// They choose a design speed for each kind of road, and that speed sets how
// steep the road may be and how gently it must round off over a hilltop or
// through a dip. The road's height line is drawn first, within those limits.
//
// One rule of our own (Jim, 10 October): the ground is truth. It is never
// raised and never cut. Canada's survey is bare earth, so the real
// embankments and cuttings are already in it; building them again would
// double them. A road therefore rides on the ground or above it, never below
// (except in a tunnel the map marks), and where it rides well above the
// ground it is a bridge.
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

// In town (built-up areas) the same kinds of road are slower, so may be
// steeper and round off more sharply, and ride less on a bed: town streets
// follow the ground. Only these kinds change; the rest keep their rules.
export const TOWN = {
  main:      { V: 60, G: 8,  Kc: 10, Ks: 15, bed: 0.3 },
  secondary: { V: 50, G: 12, Kc: 7,  Ks: 12, bed: 0.2 },
  local:     { V: 40, G: 15, Kc: 4,  Ks: 8,  bed: 0.1 },
  minor:     { V: 25, G: 18, Kc: 1,  Ks: 3,  bed: 0.1 },
};
export const TOWN_ORDER = Object.keys(TOWN);
// How much road (km) there must be per square km round a spot for it to be
// in town, counted over about 450 m square. Open country: under 5; a town
// grid of 80 m blocks: about 25.
export const TOWN_DENSITY = 10;

// Near a junction every road slows to turning speed (about 25 km/h), so it
// may change steepness sharply there: real streets flatten into a landing
// at a junction. These limits apply within the junction and for LANDING
// metres beyond its edge.
export const JUNCTION = { G: 15, Kc: 1, Ks: 2 };
export const LANDING = 15;           // metres beyond a junction's edge
const CORNER = { main: 6, secondary: 5, ramp: 5, local: 3, minor: 2 };   // corner rounding, metres
// A road joining a junction meets its surface across its whole width over
// this many metres before the edge.
const SEAM = 10;

// Settings that are not per kind.
//   hold        how closely a road follows the ground, metres: bumps smaller
//               than about this are smoothed over, bigger ones followed.
//   smooth      how hard the line is smoothed before the limits step in (x).
//   bridgeLift  a road more than this above the ground (metres) is a bridge;
//               less, and it sits on its own bed on the ground.
//   clearance   from one road's surface to the other's where one passes over
//               the other (metres): about 5 m of headroom plus the deck.
//   townOn      use town rules in built-up areas.
//   junctions   treat junctions as places of their own (one surface, roads
//               meeting its edge, slow zone round it).
export const SETTINGS = { hold: 1.0, smooth: 1, bridgeLift: 1.5, clearance: 6.5, townOn: true, junctions: true };
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
  const town = {};
  for (const k of TOWN_ORDER) town[k] = { ...TOWN[k] };
  return { kinds, town, ...SETTINGS };
}

// The rules a road keeps: its kind's, or its kind's in town.
export function kindFor(rules, c) {
  const K = rules.kinds[c.kind];
  if (c.urban && rules.townOn !== false && rules.town && rules.town[c.kind]) return { ...K, ...rules.town[c.kind] };
  return K;
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
  // A ramp is one lane with narrow edges (the app draws it as wide as its
  // motorway, which made ramps overlap their motorway far too early).
  if (line.kind === 'ramp') return RAMP_WIDTH;
  const st = ROAD_STYLE[line.cls] || ROAD_STYLE.minor;
  return st.w[line.oneway ? 1 : 0];
}
const RAMP_WIDTH = 5;

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

// ---- where the road really is ----------------------------------------------------------
//
// The map's road line can be a few metres off the real road. Where the road
// runs across a slope, the ground shows where it really is: a strip as wide as
// the road that is flat and nearly level across (the bench cut into the
// hillside, or the top of an embankment). Every 10 m along a road, each
// sideways position within BENCH_REACH metres is scored by how far the ground
// across the road's width there is from flat and level; then the gentlest path
// through the best positions is chosen (a road cannot zigzag), easing back to
// the map's line at junctions so joined roads stay joined. On flat ground every
// position scores alike and the road stays on the map's line. The ground is
// not changed; only where the road is drawn and measured.
export const BENCH_REACH = 5;        // metres either side of the map's line
const BENCH_STEP = 0.5;              // metres between sideways positions tried
const BENCH_EVERY = 10;              // metres between cross-sections
const BENCH_TURN = 1;                // most sideways change between cross-sections, metres
const BENCH_CHANGE = 0.04;           // cost of each metre of sideways change
const BENCH_STRAY = 0.01;            // cost of each metre away from the map's line
const BENCH_GAIN = 0.08;             // the best spot must beat the map's line by this (metres) to count

// How far the ground across a road of half-width hw at (x, z) is from flat
// and level, in metres (lx, lz: unit vector to the road's left).
function benchBadness(groundAt, x, z, lx, lz, hw) {
  const k = Math.max(2, Math.round(hw));          // points either side, about a metre apart
  let n = 0, su = 0, sh = 0, suu = 0, suh = 0;
  const us = [], hs = [];
  for (let q = -k; q <= k; q++) {
    const u = q * hw / k, h = groundAt(x + lx * u, z + lz * u);
    if (!Number.isFinite(h)) return Infinity;
    us.push(u); hs.push(h); n++; su += u; sh += h; suu += u * u; suh += u * h;
  }
  const slope = (n * suh - su * sh) / (n * suu - su * su), mean = sh / n;
  let rr = 0;
  for (let q = 0; q < n; q++) { const r = hs[q] - (mean + slope * (us[q] - su / n)); rr += r * r; }
  // Flatness, plus any cross slope beyond a road's own (about 4%).
  return Math.sqrt(rr / n) + Math.max(0, Math.abs(slope) - 0.04) * hw;
}

// Moves each sampled road (sampleChains) onto the flat strip nearby. Keeps
// the map's line as x0, z0 and the ground under it as raw0; shift is how far
// each sample moved (+ = to its left). opt.waterAt: skip over water.
export function findBenches(net, groundAt, rules, opt = {}) {
  const M = Math.round(BENCH_REACH / BENCH_STEP), W = 2 * M + 1;
  let moved = 0, most = 0;
  for (const c of net.chains) {
    const n = c.n;
    c.x0 = Float64Array.from(c.x); c.z0 = Float64Array.from(c.z);
    c.raw0 = new Float64Array(n);
    for (let i = 0; i < n; i++) c.raw0[i] = groundAt(c.x[i], c.z[i]);
    c.shift = new Float64Array(n);
    // Left of the way it runs, at each sample.
    const lx = new Float64Array(n), lz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      const dx = c.x[b] - c.x[a], dz = c.z[b] - c.z[a], L = Math.hypot(dx, dz) || 1;
      lx[i] = dz / L; lz[i] = -dx / L;
    }
    // Cross-sections.
    const every = Math.max(1, Math.round(BENCH_EVERY / c.ds));
    const st = [];
    for (let i = 0; i < n; i += every) st.push(i);
    if (st[st.length - 1] !== n - 1) st.push(n - 1);
    if (st.length < 3) continue;
    // Pinned to the map's line: at junctions with other roads.
    const pinned = new Uint8Array(st.length);
    for (const [id, sAt] of c.at) {
      const nd = net.nodes[id];
      if (!nd || nd.chains.length < 2) continue;
      const i = Math.round(sAt / c.ds);
      let best = 0;
      for (let k = 1; k < st.length; k++) if (Math.abs(st[k] - i) < Math.abs(st[best] - i)) best = k;
      pinned[best] = 1;
    }
    const hw = c.width / 2;
    const bad = new Float64Array(st.length * W);
    for (let k = 0; k < st.length; k++) {
      const i = st[k];
      const skip = c.br[i] || (opt.waterAt && opt.waterAt(c.x[i], c.z[i]));
      let best = Infinity, here = 0;
      for (let m = 0; m < W; m++) {
        const o = (m - M) * BENCH_STEP;
        const b = skip ? 0 : benchBadness(groundAt, c.x[i] + lx[i] * o, c.z[i] + lz[i] * o, lx[i], lz[i], hw);
        bad[k * W + m] = b;
        if (b < best) best = b;
        if (m === M) here = b;
      }
      // Nothing clearly better than the map's line: no opinion here.
      if (!(here - best >= BENCH_GAIN)) for (let m = 0; m < W; m++) bad[k * W + m] = Number.isFinite(bad[k * W + m]) ? 0 : Infinity;
    }
    // The gentlest path through the cross-sections (dynamic programming).
    const turn = Math.round(BENCH_TURN / BENCH_STEP);
    const cost = new Float64Array(st.length * W).fill(Infinity), from = new Int16Array(st.length * W);
    for (let m = 0; m < W; m++) if (!pinned[0] || m === M) cost[m] = bad[m] + BENCH_STRAY * Math.abs(m - M) * BENCH_STEP;
    for (let k = 1; k < st.length; k++) {
      for (let m = 0; m < W; m++) {
        if (pinned[k] && m !== M) continue;
        const own = bad[k * W + m] + BENCH_STRAY * Math.abs(m - M) * BENCH_STEP;
        if (!Number.isFinite(own)) continue;
        let bc = Infinity, bf = M;
        for (let q = Math.max(0, m - turn); q <= Math.min(W - 1, m + turn); q++) {
          const v = cost[(k - 1) * W + q] + BENCH_CHANGE * Math.abs(q - m) * BENCH_STEP;
          if (v < bc) { bc = v; bf = q; }
        }
        cost[k * W + m] = own + bc; from[k * W + m] = bf;
      }
    }
    let m = M, bc = Infinity;
    const last = st.length - 1;
    for (let q = 0; q < W; q++) if (cost[last * W + q] < bc) { bc = cost[last * W + q]; m = q; }
    if (!Number.isFinite(bc)) continue;           // no way through: leave it on the map's line
    const off = new Float64Array(st.length);
    for (let k = last; k >= 0; k--) { off[k] = (m - M) * BENCH_STEP; m = from[k * W + m]; }
    // Between cross-sections, smoothly; then move.
    for (let k = 0; k < last; k++) {
      for (let i = st[k]; i <= st[k + 1]; i++) {
        const t = (i - st[k]) / (st[k + 1] - st[k] || 1), u = t * t * (3 - 2 * t);
        c.shift[i] = off[k] + (off[k + 1] - off[k]) * u;
      }
    }
    for (let i = 0; i < n; i++) {
      c.x[i] += lx[i] * c.shift[i]; c.z[i] += lz[i] * c.shift[i];
      const a = Math.abs(c.shift[i]);
      if (a > 0.25) moved += c.ds;
      if (a > most) most = a;
    }
  }
  return { moved, most };
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
// lim (optional): per-sample limits { kc, ks, G, K } (crest and sag as 1/(100 K),
// grade as a fraction, K the smaller of Kc and Ks), for roads whose limits
// change along them (near junctions). Without it, the kind's own throughout.
export function fitProfile(t, w0, ds, kind, rules, fixed = new Map(), lower = new Map(), upper = new Map(), floor = null, ceil = null, lim = null) {
  const n = t.length;
  if (n < 3) {
    const p = Float64Array.from(t);
    for (const [i, h] of fixed) p[i] = h;
    return { p, ok: true, rounds: 0 };
  }
  const L = lim || limitsOf(kind, n);
  const kcA = L.kc, ksA = L.ks, GA = L.G;
  const sig = Math.max(0.05, rules.hold);
  // A first stiffness that smooths over bumps about the size the crest rule
  // could never follow; the rounds then stiffen only where needed.
  const lamInit = new Float64Array(n);
  let lam0 = 1;
  for (let i = 0; i < n; i++) {
    const ell = 0.35 * Math.sqrt(100 * L.K[i] * sig) * (rules.smooth || 1);
    lamInit[i] = Math.pow(Math.max(1, ell / ds), 4);
    if (lamInit[i] > lam0) lam0 = lamInit[i];
  }
  const lam = Float64Array.from(lamInit);
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
      const g = gam[i], target = gs[i] * GA[i] * ds;
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
        for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { free[j] = 1; lam[j] = Math.min(lam[j], lamInit[j]); if (j < n - 1) gam[j] = 0; }
        broke = true;
      }
    }
    for (let i = 1; i < n - 1; i++) {
      if (free[i]) continue;
      const k = (p[i - 1] - 2 * p[i] + p[i + 1]) / (ds * ds);
      if (k < -kcA[i] * 1.05 || k > ksA[i] * 1.05) {
        lam[i] = Math.min(lam[i] * 1.6, lam0 * 1e7);
        broke = true;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      if (free[i] || free[i + 1]) continue;
      const g = (p[i + 1] - p[i]) / ds;
      if (Math.abs(g) > Math.max(GA[i], GA[i + 1]) * 1.02) {
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

// A kind's limits, the same all along n samples.
function limitsOf(kind, n) {
  return { kc: new Float64Array(n).fill(1 / (100 * kind.Kc)), ks: new Float64Array(n).fill(1 / (100 * kind.Ks)),
    G: new Float64Array(n).fill(kind.G / 100), K: new Float64Array(n).fill(Math.min(kind.Kc, kind.Ks)) };
}

// A road's limits along it: its own (in town or not), eased to junction
// limits in each junction's slow zone (c.jz).
function limitsFor(c) {
  const L = limitsOf(c.K, c.n);
  if (!c.jz) return L;
  for (let i = 0; i < c.n; i++) {
    if (!c.jz[i]) continue;
    const Kc = Math.min(c.K.Kc, JUNCTION.Kc), Ks = Math.min(c.K.Ks, JUNCTION.Ks);
    L.kc[i] = 1 / (100 * Kc); L.ks[i] = 1 / (100 * Ks); L.G[i] = Math.max(c.K.G, JUNCTION.G) / 100; L.K[i] = Math.min(Kc, Ks);
  }
  return L;
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

// ---- town or country -------------------------------------------------------------

const ROADLIKE = new Set(['main', 'secondary', 'ramp', 'local', 'minor']);

// Marks each road as in town (c.urban) where the roads round it are dense:
// more than TOWN_DENSITY km of road per square km over about 450 m square,
// for most of its length. Uses only the roads themselves, so it works
// anywhere the map has them. Motorways and paths do not count toward it.
export function markTowns(net) {
  const cell = 50, m = new Map(), key = (i, j) => i * 100003 + j;
  for (const c of net.chains) {
    if (!ROADLIKE.has(c.kind)) continue;
    for (let i = 0; i < c.n; i++) {
      const k = key(Math.floor(c.x[i] / cell), Math.floor(c.z[i] / cell));
      m.set(k, (m.get(k) || 0) + c.ds);
    }
  }
  const reach = 4, area = ((2 * reach + 1) * cell / 1000) ** 2;      // km²
  const dens = (x, z) => {
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    let sum = 0;
    for (let j = cj - reach; j <= cj + reach; j++) for (let i = ci - reach; i <= ci + reach; i++) sum += m.get(key(i, j)) || 0;
    return sum / 1000 / area;
  };
  for (const c of net.chains) {
    c.density = dens(c.x[c.n >> 1], c.z[c.n >> 1]);
    let inTown = 0;
    const step = Math.max(1, Math.round(25 / c.ds));
    let tried = 0;
    for (let i = 0; i < c.n; i += step) { tried++; if (dens(c.x[i], c.z[i]) >= TOWN_DENSITY) inTown++; }
    c.urban = ROADLIKE.has(c.kind) && inTown * 2 > tried;
  }
}

// ---- junctions -----------------------------------------------------------------------
//
// A junction is a place of its own, worked out before the roads that meet
// there. Where three or more road arms meet (a road passing through counts
// as two), the junction is one paved area round the meeting point, as wide
// as its widest road plus a rounded corner. Junction points close enough for
// their areas to touch (both halves of a divided road) make one junction.
//
// The road fitted first among those meeting there leads: it keeps its own
// height line straight through, and the junction's surface is its surface
// extended (its crown, then level beyond its edges). Every other road meets
// that surface at the junction's edge, across its whole width, not at one
// point in the middle. Within the junction and for LANDING metres beyond its
// edge, every road slows to turning speed and may change steepness sharply,
// as real streets flatten into a junction.
//
// Not junctions: where a motorway leads (ramps leave it gradually), and
// where a railway meets a road (a level crossing, as before). Paths and
// tracks do not make a junction, and join one where they meet it.

const NOT_ARM = new Set(['path', 'track', 'rail', 'railMinor']);

// Finds junctions. order: chain ids in the order they will be fitted (the
// first among a junction's roads leads). Adds net.junctions = [{ id, x, z,
// R, nodes, arms: [{ chain, ib, i0 }], lead, pts }] and, per chain, inJ (inside
// a junction's area: junction id + 1), jz (in its slow zone), seamW / seamJ
// (how far, 0 to 1, the road's edges blend to the junction's surface).
export function findJunctions(net, rules, order) {
  const rank = new Map(order.map((id, k) => [id, k]));
  const { chains, nodes } = net;
  const cand = [];
  for (const [id, nd] of Object.entries(nodes)) {
    const arms = [];
    let rail = false;
    for (const [cid, s] of nd.on) {
      const c = chains[cid];
      if (c.kind === 'rail' || c.kind === 'railMinor') rail = true;
      if (NOT_ARM.has(c.kind)) continue;
      const i0 = Math.max(0, Math.min(c.n - 1, Math.round(s / c.ds)));
      if (s > 0.5) arms.push({ chain: cid, i0, dir: -1 });
      if (s < c.length - 0.5) arms.push({ chain: cid, i0, dir: 1 });
    }
    if (arms.length < 3 || rail) continue;
    let lead = null;
    for (const a of arms) if (lead === null || rank.get(a.chain) < rank.get(lead)) lead = a.chain;
    if (rules.kinds[chains[lead].kind].noLevel) continue;
    let half = 0, corner = 0;
    for (const a of arms) { const c = chains[a.chain]; half = Math.max(half, c.width / 2 + (rules.kinds[c.kind].sh || 0)); corner = Math.max(corner, CORNER[c.kind] || 2); }
    cand.push({ node: Number(id), x: nd.x, z: nd.z, R: half + corner, arms, lead });
  }
  // Points whose areas touch make one junction.
  const parent = cand.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const near = new Buckets(40);
  cand.forEach((c, i) => near.add(c.x, c.z, i));
  cand.forEach((a, i) => near.near(a.x, a.z, 2 * a.R + 1, (j) => {
    if (j <= i) return;
    const b = cand[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) < a.R + b.R) parent[find(i)] = find(j);
  }));
  const groups = new Map();
  cand.forEach((c, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); });
  const out = [];
  for (const g of groups.values()) {
    const x = g.reduce((a, c) => a + c.x, 0) / g.length, z = g.reduce((a, c) => a + c.z, 0) / g.length;
    let R = 0, lead = null, leadNode = null;
    for (const c of g) {
      R = Math.max(R, Math.hypot(c.x - x, c.z - z) + c.R);
      if (lead === null || rank.get(c.lead) < rank.get(lead)) { lead = c.lead; leadNode = c; }
    }
    const J = { id: out.length, x, z, R, nodes: g.map((c) => c.node), arms: [], lead, leadI: leadNode.arms.find((a) => a.chain === lead).i0 };
    // Each arm: walk out from its junction point until outside the area.
    const seen = new Set();
    for (const c of g) for (const a of c.arms) {
      const ch = chains[a.chain];
      let i = a.i0;
      while (i >= 0 && i < ch.n && Math.hypot(ch.x[i] - x, ch.z[i] - z) < R) i += a.dir;
      if (i < 0 || i >= ch.n) continue;                 // the road ends inside the junction
      const key = a.chain + ':' + i;
      if (seen.has(key)) continue;
      seen.add(key);
      J.arms.push({ chain: a.chain, ib: i, i0: a.i0, dir: a.dir });
    }
    out.push(J);
  }
  // Per road: inside the area, slow zone, and the seam at the edge.
  for (const c of chains) { c.inJ = null; c.jz = null; c.seamW = null; c.seamJ = null; }
  for (const J of out) {
    for (const a of J.arms) {
      const c = chains[a.chain];
      if (!c.inJ) { c.inJ = new Int32Array(c.n); c.jz = new Uint8Array(c.n); c.seamW = new Float32Array(c.n); c.seamJ = new Int32Array(c.n).fill(-1); }
      for (let i = a.ib - a.dir; i >= 0 && i < c.n && Math.hypot(c.x[i] - J.x, c.z[i] - J.z) < J.R; i -= a.dir) { c.inJ[i] = J.id + 1; c.jz[i] = 1; }
      for (let i = a.ib; i >= 0 && i < c.n; i += a.dir) {
        const d = Math.abs(i - a.ib) * c.ds;
        if (d > LANDING) break;
        c.jz[i] = 1;
        const w = Math.max(0, 1 - d / SEAM);
        if (w > c.seamW[i]) { c.seamW[i] = w; c.seamJ[i] = J.id; }
      }
    }
    // The area's outline: the edges of every road where it leaves the area.
    const pts = [];
    for (const a of J.arms) {
      const c = chains[a.chain], i = a.ib;
      const p = Math.max(0, i - 1), q = Math.min(c.n - 1, i + 1);
      const dx = c.x[q] - c.x[p], dz = c.z[q] - c.z[p], L = Math.hypot(dx, dz) || 1;
      const lx = dz / L, lz = -dx / L, hw = c.width / 2;
      pts.push([c.x[i] + lx * hw, c.z[i] + lz * hw], [c.x[i] - lx * hw, c.z[i] - lz * hw]);
    }
    J.pts = convexHull(pts);
  }
  net.junctions = out;
  return out;
}

// Convex hull of points [[x, z], ...], anticlockwise seen from above.
function convexHull(P) {
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  lo.pop(); hi.pop();
  return lo.concat(hi);
}

// The junction's surface height at (x, z): its leading road's surface (crown
// included); beyond its edges, rising or falling with the ground from there
// (no steeper than a junction may be), as real corners on a slope do. Set
// once the lead is fitted.
function junctionSurface(J, L, groundAt) {
  const span = Math.ceil((J.R + 20) / L.ds);
  const a = Math.max(0, J.leadI - span), b = Math.min(L.n - 1, J.leadI + span);
  const hw = L.width / 2;
  return (x, z) => {
    let best = Infinity, f = J.leadI, off = 0, fx = x, fz = z;
    for (let i = a; i < b; i++) {
      const r = segDist(x, z, L.x[i], L.z[i], L.x[i + 1], L.z[i + 1]);
      if (r.d < best) { best = r.d; f = i + r.t; off = r.d; fx = r.x; fz = r.z; }
    }
    const centre = lerpAt(L.prof, f), tilt = L.cross ? lerpAt(L.cross, f) : 0;
    const i0 = Math.max(0, Math.min(L.n - 2, Math.floor(f)));
    const side = Math.sign((L.x[i0 + 1] - L.x[i0]) * (z - L.z[i0]) - (L.z[i0 + 1] - L.z[i0]) * (x - L.x[i0])) * -1;   // +1 left
    if (off <= hw) return centre + tilt * side * off;
    const ex = fx + (x - fx) * hw / off, ez = fz + (z - fz) * hw / off;      // the lead's edge, on the way out
    const e = off - hw, edge = centre + tilt * side * hw;
    const g1 = groundAt(x, z), g0 = groundAt(ex, ez);
    if (!Number.isFinite(g1) || !Number.isFinite(g0)) return edge;
    const most = JUNCTION.G / 100 * e;
    return edge + Math.max(-most, Math.min(most, g1 - g0));
  };
}

// ---- the road's bottom: the ground across it ------------------------------------------
//
// A road is a thin layer with a bottom and a top (Jim, 13 October). The bottom
// is the ground, exactly, across the road's whole width. The top is the
// driving surface: a plane across the road (its own tilt), with a height line
// along it that is smooth for the road's speed. Between them, the layer may be
// a little thick (up to the kind's roadbed) and never negative: the top is
// never under the ground anywhere across. The centreline keeps each road to
// itself: tops blend only where roads join at a junction.

const MAX_ACROSS = 0.08;            // steepest tilt across a road (banking included)

// For each sample: the ground's tilt across (cross: metres up per metre to the
// left, smoothed along the road over a length that grows with speed), and with
// that tilt taken out, the ground's height at the middle (mid), its highest
// (hi) and lowest (lo) across the width, and the ground at each edge (gL, gR).
function readBottom(c, groundAt) {
  const n = c.n, hw = c.width / 2, K = Math.max(2, Math.ceil(hw));
  const rail = c.kind === 'rail' || c.kind === 'railMinor';
  const lx = new Float64Array(n), lz = new Float64Array(n), slope = new Float64Array(n), ok = new Uint8Array(n);
  const G = new Float64Array(n * (2 * K + 1));
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = c.x[b] - c.x[a], dz = c.z[b] - c.z[a], L = Math.hypot(dx, dz) || 1;
    lx[i] = dz / L; lz[i] = -dx / L;
    let su = 0, sg = 0, suu = 0, sug = 0, m = 0, good = true;
    for (let k = -K; k <= K; k++) {
      const u = k * hw / K, g = groundAt(c.x[i] + lx[i] * u, c.z[i] + lz[i] * u);
      G[i * (2 * K + 1) + k + K] = g;
      if (!Number.isFinite(g)) { good = false; continue; }
      su += u; sg += g; suu += u * u; sug += u * g; m++;
    }
    ok[i] = good && m > 2 ? 1 : 0;
    slope[i] = ok[i] && !rail ? Math.max(-MAX_ACROSS, Math.min(MAX_ACROSS, (m * sug - su * sg) / (m * suu - su * su))) : 0;
  }
  const W = Math.max(1, Math.round(Math.max(6, c.K.V / 6) / c.ds));
  const cross = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, m = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) if (ok[j]) { s += slope[j]; m++; }
    cross[i] = m ? s / m : 0;
  }
  const mid = new Float64Array(n), hi = new Float64Array(n), lo = new Float64Array(n), gL = new Float64Array(n), gR = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (!ok[i]) { mid[i] = hi[i] = lo[i] = gL[i] = gR[i] = c.raw[i]; continue; }
    let s = 0, mx = -Infinity, mn = Infinity;
    for (let k = -K; k <= K; k++) {
      const r = G[i * (2 * K + 1) + k + K] - cross[i] * (k * hw / K);
      s += r; if (r > mx) mx = r; if (r < mn) mn = r;
    }
    mid[i] = s / (2 * K + 1); hi[i] = mx; lo[i] = mn;
    gL[i] = G[i * (2 * K + 1) + 2 * K]; gR[i] = G[i * (2 * K + 1)];
  }
  Object.assign(c, { cross, mid, hi, lo, gL, gR });
}

// The top of road c at (x, z), from its height line and tilt, near sample
// window a..b. Returns { h, d } (d: distance from its centreline) or null.
function topOf(c, x, z, a, b) {
  let best = Infinity, f = a, u = 0;
  for (let i = Math.max(0, a); i < Math.min(c.n - 1, b); i++) {
    const r = segDist(x, z, c.x[i], c.z[i], c.x[i + 1], c.z[i + 1]);
    if (r.d < best) {
      best = r.d; f = i + r.t;
      const dx = c.x[i + 1] - c.x[i], dz = c.z[i + 1] - c.z[i];
      u = Math.sign(dx * (z - c.z[i]) - dz * (x - c.x[i])) * -r.d;      // + to the left of the way it runs
    }
  }
  if (!Number.isFinite(best)) return null;
  return { h: lerpAt(c.prof, f) + lerpAt(c.cross, f) * u, d: best };
}

// ---- merging: a road running into another at a shallow angle ----------------------------
//
// An on-ramp runs alongside the motorway for a long way before it ends on it,
// closing slowly; an off-ramp leaves the same way. Where the two overlap they
// are one surface: the joining road takes the bigger road's top (its height
// line and its tilt across, carried out sideways), and is drawn only where it
// sticks out past the bigger road's edge, as a lane that tapers away. This is
// Jim's rule: roads blend only where they are converging or diverging. Roads
// that merely run alongside, without one ending on the other, keep apart.

const MERGE_SIN = 0.5;        // shallower than 30 degrees: a merge (steeper ones meet at a junction)
const MERGE_REACH = 400;      // metres: the longest merge looked for
const MERGE_HOLD = 1e3;       // how hard a road fully on a bigger road is held to its top

// Finds merges. For each road ending on a bigger road (one fitted before it)
// at a shallow angle: the samples, from that end, where their surfaces overlap.
// Adds to the joining chain mz (per sample: 1 in a merge), mA (the bigger
// road's id), mj (where on it, as a fractional sample) and mu (how far left
// of its centreline, metres).
function findMerges(net, rules, rank) {
  const { chains, nodes } = net;
  const roadlike = (c) => ROADLIKE.has(c.kind) || c.kind === 'motorway';
  for (const B of chains) {
    if (!roadlike(B)) continue;
    for (const atEnd of [false, true]) {
      const sEnd = atEnd ? B.length : 0;
      let node = null;
      for (const [id, s] of B.at) if (Math.abs(s - sEnd) < 0.5) node = id;
      if (node == null) continue;
      let best = null;
      for (const [aid, sA] of nodes[node].on) {
        const A = chains[aid];
        if (aid === B.id || !roadlike(A) || !(rank.get(aid) < rank.get(B.id))) continue;
        const z = walkMerge(B, A, atEnd, Math.round(sA / A.ds));
        if (z && (!best || z.idx.length > best.idx.length)) best = z;
      }
      if (!best) continue;
      if (!B.mz) { B.mz = new Uint8Array(B.n); B.mA = new Int32Array(B.n).fill(-1); B.mj = new Float64Array(B.n); B.mu = new Float64Array(B.n); }
      best.idx.forEach((i, k) => { B.mz[i] = 1; B.mA[i] = best.A; B.mj[i] = best.j[k]; B.mu[i] = best.u[k]; });
    }
  }
}

// From B's end on A, inward along B, while the two overlap, stay at a
// shallow angle, and draw apart (or keep apart) going away from the end.
function walkMerge(B, A, atEnd, jA) {
  const hw = B.width / 2 + A.width / 2, step = atEnd ? -1 : 1;
  const idx = [], js = [], us = [];
  let j = jA, lastD = -1;
  for (let i = atEnd ? B.n - 1 : 0, k = 0; i >= 0 && i < B.n && k * B.ds <= MERGE_REACH; i += step, k++) {
    if (B.struct[i] === 2) break;
    let bd = Infinity, bf = j, bu = 0, bs = 0;
    for (let q = Math.max(0, Math.floor(j) - 25); q < Math.min(A.n - 1, Math.floor(j) + 25); q++) {
      const r = segDist(B.x[i], B.z[i], A.x[q], A.z[q], A.x[q + 1], A.z[q + 1]);
      if (r.d >= bd) continue;
      const dx = A.x[q + 1] - A.x[q], dz = A.z[q + 1] - A.z[q], L = Math.hypot(dx, dz) || 1;
      bd = r.d; bf = q + r.t;
      bu = Math.sign(dx * (B.z[i] - A.z[q]) - dz * (B.x[i] - A.x[q])) * -r.d;
      const a = Math.max(0, i - 1), b = Math.min(B.n - 1, i + 1);
      const ex = B.x[b] - B.x[a], ez = B.z[b] - B.z[a], E = Math.hypot(ex, ez) || 1;
      bs = Math.abs(dx * ez - dz * ex) / (L * E);          // sine of the angle between them
    }
    if (!Number.isFinite(bd) || bd >= hw || bs > MERGE_SIN) break;
    if (bd < lastD - 0.5) break;                           // closing again away from the end: not a merge
    lastD = Math.max(lastD, bd);
    idx.push(i); js.push(bf); us.push(bu); j = bf;
  }
  return idx.length >= 3 ? { A: A.id, idx, j: js, u: us } : null;
}

// A junction's surface, once every road meeting there is fitted: the tops of
// those roads, blended by how near each one's centreline is, so each eases
// into the others. Only roads that join there take part.
function junctionBlend(J, chains, fallback) {
  const parts = [];
  const seen = new Set();
  for (const a of J.arms) {
    if (seen.has(a.chain)) continue;
    seen.add(a.chain);
    const c = chains[a.chain], span = Math.ceil((J.R + 15) / c.ds);
    parts.push({ c, a: a.i0 - span, b: a.i0 + span, reach: c.width / 2 + 2 });
  }
  return (x, z) => {
    let sw = 0, sh = 0;
    for (const p of parts) {
      const t = topOf(p.c, x, z, p.a, p.b);
      if (!t) continue;
      const w = Math.max(0, 1 - t.d / p.reach) ** 2;
      sw += w; sh += w * t.h;
    }
    return sw > 1e-6 ? sh / sw : fallback(x, z);
  };
}

// Works out every road's height line, highest kind first, so each lower road
// meets the ones above it at their height. groundAt(x, z) gives the natural
// ground (NaN where unknown); waterAt(x, z) (optional) says whether a point
// is on the map's water.
// Adds to each chain: raw (ground under it), prof (its height line), ok,
// struct (0 on the ground, 1 bridge, 2 tunnel), why (per sample, what made it a
// structure). Returns { crossings, flags }.

// A bridge's ends reach the top of its banks. The map's bridge often stops a
// few metres short, where the ground is still climbing the bank far more
// steeply than any road could. Held to that ground, the road was bent up the
// bank, and the stiff deck swung up at its other end like a lever (the wedge
// at the 407 and Brock Road). So the bridge carries on until the ground is
// within the road's reach: no steeper along than twice the road's steepest
// grade, and level enough across for its roadbed. At most BANK_REACH metres.
// Needs readBottom first (mid, hi, lo).
const BANK_REACH = 20;
export function reachBankTops(c) {
  const K = c.K, n = c.n, ds = c.ds;
  if (!K || !c.mid) return;
  const steep = 2 * K.G / 100, bed = Math.max(K.bed || 0, 0.3);
  const ends = [];
  for (let i = 0; i < n; i++) {
    if (c.struct[i] !== 1 || !c.known[i]) continue;
    if (i > 0 && !c.struct[i - 1]) ends.push([i, -1]);
    if (i < n - 1 && !c.struct[i + 1]) ends.push([i, 1]);
  }
  for (const [e, dir] of ends) {
    for (let j = e + dir, d = ds; j >= 0 && j < n && d <= BANK_REACH; j += dir, d += ds) {
      if (c.struct[j] || (c.inJ && c.inJ[j])) break;
      const back = Math.abs(c.mid[j] - c.mid[j - dir]) / ds;              // from the bridge's side
      const k = j + dir, on = k >= 0 && k < n ? Math.abs(c.mid[k] - c.mid[j]) / ds : 0;
      if (back <= steep && on <= steep && c.hi[j] - c.lo[j] <= bed) break;
      c.struct[j] = 1; c.known[j] = 1; c.w[j] = 0; c.why[j] = 'bridge: reaches the top of the bank';
    }
  }
}

export function engineer(net, groundAt, rules, opt = {}) {
  const { chains, nodes } = net;
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

  // In town or not, and the rules each road keeps.
  markTowns(net);
  for (const c of chains) c.K = kindFor(rules, c);
  const order = chains.slice().sort((p, q) => rules.kinds[q.kind].rank - rules.kinds[p.kind].rank || q.length - p.length);
  // Junctions, and each road's limits along it.
  const junctions = rules.junctions !== false ? findJunctions(net, rules, order.map((c) => c.id)) : (net.junctions = [], []);
  const armOf = new Map();          // chain id -> [{ J, arm }] where it joins a junction it does not lead
  const leads = new Map();          // chain id -> [J] it leads
  const jNodes = new Set();
  for (const J of junctions) {
    for (const n of J.nodes) jNodes.add(n);
    J.nodeSet = new Set(J.nodes);
    if (!leads.has(J.lead)) leads.set(J.lead, []);
    leads.get(J.lead).push(J);
    for (const a of J.arms) {
      if (a.chain === J.lead) continue;
      if (!armOf.has(a.chain)) armOf.set(a.chain, []);
      armOf.get(a.chain).push({ J, arm: a });
    }
  }
  for (const c of chains) { c.lim = limitsFor(c); readBottom(c, groundAt); reachBankTops(c); c.mz = null; }
  findMerges(net, rules, new Map(order.map((c, k) => [c.id, k])));
  const nodeH = new Map();
  const byChain = new Map();
  for (const x of crossings) {
    for (const id of [x.a, x.b]) { let a = byChain.get(id); if (!a) byChain.set(id, a = []); a.push(x); }
  }
  const flags = [];
  for (const B of order) {
    const kB = B.K;
    const fixed = new Map(), lower = new Map(), upper = new Map();
    // Every meeting point on it whose height a road fitted earlier has set,
    // except at junctions it joins: there it meets the junction's edge.
    const joins = armOf.get(B.id) || [];
    for (const [id, s] of B.at) {
      if (!nodeH.has(id)) continue;
      if (joins.length && jNodes.has(id) && joins.some(({ J }) => J.nodeSet.has(id))) continue;
      fixed.set(Math.max(0, Math.min(B.n - 1, Math.round(s / B.ds))), nodeH.get(id));
    }
    for (const { J, arm } of joins) {
      if (!J.h) continue;
      fixed.set(arm.ib, J.h(B.x[arm.ib], B.z[arm.ib]));
    }
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
    // The top follows the bottom across the whole width: aimed at the ground's
    // middle (its tilt taken out), never under its highest point across (the
    // layer is never negative), and no thicker than the roadbed at its
    // lowest point, except where the map says it leaves the ground (a bridge,
    // water, a creek, a road below). Tunnels have no floor.
    const t = B.mid, w = B.w;
    const floor = Float64Array.from(B.hi);
    for (let i = 0; i < B.n; i++) if (B.struct[i] === 2) floor[i] = -Infinity;
    let ceil = null;
    if (kB.bed > 0) {
      ceil = new Float64Array(B.n);
      for (let i = 0; i < B.n; i++) ceil[i] = B.known[i] ? Infinity : Math.max(B.lo[i] + kB.bed, B.hi[i] + 0.05);
    }
    // Meeting a junction's edge: the edge height may be a little under its
    // ground (the leading road's crown) or over its roadbed; the floor and the
    // roadbed limit give way by that much, easing out over the seam.
    for (const { J, arm } of joins) {
      if (!J.h || !fixed.has(arm.ib)) continue;
      const h = fixed.get(arm.ib), below = Math.max(0, floor[arm.ib] - h), above = ceil ? Math.max(0, h - ceil[arm.ib]) : 0;
      if (!below && !above) continue;
      for (let i = arm.ib, d = 0; i >= 0 && i < B.n && d <= SEAM; i += arm.dir, d += B.ds) {
        const w = 1 - d / SEAM;
        floor[i] -= below * w + 0.02;
        if (ceil) ceil[i] += above * w + 0.02;
      }
    }
    // Inside a junction the road is on the junction's surface: not held to
    // its own ground there, nor flagged for leaving it.
    if (B.inJ) for (let i = 0; i < B.n; i++) if (B.inJ[i] && B.id !== junctions[B.inJ[i] - 1].lead) { w[i] = 0; floor[i] = -Infinity; if (ceil) ceil[i] = Infinity; B.known[i] = 1; }
    // Merging into a bigger road (see findMerges): blended onto its top by
    // how much the two overlap. Where they barely touch, the road keeps to its
    // own ground; as it moves onto the bigger road it takes that road's top
    // (its height line, and its tilt carried out sideways). Held, not pinned,
    // so the road stays within its own rules getting there.
    let tt = t;
    if (B.mz) {
      tt = Float64Array.from(t);
      B.mo = new Float64Array(B.n);
      for (let i = 0; i < B.n; i++) {
        if (!B.mz[i] || (B.inJ && B.inJ[i])) continue;
        const A = chains[B.mA[i]], f = B.mj[i];
        if (!A.prof) continue;
        const q = Math.min(A.n - 2, Math.floor(f));
        const same = (A.x[q + 1] - A.x[q]) * (B.x[Math.min(B.n - 1, i + 1)] - B.x[Math.max(0, i - 1)]) +
          (A.z[q + 1] - A.z[q]) * (B.z[Math.min(B.n - 1, i + 1)] - B.z[Math.max(0, i - 1)]) >= 0 ? 1 : -1;
        const tilt = lerpAt(A.cross, f), hA = lerpAt(A.prof, f) + tilt * B.mu[i];
        const o = Math.max(0, Math.min(1, (A.width / 2 + B.width / 2 - Math.abs(B.mu[i])) / B.width));
        B.mo[i] = o;
        const wh = MERGE_HOLD * o * o;
        tt[i] = (w[i] * t[i] + wh * hA) / (w[i] + wh || 1); w[i] += wh;
        B.cross[i] = (1 - o) * B.cross[i] + o * tilt * same;
        if (floor[i] > hA) floor[i] -= (floor[i] - hA) * o + 0.02 * o;
        if (ceil && ceil[i] < hA) ceil[i] += (hA - ceil[i]) * o + 0.02 * o;
        if (o > 0.5) B.known[i] = 1;
      }
    }
    const r = fitProfile(tt, w, B.ds, kB, rules, fixed, lower, upper, floor, ceil, B.lim);
    B.prof = r.p; B.ok = r.ok; B.rounds = r.rounds;
    // Leading a junction: its surface is now known.
    for (const J of leads.get(B.id) || []) {
      J.h = junctionSurface(J, B, groundAt);
      for (const n of J.nodes) nodeH.set(n, J.h(nodes[n].x, nodes[n].z));
    }
    // Joining one: inside it, on its surface.
    for (const { J, arm } of joins) {
      if (!J.h) continue;
      for (let i = arm.ib - arm.dir; i >= 0 && i < B.n && B.inJ[i] === J.id + 1; i -= arm.dir) B.prof[i] = J.h(B.x[i], B.z[i]);
    }
    for (const [id, s] of B.at) if (!nodeH.has(id)) nodeH.set(id, lerpAt(B.prof, s / B.ds));
  }
  // Every road is fitted: each junction's surface becomes the blend of the
  // tops of the roads that join there, and on it every road inside it runs.
  for (const J of junctions) {
    if (!J.h) continue;
    J.hLead = J.h;
    J.h = junctionBlend(J, chains, J.hLead);
    for (const a of J.arms) {
      const c = chains[a.chain];
      for (let i = a.ib - a.dir; i >= 0 && i < c.n && c.inJ[i] === J.id + 1; i -= a.dir) c.prof[i] = J.h(c.x[i], c.z[i]);
    }
  }

  // Well above the ground: a bridge. Untagged ones high up are worth a look:
  // the map may be missing a bridge, or the ground be wrong. The ground
  // itself is never changed: what is under each road is the ground as found.
  for (const c of chains) {
    c.under = Float64Array.from(c.raw);
    let run = null;
    const close = () => {
      if (!run) return;
      const i = (run.i0 + run.i1) >> 1;
      if (run.max > UNTOLD_BRIDGE && run.i1 - run.i0 >= 2 && !run.known) flags.push({ x: c.x[i], z: c.z[i], kind: 'bridge',
        text: `${rules.kinds[c.kind].label}: rides ${run.max.toFixed(0)} m above the ground for ${((run.i1 - run.i0) * c.ds).toFixed(0)} m, with no bridge on the map. A missing bridge, or wrong ground?` });
      run = null;
    };
    for (let i = 0; i < c.n; i++) {
      const lift = c.prof[i] - (c.mid ? c.mid[i] : c.raw[i]);
      let untold = false;
      if (!c.struct[i] && lift > rules.bridgeLift && !(c.inJ && c.inJ[i])) { c.struct[i] = 1; if (!c.why[i]) c.why[i] = 'above the ground: bridge'; untold = true; }
      if (untold && run) { run.i1 = i; run.max = Math.max(run.max, lift); run.known ||= c.known[i]; }
      else { close(); if (untold) run = { i0: i, i1: i, max: lift, known: c.known[i] }; }
    }
    close();
    if (!c.ok) {
      let worst = 0, wi = 0;
      const sc = checkProfile(c, c.prof, c.K);
      for (let i = 0; i < c.n; i++) if (sc.vert[i] > worst && !(c.inJ && c.inJ[i])) { worst = sc.vert[i]; wi = i; }
      if (worst > 1.05) flags.push({ x: c.x[wi], z: c.z[wi], kind: 'rules',
        text: `${rules.kinds[c.kind].label}: cannot keep to its rules here (${(worst * 100).toFixed(0)}% of its limit). The roads it must meet disagree.` });
    }
  }
  return { crossings, flags, junctions };
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
// The road's own limits along it (c.lim: in town, near junctions) are used
// when it has them; otherwise the kind given.
export function checkProfile(c, p, kind) {
  const n = c.n, h = Math.max(1, Math.round(5 / c.ds)), B = h * c.ds;
  const L = c.lim && c.lim.kc.length === n ? c.lim : null;
  const K = c.K || kind;
  const G0 = K.G / 100, kc0 = 1 / (100 * K.Kc), ks0 = 1 / (100 * K.Ks), Rmin = minRadius(K.V);
  const vert = new Float32Array(n), grade = new Float32Array(n), bend = new Float32Array(n), curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - h), b = Math.min(n - 1, i + h);
    const g = (p[b] - p[a]) / ((b - a) * c.ds || 1);
    grade[i] = g;
    const G = L ? L.G[i] : G0, kc = L ? L.kc[i] : kc0, ks = L ? L.ks[i] : ks0;
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

// Everything in one go, for a lab or a test.
// opt.bench: first move each road onto the flat strip nearby (findBenches).
export function runAll(lines, waterways, groundAt, rules, opt = {}) {
  const net = sampleChains(buildNetwork(lines));
  const bench = opt.bench ? findBenches(net, groundAt, rules, opt) : null;
  net.crossings = findCrossings(net);
  const waterCrossings = findWaterCrossings(net, waterways || []);
  const r = engineer(net, groundAt, rules, { ...opt, waterCrossings });
  return { net, ...r, waterCrossings, bench };
}
