/**
 * `?q=` — the showcase form's one parameter, read once by the cockpit.
 *
 * The form is a native GET to `/`, so it works without JavaScript and the
 * cockpit is what answers it: `src/vitrine/gate.js` sends any `?q=` arrival to
 * the cockpit, and the cockpit geocodes the text with the search box's own
 * path (`StyleManager#flyToAddress`). An empty `q` is the initial view.
 *
 * `q` never survives its reading. It lives in `location.search`, so the share
 * writer (a whitelist of hash keys, `ShareLinkManager#_buildHashParams`) could
 * not copy it into a link anyway — but that writer calls
 * `history.replaceState(null, '', '#…')`, which keeps the current query
 * string, and an address bar reading `/?q=12 rue …#v=2&…` would hand the typed
 * address to whoever receives the link. So it is removed at once, the same
 * doctrine as `?perf=` and `?input=` never being written into a link.
 *
 * @module vitrine/query
 */

/**
 * Read `q` and strip it from the address.
 * @param {{location?: Location, history?: History}} [refs]
 * @returns {?string} the trimmed text, `''` for an empty field, null when absent.
 */
export function takeInitialQuery({
  location = globalThis.location,
  history = globalThis.history,
} = {}) {
  let url;
  try {
    url = new URL(location.href);
  } catch {
    return null;
  }
  if (!url.searchParams.has('q')) return null;
  const query = String(url.searchParams.get('q') || '').trim().slice(0, 200);
  url.searchParams.delete('q');
  try {
    history?.replaceState?.(history.state ?? null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // A sandboxed frame can refuse; the query is still answered.
  }
  return query;
}
