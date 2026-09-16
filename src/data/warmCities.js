/**
 * @file The cities whose road cells are paid for before anyone asks.
 *
 * THE COST THIS ANSWERS. A cold Overpass road box costs 0.6 to 46 s (measured
 * 2026-09-16 against the hosted origin: Lyon 46.4 s, Paris arterials 17.8 s,
 * Marseille 6.1 s, Bordeaux 2.7 s); the same query repeated costs 52 to 78 ms.
 * `warm-road-cells.mjs` already made that "somebody pays once a week" for the
 * DEFAULT view. Everywhere else, the first visitor of the week still pays it —
 * and on 2026-09-16 they did not merely wait, they got nothing at all, because
 * overpass-api.de was refusing this address while Paris sat happily in cache.
 *
 * WHY THIS SCALES THE WAY IT DOES. The upstream cost follows the number of
 * DISTINCT CELLS looked at, not the number of visitors: `tierFetchBox` puts
 * every request on the band's own lattice, so a thousand readers over the same
 * half-kilometre share one answer for the whole TTL. Pre-warming a handful of
 * cities therefore converts the realistic majority of traffic from "cold box"
 * to "52 ms", for a fixed and known number of upstream requests per week.
 *
 * WHICH BAND IS A CERTAINTY AND WHICH IS A GUESS — the honest part.
 *
 *  - The METRO cell is a certainty. Its box is 0.30° (~33 km) on a 0.025°
 *    lattice, which is wider than any of these cities, so whatever framing a
 *    reader arrives with, pulled back over the city they land in this cell.
 *  - The STREET cell is a GUESS, and it is stated as one. Its box is 0.05°
 *    (~5.5 km) on a 0.005° (~555 m) lattice, and the cell a reader actually
 *    asks for depends on where the camera LOOKS, not where it is: at 600 m and
 *    -30° of pitch the look-at point sits ~1 040 m from the nadir, i.e. about
 *    two lattice steps, in whatever direction the heading points. So this
 *    module warms the cell that the app's OWN house framing produces — the
 *    default view's pitch and heading, applied at each city centre — which is
 *    the single most likely arrival, not a guarantee.
 *
 * WHAT IS DELIBERATELY NOT HERE. No 3×3 block of neighbouring street cells.
 * It would raise the hit rate and multiply the weekly upstream cost by nine,
 * against a free service that answers 2 slots at a time and whose refusal
 * ladder was climbed on 2026-09-16 by exactly this kind of well-meant burst.
 * A warmer that gets the host to stop answering has made things worse.
 *
 * Clock-free and I/O-free: this module only says WHERE, never fetches.
 *
 * @module data/warmCities
 */

import { lookAtGroundPoint, roadFetchTier, tierFetchBox } from './trafficBounds.js';

/**
 * Camera framing used to derive every street cell below.
 *
 * Kept equal to `DEFAULT_CITY_VIEW`'s settle framing on purpose — it is the
 * app's house style, so it is the arrival a reader is most likely to produce.
 * It is NOT imported from `src/defaultView.js`: that module is about the one
 * view the boot flight ends on, and coupling the warm list to it would mean
 * that re-aiming the front door silently re-aims nine cities as well.
 *
 * @type {Readonly<{settleAltitudeM: number, headingDeg: number, pitchDeg: number}>}
 */
export const WARM_STREET_FRAMING = Object.freeze({
  settleAltitudeM: 600,
  headingDeg: 315,
  pitchDeg: -30,
});

/**
 * Altitude used to derive every metro cell.
 *
 * Anywhere inside the metro band (8 000 → 30 000 m) yields the same 0.30° box
 * for a given point, so the exact value is not load-bearing; 20 km is the
 * middle of the band and is what a reader pulling back over a city sits at.
 */
export const WARM_METRO_ALTITUDE_M = 20_000;

/**
 * The ten cities, and why these ten.
 *
 * Six were named by the operator on 2026-09-16 — Paris, Bordeaux, Marseille,
 * Biarritz, Lyon, Lille — and the other four are the next largest communes by
 * population that were not already on that list: Toulouse, Nice, Nantes,
 * Montpellier. Biarritz is the one that is not on any population ranking and is
 * here on purpose: it is small, it is where the fork's own testing keeps
 * landing, and a small town is exactly the case a population-ranked list would
 * never cover.
 *
 * Coordinates are the city centre, to five decimals — which is 1.1 m, far below
 * the 555 m lattice, so a slightly different notion of "centre" changes nothing
 * unless it crosses a cell boundary.
 *
 * ONE CELL PER CITY PER BAND, and that is a real limit worth stating: Marseille
 * is 24 km across and a street cell is 5.5 km, so this warms the centre and
 * nothing else. It is the centre that readers arrive at.
 *
 * @type {ReadonlyArray<Readonly<{name: string, lat: number, lon: number}>>}
 */
export const WARM_CITIES = Object.freeze([
  Object.freeze({ name: 'Paris', lat: 48.85840, lon: 2.29450 }),
  Object.freeze({ name: 'Marseille', lat: 43.29650, lon: 5.36980 }),
  Object.freeze({ name: 'Lyon', lat: 45.76400, lon: 4.83570 }),
  Object.freeze({ name: 'Toulouse', lat: 43.60470, lon: 1.44420 }),
  Object.freeze({ name: 'Nice', lat: 43.71020, lon: 7.26200 }),
  Object.freeze({ name: 'Nantes', lat: 47.21840, lon: -1.55360 }),
  Object.freeze({ name: 'Montpellier', lat: 43.61080, lon: 3.87670 }),
  Object.freeze({ name: 'Bordeaux', lat: 44.83780, lon: -0.57920 }),
  Object.freeze({ name: 'Lille', lat: 50.62920, lon: 3.05730 }),
  Object.freeze({ name: 'Biarritz', lat: 43.48320, lon: -1.55860 }),
]);

/**
 * The cells one city needs warmed, in the order they should be asked for.
 *
 * METRO FIRST, deliberately. It is the cheap certainty — arterials only, one
 * pass — and if a run is going to be cut short by a refusing upstream, the
 * request that survives should be the one that helps every framing rather than
 * the one that helps a guessed framing.
 *
 * Each entry carries its own `classes` and `timeoutSec` so a caller can build
 * the exact query the layer builds. `fullClasses` is asked for only where the
 * band defines it: the metro band has none, and inventing one would warm a
 * cell the app never requests.
 *
 * @param {{name: string, lat: number, lon: number}} city
 * @returns {Array<{city: string, band: string, pass: string, certainty: 'certain'|'framing-dependent', box: {south:number,west:number,north:number,east:number}, classes: readonly string[], timeoutSec: number}>}
 */
export function warmCellsFor(city) {
  const cells = [];
  const add = (tier, center, certainty) => {
    const box = tierFetchBox(center, tier);
    if (!box) return;
    // Same two passes, same timeouts, as `fetchRoads` — the proxy caches on the
    // query BODY, so anything less than byte-identical warms nothing at all.
    cells.push({
      city: city.name, band: tier.id, pass: 'major', certainty, box,
      classes: tier.classes, timeoutSec: 12,
    });
    if (tier.fullClasses) {
      cells.push({
        city: city.name, band: tier.id, pass: 'full', certainty, box,
        classes: tier.fullClasses, timeoutSec: 20,
      });
    }
  };

  const metro = roadFetchTier(WARM_METRO_ALTITUDE_M);
  // Pulled back and level: at 20 km the look-at offset is irrelevant next to a
  // 33 km box, and a nadir centre is the one choice that cannot drift.
  if (metro) add(metro, { lat: city.lat, lon: city.lon }, 'certain');

  const street = roadFetchTier(WARM_STREET_FRAMING.settleAltitudeM);
  if (street) {
    add(street, lookAtGroundPoint({
      lat: city.lat,
      lon: city.lon,
      altitudeM: WARM_STREET_FRAMING.settleAltitudeM,
      pitchDeg: WARM_STREET_FRAMING.pitchDeg,
      headingDeg: WARM_STREET_FRAMING.headingDeg,
    }), 'framing-dependent');
  }
  return cells;
}

/**
 * Every cell the weekly run should warm, city order preserved.
 *
 * @param {ReadonlyArray<{name: string, lat: number, lon: number}>} [cities]
 * @returns {ReturnType<typeof warmCellsFor>}
 */
export function warmPlan(cities = WARM_CITIES) {
  return cities.flatMap((city) => warmCellsFor(city));
}
