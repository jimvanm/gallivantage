# Not done yet

The order of work is in `SPEC.md`. This file holds what is known to be
missing or wrong, so nothing is forgotten. Items stay until done or dropped
on purpose.

## Round Earth lab (0.1.4)

- [ ] **Check on the real data.** Built and checked only with made-up ground
      in a browser without a graphics card. Things to look at: seams or
      cracks between tiles, flicker, how fast it fills in, the view from
      orbit, standing height.
- [ ] **It fills in one zoom at a time.** A finer tile is asked for only once
      the tile above it is in, so from a standing start there are about a
      dozen rounds of downloads before the ground under you is sharp. If that
      is slow on the real network, ask for the wanted tiles directly and
      keep the coarser ones only as stand-ins.
- [ ] **Land below sea level shows as sea** (Dutch polders, Death Valley,
      the Dead Sea shore). The height data alone cannot tell sea from low
      land; the map's water can (step 6).
- [ ] **Lakes and rivers are not water yet.** Same cause, same cure: bring
      over Terrain Walker's painting of the map's water onto the ground.
- [ ] **Nothing past 85 degrees.** The height tiles stop there, so the
      middle of Antarctica shows as sea and the Arctic Ocean is right only by
      luck. Needs a different source for the poles.
- [ ] **The sun follows you**: always high in the south-west wherever you
      are. A real sun (by date and time) is easy once wanted.
- [ ] **Downloads are not kept** between visits, except by the browser's own
      short-term cache (step 2: 1 GB, favourites kept).
- [ ] **Colours by height are placeholders**: green, olive, brown, rock,
      snow. Land cover from the map comes later.
- [ ] **No other ground yet**: Canada's survey, roads, buildings, landmarks
      and the toy box all come over later, each onto the one ground.
- [ ] **The ground under you is answered by the drawing layer** (globe.js),
      because layer 2 does not exist yet. There is still only one place that
      answers it.
