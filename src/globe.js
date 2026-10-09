// The round Earth: where a thing is, and how it is turned, as seen from you.
//
// Everything is drawn in the camera's own axes: x east, y up, z south, as the
// rest of the app has always used, with the camera at the origin. Until
// 0.14.1 things were laid out on the flat map around you, with a curve faked
// in the shader (good to about 1,000 km). Now each thing that is drawn (a
// ground tile, a map tile of roads and buildings, a landmark) is a small
// patch built flat in ITS OWN local axes (east, up, south where it stands),
// and placed on the real Earth: a turn (rot) and a position (org), both
// worked out here in full precision, once per thing per frame. The graphics
// card only ever sees small numbers.
//
// The Earth is the WGS84 ellipsoid. Heights are above it, as the height tiles
// give them.

import { mercXToLon, mercYToLat } from './geo.js';

export const A = 6378137;                      // metres, equator radius
export const F = 1 / 298.257223563;            // flattening
const E2 = F * (2 - F);
const D2R = Math.PI / 180;

// Latitude and longitude (degrees) and height (metres) to earth-centred
// x, y, z in metres (x to 0N 0E, y to 0N 90E, z to the North Pole).
export function ecef(lat, lon, h, out = [0, 0, 0]) {
  const p = lat * D2R, l = lon * D2R, sp = Math.sin(p), cp = Math.cos(p);
  const n = A / Math.sqrt(1 - E2 * sp * sp);
  out[0] = (n + h) * cp * Math.cos(l);
  out[1] = (n + h) * cp * Math.sin(l);
  out[2] = (n * (1 - E2) + h) * sp;
  return out;
}

// The local axes at a place, in earth-centred terms: east, up (straight up
// from the ellipsoid) and south. In this order, they are the app's x, y, z.
export function axesAt(lat, lon) {
  const p = lat * D2R, l = lon * D2R, sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
  return [
    [-sl, cl, 0],                        // east
    [cp * cl, cp * sl, sp],              // up
    [sp * cl, sp * sl, -cp],             // south
  ];
}

// Ground metres per mercator metre at a latitude: [east, south]. The map tiles
// are cut on a sphere of radius A; the Earth is an ellipsoid, whose two
// curvatures differ by up to a third of a percent (4 m across a zoom-14 tile),
// so the two directions get their own scale.
export function mercScales(lat) {
  const p = lat * D2R, sp = Math.sin(p), cp = Math.cos(p), w = 1 - E2 * sp * sp;
  const n = A / Math.sqrt(w), m = A * (1 - E2) / (w * Math.sqrt(w));
  return [n * cp / A, m * cp / A];
}

// The view from one camera position. Build one per frame.
export class View {
  constructor(lat, lon, h) {
    this.lat = lat; this.lon = lon; this.h = h;
    this.P = ecef(lat, lon, h);
    this.ax = axesAt(lat, lon);
    // Where the middle of the Earth is, in camera axes (for "which way is up"
    // anywhere on screen).
    this.centre = this.toCam([0, 0, 0]);
  }

  // An earth-centred point in camera axes.
  toCam(p, out = [0, 0, 0]) {
    const d0 = p[0] - this.P[0], d1 = p[1] - this.P[1], d2 = p[2] - this.P[2];
    for (let i = 0; i < 3; i++) out[i] = this.ax[i][0] * d0 + this.ax[i][1] * d1 + this.ax[i][2] * d2;
    return out;
  }

  // Placement of a patch built in its own local axes at (lat, lon), with its
  // origin at height h there: { rot (3 x 3, by columns, as GLSL wants it),
  // org (camera axes, metres) }. A point (x, y, z) of the patch is then at
  // rot * (x, y, z) + org from the camera.
  place(lat, lon, h = 0, out = { rot: new Float32Array(9), org: [0, 0, 0] }) {
    const s = axesAt(lat, lon);
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3; r++) out.rot[c * 3 + r] = this.ax[r][0] * s[c][0] + this.ax[r][1] * s[c][1] + this.ax[r][2] * s[c][2];
    }
    this.toCam(ecef(lat, lon, h), out.org);
    return out;
  }

  // The same, for a patch whose middle is at a mercator position.
  placeMerc(mx, my, h = 0, out) { return this.place(mercYToLat(my), mercXToLon(mx), h, out); }
}

// The round-Earth view for a drawing pass: the one main.js built, or (for a
// pass built elsewhere, as the tests do) one made from its camera.
export function viewOf(pass) {
  return pass.globe || (pass.globe = new View(mercYToLat(pass.mercY), mercXToLon(pass.mercX), pass.alt || 0));
}

// A tile's points in its own local axes, from the flat-map points the height
// helper builds (worker.js buildMesh: x east and z south in mercator metres
// from the tile's middle, y the height, w 1 on the skirt). Each point is put
// where it really is on the Earth; the skirt hangs `skirt` metres straight
// down. Runs in the helper, in full precision.
export function tilePoints(positions, mx, my, skirt) {
  const lat0 = mercYToLat(my), lon0 = mercXToLon(mx);
  const O = ecef(lat0, lon0, 0), ax = axesAt(lat0, lon0);
  const n = positions.length / 4, out = new Float32Array(n * 3), p = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const x = positions[4 * i], el = positions[4 * i + 1], z = positions[4 * i + 2], w = positions[4 * i + 3];
    ecef(mercYToLat(my - z), mercXToLon(mx + x), el - skirt * w, p);
    const d0 = p[0] - O[0], d1 = p[1] - O[1], d2 = p[2] - O[2];
    for (let k = 0; k < 3; k++) out[3 * i + k] = ax[k][0] * d0 + ax[k][1] * d1 + ax[k][2] * d2;
  }
  return out;
}
