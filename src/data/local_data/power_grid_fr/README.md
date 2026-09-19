# National power grid (France)

`national.json` is what the **Power Grid** layer draws above 120 km, and under
the viewport answer below it: every high-voltage route (`power=line`,
`power=cable`) and substation (`power=substation`) at **50 kV or more** that
OpenStreetMap has mapped in metropolitan France and Corsica.

It exists because the per-viewport path cannot draw a country. That path asks
Overpass for one box of at most 0.8° under a camera of at most 120 km; the same
query over all of France took **4 min 01 s** and answered **90 MB** of JSON
(measured 2026-09-19). So the layer drew nothing above 120 km, and every box
nobody had asked for yet cost 4 to 21 s before a line appeared. The gas layer
never had that problem because ODRÉ publishes its network as one file; this is
that file for the electricity grid.

Rebuild it with:

```
npm run power-grid:national                  # cached tiles, fetch the missing ones
npm run power-grid:national -- --refresh     # re-query every tile
npm run power-grid:national -- --check       # report the shipped pack and its age
npm run power-grid:national -- --from dump.json   # from an Overpass dump instead
```

The country is asked for in thirty 2° tiles, one at a time, each cached under
`.gev-cache/power-grid-national/` (gitignored), so a failed tile is retried
alone. A tile no mirror answers **fails the build** rather than shipping a hole
the shape of a region; `--allow-partial` accepts the hole deliberately and
records the missing tiles in the pack, where `powerGridNational.test.mjs`
refuses it.

**How the shipped pack was built.** The 2026-09-19 tile run completed — thirty
tiles, 68 269 elements — and was then refused, because five of its tiles had
come from `overpass.private.coffee` answering from THREE stale databases (OSM
bases of 2026-06-01, 07-15 and 07-24) while FOSSGIS was throttling this machine.
The build now rejects any tile whose base is more than seven days old. The
shipped file was built with `--from` over a single national Overpass answer
taken from FOSSGIS the same afternoon (base `2026-09-19T12:55:16Z`); the
`osmBase` field in the file is always the truth about its age.

## What is in it, and what was cut

It is the viewport path's own projection (`projectPowerGrid`) over the whole
country, with three cuts — see `src/data/powerGridNational.js` for the code and
the measurements:

| cut | rule | measured on the 2026-09-19 build |
|---|---|---|
| switchyard internals | ways under 150 m, or tagged `line=busbar` / `line=bay` | 26 768 of the 40 730 mapped ways touching France were under 150 m (median 61 m) |
| simplification | Douglas-Peucker at **50 m**, first and last vertex of every way kept | 530 182 mapped vertices drawn as 74 490 |
| France only | a way is kept when ANY vertex is in a French département (IGN outlines, 2 km coastal snap) | interconnectors keep their foreign half |

What is left, on that build: **13 131 routes, 89 058 km** (7 456 km of it
underground) and **4 419 substations**:

| band | routes | km | substations |
|---|---:|---:|---:|
| ≥ 300 kV | 1 207 | 14 713 | 239 |
| 180–299 kV | 3 398 | 24 016 | 912 |
| 100–179 kV | 158 | 1 243 | 55 |
| 50–99 kV | 8 368 | 49 087 | 3 213 |

Every stroke keeps its **OSM way id** (`w123…`). That is how the layer hands
over to the viewport path without drawing a route twice: the ways a viewport
answer brings back are hidden in the national batch one at a time, and the
rest of the country stays drawn around them.

## The file

2.8 MB, about **570 KB brotli** on the wire — it is a content-hashed asset, so
the preview server sends it pre-compressed and a returning browser does not
download it again. One array element per line, so a rebuild's diff is the
routes that changed rather than the whole file.

`osmBase` is the Overpass base timestamp of the oldest tile. The key prints it;
`--check` says how many days old it is. A transmission line is built over a
decade, so a pack a few months old draws the same map — rebuild it when OSM has
had a season of edits, not on a schedule.

## Licence

© OpenStreetMap contributors, **ODbL 1.0**. This file is a derived database of
OpenStreetMap and is published under the same licence; the layer credits it on
screen like every other OSM source (`DATA_SOURCES.md`).
