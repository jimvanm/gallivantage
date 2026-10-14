// Where the candidate data sources live, and how to find the file for a spot.
// Used by datalab.html. DATA-SOURCES.csv lists each one with its licence.

import { lonToMercX, latToMercY, mercXToLon, mercYToLat, HALF } from './geo.js';

// The zoom-z map tile that holds a point, and its edges.
export function tileAt(lat, lon, z) {
  const n = 2 ** z;
  const x = Math.floor((lonToMercX(lon) + HALF) / (2 * HALF) * n);
  const y = Math.floor((HALF - latToMercY(lat)) / (2 * HALF) * n);
  return { z, x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

export function tileEdges(z, x, y) {
  const s = 2 * HALF / 2 ** z;
  const west = -HALF + x * s, north = HALF - y * s;
  return {
    west: mercXToLon(west), east: mercXToLon(west + s),
    north: mercYToLat(north), south: mercYToLat(north - s),
    mWest: west, mEast: west + s, mNorth: north, mSouth: north - s,
  };
}

// A tile's number as a string of digits, one per zoom level (Bing's scheme).
export function quadkey(z, x, y) {
  let q = '';
  for (let i = z; i > 0; i--) {
    const m = 1 << (i - 1);
    q += String((x & m ? 1 : 0) + (y & m ? 2 : 0));
  }
  return q;
}

// ESA WorldCover: one file per 3 x 3 degree square, named by its south-west
// corner. 2021 (version 200) first, 2020 (version 100) if that fails.
export function worldcoverName(lat, lon) {
  const la = Math.floor(lat / 3) * 3, lo = Math.floor(lon / 3) * 3;
  const ns = (la < 0 ? 'S' : 'N') + String(Math.abs(la)).padStart(2, '0');
  const ew = (lo < 0 ? 'W' : 'E') + String(Math.abs(lo)).padStart(3, '0');
  return ns + ew;
}
export const worldcoverUrls = (lat, lon) => {
  const t = worldcoverName(lat, lon), b = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com';
  return [`${b}/v200/2021/map/ESA_WorldCover_10m_2021_v200_${t}_Map.tif`,
          `${b}/v100/2020/map/ESA_WorldCover_10m_2020_v100_${t}_Map.tif`];
};

// WorldCover's classes, with its own colours.
export const WORLDCOVER = {
  10: ['trees', '#006400'], 20: ['shrubs', '#ffbb22'], 30: ['grass', '#ffff4c'],
  40: ['crops', '#f096ff'], 50: ['built-up', '#fa0000'], 60: ['bare ground', '#b4b4b4'],
  70: ['snow and ice', '#f0f0f0'], 80: ['open water', '#0064c8'], 90: ['wetland', '#0096a0'],
  95: ['mangroves', '#00cf75'], 100: ['moss and lichen', '#fae6a0'],
};

// Meta and WRI tree heights: one file per zoom-9 tile, named by its quadkey.
export function canopyUrl(lat, lon) {
  const t = tileAt(lat, lon, 9);
  return 'https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/' +
    quadkey(9, t.x, t.y) + '.tif';
}

// Overture's tile files, one per theme.
export const overtureTheme = (release, theme) =>
  `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${release}/${theme}.pmtiles`;

// Sentinel-2 cloud-free picture, 2016 (the year free for any use).
export const s2016Url = (z, x, y) =>
  `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`;

// One colour per kind of thing, the same in every panel, so "forest" in the
// usual map and "forest" in Overture look alike. Unknown kinds get a steady
// colour made from their name.
const KNOWN = [
  [/rail|transport|aero|airport|runway|parking/, '#9a9a9a'],
  [/wood|forest|tree/, '#2f7d32'], [/scrub|shrub|heath/, '#8fae3c'],
  [/grass|meadow|park|garden|recreation|pitch|golf|playground|cemetery|grave/, '#9fd27a'],
  [/farm|crop|orchard|vineyard|allotment|agricultur|plant_nursery/, '#e3c97a'],
  [/wet|marsh|swamp|bog|reed/, '#3fa6a0'], [/water|river|lake|ocean|sea|stream|canal|basin|reservoir|pond/, '#3a7bd5'],
  [/residential|house|neighbourhood/, '#c9a9a3'], [/commercial|retail/, '#e08fb0'],
  [/industr|quarry|landfill|brownfield|construction/, '#a98bd1'],
  [/sand|beach|bare|rock|scree|glacier|ice|snow/, '#d8d2c4'],
  [/school|college|university|education|hospital|military|religious|civic/, '#e6b35a'],
];
export function kindColour(name) {
  const s = String(name || '').toLowerCase();
  for (const [re, c] of KNOWN) if (re.test(s)) return c;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 60%)`;
}

// The name a feature goes by: its class, or failing that its subtype or kind.
export const kindOf = (p) => (p && (p.class ?? p.subtype ?? p.kind ?? p.type)) ?? '(no class)';
