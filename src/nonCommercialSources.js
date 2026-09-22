// Sources whose terms allow non-commercial use only, and the one switch that
// turns them all off.
//
// A clone is its owner's own non-commercial use, and keeps every source below.
// surplomb.app is run by a company, so it is a commercial deployment: it sets
// `GEV_NONCOMMERCIAL_SOURCES=off`, and each source listed here goes dark there.
// The server stops asking it; the page stops drawing the control, the readings
// and the attribution that belonged to it.
//
// The switch is read per request, like every GEV_* runtime switch; the page
// learns it from the `/api/trial` read it already makes at boot
// (src/trialProbe.js), so it costs no request of its own.
//
// Adding a source is one line in NONCOMMERCIAL_SOURCES, then honouring it
// where the source is fetched (`isSourceOn(id)` in the proxy) and where it is
// drawn (`offSourcesFromProbe` in the page). Its credits are withdrawn from
// the "Data attribution" popover by the entry itself.

/** The environment variable. Unset, or `on`, keeps the sources. */
export const NONCOMMERCIAL_SOURCES_VAR = 'GEV_NONCOMMERCIAL_SOURCES';

/**
 * Every source the switch turns off.
 *
 * - `id` is what the server reports in `sourcesOff` (`/api/trial`, `/healthz`).
 * - `terms` is the clause that makes it non-commercial.
 * - `credits` are the keys of its entries in src/data/dataCredits.js.
 *
 * @type {ReadonlyArray<Readonly<{id: string, name: string, terms: string, credits: readonly string[]}>>}
 */
export const NONCOMMERCIAL_SOURCES = Object.freeze([
  // "You may only use the free API services for non-commercial purposes."
  { id: 'open-meteo', name: 'Open-Meteo', terms: 'https://open-meteo.com/en/terms', credits: ['open-meteo'] },
].map((source) => Object.freeze({ ...source, credits: Object.freeze([...source.credits]) })));

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
