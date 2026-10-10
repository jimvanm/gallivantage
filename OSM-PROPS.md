# OpenStreetMap props: what five samples tell us

9 October 2026. The idea: use OpenStreetMap's small details to place a
simple stand-in model (an "archetype") for each thing, instead of a plain
box or nothing.

## The samples

Taken from Overpass once each, by hand, on 9 October 2026. Everything
with a tag inside a circle. Tags plus one centre point per shape; no
outlines. Jim has the files (`campellford.json`, `namibia.json`,
`toronto.json`, `vietnam.json`, `germany.json`, plus the Efteling export).
All five landed in the right place.

| Place | Circle | Things | Buildings | Notes |
|---|---|---|---|---|
| Campbellford, Ontario | 500 m | 1,251 | 546 | Thinnest. Bare buildings, roads, 41 stop signs. Almost no small objects. |
| Swakopmund, Namibia | 500 m | 1,282 | 667 | Footprints from Microsoft's AI tracing. 110 yard walls, 21 rooftop solar panels, lighthouse, pier. Tourist shops well mapped. |
| Hội An, Vietnam | 500 m | 7,005 | 5,798 | Every building traced, but bare boxes. 232 restaurants, 121 cafés, 46 tailors. 56 trees, 18 hydrants. |
| Rothenburg, Germany | 500 m | 7,055 | 1,538 | Mapped to the last bench. See below. |
| Downtown Toronto, Union Station | 300 m | 2,184 | 68 + 164 parts | Towers built from 3D parts with heights, colours, materials. A quarter of everything is underground (PATH). |

## What we learned

1. **How well a place is mapped matters far more than which continent
   it's on.** Rothenburg and Campbellford are both small tourist towns
   with a river. Rothenburg has 612 trees (568 with leaf type), 228
   benches, 141 street lamps, 108 bins, 58 hydrants, 47 bollards, 65
   planters, 994 doors, roof shape on 74% of buildings and storeys on
   72%. Campbellford has none of these.
2. **So every archetype needs a sensible default** for missing tags, and
   regional looks fill the gaps (gabled tile roofs in Hội An, flat roofs
   in Swakopmund).
3. **Where buildings are bare, dressing them is the win.** Hội An's
   buildings say nothing about themselves, but its shops and restaurants
   are well mapped. Awnings, signs and café tables would carry the place.
4. **Underground and indoor things must be filtered out.** In Toronto,
   561 of 2,184 things are PATH corridors, stairs, food courts and
   platforms (negative level, tunnel, or indoor). Drawn on the surface,
   they would litter the streets.
5. **Things are mapped in different ways.** Fountains are dots or
   outlines; towers are dots, buildings or parts; walls can be lines or
   buildings. Each archetype has to accept all of these.
6. **Lines and areas need outlines.** These samples carry centre points
   only, so walls, fences and hedges can't be drawn from them yet. A
   second gentle fetch per place, with outlines, would be needed for
   those.

## Sorted by how hard they are

**1. A single shape at a point** (the easy wins). Usually a dot; at most
needs turning to face the nearest road.
- Trees: 612 / 56 / 54. Leaf type (broad or needle) in Rothenburg.
- Benches: 228 / 21 / 7. Backrest and material often given.
- Bins, bollards, hydrants, street lamps, planters, grit bins.
- Post boxes: Toronto's 11 all say Canada Post, so the right red box.
- Stop signs: 41 in Campbellford alone.
- Ticket machines: 22 for parking in Rothenburg, 8 for transit in Toronto.
- Bus stops: tagged with shelter, bench and bin, so the stand-in can be
  built to match.
- Doors: 994 entrance points in Rothenburg. A door on the wall where the
  map says, at almost no cost.
- Flagpoles, clocks, defibrillators, picnic tables, drinking fountains.

**2. Following a line** (needs outlines).
- Walls, fences, hedges, retaining walls. Rothenburg's 87 city-wall
  pieces carry heights and materials.
- Rows of trees.
- Railway with overhead wires (the "electrified" tag), tram tracks.
- Piers and jetties.

**3. Filling an area** with a scatter of small things.
- Playgrounds: Rothenburg maps 27 separate pieces (swings, slides,
  climbing frames, sandpit).
- Flowerbeds, gardens, outdoor seating, fountain basins.
- Rooftop solar panels: Swakopmund's 21 are all marked solar, on the roof.
- Car parks (parked cars, later).

**4. Dressing a building.**
- Shopfronts from shop and restaurant tags: the biggest group in Hội An,
  Swakopmund and Toronto.
- Roof shape and colour: rich in Rothenburg (gabled, half-hipped,
  hipped, gambrel and more), rare elsewhere.
- Places of worship by religion: Hội An's 16 include Buddhist pagodas
  and Chinese assembly halls; Rothenburg's churches give their style.
- Towers by type: Rothenburg's 32 defensive towers, bell towers; a
  lighthouse in Swakopmund.
- Street surface: 369 cobbled stretches in Rothenburg ("sett") could
  change the road's look.

**5. Hard.**
- Statues and sculptures (16 / 13 / 8): a generic figure on a plinth
  at best.
- Toronto's building parts: worth comparing with what the streamed tiles
  already give before doing anything.
- Unique landmarks: hand-built, as now.

**Skip.** Surveillance cameras (14 in Toronto), manholes, street
cabinets, survey points, addresses, road-sign codes.

## Where the data comes from

- Overpass is shared and busy (Jim hit many timeouts on 9 October). Use
  it only by hand, rarely.
- The lab should work from these saved files, with no live calls.
- For the real app, the options are unchanged: a gentle Overpass fetch
  per area when walking, our own full-detail tiles, or a published
  source if one exists. Not decided.
