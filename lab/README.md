# Lab

Tools for trying out models before they go in the library. Every page here is a single file that works on its own: open it, serve it with the rest of the repo, or publish it.

## Tree Stand (`stand/`)

The experimental farm: plant models in rows, then walk or fly around them. It has the app's controls.

- `node lab/stand/make.mjs` rebuilds `stand/index.html` from the library.
- Only trees not yet approved get a row, each labelled with its status. Approved trees are on the library page.
- Trial rows not yet in the library come from `stand/plots/*.json`. The format is described at the top of `make.mjs`. Delete a plot file to retire its row.
- The mountain scene is known to be broken (it stops at "Planting…"). It will be fixed when it's needed.

## Leaf lab (`leaf/`)

Small viewers for building one part at a time. The fan palm leaf was made here.

- `view.mjs` writes a viewer page from `template.html`: models side by side on flat ground, with notes beside them.
- `node lab/leaf/one.mjs` writes `leaf.html`: the approved ten-finger leaf, beside two plain fans with the same outline.
- `node lab/leaf/palms.mjs` writes `palms.html`: sample palms with 10- and 11-finger leaves. It also holds the rejected tries at a far fan palm, and a check that leaves don't touch.
  - Add `--plots` to put the trial palms back in the Tree Stand as rows.
