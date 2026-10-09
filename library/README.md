# Library

Small objects the app can draw many times over (playground pieces, trees, and
whatever comes next), each built to real size from a few simple shapes.
`library.html` shows every one, pictured from its actual model, with its
status. The landmarks are listed there too (they live in `landmarks/`).

## Files

| File | What it is |
|---|---|
| `index.json` | the list: every object, its set, name, stage, map tag, status, notes |
| `<set>/build.mjs` | makes the set's shapes; exports `build()` returning `{ id: Mesh }` |
| `<set>/models.json` | the shapes. Generated: do not edit by hand |
| `shapes.mjs` | building blocks shared by the sets (rings, cones, clumps, fronds) |

Each model in `models.json` has the same form as a landmark's `model.json`:
`{ tris, pos, col, idx }`, metres, y up, x east, z south, origin at the middle
of the base, a colour per corner, no normals (the app shades from the screen).

## Add or change an object

1. Build it in `<set>/build.mjs` (or start a new set folder).
2. List it in `index.json`, with `"status": "new"`.
3. `node tools/bake_library.mjs` (or `node tools/bake_library.mjs trees`).
4. `node test/run.mjs library`. It fails if an object is listed without a shape,
   a shape is not listed, or `models.json` is not what `build.mjs` makes now.

## Status

- `approved`: Jim has seen it and it is right.
- `check`: changed since Jim last saw it.
- `pending`: waiting on something else first (the notes say what).
- `rework`: Jim has seen it and it is wrong.
- `new`: not seen yet.

## Trees

Each style has one shape per growth stage (`spire-1` to `spire-4`) and one
simple far shape (`spire-far`), stored at the oldest stage's size. The app is
meant to pick the stage from age, stretch each tree up to 10% either way, and
stretch the far shape to the tree it stands in for.
