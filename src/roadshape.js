// Road shapes from height lines (roadrules.js): the surface with its crown or
// banking, bridge decks with sides and piers, railways' stone bed and rails.
// Tunnels are left out (they are under the ground).
//
// Positions are local metres round a place's middle (x east, z south), the
// same frame as roadrules.js; vertices go into a MeshBuilder.

import { rgba } from './meshbuilder.js';
import { ROAD_STYLE, RAIL_STYLE, RAIL_HEAD } from './roads.js';
import { banking, CROWN, checkProfile } from './roadrules.js';

const LIFT = 0.08;               // the surface sits this far above its height line
const DECK = 1.2;                // depth of a bridge deck, metres
const PIER_EVERY = 30;           // metres between piers
const DECK_SIDE = [150, 148, 142], PIER_C = [128, 126, 120], DECK_UNDER = [96, 95, 92];
const BED_C = [58, 56, 54], RAIL_C = [150, 148, 144];
const SIDE_C = [112, 108, 102];        // the road's own bed, where it stands a little above the ground

// Colour for how hard a stretch pushes its rules (1 = at the limit).
export function ruleColour(r) {
  if (r <= 1) return [64, 168, 96];                     // within its rules
  if (r <= 1.5) return [222, 170, 40];                  // a little over
  return [208, 58, 46];                                 // well over
}

// opt:
//   which    'prof' (the engineered line) or 'raw' (draped on the ground, as today)
//   colour   'plain' or 'rules'
//   curves   in rules colour, count the plan's bends too
//   rules    the rules (for the kinds' speeds and limits)
export function buildRoadShapes(net, mb, opt) {
  const { rules } = opt;
  const raw = opt.which === 'raw';
  const counts = { decks: 0, piers: 0, tunnels: 0, piersMoved: 0, pierSpots: [] };
  const onRoad = raw ? null : drivableAt(net, rules);
  for (const c of net.chains) {
    const kind = rules.kinds[c.kind];
    const p = raw ? c.raw : c.prof;
    if (!p) continue;
    const struct = raw ? null : c.struct;
    const sc = opt.colour === 'rules' ? checkProfile(c, p, kind) : null;
    const rail = c.kind === 'rail' || c.kind === 'railMinor';
    const st = ROAD_STYLE[c.cls] || ROAD_STYLE.minor;
    const plain = rail ? BED_C : st.c;
    const hw = c.width / 2;
    const n = c.n;
    // Direction and left-hand normal at each sample.
    const lx = new Float64Array(n), lz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = c.x[b] - c.x[a], dz = c.z[b] - c.z[a], L = Math.hypot(dx, dz) || 1;
      lx[i] = dz / L; lz[i] = -dx / L;              // left of the way it runs (z is south)
    }
    // Cross-section heights at the left edge, middle and right edge.
    const bank = (i) => (raw || rail) ? null : banking(kind.V, c.R[i]);
    const edgeH = (i, side) => {             // side +1 left, -1 right
      const e = bank(i);
      if (e === null) return p[i] - (raw || rail ? 0 : CROWN * hw);
      return p[i] - side * e * hw;
    };
    const col = (i) => {
      let rgb = plain;
      if (sc) rgb = ruleColour(Math.max(sc.vert[i], opt.curves ? sc.curve[i] : 0));
      return rgba(rgb[0], rgb[1], rgb[2]);
    };
    // The surface, three vertices across each sample.
    let prev = -1;
    for (let i = 0; i < n; i++) {
      if (struct && struct[i] === 2 && (i === 0 || struct[i - 1] === 2)) { prev = -1; counts.tunnels++; continue; }
      const k = col(i);
      const base = mb.vert(c.x[i] + lx[i] * hw, edgeH(i, 1) + LIFT, c.z[i] + lz[i] * hw, k);
      mb.vert(c.x[i], p[i] + LIFT, c.z[i], k);
      mb.vert(c.x[i] - lx[i] * hw, edgeH(i, -1) + LIFT, c.z[i] - lz[i] * hw, k);
      if (prev >= 0) {
        mb.tri(prev, base, prev + 1); mb.tri(prev + 1, base, base + 1);
        mb.tri(prev + 1, base + 1, prev + 2); mb.tri(prev + 2, base + 1, base + 2);
      }
      prev = base;
    }
    // Rails on top of the bed (plain colour only).
    if (rail && !sc) {
      const rs = c.cls === 'transit' && c.subclass === 'tram' ? RAIL_STYLE.tram : RAIL_STYLE.main;
      const steel = rgba(RAIL_C[0], RAIL_C[1], RAIL_C[2]);
      for (const [o1, o2] of [[rs.gauge / 2 + RAIL_HEAD, rs.gauge / 2], [-rs.gauge / 2, -rs.gauge / 2 - RAIL_HEAD]]) {
        let pv = -1;
        for (let i = 0; i < n; i++) {
          if (struct && struct[i] === 2) { pv = -1; continue; }
          const y = p[i] + LIFT + 0.17;
          const a = mb.vert(c.x[i] + lx[i] * o1, y, c.z[i] + lz[i] * o1, steel);
          mb.vert(c.x[i] + lx[i] * o2, y, c.z[i] + lz[i] * o2, steel);
          if (pv >= 0) { mb.tri(pv, a, pv + 1); mb.tri(pv + 1, a, a + 1); }
          pv = a;
        }
      }
    }
    if (!struct) continue;
    // Where the road stands a little above the ground (less than a bridge),
    // its own bed shows at the edges, down to the ground. The ground itself
    // is not touched.
    const bed = rgba(SIDE_C[0], SIDE_C[1], SIDE_C[2]);
    for (let i = 1; i < n; i++) {
      const a = i - 1;
      if (struct[a] || struct[i] || !c.under) continue;
      if (p[a] - c.under[a] < 0.15 && p[i] - c.under[i] < 0.15) continue;
      for (const sd of [1, -1]) {
        const P = [c.x[a] + sd * lx[a] * hw, edgeH(a, sd) + LIFT, c.z[a] + sd * lz[a] * hw];
        const Q = [c.x[i] + sd * lx[i] * hw, edgeH(i, sd) + LIFT, c.z[i] + sd * lz[i] * hw];
        const b = mb.verts;
        mb.vert(P[0], P[1], P[2], bed); mb.vert(Q[0], Q[1], Q[2], bed);
        mb.vert(Q[0], c.under[i] - 0.3, Q[2], bed); mb.vert(P[0], c.under[a] - 0.3, P[2], bed);
        mb.tri(b, b + 1, b + 2); mb.tri(b, b + 2, b + 3);
      }
    }
    // Bridge decks: sides and underside, then piers down to the ground.
    const side = rgba(DECK_SIDE[0], DECK_SIDE[1], DECK_SIDE[2]), under = rgba(DECK_UNDER[0], DECK_UNDER[1], DECK_UNDER[2]);
    const pier = rgba(PIER_C[0], PIER_C[1], PIER_C[2]);
    let run = -1, sinceP = 0;
    for (let i = 0; i < n; i++) {
      const on = struct[i] === 1;
      if (on && run < 0) { run = i; counts.decks++; sinceP = PIER_EVERY / 2; c._moved = false; }
      if (!on) { run = -1; continue; }
      if (i > run) {
        const a = i - 1;
        const L1 = [c.x[a] + lx[a] * hw, edgeH(a, 1) + LIFT, c.z[a] + lz[a] * hw], L2 = [c.x[i] + lx[i] * hw, edgeH(i, 1) + LIFT, c.z[i] + lz[i] * hw];
        const R1 = [c.x[a] - lx[a] * hw, edgeH(a, -1) + LIFT, c.z[a] - lz[a] * hw], R2 = [c.x[i] - lx[i] * hw, edgeH(i, -1) + LIFT, c.z[i] - lz[i] * hw];
        const quad = (P, Q, colr) => {
          const b = mb.verts;
          mb.vert(P[0], P[1], P[2], colr); mb.vert(Q[0], Q[1], Q[2], colr);
          mb.vert(Q[0], Q[1] - DECK, Q[2], colr); mb.vert(P[0], P[1] - DECK, P[2], colr);
          mb.tri(b, b + 1, b + 2); mb.tri(b, b + 2, b + 3);
        };
        quad(L1, L2, side); quad(R1, R2, side);
        const b = mb.verts;
        mb.vert(L1[0], L1[1] - DECK, L1[2], under); mb.vert(L2[0], L2[1] - DECK, L2[2], under);
        mb.vert(R2[0], R2[1] - DECK, R2[2], under); mb.vert(R1[0], R1[1] - DECK, R1[2], under);
        mb.tri(b, b + 1, b + 2); mb.tri(b, b + 2, b + 3);
        sinceP += c.ds;
      }
      const ground = c.under ? c.under[i] : c.raw[i];
      if (sinceP >= PIER_EVERY && p[i] - DECK - ground > 2.5) {
        // Never on a road, railway or path below: wait until clear of it
        // (the next clear spot along the deck), so the span reaches across.
        if (onRoad && onRoad(c.id, c.x[i], c.z[i], Math.max(hw * 0.55, 0.6) + 0.5, p[i] - DECK)) { if (!c._moved) { counts.piersMoved++; c._moved = true; } continue; }
        c._moved = false;
        sinceP = 0; counts.piers++; counts.pierSpots.push([c.x[i], c.z[i], c.id]);
        box(mb, c.x[i], c.z[i], lx[i], lz[i], hw * 0.55, 0.6, ground - 0.5, p[i] - DECK, pier);
      }
    }
  }
  return counts;
}

// Whether a spot (a pier r metres round) would stand on another road's
// surface (with its shoulders) that lies below height y.
function drivableAt(net, rules) {
  const cell = 20, m = new Map(), key = (i, j) => i * 100003 + j;
  for (const c of net.chains) {
    if (!c.prof) continue;
    const reach = c.width / 2 + (rules.kinds[c.kind].sh || 0);
    for (let i = 0; i < c.n; i++) {
      const k = key(Math.floor(c.x[i] / cell), Math.floor(c.z[i] / cell));
      let a = m.get(k); if (!a) m.set(k, a = []);
      a.push([c.id, c.x[i], c.z[i], c.prof[i], reach]);
    }
  }
  const far = 40;
  return (id, x, z, r, y) => {
    for (let j = Math.floor((z - far) / cell); j <= Math.floor((z + far) / cell); j++) {
      for (let i = Math.floor((x - far) / cell); i <= Math.floor((x + far) / cell); i++) {
        const a = m.get(key(i, j)); if (!a) continue;
        for (const [cid, sx, sz, h, reach] of a) {
          if (cid === id || h > y - 1) continue;
          if (Math.hypot(sx - x, sz - z) < reach + r + 1) return true;   // samples are 2 m apart: 1 m spare
        }
      }
    }
    return false;
  };
}

// A box standing upright, its long side across the road (a pier).
function box(mb, x, z, lx, lz, halfAcross, halfAlong, y0, y1, colour) {
  const fx = -lz, fz = lx;          // along the road
  const corners = [];
  for (const [a, f] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) corners.push([x + lx * halfAcross * a + fx * halfAlong * f, z + lz * halfAcross * a + fz * halfAlong * f]);
  for (let k = 0; k < 4; k++) {
    const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
    const b = mb.verts;
    mb.vert(ax, y0, az, colour); mb.vert(bx, y0, bz, colour); mb.vert(bx, y1, bz, colour); mb.vert(ax, y1, az, colour);
    mb.tri(b, b + 1, b + 2); mb.tri(b, b + 2, b + 3);
  }
}

// Where to stand when driving along a road: fractional sample f on chain c,
// driving in direction dir (+1 toward the end, -1 back), in the right-hand
// lane (Canada drives on the right; a one-way road is driven in its middle).
// Returns { x, y (road surface), z, fx, fz (forward), bank (cross slope, + = down to the left) }.
export function roadPoint(c, f, dir, which, rules) {
  const p = which === 'raw' ? c.raw : c.prof;
  const n = c.n, i = Math.max(0, Math.min(n - 2, Math.floor(f))), u = Math.max(0, Math.min(1, f - i));
  const x = c.x[i] + (c.x[i + 1] - c.x[i]) * u, z = c.z[i] + (c.z[i + 1] - c.z[i]) * u;
  let fx = (c.x[i + 1] - c.x[i]) * dir, fz = (c.z[i + 1] - c.z[i]) * dir;
  const L = Math.hypot(fx, fz) || 1; fx /= L; fz /= L;
  const lx = fz, lz = -fx;                               // left of the way you drive
  const off = c.oneway ? 0 : -c.width / 4;               // right-hand lane
  const kind = rules.kinds[c.kind];
  let e = which === 'raw' ? null : banking(kind.V, c.R[Math.round(f)] * dir);
  const h = p[i] + (p[i + 1] - p[i]) * u;
  const bank = e === null ? (which === 'raw' ? 0 : (off < 0 ? -CROWN : 0)) : e;
  const y = h + LIFT + (e === null ? (which === 'raw' ? 0 : -CROWN * Math.abs(off)) : -e * off);
  return { x: x + lx * off, y, z: z + lz * off, fx, fz, bank };
}
