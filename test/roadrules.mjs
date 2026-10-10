// Road rules (src/roadrules.js): joining map pieces into roads, deciding which
// road is on top where two cross, height lines within each kind's limits, and
// the ground cut and filled to meet them. All on made-up ground.
import assert from 'node:assert/strict';
import {
  clipPolyline, buildNetwork, sampleChains, findCrossings, fitProfile, engineer,
  checkProfile, defaultRules, kindOf, runAll, minRadius, banking, KINDS,
} from '../src/roadrules.js';

let n = 0;
const ok = (name) => { n++; console.log('ok  ' + name); };
const line = (pts, kind, more = {}) => ({ pts, kind, cls: { motorway: 'motorway', secondary: 'secondary', local: 'minor', ramp: 'motorway' }[kind] || 'minor', brunnel: null, layer: 0, oneway: false, ...more });
const maxGrade = (p, ds) => { let m = 0; for (let i = 1; i < p.length; i++) m = Math.max(m, Math.abs(p[i] - p[i - 1]) / ds); return m; };

// ---- kinds -----------------------------------------------------------------------
assert.equal(kindOf('motorway', {}), 'motorway');
assert.equal(kindOf('motorway', { ramp: 1 }), 'ramp');
assert.equal(kindOf('tertiary', {}), 'secondary');
assert.equal(kindOf('rail', { subclass: 'rail' }), 'rail');
assert.equal(kindOf('rail', { service: 'siding' }), 'railMinor');
assert.equal(kindOf('ferry', {}), null);
assert.equal(kindOf('path', { indoor: 1 }), null);
assert.ok(minRadius(120) > 600 && minRadius(120) < 900, 'tightest curve at 120 km/h is several hundred metres');
assert.ok(minRadius(50) < 100);
assert.equal(banking(120, 1e6), null, 'a straight road keeps its crown');
assert.ok(banking(120, 800) > 0.05 && banking(120, -800) < -0.05, 'curves bank toward their inside');
ok('kinds from the map\'s classes, curves and banking');

// ---- clipping ----------------------------------------------------------------------
{
  const parts = clipPolyline([-10, 5, 50, 5, 50, 200, 60, 50], 0, 0, 100, 100);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts[0].slice(0, 2), [0, 5]);
  assert.deepEqual(parts[0].slice(-2), [50, 100]);
  assert.ok(Math.abs(parts[1][0] - (50 + 10 * (100 / 150))) < 1e-9 && parts[1][1] === 100);
  ok('lines are cut to a box, leaving and coming back in as two pieces');
}

// ---- joining -------------------------------------------------------------------------
{
  // One road in two tiles: two lines meeting at the tile edge (x = 0).
  const net = buildNetwork([line([-300, 0, 0, 0.2], 'secondary'), line([0, 0.1, 300, 0], 'secondary')]);
  assert.equal(net.chains.length, 1, 'joined across the tile edge');
  assert.ok(Math.abs(net.chains[0].length - 600) < 1);
  ok('a road cut at a tile edge is one road again');
}
{
  // A side road ending 1 m short of a main road's middle (no shared point).
  const net = buildNetwork([line([-300, 0, 300, 0], 'secondary'), line([0, 200, 0, 1], 'local')]);
  const sec = net.chains.filter((c) => c.kind === 'secondary');
  assert.equal(sec.length, 1, 'the main road stays one road through the junction');
  const loc = net.chains.find((c) => c.kind === 'local');
  assert.ok(loc.b >= 0 && net.nodes[loc.b].chains.length === 2, 'the side road meets it at a junction');
  assert.ok(Math.abs(net.nodes[loc.b].z - 1) < 1e-9);
  ok('a T junction the map drew without a shared point is joined');
}
{
  // Motorway with a ramp leaving at a junction, and a bridge piece in the middle.
  const net = buildNetwork([
    line([-600, 0, -100, 0], 'motorway'), line([-100, 0, 100, 0], 'motorway', { brunnel: 'bridge' }),
    line([100, 0, 600, 0], 'motorway'), line([100, 0, 300, 20, 500, 80], 'ramp', { cls: 'motorway' }),
  ]);
  const mw = net.chains.filter((c) => c.kind === 'motorway');
  assert.equal(mw.length, 1, 'the motorway stays one road past its ramp and through its bridge');
  assert.equal(net.chains.filter((c) => c.kind === 'ramp').length, 1);
  sampleChains(net);
  const c = mw[0], mid = Math.round(c.n / 2);
  assert.equal(c.br[mid], 1, 'the bridge piece keeps its tag');
  assert.equal(c.br[5], 0);
  ok('a motorway is one road past its ramps and through its bridges');
}

// ---- the height line ------------------------------------------------------------------
const rules = defaultRules();
{
  // A motorway along a 6 m deep creek gully and over a 0.8 m bump, both on
  // its own line. The ground is truth: it may ride over, never through.
  const ds = 2, N = 1001, t = new Float64Array(N), w = new Float64Array(N).fill(1);
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    t[i] = 100 + 0.005 * s + 0.05 * Math.sin(i * 1.7)
      + 0.8 * Math.exp(-(((s - 700) / 6) ** 2)) - 6 * Math.exp(-(((s - 1400) / 8) ** 2));
  }
  w.fill(0, 690, 711);                       // the creek: not followed down (as engineer() does)
  const r = fitProfile(t, w, ds, rules.kinds.motorway, rules, new Map(), new Map(), new Map(), t);
  assert.ok(r.ok, 'kept to the rules in ' + r.rounds + ' rounds');
  let under = 0;
  for (let i = 0; i < N; i++) under = Math.max(under, t[i] - r.p[i]);
  assert.ok(under < 0.03, 'never under the ground: ' + under.toFixed(3));
  const base = (s) => 100 + 0.005 * s;
  assert.ok(r.p[350] >= t[350] - 0.03 && r.p[350] - base(700) < 1.2, 'rides over the bump');
  assert.ok(Math.abs(r.p[700] - base(1400)) < 1.0, 'does not dip into the creek: ' + (r.p[700] - base(1400)).toFixed(2));
  assert.ok(maxGrade(r.p, ds) <= 0.04 * 1.03);
  const fake = { n: N, ds, R: new Float64Array(N).fill(Infinity) };
  const raw = checkProfile(fake, t, rules.kinds.motorway), eng = checkProfile(fake, r.p, rules.kinds.motorway);
  assert.ok(Math.max(...raw.vert) > 3, 'draped on the ground it breaks the rules badly');
  assert.ok(Math.max(...eng.vert) < 1.15, 'the fitted line keeps to them: ' + Math.max(...eng.vert).toFixed(2));
  ok('a motorway rides smoothly over a bump and across a creek, never under the ground');
}
{
  // A 15% hill: the motorway may not climb faster than 4%.
  const ds = 2, N = 601, t = new Float64Array(N), w = new Float64Array(N).fill(1);
  for (let i = 0; i < N; i++) { const s = i * ds; t[i] = 50 + 0.15 * Math.max(0, Math.min(200, s - 500)); }
  const r = fitProfile(t, w, ds, rules.kinds.motorway, rules);
  assert.ok(maxGrade(r.p, ds) <= 0.04 * 1.05, 'steepest ' + (100 * maxGrade(r.p, ds)).toFixed(1) + '%');
  const loc = fitProfile(t, w, ds, rules.kinds.local, rules);
  assert.ok(maxGrade(loc.p, ds) <= 0.09 * 1.05 && maxGrade(loc.p, ds) > 0.07, 'a local road may climb to 9%');
  ok('the steepest grade holds: 4% for a motorway, 9% for a local road');
}
{
  // Pinned ends and a must-be-above point.
  const ds = 2, N = 201, t = new Float64Array(N).fill(10), w = new Float64Array(N).fill(1);
  const r = fitProfile(t, w, ds, rules.kinds.secondary, rules, new Map([[0, 12], [N - 1, 12]]), new Map([[100, 16.5]]));
  assert.ok(Math.abs(r.p[0] - 12) < 1e-6 && Math.abs(r.p[N - 1] - 12) < 1e-6, 'meets its junctions exactly');
  assert.ok(r.p[100] >= 16.45, 'clears what it passes over');
  ok('junction heights are met exactly, and a road passing over clears what is below');
}

// ---- crossings ------------------------------------------------------------------------------
// A small world: a motorway along x on flat ground at 100 m; a secondary road
// along z crossing it. groundAt adds whatever a test wants.
function world(extra, lines) {
  const groundAt = (x, z) => 100 + extra(x, z);
  return runAll(lines, [], groundAt, defaultRules());
}
{
  // Approach mounds either side of the motorway along the secondary road: it
  // goes over, with no tag to say so.
  const mound = (x, z) => (Math.abs(x) < 15 && Math.abs(z) > 22 && Math.abs(z) < 140) ? Math.max(0, 6.5 * (1 - (Math.abs(z) - 22) / 118)) : 0;
  const r = world(mound, [line([-800, 0, 800, 0], 'motorway'), line([0, -400, 0, 400], 'secondary')]);
  const mw = r.net.chains.find((c) => c.kind === 'motorway'), sec = r.net.chains.find((c) => c.kind === 'secondary');
  assert.equal(r.crossings.length, 1);
  const d = sec.decisions[0];
  assert.equal(d.rel, 'over'); assert.equal(d.tag, null); assert.equal(d.ground, 'over');
  const hs = sec.prof[Math.round(d.ib)], hm = mw.prof[Math.round(d.ia)];
  assert.ok(hs - hm >= 6.4, 'clears the motorway: ' + (hs - hm).toFixed(2));
  assert.ok(Math.abs(hm - 100) < 0.5, 'the motorway stays on its own ground');
  assert.equal(sec.struct[Math.round(d.ib)], 1, 'a deck over the motorway');
  ok('the ground\'s mounds say the secondary road goes over the motorway');
}
{
  // Flat ground, no tags: two local roads meet level.
  const r = world(() => 0, [line([-300, 0, 300, 0], 'secondary'), line([0.3, -300, 0.3, 300], 'local')]);
  assert.equal(r.net.chains.length, 2);
  // They share no point, so this is found as a crossing and settled level.
  const loc = r.net.chains.find((c) => c.kind === 'local');
  assert.equal(loc.decisions[0].rel, 'level');
  ok('on flat ground without tags, ordinary roads meet level');
}
{
  // Flat ground, no tags, but one is a motorway: never level; flagged as a guess.
  const r = world(() => 0, [line([-800, 0, 800, 0], 'motorway'), line([0, -300, 0, 300], 'local')]);
  const loc = r.net.chains.find((c) => c.kind === 'local');
  assert.notEqual(loc.decisions[0].rel, 'level');
  assert.ok(r.flags.some((f) => f.kind === 'guess'));
  ok('a motorway never meets a road level; with nothing to go on it is flagged as a guess');
}
{
  // The map says bridge, the ground says under: go with the map, flag it.
  const cut = (x, z) => (Math.abs(x) < 15 && Math.abs(z) > 22 && Math.abs(z) < 120) ? -8 : 0;
  const r = world(cut, [line([-800, 0, 800, 0], 'motorway'), line([0, -400, 0, -40], 'secondary'),
    line([0, -40, 0, 40], 'secondary', { brunnel: 'bridge', layer: 1 }), line([0, 40, 0, 400], 'secondary')]);
  const sec = r.net.chains.find((c) => c.kind === 'secondary');
  assert.equal(sec.decisions[0].rel, 'over');
  assert.ok(r.flags.some((f) => f.kind === 'clue'));
  ok('when the map and the ground disagree, the map wins and the spot is flagged');
}

// ---- the ground is truth ------------------------------------------------------------------------
{
  // A secondary road across a 5 m deep valley and over a 5 m ridge. The road
  // may not go into the ridge, so it climbs over it; it bridges the valley.
  const nat = (x, z) => 100 - 5 * Math.exp(-(((z + 80) / 25) ** 2)) + 5 * Math.exp(-(((z - 80) / 25) ** 2));
  const rl = defaultRules();
  const r = runAll([line([0, -190, 0, 190], 'secondary')], [], nat, rl);
  const c = r.net.chains[0];
  let under = 0;
  for (let i = 0; i < c.n; i++) under = Math.max(under, c.raw[i] - c.prof[i]);
  assert.ok(under < 0.03, 'never under the ground: ' + under.toFixed(3));
  for (let i = 0; i < c.n; i++) assert.equal(c.under[i], c.raw[i], 'the ground under it is the ground as found');
  for (let i = 0; i < c.n; i++) {
    const lift = c.prof[i] - c.raw[i];
    if (lift > rl.bridgeLift + 0.01) assert.equal(c.struct[i], 1, 'well above the ground is a bridge');
  }
  ok('the ground is never changed: the road rides on it or bridges over it');
}
// ---- a little roadbed, and water ----------------------------------------------------------------
{
  // A local road over a field with 0.6 m bumps: it may ride at most 0.3 m
  // above the ground, so it follows the bumps (slow roads may be bumpy).
  const bumpy = (x, z) => 100 + 0.6 * Math.max(0, Math.sin(z / 6));
  const r = runAll([line([0, -150, 0, 150], 'local')], [], bumpy, defaultRules());
  const c = r.net.chains[0];
  let hi = 0, lo = 0;
  for (let i = 0; i < c.n; i++) { hi = Math.max(hi, c.prof[i] - c.raw[i]); lo = Math.max(lo, c.raw[i] - c.prof[i]); }
  assert.ok(hi < 0.35, 'no more than its roadbed above the ground: ' + hi.toFixed(2));
  assert.ok(lo < 0.03, 'never under it');
  assert.ok(!r.flags.length, 'and that is not a fault: ' + r.flags.map((f) => f.text).join(' | '));
  // A motorway has no roadbed limit: it rides smooth and bridges instead.
  const m = runAll([line([0, -150, 0, 150], 'motorway')], [], bumpy, defaultRules()).net.chains[0];
  let mh = 0; for (let i = 0; i < m.n; i++) mh = Math.max(mh, m.prof[i] - m.raw[i]);
  assert.ok(mh > 0.4, 'a motorway rides smooth over them');
  ok('a slow road follows bumps higher than its roadbed; a motorway rides over them');
}
{
  // A local road across a river at water level, the banks dipping a little
  // either side: over the water and on the banks it is a bridge, unflagged.
  const g = (x, z) => 100 - (Math.abs(z) < 60 ? 2 : 0) - (Math.abs(z) >= 60 && Math.abs(z) < 75 ? 5 : 0);
  const waterAt = (x, z) => Math.abs(z) < 60;
  const r = runAll([line([0, -300, 0, 300], 'local')], [], g, defaultRules(), { waterAt });
  const c = r.net.chains[0];
  for (let i = 0; i < c.n; i++) if (Math.abs(c.z[i]) < 60) assert.equal(c.struct[i], 1, 'over the water: a bridge at any height');
  assert.ok(!r.flags.length, 'the banks are not flagged: ' + r.flags.map((f) => f.text).join(' | '));
  ok('a road over water is a bridge, at any height, and its banks are not flagged');
}

// ---- piers -------------------------------------------------------------------------------------
{
  // A secondary road on a long, high bridge over a divided motorway: piers
  // every 30 m or so, but never on the motorway or its shoulders.
  const { buildRoadShapes } = await import('../src/roadshape.js');
  const { MeshBuilder } = await import('../src/meshbuilder.js');
  const valley = (x, z) => 100 - 12 * Math.exp(-((z / 120) ** 2));      // the motorway runs along a valley floor
  const rl = defaultRules();
  const r = runAll([line([-800, -14, 800, -14], 'motorway', { oneway: true }), line([800, 14, -800, 14], 'motorway', { oneway: true }),
    line([0, -400, 0, 400], 'secondary', { brunnel: 'bridge' })], [], valley, rl);
  const cnt = buildRoadShapes(r.net, new MeshBuilder(), { which: 'prof', colour: 'plain', rules: rl });
  const onSec = cnt.pierSpots.filter(([, , id]) => r.net.chains[id].kind === 'secondary');
  assert.ok(onSec.length >= 3, 'the bridge has piers: ' + onSec.length);
  const edge = 12 / 2 + rl.kinds.motorway.sh;          // a one-way motorway half and its shoulder
  for (const [x, z] of onSec) for (const cz of [-14, 14]) assert.ok(Math.abs(z - cz) > edge, `pier at z ${z.toFixed(1)} stands on the motorway`);
  assert.ok(cnt.piersMoved >= 1, 'a pier was moved off the motorway');
  ok('bridge piers never stand on a road below; they move along to the side');
}

// ---- where the road really is -------------------------------------------------------------------
{
  // A local road (6 m wide) mapped 3 m off the real road, which runs on an
  // 8 m flat bench cut into a 30% hillside. The road moves onto the bench.
  const { findBenches } = await import('../src/roadrules.js');
  const hill = (x, z) => x > 7 ? 100 + 0.3 * (x - 7) : x < -1 ? 100 - 0.3 * (-1 - x) : 100;
  const r = runAll([line([0, -300, 0, 300], 'local')], [], hill, defaultRules(), { bench: true });
  const c = r.net.chains[0];
  const mid = c.shift.slice(20, c.n - 20);
  assert.ok(Math.min(...mid) >= 1.9 && Math.max(...mid) <= 4.1, 'moved onto the bench (2 to 4 m puts all 6 m of it there): ' + Math.min(...mid).toFixed(1) + ' to ' + Math.max(...mid).toFixed(1));
  assert.ok(c.x[Math.round(c.n / 2)] >= 1.9, 'and now runs along it');
  assert.ok(c.x0 && Math.abs(c.x0[Math.round(c.n / 2)]) < 1e-9, 'the map\'s line is kept for today\'s view');
  // On flat ground it stays on the map's line.
  const flat = runAll([line([0, -300, 0, 300], 'local')], [], (x, z) => 100 + 0.02 * Math.sin(x + z), defaultRules(), { bench: true });
  assert.ok(Math.max(...flat.net.chains[0].shift.map(Math.abs)) < 0.01, 'flat ground: not moved');
  // At a junction it eases back to the map's line, so joined roads stay joined.
  const j = runAll([line([0, -300, 0, 300], 'local'), line([0, 0, -200, 0], 'local')], [], hill, defaultRules(), { bench: true });
  const through = j.net.chains.find((q) => q.length > 500);
  assert.ok(Math.abs(through.shift[Math.round(300 / through.ds)]) < 0.01, 'at the junction: on the map\'s line');
  assert.ok(Math.abs(through.shift[Math.round(100 / through.ds)]) > 1.5, 'away from it: on the bench');
  ok('a road mapped off its real place moves onto the flat strip in the ground; not on flat ground; not at junctions');
}

// ---- junctions -----------------------------------------------------------------------------------
{
  // A T on a hillside: a secondary road runs across a 6% slope, a local road
  // climbs to it from below. One junction; the local road meets its edge on
  // the junction's surface, with no hump, and follows its ground beyond.
  const hill = (x, z) => 100 + 0.06 * z;                       // ground rises southward
  const rl = defaultRules();
  const r = runAll([line([-300, 0, 300, 0], 'secondary'), line([0, -200, 0, 0], 'local')], [], hill, rl);
  assert.equal(r.junctions.length, 1, 'one junction');
  const J = r.junctions[0], sec = r.net.chains.find((c) => c.kind === 'secondary'), loc = r.net.chains.find((c) => c.kind === 'local');
  assert.equal(J.lead, sec.id, 'the secondary road leads');
  assert.equal(J.arms.length, 3);
  const arm = J.arms.find((a) => a.chain === loc.id);
  assert.ok(Math.abs(loc.prof[arm.ib] - J.h(loc.x[arm.ib], loc.z[arm.ib])) < 1e-6, 'meets the junction surface at its edge');
  const mid = Math.round(300 / sec.ds);
  assert.ok(Math.abs(J.h(sec.x[mid], sec.z[mid]) - sec.prof[mid]) < 0.01, 'the junction surface is the leading road\'s');
  const sc = checkProfile(loc, loc.prof, loc.K);
  let worst = 0; for (let i = 0; i < loc.n; i++) if (!loc.inJ[i]) worst = Math.max(worst, sc.vert[i]);
  assert.ok(worst < 1.2, 'no hump where it joins: ' + worst.toFixed(2));
  let far = 0; for (let i = 0; i < loc.n; i++) if (Math.abs(loc.z[i]) > 30) far = Math.max(far, Math.abs(loc.prof[i] - loc.raw[i]));
  assert.ok(far < 0.15, 'follows its ground beyond the junction: ' + far.toFixed(2));
  ok('a T junction on a hillside: one surface, the joining road meets its edge without a hump');
}
{
  // Two carriageways of a divided road, 12 m apart, crossed by a local road:
  // one junction, not two. (With a wide median they are two.)
  // (Meeting points shared, as the map draws them.)
  const r = runAll([line([-400, -6, 0, -6, 400, -6], 'secondary', { oneway: true }), line([400, 6, 0, 6, -400, 6], 'secondary', { oneway: true }),
    line([0, -200, 0, -6, 0, 6, 0, 200], 'local')], [], (x, z) => 100, defaultRules());
  assert.equal(r.junctions.length, 1, 'the two meeting points make one junction: ' + r.junctions.length);
  ok('both halves of a divided road make one junction');
}
{
  // A ramp leaving a motorway is not a junction; nor is a level crossing.
  const r = runAll([line([-600, 0, -100, 0], 'motorway'), line([-100, 0, 600, 0], 'motorway'), line([-100, 0, 100, 30, 300, 80], 'ramp', { cls: 'motorway' })], [], () => 100, defaultRules());
  assert.equal(r.junctions.length, 0);
  ok('a motorway ramp is not a junction');
}
{
  // The drawing: each junction is one surface, and roads stop at its edge.
  const { buildRoadShapes } = await import('../src/roadshape.js');
  const { MeshBuilder } = await import('../src/meshbuilder.js');
  const rl = defaultRules();
  const r = runAll([line([-300, 0, 0, 0, 300, 0], 'secondary'), line([0, -200, 0, 0, 0, 200], 'local')], [], (x, z) => 100 + 0.05 * z, rl);
  const mb = new MeshBuilder();
  const cnt = buildRoadShapes(r.net, mb, { which: 'prof', colour: 'plain', rules: rl });
  assert.equal(cnt.junctions, 1);
  for (const v of mb.pos) assert.ok(Number.isFinite(v));
  ok('a junction is drawn as one surface');
}

// ---- town or country ------------------------------------------------------------------------------
{
  const { markTowns } = await import('../src/roadrules.js');
  const grid = [];
  const ks = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  for (const k of ks) {
    grid.push(line([-300, k * 60, ...ks.flatMap((q) => [q * 60, k * 60]), 300, k * 60], 'local'));
    grid.push(line([k * 60, -300, ...ks.flatMap((q) => [k * 60, q * 60]), k * 60, 300], 'local'));
  }
  const town = runAll(grid, [], () => 100, defaultRules());
  assert.ok(town.net.chains.filter((c) => c.urban).length > town.net.chains.length * 0.8, 'a grid of streets is a town');
  const country = runAll([line([-300, 0, 300, 0], 'local'), line([0, 0, 0, 300], 'local')], [], () => 100, defaultRules());
  assert.ok(country.net.chains.every((c) => !c.urban), 'two lone roads are country');
  assert.equal(town.net.chains.find((c) => c.urban).K.V, defaultRules().town.local.V, 'town streets keep town rules');
  ok('dense streets are a town and keep town rules; lone roads are country');
}

// ---- reading the road from the ground --------------------------------------------------------------
{
  const { readGroundRoads } = await import('../src/roadread.js');
  const rl = defaultRules();
  const read = (g) => { const r = runAll([line([0, -200, 0, 200], 'local')], [], g, rl); const s = readGroundRoads(r.net, g, rl); return { s, c: r.net.chains[0] }; };
  // A 7 m flat bench cut into a 20% hillside, its middle 2 m left of the map's line.
  const bench = read((x, z) => x < -5.5 ? 100 + 0.2 * (-5.5 - x) : x > 1.5 ? 100 - 0.2 * (x - 1.5) : 100);
  assert.ok(bench.s.len.fits > 300, 'the map\'s road lies on the bench');
  const w = bench.c.read.width[100], off = bench.c.read.off[100];
  assert.ok(w > 6 && w < 9.5 && off < -0.8 && off > -2.6, 'width and place read: ' + w + ' ' + off);
  // Flat open ground: no strip with edges, so it cannot tell.
  const flat = read((x, z) => 100 + 0.01 * Math.sin(x * 0.7 + z));
  assert.ok(flat.s.len.unclear > 390, 'flat ground: can\'t tell');
  // Gently rolling open ground: no sharp edges, so it cannot tell either.
  const roll = read((x, z) => 100 + 4 * Math.sin(x / 60) * Math.cos(z / 80));
  assert.ok(roll.s.len.unclear > 350, 'rolling ground: can\'t tell: ' + JSON.stringify(roll.s.len));
  // A raised road bed, 8 m across, with banks: found, and the road lies on it.
  const emb = read((x, z) => { const ax = Math.abs(x); return 100 + (ax < 4 ? 1 : ax < 6 ? 1 - (ax - 4) / 2 : 0); });
  assert.ok(emb.s.len.fits > 300);
  // The map's line 4 m off a 7 m bench: part of the road hangs off its edge.
  const off4 = read((x, z) => x < -7.5 ? 100 + 0.2 * (-7.5 - x) : x > -0.5 ? 100 - 0.2 * (x + 0.5) : 100);
  assert.ok(off4.s.len.hangs > 300, 'hangs off the edge: ' + JSON.stringify(off4.s.len));
  ok('the road strip is read from the ground; the map\'s road lies on it, hangs off it, or it cannot tell');
}

// ---- from real map tiles -------------------------------------------------------------------
{
  // One secondary road crossing from one zoom-14 tile into the next, as the
  // map service sends it: each tile carries a margin past its edge.
  const { decodeMVT } = await import('../src/mvt.js');
  const { linesFromLayer } = await import('../src/roadrules.js');
  const { tileToMerc, tileSizeMerc } = await import('../src/geo.js');
  const vi = (x) => { const b = []; while (x >= 128) { b.push((x % 128) | 128); x = Math.floor(x / 128); } b.push(x); return b; };
  const key = (f, w) => vi(f * 8 + w), ld = (f, b) => [...key(f, 2), ...vi(b.length), ...b];
  const str = (s) => [...new TextEncoder().encode(s)], zz = (v) => (v << 1) ^ (v >> 31);
  const tile = (line) => {
    const g = []; let px = 0, py = 0;
    line.forEach(([x, y], i) => { if (i === 0) g.push(...vi(9)); else if (i === 1) g.push(...vi(((line.length - 1) << 3) | 2)); g.push(...vi(zz(x - px)), ...vi(zz(y - py))); px = x; py = y; });
    const feat = [...key(3, 0), 2, ...ld(2, [0, 0, 1, 1]), ...ld(4, g)];
    return new Uint8Array(ld(3, [...ld(1, str('transportation')), ...ld(2, feat), ...ld(3, str('class')), ...ld(3, str('brunnel')),
      ...ld(4, ld(1, str('secondary'))), ...ld(4, ld(1, str('bridge'))), ...key(5, 0), ...vi(4096)]));
  };
  const z = 14, tx = 4578, ty = 5973, s = tileSizeMerc(z), nw = tileToMerc(tx + 1, ty, z);
  const frame = { cmx: nw.x, cmy: nw.y - s / 2, k: 0.72, half: 5000 };
  const A = decodeMVT(tile([[1000, 2048], [4096 + 200, 2048]]), ['transportation'], 'class', ['transportation']);
  const B = decodeMVT(tile([[-200, 2048], [3000, 2048]]), ['transportation'], 'class', ['transportation']);
  const lines = [...linesFromLayer(A.transportation, { x: tx, y: ty, z }, frame), ...linesFromLayer(B.transportation, { x: tx + 1, y: ty, z }, frame)];
  assert.equal(lines.length, 2);
  assert.equal(lines[0].brunnel, 'bridge');
  const net = buildNetwork(lines);
  assert.equal(net.chains.length, 1, 'one road, not two overlapping');
  const want = ((4096 - 1000) + 3000) / 4096 * s * 0.72;
  assert.ok(Math.abs(net.chains[0].length - want) < 0.5, 'and no doubled stretch at the edge: ' + net.chains[0].length.toFixed(1) + ' vs ' + want.toFixed(1));
  ok('map tiles\' margins are cut off, and a road crossing tiles is joined once');
}

console.log(`\n${n} checks passed`);
