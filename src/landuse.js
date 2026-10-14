// What grows on each kind of land: one table, one row per kind. The planting (biome.js) and the cover grid
// (forestcover.js) read only this table, so a new kind of land is a new row, not new code.
//
// Each row:
//   id, name   the kind of land (its number in the cover grid is its place in this list)
//   trees      how many trees, as a share of a full forest's: { base, open } gives base + open x the climate's
//              openness (forests thin out in dry or cold climates); open: 'scatter' is the lone trees on land the
//              map says nothing about (the Biome Lab's scatter setting)
//   town       how tended the trees are, 0 wild .. 1 a town's: young and broadleaf, never an old conifer
//   kinds      'street': broadleaf only (trees along a street)
//   clear      metres kept clear of trees round it (sports fields)
//   from       the map's names for it: [layer, class, subclasses (optional)]; areas unless said
//   lines      map lines that mark this land: [layer, class, metres kept clear each side of the line]
//
// Land the map names but this table does not: land use counts as tended land with no trees (people use it for
// something; we do not know what), land cover as nothing mapped. So nothing new ever sprouts a forest by mistake.

export const LAND = [
  { id: 'NONE', name: 'nothing mapped', trees: { base: 0, open: 'scatter' }, town: 0 },
  { id: 'WOOD', name: 'wood or forest', trees: { base: 0.35, open: 0.65 }, town: 0,
    from: [['landcover', 'wood'], ['landcover', 'forest'], ['landuse', 'forest']] },
  { id: 'GRASS', name: 'grass or meadow', trees: { base: 0, open: 0.06 }, town: 0, from: [['landcover', 'grass']] },
  { id: 'SCRUB', name: 'scrub or heath', trees: { base: 0, open: 0.3 }, town: 0,
    from: [['landcover', 'grass', ['scrub', 'heath', 'fell']]] },
  { id: 'FARM', name: 'farmland', from: [['landcover', 'farmland'], ['landuse', 'farmland'], ['landuse', 'farmyard'], ['landuse', 'allotments']] },
  { id: 'VINEYARD', name: 'vineyard', from: [['landcover', 'farmland', ['vineyard']], ['landuse', 'vineyard']] },
  { id: 'ORCHARD', name: 'orchard', from: [['landcover', 'farmland', ['orchard']], ['landuse', 'orchard']] },
  { id: 'ROCK', name: 'rock', from: [['landcover', 'rock'], ['landuse', 'quarry']] },
  { id: 'ICE', name: 'ice', from: [['landcover', 'ice']] },
  { id: 'SAND', name: 'sand', from: [['landcover', 'sand']] },
  { id: 'WETLAND', name: 'wetland', trees: { base: 0, open: 0.15 }, town: 0, from: [['landcover', 'wetland']] },
  { id: 'BUILT', name: 'built-up', town: 1,
    from: ['commercial', 'industrial', 'retail', 'railway', 'garages', 'school', 'university', 'college', 'kindergarten',
      'library', 'hospital', 'military', 'stadium', 'bus_station', 'dam', 'construction', 'brownfield', 'landfill'].map((c) => ['landuse', c]) },
  { id: 'WATER', name: 'water', from: [['water', '*']] },
  { id: 'PARK', name: 'park or green', trees: { base: 0.12, open: 0 }, town: 0.8,
    from: [['landcover', 'grass', ['park', 'garden', 'village_green', 'recreation_ground']], ['landuse', 'cemetery'],
      ['landuse', 'zoo'], ['landuse', 'theme_park'], ['landuse', 'park'], ['landuse', 'recreation_ground'], ['landuse', 'village_green']] },
  { id: 'SPORT', name: 'sports field, track or playground', town: 1, clear: 10,
    from: [['landuse', 'pitch'], ['landuse', 'playground'], ['landuse', 'track']] },
  { id: 'STRUCT', name: 'road or building', town: 1 },
  { id: 'YARD', name: 'houses and yards', trees: { base: 0.2, open: 0 }, town: 1, from: [['landuse', 'residential'], ['landuse', 'suburb'], ['landuse', 'quarter'], ['landuse', 'neighbourhood']] },
  { id: 'VERGE', name: 'street-side', trees: { base: 0.9, open: 0 }, town: 1, kinds: 'street' },
  { id: 'AIRPORT', name: 'airport', town: 1,
    from: ['aerodrome', 'heliport', 'runway', 'taxiway', 'apron', 'helipad'].map((c) => ['aeroway', c]),
    lines: [['aeroway', 'runway', 75], ['aeroway', 'taxiway', 30]] },
];

// The numbers in the cover grid, by name: COVER.WOOD and so on.
export const COVER = Object.fromEntries(LAND.map((L, i) => [L.id, i]));
export const COVER_NAMES = LAND.map((L) => L.name);

// The order the map's areas are laid down in, each over the last: what people use the land for, then what covers
// it (a wood in a park is a wood), then sports fields and airports (the map lays park grass over pitches), then water.
export const LAYER_ORDER = ['landuse', 'landcover', 'sport', 'aeroway', 'water'];
const SPORT_IDS = new Set(LAND.filter((L) => L.id === 'SPORT').flatMap((L) => L.from.map((f) => f[1])));

// layer|class|subclass -> code, and layer|class -> code
const exact = new Map(), byClass = new Map();
LAND.forEach((L, code) => {
  for (const [layer, cls, subs] of L.from || []) {
    if (subs) for (const s of subs) exact.set(`${layer}|${cls}|${s}`, code);
    else byClass.set(`${layer}|${cls}`, code);
  }
});

// The kind of land a map area is, or null for none. layer: as LAYER_ORDER ('sport' is the landuse layer's sports
// classes, laid down in their own turn).
export function landCode(layer, cls, sub) {
  if (layer === 'water') return COVER.WATER;
  if (layer === 'sport') return SPORT_IDS.has(cls) ? COVER.SPORT : null;
  if (layer === 'landuse' && SPORT_IDS.has(cls)) return null;              // laid down later, over the land cover
  const k = exact.get(`${layer}|${cls}|${sub}`) ?? byClass.get(`${layer}|${cls}`);
  if (k !== undefined) return k;
  return layer === 'landuse' ? COVER.BUILT : null;                         // unknown use: tended, no trees
}

// The map lines that mark a kind of land: 'layer|class' -> [code, metres clear each side].
export const LAND_LINES = new Map(LAND.flatMap((L, code) => (L.lines || []).map(([layer, cls, m]) => [`${layer}|${cls}`, [code, m]])));
