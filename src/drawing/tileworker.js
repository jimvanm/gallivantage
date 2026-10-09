// A helper running beside the page: fetches one height tile, reads its
// heights, and builds its piece of the round Earth (tilemesh.js), so the page
// never stalls doing it.

import { tileUrl, decode, PX } from '../sources/terrarium.js';
import { buildTileMesh } from './tilemesh.js';
import { metresPerDegree, tileLat } from '../geo/earth.js';

async function heights(z, x, y) {
  const res = await fetch(tileUrl(z, x, y), { mode: 'cors' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob);
  const cv = new OffscreenCanvas(PX, PX), cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0, PX, PX); bmp.close();
  const lat = tileLat(y + 0.5, z), px = metresPerDegree(lat).east * 360 / 2 ** z / PX;
  return { h: decode(cx.getImageData(0, 0, PX, PX).data, px), bytes: blob.size };
}

self.onmessage = async (ev) => {
  const { id, z, x, y } = ev.data;
  try {
    const { h, bytes } = await heights(z, x, y);
    const m = buildTileMesh(z, x, y, h);
    self.postMessage({ id, ok: true, bytes, vertices: m.vertices, indices: m.indices, centre: m.centre,
      radius: m.radius, minH: m.minH, maxH: m.maxH, nodes: m.nodes, size: m.size },
    [m.vertices, m.indices.buffer, m.nodes.buffer]);
  } catch (e) {
    self.postMessage({ id, ok: false, error: String(e && e.message || e) });
  }
};
