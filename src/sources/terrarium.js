// Layer 1, sources: the world's height tiles.
//
// Mapzen's "Terrarium" tiles, on Amazon's open data: 256 x 256 pictures whose
// colours encode height, for the whole world, zoom 0 to 15. No account, and
// readable from a web page. The data is about 30 m apart in most places
// (10 m in the US, finer in parts of Europe and New Zealand), so zooms past 12
// mostly enlarge it.
//
// Brought over from Terrain Walker (heightgrid.js), unchanged in what it does.

export const URL_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const PX = 256;
export const MAX_ZOOM = 15;

export const tileUrl = (z, x, y) =>
  URL_TEMPLATE.replace('{z}', z).replace('{x}', x).replace('{y}', y);

// Colours to heights in metres. pxMetres (optional) turns on spike removal.
export function decode(rgba, pxMetres) {
  const h = new Float32Array(PX * PX);
  for (let i = 0, p = 0; i < h.length; i++, p += 4) {
    h[i] = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768;
  }
  if (pxMetres) despike(h, pxMetres);
  return h;
}

// The data has stray single points thousands of metres wrong, mostly near
// coasts. A real summit is broad; a spike is one point far from flat
// neighbours. A point is replaced by its 5 x 5 median only when it is off
// that median by more than a steep real rise could explain (at least 120 m,
// more on coarse tiles) AND by more than 3 times the spread round it (so
// cliffs, which have a wide spread, are left alone). Returns how many.
export function despike(h, pxMetres) {
  const T = Math.max(120, 4 * pxMetres);
  const win = new Float32Array(25);
  const at = (x, y) => h[Math.max(0, Math.min(PX - 1, y)) * PX + Math.max(0, Math.min(PX - 1, x))];
  let fixed = 0;
  for (let y = 0; y < PX; y++) {
    for (let x = 0; x < PX; x++) {
      const v = h[y * PX + x];
      const avg4 = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 4;
      if (Math.abs(v - avg4) < T) continue;
      let k = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) win[k++] = at(x + dx, y + dy);
      win.sort();
      const med = win[12], iqr = win[18] - win[6], off = Math.abs(v - med);
      if (off > T && off > 3 * iqr) { h[y * PX + x] = med; fixed++; }
    }
  }
  return fixed;
}

// Smooth (bilinear) height at fractional pixel coordinates.
export function sample(h, fx, fy) {
  const x = Math.max(0, Math.min(PX - 1.001, fx)), y = Math.max(0, Math.min(PX - 1.001, fy));
  const x0 = x | 0, y0 = y | 0, tx = x - x0, ty = y - y0;
  const a = h[y0 * PX + x0], b = h[y0 * PX + x0 + 1];
  const c = h[(y0 + 1) * PX + x0], d = h[(y0 + 1) * PX + x0 + 1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
