# Fuel prices: the frozen "before" reference

`reference.json` holds, for every filling station in metropolitan France and
Corsica, the Gazole and E10 price it charged from **24 to 30 October 2026**,
and the brand OpenStreetMap gives it. The fuel-price layer ("Prix des
carburants") compares that frozen price with today's live one.

Rebuild it with:

```
npm run fuel:reference                       # reuses .gev-cache/fuel-fr/ when present
npm run fuel:reference -- --refresh          # re-downloads both sources
npm run fuel:reference -- --refresh-osm      # re-queries Overpass only
npm run fuel:reference -- --refresh-annual   # re-downloads the annual file only
```

A cold build took 8 min 47 s on 2026-11-23, nearly all of it Overpass (one
mirror timed out after 256 s before `overpass-api.de` answered in 114 s). A warm
rebuild takes 3 s. Two builds over the same cache differ only in `builtAt`.

## Sources and licences

| source | what it gives | licence |
|---|---|---|
| [Annual 2026 price history](https://donnees.roulez-eco.fr/opendata/annee/2026), from the official fuel-price feed ([prix-carburants.gouv.fr](https://www.prix-carburants.gouv.fr/rubrique/opendata/)) | every price declaration of 2026 at every station | Licence Ouverte / Etalab 2.0 |
| OpenStreetMap, `amenity=fuel` in the French Republic, via Overpass | brand, name, operator, and the station id in `ref:FR:prix-carburants` | ODbL 1.0 |

The official feed carries no brand. OSM does, and its `ref:FR:prix-carburants`
tag holds the feed's station id (exact match after trimming; a tag with several
ids separated by `;` counts for each).

## Format

```json
{
  "version": 1, "builtAt": "…",
  "window": { "start": "2026-10-24", "end": "2026-10-30", "minValidDays": 5, "maxAgeDays": 30 },
  "fuels": ["Gazole", "E10"],
  "groups": ["Pétrolier", "Grande surface", "Réseau indépendant"],
  "brands": ["TotalEnergies", "…"], "brandGroups": ["Pétrolier", "…"],
  "sources": { "annual": { … }, "osm": { … } },
  "counts": { … },
  "stations": { "<station id>": [brandIndex, gazoleBefore, e10Before, access] }
}
```

`brandIndex` points into `brands` (null: no brand recognized, shown as
"Indépendant / non renseigné"); `brandGroups[brandIndex]` is its group. Prices
are €/L rounded to 3 decimals, or null. `access` is 1 for a TotalEnergies
Access station.

## Rules

They mirror a pre-registered analysis; the code and its tests are in
`src/data/fuelReference.js` and `fuelReference.test.mjs`.

1. **Daily price** for day J: the last declared value whose `maj` falls on or
   before J 23:59:59 Paris time. Missing when that declaration is more than 30
   calendar days older than J. Ties on `maj` go to the later line of the file.
2. **Bounds**: values above 100 are read as thousandths of a euro; anything
   outside 1.00–4.00 €/L after that is ignored (the previous declaration
   carries on) and counted.
3. **Before price**: the mean of the valid daily prices from 24 to 30 October
   2026, only if at least 5 of the 7 days are valid. Summed in integer
   thousandths, rounded half up to 3 decimals.
4. **Brand**: OSM `brand`, then `name`, then `operator`, each lowercased,
   stripped of accents and punctuation; the first pattern of the table in
   `BRAND_RULES` that matches wins. A TotalEnergies station whose `name` or
   `brand` contains "access" is flagged. When several OSM elements carry the
   same station id, they are read in id order (`n…`, `r…`, `w…`) and the
   first one with a brand wins.
5. **Scope**: postcodes 01xxx–95xxx. A station is kept when it has a before
   price for either fuel, or an OSM brand.

Ruptures (`<rupture>`) and closures (`<fermeture>`) are not applied: rule 1
does not use them.

## Measured on the 2026-11-23 build

- Annual file: 33.4 MB ZIP, last modified 2026-11-22 23:40 UTC; 14 935
  stations, 4 871 919 price declarations. Three are out of scope: two in
  La Réunion (974xx) and the feed's test station `99999001` (postcode 99999).
- **9 970 stations** in the pack: 9 243 with a Gazole before price, 7 592
  with an E10 one, 684 kept for their brand alone.
- Mean before price (simple mean of stations): **Gazole 2.373 €/L**, E10
  2.114 €/L. Gazole ranges from 2.107 to 2.881 €/L (median 2.384); 77.1 % of
  stations sit above 2.25 €/L.
- No declaration fell outside the bounds, none was unreadable, and no value
  was written in thousandths.
- OSM (`overpass-api.de`, base 2026-11-23 08:34 UTC): 12 610 fuel elements,
  10 146 with `ref:FR:prix-carburants`, 10 041 stations matched. **Match rate:
  9 227 of the 9 243 stations with a Gazole before price (99.8 %).** 17
  stations have OSM elements that disagree on the brand.
- Brands: 9 579 stations branded, 391 not. TotalEnergies 2 482 (559 of them
  Access), Intermarché 1 720, Carrefour 1 433, Système U 936, E.Leclerc 746,
  Esso 673, Avia 626, Auchan 259, Eni 169, others below 110.
- 1 567 stations with a Gazole before price also declared a Gazole rupture
  overlapping the window — almost all temporary ones opened in October 2026.
  Their before price is still the last declared one, as rule 1 says.

## What the real file looks like

Checked against the 2026 file, where it differs from the published
description:

- `maj` has no offset and is **Paris wall-clock time**: on 2026-03-29 (spring
  forward) the file holds no declaration between 02:00 and 02:59, against 3
  the day before, and nightly batches keep the same clock time in winter and
  summer.
- The file holds 5 109 empty `<prix/>` placeholders, plus empty `<rupture/>`
  and `<fermeture/>` ones; they carry nothing.
- Coordinates are degrees × 100 000, but 3 362 stations write them with
  decimals, and the 97420 station uses a projected system. The pack does not
  use coordinates.
