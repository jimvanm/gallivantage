# Library and Tree Lab: where things stand (9 October 2026, 20:15 EDT)

Written by the session working on objects. For the main development session:
nothing here touches the app yet.

## In the repo (change files 14 to 18)

- `library/`: small objects the app will draw many times over. `index.json`
  lists each with map tag, stage and status; `<set>/build.mjs` makes the shapes;
  `<set>/models.json` is baked by `node tools/bake_library.mjs`. Same model form
  as a landmark's model.json. Test: `test/library.mjs`. README in the folder.
- `library.html`: every library object and landmark, pictured from its model.
- `treelab.html`: plants library trees by the hundred thousand, using the app's
  own `src/controls.js`. Scenes: mountain, Tuscan vineyard.
- 14 and 15 are on GitHub (5586ecb). 16 (tree lab), 17 (pine stands) and 18
  (pines approved) were sent to Jim; apply in order.

## Approved (32 of 45)

Playground: swing, slide, climbing frame, sandpit. Trees: spire 2 to 4 and far;
all pines; all columns; round, tall oval, spreading 1 to 4; all feather palms.
Still open: spire sapling, four far shapes (check), fan palms (rework, start
again), vine (new), column and feather-palm far shapes (new).

## The mountain: set aside, ready to stage for production

Jim: "good enough to set aside"; no more lab work on it for now. Rules worth
keeping when trees go into the app (all in treelab.html, `mountain()`):

- Trees are instanced: 20 bytes each; one draw call per shape; a detailed shape
  per growth stage near (200 m), one simple shape per style beyond; the list is
  refreshed per 100 m cell, nearest first, after 20 m of travel or a turn.
- Each style has a shape per growth stage; age picks the stage; each tree is
  stretched up to 10% either way.
- Low down: mixed forest (broadleaf in the valley, then spruce, pine, cedar).
  Up the slopes: spruce and fir fill the ground; pines only in their own stands
  (300 to 400 m patches) on the sun-facing side, about 30% narrower there.
- Trees bunch up and thin out, with small clearings.
- Known cost: refreshing the list stalls the main program at large counts
  (about 20 ms at 300,000 trees); do it per tile in the background in the app.
  Thinning far trees (one in four, enlarged) not built yet.
