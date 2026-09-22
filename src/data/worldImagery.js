// Worldwide satellite imagery — the base layer of the `Satellite` stack.
//
// WHY THIS FILE EXISTS. A keyless build has no photography outside France.
// Google's satellite is withheld from any EEA billing address (see
// src/data/googleMapTiles.js), Bing needs an ion token, and IGN stops at the
// Channel. So `ign-ortho` used to composite France's 20 cm orthophoto over a
// world of OSM *line work* — a street map showing through under a photograph,
// which reads as a rendering fault the moment the camera crosses a border.
//
// This module supplies the two keyless worldwide photographic bases that fill
// that hole, in priority order. Both were probed over the same Paris tile on
// 2026-09-08, and both answer with real JPEG and open CORS:
//
//                      z=17     z=18     z=19     z=20
//   IGN orthophoto     15.4 kB  11.6 kB   9.8 kB   404
//   Esri World Imagery 16.3 kB  14.1 kB  12.2 kB  2521 B ("no data" tile)
//
// Esri and IGN cap at the SAME z=19, which is what makes the composite safe:
// the world base never outruns the French layer above it, it only continues
// past its edge.
//
// THE LICENCE SPLIT, and why there are two providers rather than one. The
// anonymous Esri endpoint is open and is what leaflet-providers and QGIS ship
// by default, but Esri says outright that it "is not available for commercial
// use" — fine for a clone run by its owner, not for a hosted product. EOX's
// Sentinel-2 cloudless is the unambiguous alternative — except that its
// licence is declared PER VINTAGE, and only two of the eleven are usable
// commercially (read from its WMTSCapabilities, 2026-09-08):
//
//   s2cloudless_3857        (2016)   CC BY 4.0
//   s2cloudless-2017_3857   (2017)   CC BY 4.0
//   s2cloudless-2018 … 2025          CC BY-NC-SA 4.0   <- NonCommercial
//
// Hence 2016, and not 2017 as this file first said. Both are CC BY 4.0, but
// only 2016 covers the world: 2017 is Europe, North Africa and the Middle East,
// and paints every other continent as flat white land — its four z1 tiles,
// read 2026-09-22, show the Americas, Asia past the Urals, southern Africa
// and Australia white. That went unseen while Sentinel-2 only stood in for a
// dead Esri; it became the whole world base the day a commercial deployment
// switched the anonymous endpoint off. Same 10 m detail, same z14 profile
// (Madrid, 2016 vs 2017: 25.3 / 27.7 kB at z13, 13.2 / 14.6 kB at z14).
//
// THREE PATHS, AND WHO GETS WHICH (`chooseWorldImagery`):
//
//   1. A build with ARCGIS_API_KEY asks ArcGIS Location Platform — the SAME
//      World Imagery, licensed and billed per tile (2 M free a month, then
//      $0.15 per 1,000, no subscription). Commercial use is what that key
//      pays for, so the non-commercial switch does not apply to it.
//   2. A build without one asks the anonymous `services.arcgisonline.com`
//      endpoint — but only once the server has SAID it may. Esri: "this
//      service is not available for commercial use", so a deployment with
//      GEV_NONCOMMERCIAL_SOURCES=off lists it in `sourcesOff`
//      (src/nonCommercialSources.js), and a page that has not heard from the
//      server yet does not guess: the browser fetches these tiles itself, so
//      one guess would be one request the hosted site may not make.
//   3. Everything else draws Sentinel-2 cloudless 2016, which is also where
//      either Esri path lands once it has failed its tile budget.

import * as Cesium from 'cesium';

// XYZ, not WMTS: Esri's MapServer `tile/{z}/{y}/{x}` endpoint is row-then-column
// and is bit-for-bit Cesium's default WebMercatorTilingScheme (256 px, one tile
// at level 0), so no tiling scheme is passed here.
const ESRI_WORLD_IMAGERY_URL =
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// The same service behind an access token: the "Map tile services" Esri lists
// as the data of its Basemap Styles service, and the host Location Platform
// bills as basemap tiles ("the number of tile requests to basemaps-api.arcgis.com,
// ibasemaps-api.arcgis.com, or static-map-tiles-api.arcgis.com"). Same 256 px
// Web Mercator grid as the anonymous one — probed 2026-09-22 — so it swaps in
// with nothing else changed. The key rides in `token`, the form Esri documents
// for tiles; an Authorization header would cost a CORS preflight per tile.
const ESRI_LICENSED_URL =
  'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

// Past 19 Esri answers 200 with a constant 2521-byte "no data" placeholder
// rather than a 404 — an error budget would never notice it. Capping makes
// Cesium magnify the last real tile instead of painting that placeholder. The
// licensed path keeps the cap too: it is what keeps the base from outrunning
// IGN, and every level past it would be a billed tile.
const ESRI_MAX_LEVEL = 19;

const ESRI_CREDIT = 'Imagerie © Esri, Maxar, Earthstar Geographics';

// What Esri requires of an app that is not one of its SDKs: "Powered by Esri"
// on screen, plus the data providers — here the service's own `copyrightText`,
// read 2026-09-22. Both are Esri's wording, quoted rather than translated.
// i18n-ignore-next-line — attribution prescribed by Esri, verbatim.
const ESRI_LICENSED_CREDIT = 'Powered by <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> · Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community';

/**
 * The id under which GEV_NONCOMMERCIAL_SOURCES=off turns the anonymous
 * endpoint off. It must stay in NONCOMMERCIAL_SOURCES
 * (src/nonCommercialSources.js) — the server only reports ids that list holds
 * — and worldImagery.test.mjs holds the two together.
 */
export const ANONYMOUS_ESRI_SOURCE_ID = 'esri-world-imagery';

/** The three world bases, by the name `chooseWorldImagery` returns. */
export const WORLD_IMAGERY = Object.freeze({
  LICENSED: 'esri-licensed',
  ANONYMOUS: 'esri-anonymous',
  S2CLOUDLESS: 's2cloudless',
});

/**
 * Whether a build carries an ArcGIS key. Whitespace is not a key: an `.env`
 * line left as `ARCGIS_API_KEY= ` must not send `token=` with every tile.
 * @param {unknown} apiKey
 * @returns {boolean}
 */
export function hasArcgisApiKey(apiKey) {
  return typeof apiKey === 'string' && apiKey.trim() !== '';
}

/**
 * Which world base to draw.
 *
 * @param {object} state
 * @param {string} [state.arcgisApiKey] The build's ArcGIS key, if any.
 * @param {boolean} [state.anonymousEsriAllowed] True only once the server has
 *   said this deployment may use the anonymous endpoint.
 * @param {boolean} [state.degraded] Esri has failed its tile budget.
 * @returns {string} One of `WORLD_IMAGERY`.
 */
export function chooseWorldImagery({ arcgisApiKey = '', anonymousEsriAllowed = false, degraded = false } = {}) {
  if (degraded) return WORLD_IMAGERY.S2CLOUDLESS;
  if (hasArcgisApiKey(arcgisApiKey)) return WORLD_IMAGERY.LICENSED;
  return anonymousEsriAllowed === true ? WORLD_IMAGERY.ANONYMOUS : WORLD_IMAGERY.S2CLOUDLESS;
}

/**
 * The "Data attribution" line of each world base (src/data/dataCredits.js).
 * @type {Readonly<Record<string, string>>}
 */
export const WORLD_IMAGERY_CREDIT_KEYS = Object.freeze({
  [WORLD_IMAGERY.LICENSED]: 'world-satellite-arcgis',
  [WORLD_IMAGERY.ANONYMOUS]: 'world-satellite-keyless',
  [WORLD_IMAGERY.S2CLOUDLESS]: 'world-satellite-s2cloudless',
});

/**
 * The popover line of the Esri path this build can never draw: the anonymous
 * endpoint's when it has a key, the licensed one's when it has none.
 * @param {string} [arcgisApiKey]
 * @returns {string[]}
 */
export function unusedWorldImageryCreditKeys(arcgisApiKey) {
  return [WORLD_IMAGERY_CREDIT_KEYS[
    hasArcgisApiKey(arcgisApiKey) ? WORLD_IMAGERY.ANONYMOUS : WORLD_IMAGERY.LICENSED
  ]];
}

/**
 * How long the boot may hold the satellite stack for the `/api/trial` answer
 * before it draws Sentinel-2 and lets a late answer swap the base.
 */
export const WORLD_BASE_PROBE_WAIT_MS = 500;

/**
 * The page's reading of `/api/trial` for the anonymous endpoint: allowed only
 * when the answer carries a `sourcesOff` list and the endpoint is not in it.
 *
 * Stricter than `offSourcesFromProbe`, which reads a failed answer as a clone.
 * That is right for sources the SERVER fetches, because the server checks the
 * switch again before each fetch. Esri tiles are fetched by the browser, so the
 * page is the only check there is: a failed probe on the hosted site — a 429
 * from the edge, a dropped connection — must not turn into Esri requests.
 *
 * @param {unknown} probe The `/api/trial` body, or null.
 * @returns {boolean}
 */
export function anonymousEsriAllowedByProbe(probe) {
  if (!probe || typeof probe !== 'object' || !Array.isArray(probe.sourcesOff)) return false;
  return !probe.sourcesOff.includes(ANONYMOUS_ESRI_SOURCE_ID);
}

// EOX WMTS RESTful: /{layer}/{style}/{tileMatrixSet}/{z}/{row}/{col}.jpg. The
// `g` matrix set is GoogleMapsCompatible — verified by asking for it directly:
// level 0 returns one tile, level 1 returns four.
const S2CLOUDLESS_URL =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';

// Sentinel-2 is 10 m/px. EOX serves 200s up to 16, but the bodies collapse
// past 14 (13 kB at 14, 6 kB at 16) — that is upsampling, not detail.
const S2CLOUDLESS_MAX_LEVEL = 14;

const S2CLOUDLESS_CREDIT =
  'Sentinel-2 cloudless 2016 © EOX — Copernicus, CC BY 4.0';

/**
 * Distinct failed tiles tolerated before Esri is declared down.
 *
 * Sized against what a real outage looks like rather than against a hunch: one
 * globe view requests roughly 30–90 tiles, so a service that is actually down
 * blows through six almost immediately, while the occasional single tile lost
 * to a flaky connection never gets there. Counted per DISTINCT tile, because
 * Cesium re-raises `errorEvent` on every retry of the same one.
 */
export const WORLD_IMAGERY_FAILURE_BUDGET = 6;

/**
 * Esri World Imagery — the preferred worldwide base. With a key, through
 * ArcGIS Location Platform; without one, the anonymous endpoint, which only a
 * non-commercial deployment may use (`chooseWorldImagery` decides that).
 * @param {object} [options]
 * @param {string} [options.apiKey] An ArcGIS Location Platform API key.
 * @returns {Cesium.UrlTemplateImageryProvider}
 */
export function createEsriWorldImageryProvider({ apiKey = '' } = {}) {
  if (hasArcgisApiKey(apiKey)) {
    return new Cesium.UrlTemplateImageryProvider({
      url: `${ESRI_LICENSED_URL}?token=${encodeURIComponent(apiKey.trim())}`,
      maximumLevel: ESRI_MAX_LEVEL,
      credit: new Cesium.Credit(ESRI_LICENSED_CREDIT, true),
    });
  }
  return new Cesium.UrlTemplateImageryProvider({
    url: ESRI_WORLD_IMAGERY_URL,
    maximumLevel: ESRI_MAX_LEVEL,
    credit: new Cesium.Credit(ESRI_CREDIT, true),
  });
}

/**
 * The provider for one of the three world bases.
 * @param {string} kind One of `WORLD_IMAGERY`.
 * @param {object} [options]
 * @param {string} [options.arcgisApiKey]
 * @returns {Cesium.UrlTemplateImageryProvider}
 */
export function createWorldImageryProvider(kind, { arcgisApiKey = '' } = {}) {
  if (kind === WORLD_IMAGERY.LICENSED) return createEsriWorldImageryProvider({ apiKey: arcgisApiKey });
  if (kind === WORLD_IMAGERY.ANONYMOUS) return createEsriWorldImageryProvider();
  return createS2CloudlessProvider();
}

/**
 * Sentinel-2 cloudless 2016 — the CC BY 4.0 fallback, and the only CC BY
 * vintage that covers the whole world.
 * @returns {Cesium.UrlTemplateImageryProvider}
 */
export function createS2CloudlessProvider() {
  return new Cesium.UrlTemplateImageryProvider({
    url: S2CLOUDLESS_URL,
    maximumLevel: S2CLOUDLESS_MAX_LEVEL,
    credit: new Cesium.Credit(S2CLOUDLESS_CREDIT, true),
  });
}

/**
 * Calls `onExhausted` once the provider has failed `budget` DISTINCT tiles.
 *
 * Optimistic degradation rather than a probe: probing Esri before building the
 * layer would put a network round-trip in front of every switch to satellite,
 * to answer a question that is "yes" almost always. Watching instead costs
 * nothing on the happy path and still reacts to an outage that starts
 * mid-session, which a boot-time probe cannot do.
 *
 * @param {Cesium.ImageryProvider} provider - Provider whose `errorEvent` to watch.
 * @param {number} budget - Distinct failed tiles tolerated.
 * @param {() => void} onExhausted - Called at most once, when the budget is spent.
 * @returns {() => void} Detaches the listener.
 */
export function watchTileFailures(provider, budget, onExhausted) {
  const failed = new Set();
  let fired = false;
  const listener = (error) => {
    if (fired) return;
    // A TileProviderError carries the tile it belongs to. Anything without one
    // is a provider-level failure (a bad `layer.json`, a DNS error) and counts
    // once under its own key rather than being dropped.
    const key = error && error.level != null
      ? `${error.level}/${error.x}/${error.y}`
      : 'provider';
    failed.add(key);
    if (failed.size < budget) return;
    fired = true;
    onExhausted();
  };
  provider.errorEvent.addEventListener(listener);
  return () => provider.errorEvent.removeEventListener(listener);
}
