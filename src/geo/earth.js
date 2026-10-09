// The shape of the Earth, and where things are on it.
//
// The Earth is the WGS84 ellipsoid: a ball slightly squashed at the poles
// (21 km shorter pole to pole than across the equator). Every position in the
// app is one of two kinds:
//
//   - geographic: latitude and longitude in degrees, height in metres above
//     the ellipsoid (roughly, above sea level);
//   - "earth-centred": x, y, z in metres from the centre of the Earth, x
//     towards 0 N 0 E, y towards 0 N 90 E, z towards the North Pole.
//
// Earth-centred numbers are millions of metres, too big for the graphics card
// to hold to the centimetre. So positions are always worked out here in full
// precision, then made relative to the camera (or a tile's middle) before they
// go to the graphics card.

export const A = 6378137;                    // metres, equator radius
export const F = 1 / 298.257223563;          // flattening
export const B = A * (1 - F);                // metres, pole radius
export const E2 = F * (2 - F);               // eccentricity squared
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// Latitude, longitude (degrees) and height (metres) to earth-centred x, y, z.
export function toEarth(lat, lon, h = 0, out = [0, 0, 0]) {
  const p = lat * D2R, l = lon * D2R;
  const sp = Math.sin(p), cp = Math.cos(p);
  const n = A / Math.sqrt(1 - E2 * sp * sp);   // radius of curvature across
  out[0] = (n + h) * cp * Math.cos(l);
  out[1] = (n + h) * cp * Math.sin(l);
  out[2] = (n * (1 - E2) + h) * sp;
  return out;
}

// Earth-centred x, y, z back to { lat, lon, h }. Accurate to well under a
// millimetre anywhere from the centre of the Earth out past the Moon
// (Bowring's method, two rounds).
export function fromEarth(x, y, z) {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  if (p < 1e-9) return { lat: z >= 0 ? 90 : -90, lon: 0, h: Math.abs(z) - B };
  const ep2 = (A * A - B * B) / (B * B);
  let beta = Math.atan2(A * z, B * p), lat = 0;
  for (let i = 0; i < 2; i++) {
    const sb = Math.sin(beta), cb = Math.cos(beta);
    lat = Math.atan2(z + ep2 * B * sb * sb * sb, p - E2 * A * cb * cb * cb);
    beta = Math.atan2((1 - F) * Math.sin(lat), Math.cos(lat));
  }
  const sl = Math.sin(lat), cl = Math.cos(lat);
  const n = A / Math.sqrt(1 - E2 * sl * sl);
  const h = Math.abs(cl) > 1e-9 ? p / cl - n : Math.abs(z) / Math.abs(sl) - n * (1 - E2);
  return { lat: lat * R2D, lon: lon * R2D, h };
}

// The local directions at a place: east, north and up (straight up from the
// ellipsoid, the way a plumb line hangs). Each is a unit vector in
// earth-centred axes.
export function localFrame(lat, lon) {
  const p = lat * D2R, l = lon * D2R;
  const sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
  return {
    east: [-sl, cl, 0],
    north: [-sp * cl, -sp * sl, cp],
    up: [cp * cl, cp * sl, sp],
  };
}

// Metres per degree at a latitude, for turning a step on the ground into a
// change of latitude and longitude. h: height above the ellipsoid.
export function metresPerDegree(lat, h = 0) {
  const sp = Math.sin(lat * D2R), w = 1 - E2 * sp * sp;
  const n = A / Math.sqrt(w), m = A * (1 - E2) / (w * Math.sqrt(w));
  return { north: (m + h) * D2R, east: (n + h) * Math.cos(lat * D2R) * D2R };
}

export const wrapLon = (lon) => ((lon + 180) % 360 + 360) % 360 - 180;

// ---- map tiles -----------------------------------------------------------------
// The height and map tiles are cut the usual web-map way ("Web Mercator"):
// zoom z splits the world into 2^z by 2^z square tiles, x from 180 W eastward,
// y from 85.05 N southward. They stop at 85.05 degrees north and south, which
// is why there is a hole at each pole.

export const MAX_LAT = 85.0511287798;

export const tileLon = (x, z) => x / 2 ** z * 360 - 180;
export const tileLat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * R2D;

// The tile (fractional) containing a latitude and longitude.
export function tileAt(lat, lon, z) {
  const n = 2 ** z, la = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * D2R;
  return {
    x: (wrapLon(lon) + 180) / 360 * n,
    y: (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n,
  };
}

// A tile's edges: { w, e, n, s } in degrees.
export const tileBounds = (z, x, y) =>
  ({ w: tileLon(x, z), e: tileLon(x + 1, z), n: tileLat(y, z), s: tileLat(y + 1, z) });
