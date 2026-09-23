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
| `bands.json` | The three day-of-burning rings drawn from the two files above: where satellites had seen heat arrive by the end of 23 July, of 25 July and of 1 August, as nested polygons, with each band's fill and date-label anchor. Rebuilt by `node scripts/build-gironde-megafire-bands.mjs`. |

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

## The day-of-burning rings

`bands.json` follows the "day-of-burning" method of Parks (2014, International
Journal of Wildland Fire): the footprint is the union of the five Copernicus
perimeters, smoothed by 350 m; every FIRMS detection stamps a disc of radius R
with its exact time; a band's region is the footprint ground stamped by the end
of the band, smoothed by 1.4 km (as a share of the footprint around each point,
so a region reaches the footprint's own edge) so it reads as a few round shapes. The last
region is the whole footprint, 38,915.6 ha as drawn — wider than the 31,326.5 ha
Copernicus published, because the smoothing closes the gaps between its pieces.
Region areas therefore read high; quote Copernicus's hectares, not these.

| Band | Local days | Detections | Region | Share of the footprint |
| --- | --- | ---: | ---: | ---: |
| `jul-22-23` | 22–23 July | 1,640 | 11,150.6 ha | 28.7 % |
| `jul-24-25` | 24–25 July | 5,208 | 34,332.5 ha | 88.2 % |
| `jul-26-aug-01` | 26 July – 1 August | 2,676 | 38,915.6 ha | 100 % |

A ring shows where satellites saw heat arrive, not a flame front: a VIIRS
pixel is 375 m across and a few overpasses a day date the arrival to hours.

R = 1,050 m is fitted on shape: at each radius from 300 to 1,500 m, the region
at the instant of DEL_MONIT01 and of GRA_PRODUCT is compared with their burnt
polygons, and the smallest radius within 0.005 of the best mean intersection
over union is kept.

| Image | Role | IoU | Burnt ground left to a later ring |
| --- | --- | ---: | ---: |
| DEL_MONIT01 (26 July) | fitted | 0.623 | 0.7 % |
| GRA_PRODUCT (27 July) | fitted | 0.715 | 1.2 % |
| DEL_MONIT02 (29 July) | check | 0.794 | 1.4 % |
| GRA_MONIT01 (1 August) | check | 0.784 | 1.7 % |

Matching area instead was rejected: 300 m, the radius nearest the published
hectares, has the worst shape of the range (IoU 0.557 on DEL_MONIT01) and
leaves 11.4 % of the ground Copernicus already showed burnt to a later ring. DEL_PRODUCT (24 July) is left out:
it lags the detections, with 939 of the 3,776 detections before it lying more
than 500 m outside its perimeter. After 27 July the two sources part: between
GRA_PRODUCT and DEL_MONIT02 Copernicus adds 3,317.7 ha while the FIRMS region
grows by 17.3 ha.

## Credits

- **Copernicus EMS Rapid Mapping** — © Contains modified Copernicus EMS Rapid Mapping data (EMSR899) 2026  
  Copernicus data and information policy — Reg. (EU) 1159/2013 · <https://mapping.emergency.copernicus.eu/activations/EMSR899/>
- **EFFIS** — © European Forest Fire Information System — EFFIS, Copernicus EMS  
  Copernicus data and information policy · <https://forest-fire.emergency.copernicus.eu/>
- **NASA FIRMS** — NASA FIRMS — VIIRS (S-NPP, NOAA-20, NOAA-21) and MODIS active fire data  
  Public domain (NASA open data) · <https://firms.modaps.eosdis.nasa.gov/>

