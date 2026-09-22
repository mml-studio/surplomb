// Where the page asks for the TeleGeography cable map, and which files that
// door opens onto. Shared by the layer (src/data/telegeographySubmarineCables.js)
// and the server route in vite.config.js; dependency-free so both can import it.
//
// WHY A ROUTE AND NOT AN ASSET. The two GeoJSON files used to be referenced as
// `new URL('./local_data/…json', import.meta.url)`, which makes Vite copy them
// into `dist/assets/` under a hashed name — and the static server hands those
// to anyone who asks, whatever the deployment. The data is CC BY-NC-SA 3.0, so
// a commercial host may not serve it, and a file in `dist/` is a file it
// serves. Behind a route, the server can refuse it where
// GEV_NONCOMMERCIAL_SOURCES=off (src/nonCommercialSources.js) and still read it
// from the checkout everywhere else: no network, no key, as before.

/** The route prefix. Each file below is `${SUBMARINE_CABLE_ROUTE}/<file>`. */
export const SUBMARINE_CABLE_ROUTE = '/api/submarine-cables';

/** The two files the route serves, by role. Anything else answers 404. */
export const SUBMARINE_CABLE_FILES = Object.freeze({
  cables: 'cable-geo.json',
  landingPoints: 'landing-point-geo.json',
});

/** Where they live in the checkout, relative to the repository root. */
export const SUBMARINE_CABLE_DATA_DIR = Object.freeze(['src', 'data', 'local_data', 'telegeography_submarine_cables']);

/**
 * The URL the page fetches one file from.
 * @param {string} file One of SUBMARINE_CABLE_FILES.
 * @returns {string}
 */
export function submarineCableUrl(file) {
  return `${SUBMARINE_CABLE_ROUTE}/${file}`;
}
