// Which tiles are drawn: checked as properties, at several heights and places,
// with everything loaded and with tiles missing.
import { selectTiles, ROOT_Z } from '../src/drawing/select.js';
import { Camera } from '../src/moving/camera.js';
import { viewPlanes } from '../src/drawing/view.js';
import { toEarth, tileAt } from '../src/geo/earth.js';
import { ok, done } from './_check.mjs';

const N = 64, H = 1000, FOVD = 60;
const viewFor = (cam, opts = {}) => {
  const e = cam.earth, l = Math.hypot(...e), axes = cam.axes();
  return { cam: e, camDir: [e[0] / l, e[1] / l, e[2] / l], camH: cam.h, planes: viewPlanes(axes, FOVD, 16 / 9),
    pxPerRadian: H / (FOVD * Math.PI / 180), detailPx: 4, maxZ: opts.maxZ || 14, N };
};
// Everything is available: answer the select, then load what it fetches, until settled.
function settle(view, tiles = new Map(), refuse = () => false) {
  for (let round = 0; round < 40; round++) {
    const { fetch } = selectTiles(view, tiles);
    const got = fetch.filter((f) => !refuse(f));
    if (!got.length) break;
    for (const f of got) tiles.set(f.key, { minH: 0, maxH: 500 });
  }
  return selectTiles(view, tiles);
}
const parse = (k) => k.split('/').map(Number);
const isAncestor = (a, b) => { const [za, xa, ya] = parse(a), [zb, xb, yb] = parse(b); return za < zb && (xb >> (zb - za)) === xa && (yb >> (zb - za)) === ya; };
const noOverlap = (draw) => draw.every((a) => draw.every((b) => a === b || !isAncestor(a, b)));

// 1. Standing in Toronto: fine tiles under your feet, nothing from the far side.
let cam = new Camera({ lat: 43.64, lon: -79.39, h: 80, heading: 0, tilt: -10 });
let r = settle(viewFor(cam));
ok(r.draw.length > 0, 'standing: something is drawn');
ok(noOverlap(r.draw), 'standing: no tile drawn over a finer one');
const t14 = tileAt(cam.lat, cam.lon, 14), under = `14/${Math.floor(t14.x)}/${Math.floor(t14.y)}`;
ok(r.draw.includes(under), 'standing: the zoom-14 tile underfoot is drawn (' + r.draw.filter((k) => k.startsWith('14/')).length + ' at 14)');
ok(!r.draw.some((k) => { const [z, x] = parse(k); const lonW = x / 2 ** z * 360 - 180; return z >= 4 && Math.abs(((lonW + 79 + 540) % 360) - 180) > 120; }),
  'standing: nothing from the far side of the Earth');
ok(r.draw.length < 600, 'standing: a sane number of tiles: ' + r.draw.length);

// 2. Geostationary over the Americas: only coarse tiles, and the far side culled.
cam = new Camera({ lat: 0, lon: -80, h: 35786000, heading: 0, tilt: -90 });
r = settle(viewFor(cam));
ok(r.draw.length > 0 && noOverlap(r.draw), 'geostationary: drawn, no overlap');
ok(Math.max(...r.draw.map((k) => parse(k)[0])) <= 6, 'geostationary: nothing finer than zoom 6');
ok(!r.draw.some((k) => { const [z, x, y] = parse(k); return z === 3 && x === 6 && y === 3; }), 'geostationary: Asia (3/6/3) not drawn');

// 3. HOLD: a missing tile keeps its parent on screen; nothing under that parent is drawn.
cam = new Camera({ lat: 51.3, lon: -116.2, h: 3000, heading: 90, tilt: -20 });
const v = viewFor(cam);
const full = settle(v).draw;
const victim = full.find((k) => parse(k)[0] >= 8);
const [vz, vx, vy] = parse(victim), parent = `${vz - 1}/${vx >> 1}/${vy >> 1}`;
r = settle(v, new Map(), (f) => f.key === victim);
ok(r.draw.includes(parent), 'hold: the parent of a missing tile is drawn');
ok(!r.draw.some((k) => isAncestor(parent, k)), 'hold: none of that parent\'s finer tiles are drawn');
ok(noOverlap(r.draw), 'hold: no overlap');

// 4. Across the date line: tiles both sides, no tile drawn twice.
cam = new Camera({ lat: -17.5, lon: 179.95, h: 50000, heading: 0, tilt: -30 });
r = settle(viewFor(cam));
ok(new Set(r.draw).size === r.draw.length, 'date line: no tile drawn twice');
const xs = r.draw.filter((k) => parse(k)[0] >= 6).map((k) => parse(k)[1] / 2 ** parse(k)[0]);
ok(xs.some((f) => f > 0.99) && xs.some((f) => f < 0.01), 'date line: tiles on both sides');

// 5. The coarsest tiles are always fetched first.
const first = selectTiles(viewFor(new Camera({ lat: 0, lon: 0, h: 100 })), new Map()).fetch;
ok(first.slice(0, 4 ** ROOT_Z).every((f) => f.z === ROOT_Z) && first.filter((f) => f.z === ROOT_Z).length === 4 ** ROOT_Z, 'empty start: all the roots, first');
done();
