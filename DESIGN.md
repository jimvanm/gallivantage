# Gallivantage: design

Agreed 8 October 2026; how we get there changed 9 October. Every change
must agree with this page. Detail decisions go in `TODO.md`; how the app
works is in `SPEC.md`.

## What it is

**A planet playground:** the real Earth, round, streamed live from public
data, that you can walk, drive, sail and fly, and rearrange for fun. In time
it becomes a game world, with other people and vehicles moving about in it.

It grew out of Terrain Walker (github.com/jimvanm/TerrainWalker, tag
`before-redesign`), which stays as it was.

**How we get there (changed 9 October).** Gallivantage starts as a copy of
Terrain Walker 0.13.34, working from day one, and is changed in place toward
this design one step at a time; every step leaves the app working at least
as well as before. A first attempt (0.1.1 to 0.1.4) rebuilt the parts from
scratch instead, and lost what Terrain Walker had already learned: its
controls, its map painting (lakes, land cover), its depth handling, its
loading rules. Read `TODO.md` ("Patterns worth knowing") and `SPEC.md` (how
it works) before changing anything. Those attempts stay in the history.

## The layers

Six layers, bottom to top. A layer may use those below it, never those above.

| Layer | Owns | Never does |
| --- | --- | --- |
| 1. Sources | Fetching and keeping downloads: height tiles, Canada's survey, the map, Overture, Wikidata, landmarks. | Decide what anything looks like |
| 2. One ground | The only answer to "how high is the ground here?" Shaped once: water levelled, roads cut in, buildings on level pads, moved pieces laid in. | Fetch for itself, or draw |
| 3. Things on the ground | Water, roads, buildings, landmarks: their shapes and looks. | Keep its own idea of the ground |
| 4. Drawing | Putting layers 2 and 3 on screen: far ground in tiles, close ground in rings round you. | Decide where anything is |
| 5. Moving | You, and later other people and vehicles: walking, flying, physics. | Keep its own idea of the ground |
| 6. Interface | Keys, menus, status bar, reports, the two modes. | Hold state other layers depend on |

Two things sit beside the layers. **The toy box** (moved mountains and
cities, dropped landmarks) feeds its changes into layer 2, so moved ground is
real ground. **Labs** are the app's own layers with sliders and side-by-side
views, never copies.

## The rules

1. **One ground.** Nothing outside layer 2 works out ground height for itself.
2. **One way per thing in the app.** Comparisons of old and new live in labs.
   When a new way wins, the old one leaves the app.
3. **Labs first, then the app.** A lab uses the app's own code, so what looks
   right there looks the same in the app.
4. **Everything streams live from public data.** No big download that changes
   the app. Niagara's prebuilt ground is not brought over unless its lab
   shows it is needed.
5. **Kept downloads stay under 1 GB**, oldest dropped first. Areas round your
   favourites are kept beyond that.
6. **The Earth is round.** Everything is built on the round Earth.
7. **Fetch, draw and hold stay separate decisions:** what to download, what to
   show, and when to let go of a coarser stand-in.
8. **Water level comes from the map, not guessed from slope.** Rivers fall
   gently along their length; white water only where the map marks a fall,
   rapids or a weir.
9. **Every change is small, numbered and tested**, and arrives as one .mbox
   file applied with `apply.bat`.

## The round Earth

Terrain Walker's world is flat with a curve faked near you. That holds to
about 10 degrees of arc (roughly 1,000 km), then fails: from high up you see
a tilting plane, not a ball. Its own plan (`TODO.md`, "The big one") is the
way: about 150 to 250 lines in three places (the tile mesh, each tile's
placement, the controls); the tile choice, loading, map painting and colours
are untouched. It deletes the faked curve, the stretch fix for latitude, the
extra horizon rings and the square edge of the world.

Learned from the first attempt, and kept:

- **Land and sea never compare depths.** The sea is worked out exactly for
  each pixel, and each piece of ground works out exactly whether the sea
  hides it. Comparing depths flickered on a real graphics card.
- **Check depth on a coarse card.** A test browser may keep depth more
  finely than Jim's card; round it to 24 bits (and 16) in tests before
  trusting a picture.
- **Failed tiles are retried with growing waits**, never given up for good.
- **Never throw away a tile the view is still waiting on.**

The data is unchanged, so there is still a hole at each pole.

## The interface

The interface gets its own review once the round Earth and one ground are
in. These are the principles it is judged by, drawn from the standard
usability rules (Jakob Nielsen's ten are the best known) and from how games
and flight simulators lay out their screens.

1. **The world comes first.** On screen by default: only what you need while
   moving. Everything else on request.
2. **Use the controls people already know.** W A S D and the mouse to move
   and look, Escape to back out, as most games do.
3. **Always show what state you are in.** Which mode, what is in your hand,
   what is loading. Never a hidden switch.
4. **Show, don't make people remember.** Menus list what each key does in the
   current mode.
5. **Group by task, not by when it was added.**
6. **Same action, same key, everywhere.** One key never means two things.
7. **Everything can be undone.**
8. **Settings are kept**, with one place to see and reset them.
9. **Plain words.** Every label says what it does in everyday language.

## Order of work

Each step waits for a "go", and leaves the app working.

1. **Gallivantage is Terrain Walker 0.13.34**, renamed (0.14.0).
2. **Round Earth,** in place, as Terrain Walker's plan describes.
3. **Download limit:** 1 GB, favourites kept.
4. **One ground:** everything asks layer 2.
5. **Ground lab:** where Canada's survey is right and where it is wrong.
6. **Close ground in rings round you.**
7. **Water:** levels from the map, shaped into the one ground.
8. **Toy box into the ground:** stand on a moved mountain.
9. **Interface review,** by the principles above, keeping the controls.
10. **Walking with physics,** then vehicles, then other people.

What leaves the app, and when, is decided at each step, not in advance: the
old ways go once the new way has been seen working.
