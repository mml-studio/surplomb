# Gironde megafire — Jul 22 to Aug 1, 2026

Frozen pack for the `gironde-megafire-2026` layer. Rebuilt by
`node scripts/build-gironde-megafire-2026.mjs` (see the script's header for
the sources and for why nothing is re-read at runtime).

Built on 2026-09-10.

## What the pack contains

| File | Contents |
| --- | --- |
| `event.json` | The five dated Copernicus perimeters, their fire fronts and active flames, the final EFFIS perimeter, and the statistics Copernicus published for each product. |
| `hotspots.json` | The NASA FIRMS detections inside the window, in minutes since it opened. |

## The five images

| Acquisition (UTC) | Product | Sensor | Published burnt area | Polygons drawn |
| --- | --- | --- | ---: | ---: |
| 2026-07-24 09:05 | DEL_PRODUCT | Pléiades Neo (Legion) | 5,775.4 ha | 42 |
| 2026-07-26 10:12 | DEL_MONIT01 | Pléiades Neo (Legion) + Sentinel-2 | 24,857.4 ha | 662 |
| 2026-07-27 16:16 | GRA_PRODUCT | Pléiades Neo (Legion) | 28,284.7 ha | 490 |
| 2026-07-29 14:07 | DEL_MONIT02 | Pléiades Neo (Legion) | 31,602.4 ha | 144 |
| 2026-08-01 11:38 | GRA_MONIT01 | Pléiades Neo (Legion) | 31,326.5 ha | 126 |

The “published burnt area” column is Copernicus's own, never recomputed from
the drawing. `measuredHa` (raw geometry) and `drawnHa` (after simplification)
are kept in `event.json` so that the gap stays measurable.

## The hotspots

9,524 detections kept inside the window, 3,775 of them on 2026-07-24 — the busiest day.
Peak radiative power on a single pixel: 1,573.57 MW.

## Credits

- **Copernicus EMS Rapid Mapping** — © Contains modified Copernicus EMS Rapid Mapping data (EMSR899) 2026  
  Copernicus data and information policy — Reg. (EU) 1159/2013 · <https://mapping.emergency.copernicus.eu/activations/EMSR899/>
- **EFFIS** — © European Forest Fire Information System — EFFIS, Copernicus EMS  
  Copernicus data and information policy · <https://forest-fire.emergency.copernicus.eu/>
- **NASA FIRMS** — NASA FIRMS — VIIRS (S-NPP, NOAA-20, NOAA-21) and MODIS active fire data  
  Public domain (NASA open data) · <https://firms.modaps.eosdis.nasa.gov/>

