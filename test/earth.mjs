import { toEarth, fromEarth, localFrame, metresPerDegree, tileAt, tileBounds, A, B, MAX_LAT } from '../src/geo/earth.js';
import { ok, near, done } from './_check.mjs';

// Known points.
let p = toEarth(0, 0, 0);
near(p[0], A, 1e-6, 'equator, prime meridian x'); near(p[1], 0, 1e-6, 'y'); near(p[2], 0, 1e-6, 'z');
p = toEarth(90, 0, 0);
near(p[2], B, 1e-6, 'North Pole is the short radius');
p = toEarth(0, 90, 1000);
near(p[1], A + 1000, 1e-6, '1 km above 0 N 90 E');

// Round trips, from the ground to geostationary height, all over.
for (const [lat, lon, h] of [[43.6426, -79.3871, 76], [-33.86, 151.2, 0], [89.9, 10, 5],
  [-85, -170, 2000], [27.988, 86.925, 8849], [45, -80, 35786000], [0, 179.999, -400]]) {
  const e = toEarth(lat, lon, h), g = fromEarth(e[0], e[1], e[2]);
  near(g.lat, lat, 1e-9, `lat round trip ${lat},${lon}`);
  near(((g.lon - lon + 540) % 360) - 180, 0, 1e-9, `lon round trip ${lat},${lon}`);
  near(g.h, h, 1e-3, `height round trip ${lat},${lon},${h}`);
}

// Local frame: unit, at right angles, and up really is away from the centre.
for (const [lat, lon] of [[43.6, -79.4], [-60, 120], [0, 0]]) {
  const f = localFrame(lat, lon);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  near(dot(f.east, f.north), 0, 1e-12, 'east and north at right angles');
  near(dot(f.east, f.up), 0, 1e-12, 'east and up at right angles');
  near(dot(f.north, f.up), 0, 1e-12, 'north and up at right angles');
  near(dot(f.up, f.up), 1, 1e-12, 'up is a unit');
  // Moving up 1 km along "up" adds 1 km of height.
  const e = toEarth(lat, lon, 0), g = fromEarth(e[0] + 1000 * f.up[0], e[1] + 1000 * f.up[1], e[2] + 1000 * f.up[2]);
  near(g.h, 1000, 1e-6, 'up adds height');
  // A metre north changes latitude by 1 / metres-per-degree.
  const m = metresPerDegree(lat), n = fromEarth(e[0] + f.north[0], e[1] + f.north[1], e[2] + f.north[2]);
  near(n.lat - lat, 1 / m.north, 1e-12, 'metres per degree north');
}

// Tiles.
let t = tileAt(0, 0, 1);
near(t.x, 1, 1e-12, 'tile x at 0,0'); near(t.y, 1, 1e-12, 'tile y at 0,0');
const b = tileBounds(0, 0, 0);
near(b.n, MAX_LAT, 1e-9, 'the world tile reaches 85.05 N');
t = tileAt(43.6426, -79.3871, 12);
ok(Math.floor(t.x) === 1144 && Math.floor(t.y) === 1495, 'CN Tower in tile 12/1144/1495: ' + Math.floor(t.x) + '/' + Math.floor(t.y));
done();
