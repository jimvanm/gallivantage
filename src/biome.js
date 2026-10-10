// Which trees grow where, worked out on the spot: nothing is stored.
//
// A tile's trees come from the tile's own address (the seed), the climate
// zone (src/zones.js), the ground's height and slope, and what the map says
// covers the ground. The same tile always gives the same trees, so they come
// back unchanged on every visit, and a tile out of range is simply dropped.
//
// The rules, in order:
// 1. Where: the map's woods and forests are forest. Land the map says nothing
//    about gets scattered trees, as many as the climate allows. Fields,
//    vineyards, towns, rock, ice, sand and water get none.
// 2. How high: a treeline from latitude (about 3,800 m in the tropics,
//    2,300 m at 50 degrees, sea level near 72), lower in ocean climates,
//    higher on slopes facing the sun in cold places. Trees thin and shrink
//    over the last few hundred metres below it. Snow from a set height above.
// 3. What kind: each zone has its own mix of the library's eight tree styles.
//    In cold and temperate zones the mix turns to spruce and fir towards the
//    treeline; in the tropics it never does (Saba: no conifers, right to the
//    top). Palms only in warm zones, and only low down.
// 4. Slopes: none on very steep ground. In dry places trees crowd the shady
//    slopes; pines take the sunny ones.

import { ZONES, landZone } from './zones.js';

export const KINDS = ['spire', 'pine', 'column', 'round', 'oval', 'spread', 'feather', 'fan'];
const [SPIRE, PINE, COLUMN, ROUND, OVAL, SPREAD, FEATHER, FAN] = KINDS.map((_, i) => i);

// What the map says covers the ground, as one number per spot.
export const COVER = { NONE: 0, WOOD: 1, GRASS: 2, SCRUB: 3, FARM: 4, VINEYARD: 5, ORCHARD: 6, ROCK: 7, ICE: 8,
  SAND: 9, WETLAND: 10, BUILT: 11, WATER: 12, PARK: 13 };
export const COVER_NAMES = ['nothing mapped', 'wood or forest', 'grass or meadow', 'scrub or heath', 'farmland',
  'vineyard', 'orchard', 'rock', 'ice', 'sand', 'wetland', 'built-up', 'water', 'park or green'];

// The settings Jim can move in the lab. Change defaults only after a look.
export function defaultRules() {
  return {
    density: 1,        // forest density: 1 = about 100 trees a hectare in a full forest (8 = 800, a closed canopy)
    spacing: 6,        // metres between possible spots (closest two trees can stand)
    scatter: 0.3,      // trees on land the map says nothing about, against a forest (0..1)
    treeline: 1,       // treeline height, times the latitude rule
    snow: 700,         // snow starts this many metres above the treeline
    edge: 300,         // trees thin and shrink over this many metres below the treeline
    palm: 350,         // palms only below this height (metres above sea level)
    steep: 0.85,       // no trees on slopes steeper than this (rise over run; 0.85 is about 40 degrees)
    sunny: 1,          // how much a slope's facing matters (0 = not at all)
    blend: 1.5,        // zone edges are blended over this many km
  };
}

// Treeline by latitude (degrees, metres).
const TREELINE = [[0, 3800], [20, 3800], [30, 3500], [40, 3000], [50, 2300], [55, 1600], [60, 1000], [65, 600], [70, 150], [72, 0]];
function curve(lat) {
  const a = Math.abs(lat);
  for (let i = 1; i < TREELINE.length; i++) {
    const [a0, h0] = TREELINE[i - 1], [a1, h1] = TREELINE[i];
    if (a <= a1) return h0 + (h1 - h0) * (a - a0) / (a1 - a0);
  }
  return 0;
}

// Each zone: the tree mix (shares of the eight styles), how dense its trees
// are where it is not forest (open), and how big they grow (size).
const M = (o) => KINDS.map((k) => o[k] || 0);
const LOOK = {
  Af: { mix: M({ round: 0.55, spread: 0.25, feather: 0.2 }), open: 1, size: 1.15 },
  Am: { mix: M({ round: 0.5, spread: 0.3, feather: 0.2 }), open: 1, size: 1.1 },
  As: { mix: M({ spread: 0.55, round: 0.25, feather: 0.15, fan: 0.05 }), open: 0.45, size: 0.9 },
  Aw: { mix: M({ spread: 0.55, round: 0.25, feather: 0.15, fan: 0.05 }), open: 0.45, size: 0.9 },
  BSh: { mix: M({ spread: 0.7, round: 0.1, feather: 0.1, fan: 0.1 }), open: 0.15, size: 0.7 },
  BSk: { mix: M({ pine: 0.6, column: 0.2, spread: 0.1, oval: 0.1 }), open: 0.25, size: 0.8 },
  BWh: { mix: M({ spread: 0.6, feather: 0.3, fan: 0.1 }), open: 0.03, size: 0.6 },
  BWk: { mix: M({ column: 0.6, spread: 0.4 }), open: 0.05, size: 0.5 },
  Cfa: { mix: M({ round: 0.5, oval: 0.15, spread: 0.1, pine: 0.15, column: 0.05, spire: 0.05 }), open: 0.9, size: 1 },
  Cfb: { mix: M({ round: 0.45, oval: 0.2, spire: 0.2, pine: 0.1, column: 0.05 }), open: 0.9, size: 1 },
  Cfc: { mix: M({ spire: 0.5, oval: 0.3, pine: 0.2 }), open: 0.8, size: 0.8 },
  Csa: { mix: M({ spread: 0.4, column: 0.25, pine: 0.25, round: 0.05, fan: 0.05 }), open: 0.5, size: 0.85 },
  Csb: { mix: M({ spread: 0.35, pine: 0.25, column: 0.2, round: 0.2 }), open: 0.6, size: 0.9 },
  Csc: { mix: M({ pine: 0.4, spire: 0.3, column: 0.3 }), open: 0.6, size: 0.8 },
  Cwa: { mix: M({ round: 0.5, spread: 0.3, pine: 0.1, feather: 0.1 }), open: 0.8, size: 1 },
  Cwb: { mix: M({ round: 0.45, pine: 0.25, spread: 0.2, oval: 0.1 }), open: 0.8, size: 0.95 },
  Cwc: { mix: M({ round: 0.45, pine: 0.25, spread: 0.2, oval: 0.1 }), open: 0.7, size: 0.85 },
  Dfa: { mix: M({ round: 0.55, oval: 0.2, spread: 0.1, pine: 0.05, spire: 0.05, column: 0.05 }), open: 0.9, size: 1 },
  Dfb: { mix: M({ round: 0.35, oval: 0.2, spire: 0.2, pine: 0.15, column: 0.1 }), open: 1, size: 1 },
  Dfc: { mix: M({ spire: 0.5, pine: 0.3, oval: 0.15, column: 0.05 }), open: 0.9, size: 0.9 },
  Dfd: { mix: M({ spire: 0.4, pine: 0.3, oval: 0.3 }), open: 0.7, size: 0.7 },
  Dsa: { mix: M({ pine: 0.45, spire: 0.25, oval: 0.15, column: 0.15 }), open: 0.7, size: 0.9 },
  Dsb: { mix: M({ pine: 0.45, spire: 0.25, oval: 0.15, column: 0.15 }), open: 0.7, size: 0.9 },
  Dsc: { mix: M({ spire: 0.5, pine: 0.3, oval: 0.2 }), open: 0.7, size: 0.8 },
  Dsd: { mix: M({ spire: 0.5, pine: 0.3, oval: 0.2 }), open: 0.6, size: 0.7 },
  Dwa: { mix: M({ round: 0.4, oval: 0.2, pine: 0.2, spire: 0.2 }), open: 0.8, size: 1 },
  Dwb: { mix: M({ round: 0.4, oval: 0.2, pine: 0.2, spire: 0.2 }), open: 0.8, size: 0.95 },
  Dwc: { mix: M({ spire: 0.4, pine: 0.3, oval: 0.3 }), open: 0.8, size: 0.85 },
  Dwd: { mix: M({ spire: 0.4, pine: 0.3, oval: 0.3 }), open: 0.7, size: 0.7 },
  ET: { mix: M({ spire: 0.7, oval: 0.3 }), open: 0.1, size: 0.4 },
  EF: { mix: M({}), open: 0, size: 0 },
};
const SUBALPINE = M({ spire: 0.75, pine: 0.15, column: 0.1 });

// How much each kind of ground takes trees, before the climate has its say.
function coverShare(cover, open, R) {
  switch (cover) {
    case COVER.WOOD: return 0.35 + 0.65 * open;
    case COVER.NONE: return R.scatter * open;
    case COVER.SCRUB: return 0.3 * open;
    case COVER.WETLAND: return 0.15 * open;
    case COVER.PARK: return 0.12;
    case COVER.GRASS: return 0.06 * open;
    default: return 0;
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// Everything the rules say about one spot.
// s: { lat, lon, h (m above sea), slope (rise over run), sunny (-1 shaded .. 1 facing the sun), cover }
export function readSpot(s, R) {
  const { zone: zn, how } = landZone(s.lat, s.lon);
  const code = ZONES[zn] || 'Dfb', look = LOOK[code] || LOOK.Dfb;
  const cold = code[0] === 'D' || code[0] === 'E' || code === 'Cfc' || code === 'BSk' || code === 'BWk';
  // Ocean climates have low treelines (Scotland, Norway's coast), but only away from the tropics:
  // the Andes near Quito read as 'mild ocean climate' too.
  const ocean = (code === 'Cfb' || code === 'Cfc') ? smooth(35, 45, Math.abs(s.lat)) : 0;
  const sunny = Math.max(-1, Math.min(1, s.sunny * R.sunny));
  const treeline = curve(s.lat) * (1 - 0.3 * ocean) * R.treeline + (cold ? 150 * sunny : 0);
  const snowline = Math.max(treeline, 0) + R.snow;
  const out = { zone: code, how, treeline, snowline, density: 0, mix: null, size: 0 };
  if (s.h >= treeline || !look.open) return out;

  let d = coverShare(s.cover, look.open, R);
  const dry = code[0] === 'B' || code[0] === 'C' && code[1] === 's';
  if (dry) d *= clamp01(1 - 0.5 * sunny);                              // shady slopes hold water
  d *= clamp01((treeline - s.h) / R.edge);                              // thinning towards the treeline
  d *= clamp01((R.steep - s.slope) / (R.steep * 0.4));                 // none on cliffs
  out.density = d * R.density;

  const mix = look.mix.slice(), f = s.h / Math.max(1, treeline);
  if (code[0] !== 'A') {
    const t = smooth(0.55, 0.85, f);
    for (let i = 0; i < mix.length; i++) mix[i] = mix[i] * (1 - t) + SUBALPINE[i] * t;
  }
  const palmK = clamp01(1 - (s.h - R.palm) / 150);
  mix[ROUND] += (mix[FEATHER] + mix[FAN]) * (1 - palmK);
  mix[FEATHER] *= palmK; mix[FAN] *= palmK;
  mix[PINE] *= 1 + 0.8 * Math.max(0, sunny);                             // pines take the sunny side
  const sum = mix.reduce((a, b) => a + b, 0) || 1;
  out.mix = mix.map((v) => v / sum);
  out.size = look.size * Math.max(0.35, Math.min(1, 0.35 + (treeline - s.h) / (R.edge * 2)));
  return out;
}

// A small fast random number source from a seed.
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function tileSeed(z, x, y) {
  let h = Math.imul(z + 1, 0x9E3779B1) ^ Math.imul(x, 0x85EBCA77) ^ Math.imul(y, 0xC2B2AE3D);
  h = Math.imul(h ^ h >>> 15, 0x2C1B3C6D); return (h ^ h >>> 12) >>> 0;
}

// How sunny a slope is, from the ground's rise east (gx) and south (gz):
// 1 facing the equator, -1 facing the pole, 0 flat. Lab and app frames have x east, z south.
export function sunnyFrom(gx, gz, lat) {
  const g = Math.hypot(gx, gz);
  if (g < 1e-4) return 0;
  const toEquator = lat >= 0 ? 1 : -1;                    // +z is south
  return (-gz * toEquator) / g * Math.min(1, g / 0.2);
}

const STRIDE = 8;   // per tree: x, z, kind, age (0..1), size (times the style's own), width factor, facing (0..1), shade (0..1)
export { STRIDE as TREE_STRIDE };

// The trees of one tile. ctx: { seed, x0, z0, size (metres, square, x east and z south from x0, z0),
// latLon(x, z) -> [lat, lon], ground(x, z), grad(x, z) -> [gx, gz], cover(x, z), keep (optional, 0..1) }.
// keep: only the trees whose facing number is below it (a fixed, even share of them), for far away, where
// fewer trees are drawn, each bigger. The rest are not worked out at all, so a far tile is quick to make.
// Returns a Float32Array, STRIDE numbers a tree.
export function plantTile(ctx, R) {
  // Spots closer together when the forest is denser than they allow (at most 90% of spots taken).
  const sp = Math.min(R.spacing, 9.5 / Math.sqrt(Math.max(0.01, R.density)));
  const r = rng(ctx.seed), n = Math.max(1, Math.round(ctx.size / sp)), cell = ctx.size / n;
  const out = [];
  const blendDeg = R.blend / 111;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    // every spot draws the same number of random numbers, so changing one rule moves no other tree
    const jx = r(), jz = r(), pick = r(), kindPick = r(), ageR = r(), sizeR = r(), widthR = r(), yaw = r(), shade = r(), bx = r(), bz = r();
    if (ctx.keep !== undefined && yaw >= ctx.keep) continue;
    const x = ctx.x0 + (i + jx) * cell, z = ctx.z0 + (j + jz) * cell;
    const cover = ctx.cover(x, z);
    if (cover === COVER.FARM || cover === COVER.VINEYARD || cover === COVER.ORCHARD || cover === COVER.BUILT ||
        cover === COVER.WATER || cover === COVER.ROCK || cover === COVER.ICE || cover === COVER.SAND) continue;
    const [lat, lon] = ctx.latLon(x, z), h = ctx.ground(x, z), [gx, gz] = ctx.grad(x, z);
    const spot = readSpot({ lat: lat + (bz - 0.5) * 2 * blendDeg, lon: lon + (bx - 0.5) * 2 * blendDeg / Math.max(0.1, Math.cos(lat * Math.PI / 180)),
      h, slope: Math.hypot(gx, gz), sunny: sunnyFrom(gx, gz, lat), cover }, R);
    // density 1 means about one tree per 100 square metres
    if (!spot.mix || pick >= spot.density * cell * cell / 100) continue;
    let k = 0, acc = spot.mix[0];
    while (k < 7 && kindPick > acc) acc += spot.mix[++k];
    const conifer = k <= COLUMN;
    const age = (conifer ? 0.4 + 0.6 * ageR : 0.15 + 0.85 * ageR) * Math.min(1, 0.4 + spot.size * 0.6);
    out.push(x, z, k, age, spot.size * (0.9 + 0.2 * sizeR), 0.9 + 0.2 * widthR, yaw, shade);
  }
  return new Float32Array(out);
}
