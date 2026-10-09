// The round Earth (globe.js): placements checked as properties, far and near,
// across the date line and at high latitude.
import assert from 'node:assert/strict';
import { ecef, axesAt, View, mercScales, tilePoints, A } from '../src/globe.js';
import { buildMesh } from '../src/worker.js';
import { tileCentreMerc, tileSizeMerc, mercToTile, lonToMercX, latToMercY, mercXToLon, mercYToLat } from '../src/geo.js';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (within ${tol})`);
const apply = (at, p) => [0, 1, 2].map((r) => at.rot[r] * p[0] + at.rot[3 + r] * p[1] + at.rot[6 + r] * p[2] + at.org[r]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 1. Straight down is straight down, and the camera's axes are its own.
{
  const v = new View(43.65, -79.38, 1000);
  const below = v.toCam(ecef(43.65, -79.38, 0));
  near(below[0], 0, 1e-6, 'below: no east'); near(below[1], -1000, 1e-6, 'below: 1000 m down'); near(below[2], 0, 1e-6, 'below: no south');
  near(v.centre[1], -(A + 1000), 30000, 'the middle of the Earth is straight down');
  for (const ax of axesAt(-33.9, 151.2)) near(Math.hypot(...ax), 1, 1e-12, 'axes are units');
  console.log('ok  straight down, and the axes');
}

// 2. The curve is real: a sea-level point 100 km north of a camera on the sea
//    lies about d^2 / 2R (785 m) below level, as Terrain Walker's faked curve said.
{
  const v = new View(45, -60, 0);
  const p = v.toCam(ecef(45 + 100000 / 111132, -60, 0));
  near(-p[1], 100000 ** 2 / (2 * 6371000), 15, 'drop 100 km away');
  assert.ok(p[2] < -99000, 'and it is north (negative south)');
  console.log('ok  the curve: ' + (-p[1]).toFixed(0) + ' m below level at 100 km');
}

// 3. A placement puts every point of a patch where it really is, near and far.
for (const [lat, lon, dLat, dLon] of [[43.6, -79.4, 0.01, 0.01], [43.6, -79.4, 8, 12], [70, 20, -3, 40], [-45, 170, 1, 1]]) {
  const v = new View(lat, lon, 500);
  const at = v.place(lat + dLat, lon + dLon, 200);
  const s = axesAt(lat + dLat, lon + dLon), O = ecef(lat + dLat, lon + dLon, 200);
  for (const p of [[0, 0, 0], [300, 0, 0], [0, 50, 0], [-120, 10, 700]]) {
    const e = [0, 1, 2].map((k) => O[k] + p[0] * s[0][k] + p[1] * s[1][k] + p[2] * s[2][k]);
    assert.ok(dist(apply(at, p), v.toCam(e)) < 0.05, `patch point at ${dLat},${dLon} from the camera`);
  }
}
console.log('ok  placements put patch points where they really are, near and far');

// 4. Roads stand on the ground: a map-tile point placed as roads and
//    buildings are (mercator units, scaled, turned) lands within 30 cm of the
//    same point as the ground tile puts it (exact), across a zoom-14 tile,
//    at the equator, mid-latitude and far north.
for (const lat of [0.5, 43.65, 69.6]) {
  const z = 14, t = mercToTile(lonToMercX(-79.38), latToMercY(lat), z);
  const tx = Math.floor(t.x), ty = Math.floor(t.y);
  const c = tileCentreMerc(tx, ty, z), half = tileSizeMerc(z) / 2;
  const v = new View(lat + 0.01, -79.37, 300);
  const clat = mercYToLat(c.y), clon = mercXToLon(c.x), sc = mercScales(clat);
  const asRoad = v.place(clat, clon, 0);
  let worst = 0;
  for (const [x, zz] of [[0, 0], [half, 0], [0, half], [-half, -half], [half * 0.7, -half * 0.3]]) {
    const el = 150;
    const road = apply(asRoad, [x * sc[0], el, zz * sc[1]]);
    const ground = v.toCam(ecef(mercYToLat(c.y - zz), mercXToLon(c.x + x), el));
    worst = Math.max(worst, dist(road, ground));
  }
  assert.ok(worst < 0.3, `roads within 30 cm of the ground at ${lat}: ${worst.toFixed(3)} m`);
  console.log(`ok  roads on the ground at ${lat} N: worst ${(worst * 100).toFixed(1)} cm across a zoom-14 tile`);
}

// 5. The ground tiles' own points (tilePoints, built in the helper) are where
//    they really are, skirt included, for a fine tile and a continent-sized one.
for (const [z, lat, lon] of [[14, 43.65, -79.38], [4, 45, -100]]) {
  const t = mercToTile(lonToMercX(lon), latToMercY(lat), z), tx = Math.floor(t.x), ty = Math.floor(t.y);
  const h = new Float32Array(256 * 256).fill(321);
  const { positions } = buildMesh(h, z, 16);
  const c = tileCentreMerc(tx, ty, z), pts = tilePoints(positions, c.x, c.y, 150);
  const v = new View(lat, lon, 2000), at = v.place(mercYToLat(c.y), mercXToLon(c.x), 0);
  for (const i of [0, 8, 16 * 17 / 2, positions.length / 4 - 1]) {
    const x = positions[4 * i], el = positions[4 * i + 1], zz = positions[4 * i + 2], w = positions[4 * i + 3];
    const truth = v.toCam(ecef(mercYToLat(c.y - zz), mercXToLon(c.x + x), el - 150 * w));
    const got = apply(at, [pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]]);
    assert.ok(dist(got, truth) < (z < 8 ? 2 : 0.05), `zoom ${z} point ${i}: ${dist(got, truth).toFixed(3)} m off`);
  }
}
console.log('ok  ground tile points, skirts too, at zoom 14 and zoom 4');

// 6. The date line: a tile reached by flying east past 180 (longitude 180.5)
//    is placed exactly where the same tile at -179.5 is.
{
  const v = new View(-17.6, 179.9, 3000);
  const a = v.place(-17.6, 180.5, 0), b = v.place(-17.6, -179.5, 0);
  assert.ok(dist(a.org, b.org) < 1e-6 && a.rot.every((r, i) => Math.abs(r - b.rot[i]) < 1e-7), 'same place either way round');
  console.log('ok  the date line');
}
