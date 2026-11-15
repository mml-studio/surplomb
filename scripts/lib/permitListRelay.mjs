/**
 * The relay some municipal sites are read through.
 *
 * WHY. About ten small towns' WordPress sites — nine on one host family that
 * silently drops every connection from the staging box's address, and Nevoy,
 * which answers it 403 whatever the user agent — serve the same pages normally
 * to another network. Their permits are public legal postings the town must
 * display, so the sweep keeps reading them, once a night at its usual pace,
 * through a small HTTP relay on that other network (docs/DEPLOY.md, "Towns
 * read through a relay").
 *
 * A city opts in with `source.relay: true` in its registry entry. When
 * `PERMIT_LIST_RELAY` names the relay (`http://<host>:<port>`), a GET to such a
 * city's host goes to `<relay>/fetch?url=<the address>` instead; unset — dev,
 * CI, a self-hosted instance — every request goes direct, as before. The relay
 * follows redirects, passes the status, `Content-Type`, `ETag`,
 * `Last-Modified` and `Retry-After` through, and forwards `Accept`,
 * `User-Agent`, `If-None-Match` and `If-Modified-Since`, so the readers see
 * the site's own answer. Pacing, the user agent and the robots.txt check stay
 * on this side, keyed on the town's address, not the relay's.
 *
 * A failure of the RELAY ITSELF — a host it does not serve, a site it could not
 * reach, a body over its ceiling — carries an `X-Relay-Error` header and is
 * thrown here, so the caller treats it like a site that did not answer: tried
 * again the next night, never cached as the site's refusal (a 5xx robots.txt
 * would otherwise read as "refuses all" for a day).
 */

/** The header the relay marks its own failures with. */
export const PERMIT_LIST_RELAY_ERROR_HEADER = 'x-relay-error';

/**
 * The relay's base address from `PERMIT_LIST_RELAY`, or null: an http(s) URL,
 * without its query, hash or trailing slash.
 *
 * @param {?string} value
 * @returns {?string}
 */
export function resolvePermitListRelay(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.search = '';
  url.hash = '';
  return url.href.replace(/\/+$/, '');
}

/**
 * Every host a city flagged `source.relay` is read from: its page's and, for a
 * WordPress site whose API lives elsewhere, its `wpBase`'s.
 *
 * @param {Iterable<{page: string, source?: {relay?: boolean, wpBase?: string}}>} cities
 * @returns {Set<string>}
 */
export function permitListRelayHosts(cities) {
  const hosts = new Set();
  for (const city of cities) {
    if (city.source?.relay !== true) continue;
    for (const address of [city.page, city.source.wpBase]) {
      if (address) hosts.add(new URL(address).hostname);
    }
  }
  return hosts;
}

/**
 * Where a request is sent: the relay's address for a GET to a relayed host,
 * the address itself otherwise.
 *
 * @param {string} url
 * @param {{method?: string}} init
 * @param {{relay: ?string, hosts: Set<string>}} options
 * @returns {string}
 */
export function permitListRelayTarget(url, init, { relay, hosts }) {
  if (!relay) return url;
  if (init?.method && init.method.toUpperCase() !== 'GET') return url;
  if (!hosts.has(new URL(url).hostname)) return url;
  return `${relay}/fetch?${new URLSearchParams({ url })}`;
}

/**
 * `send` (a `fetch`), with the relayed hosts' GETs sent through the relay.
 * Returns `send` itself when no relay is configured or no city asks for one.
 *
 * @param {typeof fetch} send
 * @param {{relay?: ?string, cities: Iterable<object>}} options `relay` is the
 *   raw `PERMIT_LIST_RELAY`.
 * @returns {typeof fetch}
 */
export function permitListRelayFetch(send, { relay, cities }) {
  const base = resolvePermitListRelay(relay);
  const hosts = permitListRelayHosts(cities);
  if (!base || !hosts.size) return send;
  return async (url, init = {}) => {
    const target = permitListRelayTarget(url, init, { relay: base, hosts });
    if (target === url) return send(url, init);
    const response = await send(target, init);
    const failure = response?.headers?.get?.(PERMIT_LIST_RELAY_ERROR_HEADER);
    if (!failure) return response;
    await response.body?.cancel?.().catch?.(() => {});
    throw new Error(`relay: ${failure} (HTTP ${response.status})`);
  };
}
