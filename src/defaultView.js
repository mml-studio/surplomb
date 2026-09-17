/**
 * @file The view every visitor lands on, and the Overpass box it will ask for.
 *
 * WHY THIS IS NOT IN `camera.js`. It used to be, and `camera.js` imports
 * Cesium — so the one constant that describes where every single reader
 * arrives could not be read by anything outside a browser. That is exactly
 * backwards for the thing it is now needed for: `scripts/warm-road-cells.mjs`
 * has to know what the app WILL request before any browser has requested it.
 *
 * `camera.js` re-exports `DEFAULT_CITY_VIEW`, so nothing that already imports
 * it from there has to change.
 *
 * @module defaultView
 */

import { roadFetchTier, lookAtGroundPoint, tierFetchBox } from './data/trafficBounds.js';

/**
 * Default map view — the boot flight's start, its end and its framing.
 *
 * `approachAltitudeM` is also the height `photorealAdoption.js` treats as
 * "arrived over a city" and the one `groundHeight` stops paying for terrain
 * samples at; changing it moves three things, not one.
 *
 * A phone lands at the same point and height but straight down, north up
 * (`src/topDownView.js`), so it looks at the point itself rather than a
 * kilometre north-west of it. The cell below is the desktop's: a phone boots
 * with no layer on, and one that restored the traffic layer asks for a cell
 * the warmer does not pay for.
 */
export const DEFAULT_CITY_VIEW = Object.freeze({
  label: 'Paris',
  lon: 2.2945,
  lat: 48.8584,
  approachAltitudeM: 25000,
  settleAltitudeM: 600,
  headingDeg: 315,
  pitchDeg: -30,
});

/**
 * The Overpass cell the default view asks for, derived rather than pinned.
 *
 * ── Why this can be computed at all ───────────────────────────────────────
 * Because the box stopped depending on the reader. `tierFetchBox` puts it at
 * the band's own span on the band's lattice, so it is a function of the
 * look-at point alone — not of the window size, which used to produce five
 * different boxes for one view (`scripts/qa-span-par-viewport.mjs`).
 *
 * ── Why the derivation is trustworthy, and how you would know ─────────────
 * It is not the app's code path: the app picks the ellipsoid under the canvas
 * centre with Cesium, this walks a sphere. They agree because the lattice step
 * is 370-555 m and the two answers differ by metres. **That agreement is a
 * measured fact, not a proof**, and it is pinned in
 * `src/defaultView.test.mjs` against the box captured off the wire on
 * 2026-09-16. Change `DEFAULT_CITY_VIEW` or a band's `snapDeg` and that test
 * fails by name — which is the whole point, because the failure mode being
 * guarded against is a warmer that keeps warming a cell nobody visits, with
 * nothing to notice, since a useless request looks exactly like a useful one.
 *
 * @returns {{tier:Object, center:{lat:number, lon:number}, box:{south:number, west:number, north:number, east:number}}}
 */
export function defaultViewFetchBox() {
  const tier = roadFetchTier(DEFAULT_CITY_VIEW.settleAltitudeM);
  const center = lookAtGroundPoint({
    lat: DEFAULT_CITY_VIEW.lat,
    lon: DEFAULT_CITY_VIEW.lon,
    altitudeM: DEFAULT_CITY_VIEW.settleAltitudeM,
    pitchDeg: DEFAULT_CITY_VIEW.pitchDeg,
    headingDeg: DEFAULT_CITY_VIEW.headingDeg,
  });
  return { tier, center, box: tierFetchBox(center, tier) };
}
