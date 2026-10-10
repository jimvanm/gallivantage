// World climate zones (Koppen-Geiger), read a 30-degree square at a time.
//
// The map: Rubel et al. (2017), 1986-2010, at 100 seconds of arc (about
// 3 km), from the kgcpy package (BSD licence). Cut by
// tools/zones/make_zones.py into data/zones/<row>-<col>.bin.gz: 1080 x 1080
// bytes each, north row first; all-sea squares are left out. About 380 KB
// for the whole world, so a square is fetched once and kept.
//
// Two things the raw map gets wrong for us, put right here:
// - Small islands (Saba, Martinique, Madeira) are too small for it and read
//   as sea. A land point that reads as sea takes the nearest land zone within
//   about 10 km, or failing that a rough zone from its latitude.
// - Mountains are drawn as cold zones (Banff's peaks are tundra), but trees
//   still grow in their valleys. Height is handled by our own treeline rule,
//   so a tundra or ice-cap pixel takes the nearest warmer zone within about
//   10 km. Only true lowland tundra and ice caps keep them.

export const ZONES = [null,
  'Af', 'Am', 'As', 'Aw', 'BSh', 'BSk', 'BWh', 'BWk', 'Cfa', 'Cfb', 'Cfc', 'Csa', 'Csb', 'Csc',
  'Cwa', 'Cwb', 'Cwc', 'Dfa', 'Dfb', 'Dfc', 'Dfd', 'Dsa', 'Dsb', 'Dsc', 'Dsd', 'Dwa', 'Dwb', 'Dwc',
  'Dwd', 'EF', 'ET', 'sea'];
export const SEA = 32;
const ET = 31, EF = 30;

// Plain names, for the lab's panel.
export const ZONE_NAMES = {
  Af: 'tropical rainforest', Am: 'tropical, monsoon', As: 'tropical, dry summer', Aw: 'tropical savanna',
  BSh: 'hot steppe', BSk: 'cold steppe (dry)', BWh: 'hot desert', BWk: 'cold desert',
  Cfa: 'humid, hot summer', Cfb: 'mild ocean climate', Cfc: 'cool ocean climate',
  Csa: 'Mediterranean, hot summer', Csb: 'Mediterranean, warm summer', Csc: 'Mediterranean, cool summer',
  Cwa: 'dry winter, hot summer', Cwb: 'highland, dry winter', Cwc: 'cool highland, dry winter',
  Dfa: 'cold winter, hot summer', Dfb: 'cold winter, warm summer', Dfc: 'cold, short summer', Dfd: 'very cold winter',
  Dsa: 'cold winter, dry hot summer', Dsb: 'cold winter, dry warm summer', Dsc: 'cold, dry short summer', Dsd: 'very cold, dry summer',
  Dwa: 'cold dry winter, hot summer', Dwb: 'cold dry winter, warm summer', Dwc: 'cold dry winter, short summer', Dwd: 'very cold dry winter',
  EF: 'ice cap', ET: 'tundra', sea: 'sea',
};

const S = 1080, PX_DEG = 36;                  // 1080 pixels per 30 degrees
const squares = new Map();                     // 'row-col' -> Uint8Array | null (all sea) | Promise

// How a square's bytes are read. Replaced in tests (Node cannot fetch files).
let reader = async (row, col) => {
  const r = await fetch(new URL(`../data/zones/${row}-${col}.bin.gz`, import.meta.url));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('climate zones: HTTP ' + r.status);
  const s = r.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
};
export function setZoneReader(fn) { reader = fn; squares.clear(); memo.clear(); }

const key = (row, col) => row + '-' + col;
function squareOf(lat, lon) {
  return [Math.min(5, Math.max(0, Math.floor((90 - lat) / 30))), ((Math.floor((lon + 180) / 30) % 12) + 12) % 12];
}

// Fetch the squares a box needs (with 0.5 degrees to spare). Resolves when ready.
export async function loadZones(lat0, lon0, lat1, lon1) {
  const want = new Set();
  for (const lat of [lat0 - 0.5, lat1 + 0.5, (lat0 + lat1) / 2]) for (const lon of [lon0 - 0.5, lon1 + 0.5, (lon0 + lon1) / 2]) {
    want.add(key(...squareOf(Math.max(-89.99, Math.min(89.99, lat)), lon)));
  }
  await Promise.all([...want].map((k) => {
    if (!squares.has(k)) {
      const [r, c] = k.split('-').map(Number);
      const p = reader(r, c).then((b) => { squares.set(k, b); return b; }, (e) => { squares.delete(k); throw e; });
      squares.set(k, p);
    }
    return squares.get(k);
  }));
}

// The raw zone number at a point: 1..31, SEA, or 0 if its square is not loaded.
export function rawZone(lat, lon) {
  if (lat >= 90) lat = 89.999; if (lat <= -90) lat = -89.999;
  const gy = Math.floor((90 - lat) * PX_DEG), gx = (((Math.floor((lon + 180) * PX_DEG)) % 12960) + 12960) % 12960;
  const b = squares.get(key(Math.floor(gy / S), Math.floor(gx / S)));
  if (b === undefined || b instanceof Promise) return 0;
  if (b === null) return SEA;
  return b[(gy % S) * S + (gx % S)];
}

// A rough zone from latitude alone, for land the map does not have.
export function zoneFromLatitude(lat) {
  const a = Math.abs(lat);
  return a < 23.5 ? 1 : a < 35 ? 12 : a < 50 ? 10 : a < 66 ? 20 : ET;
}

// The zone trees answer to at a land point, and how it was found:
// 'map', 'nearby' (sea or tundra pixel replaced by a neighbour) or 'latitude'.
const memo = new Map();       // pixel -> answer (the search below is the costly part)
export function landZone(lat, lon) {
  const pk = Math.floor((90 - lat) * PX_DEG) * 12960 + (((Math.floor((lon + 180) * PX_DEG)) % 12960) + 12960) % 12960;
  const m = memo.get(pk);
  if (m) return m;
  const a = findLandZone(lat, lon);
  if (a.zone) { if (memo.size > 20000) memo.clear(); memo.set(pk, a); }
  return a;
}
function findLandZone(lat, lon) {
  const z = rawZone(lat, lon);
  if (z === 0) return { zone: 0, how: 'not loaded' };
  if (z !== SEA && z !== ET && z !== EF) return { zone: z, how: 'map' };
  // Nearest replacement within 3 pixels (about 10 km), ring by ring.
  const d = 1 / PX_DEG, k = 1 / Math.max(0.05, Math.cos(lat * Math.PI / 180));
  for (let r = 1; r <= 3; r++) {
    const seen = new Map();
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      const n = rawZone(lat + j * d, lon + i * d * Math.min(k, 3));
      if (n && n !== SEA && n !== ET && n !== EF) seen.set(n, (seen.get(n) || 0) + 1);
    }
    if (seen.size) return { zone: [...seen].sort((a, b) => b[1] - a[1])[0][0], how: 'nearby' };
  }
  if (z === SEA) return { zone: zoneFromLatitude(lat), how: 'latitude' };
  return { zone: z, how: 'map' };
}
