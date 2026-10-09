# Gallivantage

A planet playground: the real Earth, round, streamed live from public data,
to walk, drive, sail and fly, and to rearrange for fun.

The design is in `SPEC.md`; what is not done yet is in `TODO.md`. There is no
app yet, only labs: the first is the round Earth.

## Run it

The project is a folder of plain files, served by a local web server. Use
[Caddy](https://caddyserver.com/download). On Windows, open `serve.bat`, set
the line naming where `caddy` is on your computer, then double-click it. Or,
in this folder: `caddy run`.

Then open the round Earth lab: <http://localhost:8080/labs/roundearth.html>

(Python's built-in web server does not work on Windows: it often serves code
as plain text, which browsers refuse to run.)

## Tests

`node test/run.mjs` runs them all; `node test/run.mjs earth` runs only those
with "earth" in the name.

## Taking a change

Changes arrive as `.mbox` files. Drag one or more onto `apply.bat`. Each one
that applies is committed and its file deleted. Nothing is pushed; push when
you wish.

If one does not apply, an earlier one is usually missing: apply that first.

## Where things are

Folders follow the layers in `SPEC.md`:

| Folder | Layer |
| --- | --- |
| `src/geo/` | The shape of the Earth and the map tile grid (used by all) |
| `src/sources/` | 1. Sources: fetching and reading downloads |
| `src/drawing/` | 4. Drawing |
| `src/moving/` | 5. Moving |
| `labs/` | Labs, built from the layers above |
| `test/` | Tests |
