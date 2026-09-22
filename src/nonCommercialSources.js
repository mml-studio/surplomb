// Sources a commercial deployment may not use, and the one switch that turns
// them all off.
//
// A clone is its owner's own non-commercial use, and keeps every source below.
// surplomb.app is run by a company, so it is a commercial deployment: it sets
// `GEV_NONCOMMERCIAL_SOURCES=off`, and each source listed here goes dark there.
// The server stops asking it (or serving it); the page stops drawing the
// control, the readings and the attribution that belonged to it.
//
// Most members are here because their licence or terms allow non-commercial
// use only. One is here for a different clause — Google's Street View terms
// forbid its imagery beside a non-Google map — and says so in its `reason`.
// The variable keeps its name: it is set on the hosted box, and what it means
// there has not changed (a commercial host turns these off).
//
// The switch is read per request, like every GEV_* runtime switch; the page
// learns it from the `/api/trial` read it already makes at boot
// (src/trialProbe.js), so it costs no request of its own.
//
// Adding a source is one line in NONCOMMERCIAL_SOURCES, then honouring it
// where the source is fetched (`isSourceOn(id)` in the proxy) and where it is
// drawn (`offSourcesFromProbe` in the page). Its credits are withdrawn from
// the "Data attribution" popover, and its layers from the Data Layers panel,
// by the entry itself.

/** The environment variable. Unset, or `on`, keeps the sources. */
export const NONCOMMERCIAL_SOURCES_VAR = 'GEV_NONCOMMERCIAL_SOURCES';

/**
 * Every source the switch turns off.
 *
 * - `id` is what the server reports in `sourcesOff` (`/api/trial`, `/healthz`).
 * - `terms` is the clause that keeps it off a commercial deployment.
 * - `reason` is which kind of clause that is: `non-commercial` (the default —
 *   the licence or terms allow non-commercial use only) or `display-terms`
 *   (the provider forbids the way this app would show it).
 * - `credits` are the keys of its entries in src/data/dataCredits.js.
 * - `layers` are the Data Layers rows it alone feeds, withheld from the panel
 *   where it is off (none by default).
 *
 * @type {ReadonlyArray<Readonly<{id: string, name: string, terms: string, reason: string, credits: readonly string[], layers: readonly string[]}>>}
 */
export const NONCOMMERCIAL_SOURCES = Object.freeze([
  // "You may only use the free API services for non-commercial purposes."
  { id: 'open-meteo', name: 'Open-Meteo', terms: 'https://open-meteo.com/en/terms', credits: ['open-meteo'] },
  // "As is stated in the terms of use, this service is not available for commercial use." (Esri staff.) Fetched by the browser, so the page is the check: src/data/worldImagery.js. A build with ARCGIS_API_KEY never asks it.
  { id: 'esri-world-imagery', name: 'Esri World Imagery (anonymous endpoint)', terms: 'https://community.esri.com/t5/arcgis-location-platform-developers-ques/inquiry-about-world-imagery/td-p/1569266', credits: ['world-satellite-keyless'] },
  // "Any use by a for-profit or commercial entity — including government and
  // military contractors — requires a written license from OpenSky Network,
  // regardless of purpose." Off, the flights proxy makes adsb.lol its primary
  // source and never asks OpenSky for a snapshot, a track or a token.
  { id: 'opensky', name: 'OpenSky Network', terms: 'https://opensky-network.org/about/terms-of-use', credits: ['opensky'] },
  // "You may only display the content of the Service for your own personal use (i.e., non-commercial use)." The cockpit headlines fall back on GDELT.
  { id: 'google-news', name: 'Google News RSS', terms: 'https://www.google.com/intl/en_us/terms_google_news.html', credits: ['google-news-rss'] },
  // EEA: "Customer may not use any Google Maps Content from the Street View Static API With any Map."
  { id: 'google-street-view', name: 'Google Street View Static', terms: 'https://developers.google.com/maps/comms/eea/street-view-static', reason: 'display-terms', credits: ['google-street-view'] },
  // CC BY-NC-SA 3.0: the bundled cable map may not be used commercially.
  { id: 'telegeography', name: 'TeleGeography Submarine Cable Map', terms: 'https://creativecommons.org/licenses/by-nc-sa/3.0/', credits: ['telegeography'], layers: ['telegeography-submarine-cables'] },
].map((source) => Object.freeze({
  reason: 'non-commercial',
  ...source,
  credits: Object.freeze([...source.credits]),
  layers: Object.freeze([...(source.layers || [])]),
})));

const KNOWN_IDS = new Set(NONCOMMERCIAL_SOURCES.map((source) => source.id));

function serverEnv() {
  return globalThis.process?.env ?? {};
}

/**
 * Whether this deployment may use the sources above. Unset or `on` (any case)
 * keeps them; any other value turns them off, so a typo errs on the side of
 * the licence rather than of the feature.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
export function nonCommercialSourcesAllowed(env = serverEnv()) {
  const value = String(env?.[NONCOMMERCIAL_SOURCES_VAR] ?? '').trim().toLowerCase();
  return value === '' || value === 'on';
}

/**
 * The ids this deployment turns off, in list order. Empty on a clone.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {string[]}
 */
export function sourcesOff(env = serverEnv()) {
  return nonCommercialSourcesAllowed(env) ? [] : NONCOMMERCIAL_SOURCES.map((source) => source.id);
}

/**
 * Whether the proxy may fetch `id`. A source that is not on the list is never
 * this switch's business, and is always on.
 *
 * @param {string} id
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
export function isSourceOn(id, env = serverEnv()) {
  return !KNOWN_IDS.has(id) || nonCommercialSourcesAllowed(env);
}

/**
 * The page's side: the ids a `/api/trial` answer says are off. A missing,
 * failed or malformed answer is an empty set — the clone's behaviour — and an
 * id this build does not know is ignored.
 *
 * @param {unknown} probe The `/api/trial` body, or null.
 * @returns {Set<string>}
 */
export function offSourcesFromProbe(probe) {
  const listed = probe && typeof probe === 'object' && Array.isArray(probe.sourcesOff) ? probe.sourcesOff : [];
  return new Set(listed.filter((id) => typeof id === 'string' && KNOWN_IDS.has(id)));
}

/**
 * The credit keys of the given sources, for `withdrawDataCredits`.
 *
 * @param {Iterable<string>} ids
 * @returns {string[]}
 */
export function creditKeysOf(ids) {
  const wanted = new Set(ids);
  return NONCOMMERCIAL_SOURCES.filter((source) => wanted.has(source.id)).flatMap((source) => source.credits);
}

/**
 * The Data Layers rows of the given sources, for `withholdLayers`.
 *
 * @param {Iterable<string>} ids
 * @returns {string[]}
 */
export function layerIdsOf(ids) {
  const wanted = new Set(ids);
  return NONCOMMERCIAL_SOURCES.filter((source) => wanted.has(source.id)).flatMap((source) => source.layers);
}

/** Every layer some source on the list could withhold, whatever this deployment says. */
export const SWITCHABLE_LAYER_IDS = Object.freeze(NONCOMMERCIAL_SOURCES.flatMap((source) => source.layers));
