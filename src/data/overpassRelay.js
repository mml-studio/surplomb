/**
 * @file The contract between this server and its Overpass egress relay.
 *
 * THE COST THIS ANSWERS. Measured 2026-09-16 from inside the `gev` container on
 * the Hostinger VPS, the same Marseille road query per host:
 *
 *   overpass-api.de        connection REFUSED in 193 ms   (both facades, v4 and v6)
 *   lz4.overpass-api.de    connection REFUSED in  72 ms
 *   overpass.private.coffee  200 in 38 591 ms, data stamped 2026-07-15
 *   maps.mail.ru           504 in 641 ms
 *
 * A refusal in under 200 ms on every address of a host is a ban on our IP, not
 * an outage: from a Mac on another network the same query answered 200 in
 * 0.20 s at the same second. The two banned addresses are 72.61.194.137 and
 * 2a02:4780:28:f502::1, and they are the box's ONLY egress — so no mirror order
 * and no backoff can reach FOSSGIS from there. The one lever left is to leave
 * by a different address.
 *
 * WHAT THIS IS NOT. It is not a way to be harder to identify. The relay carries
 * this app's real `User-Agent` and its contact URL, adds a header naming itself
 * as the relay, and is rate-capped below what one honest client needs — so
 * FOSSGIS can see exactly who is calling and refuse the relay in one rule if
 * they would rather we stayed blocked. The volume that earned the ban
 * (~4 300 POST/hour, client and server re-triggering each other) was fixed in
 * `main@dcb881bb` before this existed; measured after, the same session costs
 * 26. The unblock request goes out on that evidence, and when it lands this
 * relay should be switched off by clearing `GEV_OVERPASS_RELAY_URL` — a direct
 * request is one hop cheaper and one dependency lighter.
 *
 * WHY A SHARED MODULE RATHER THAN TWO COPIES. Both ends of this hop make the
 * same four decisions — which path, which header, which token, which upstream —
 * and they are deployed separately (the server by the VPS timer, the worker by
 * `wrangler deploy`). Two copies would drift on the first rename and fail as a
 * 401 that looks like a bad secret. The worker imports this file directly.
 *
 * Clock-free, I/O-free and environment-free, like `overpassMirrors.js`.
 *
 * @module data/overpassRelay
 */

/** Path the relay answers on, mirroring the Overpass API it stands in front of. */
export const OVERPASS_RELAY_PATH = '/api/interpreter';

/**
 * Header carrying the shared secret.
 *
 * Deliberately NOT `Authorization`. Cloudflare Access, the tunnel and several
 * of this account's existing rules all read that header, and a relay whose
 * auth can be eaten by a zone-level rule fails as an unexplained 403 on the
 * one path that has no other way out.
 */
export const OVERPASS_RELAY_TOKEN_HEADER = 'x-surplomb-relay-token';

/** Header the relay stamps on the way out, so the upstream can see the hop. */
export const OVERPASS_RELAY_MARK_HEADER = 'x-surplomb-relay';

/**
 * Where the relay forwards to.
 *
 * ONE upstream, and the one that bans us. A relay that rotated mirrors would
 * duplicate `overpassMirrors.js` in a place with no tests and no cache, and it
 * would hide which host actually answered — the server's rotation already owns
 * that decision and needs this hop to be a plain pipe with a known other end.
 */
export const OVERPASS_RELAY_UPSTREAM = 'https://overpass-api.de/api/interpreter';

/**
 * Largest body the relay will carry, in bytes.
 *
 * Overpass QL is text and this app's longest query — the seven-class road box
 * with an `is_in` pivot — is under 2 KB. 16 KB is eight times the worst case
 * observed and still small enough that the relay cannot be turned into a file
 * uploader by anyone who learns the token.
 */
export const OVERPASS_RELAY_MAX_BODY_BYTES = 16_384;

/**
 * Turn whatever an operator put in `GEV_OVERPASS_RELAY_URL` into the endpoint
 * the rotation calls.
 *
 * Accepts the worker's bare origin (`https://x.workers.dev`), the origin with a
 * trailing slash, or the full interpreter path — because all three are what a
 * `wrangler deploy` prints or what a hand-typed value looks like, and getting
 * this wrong shows up as a 404 from Cloudflare that reads like a dead mirror.
 *
 * @param {string|null|undefined} base Configured value, any of the three shapes.
 * @returns {string|null} Absolute interpreter URL, or null when unconfigured or
 *   unparseable — an unusable value must leave the rotation EXACTLY as it was,
 *   never insert a broken first mirror.
 */
export function resolveRelayEndpoint(base) {
  const raw = String(base ?? '').trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path.endsWith(OVERPASS_RELAY_PATH) ? path : `${path}${OVERPASS_RELAY_PATH}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

/**
 * The rotation list, with the relay in front when it is usable.
 *
 * FIRST, not last, and that is not a latency sort — the thing
 * `overpassMirrors.js` forbids. It is an operator declaring which egress works:
 * configuring a relay at all means the direct one is blocked, so ranking it
 * behind the hosts that refuse us would spend the whole 30 s rotation budget
 * learning that again (two refusals, then private.coffee's 12 s leash against
 * its measured 38.6 s). Clearing the variable puts the list back as it was.
 *
 * Both a URL and a token are required. A relay without its secret answers 401
 * to every request, which would be a guaranteed-dead first mirror — worse than
 * no relay, because it costs an attempt and parks a group.
 *
 * @param {readonly string[]} endpoints Mirrors, in preference order.
 * @param {Object} [options]
 * @param {string|null} [options.url] Configured relay base.
 * @param {string|null} [options.token] Shared secret.
 * @returns {string[]} A new list; the input is never mutated.
 */
export function withOverpassRelay(endpoints, { url = null, token = null } = {}) {
  const list = [...(endpoints || [])];
  const endpoint = resolveRelayEndpoint(url);
  if (!endpoint || !String(token ?? '').trim()) return list;
  return [endpoint, ...list.filter((candidate) => candidate !== endpoint)];
}

/**
 * Headers for one upstream request.
 *
 * The `User-Agent` is the same on every endpoint INCLUDING the relay: the OSM
 * convention is `app/version (+contact)` and the whole point of the relay
 * carrying it is that the operators on the other end can still tell who is
 * calling and reach us. The token rides only on the relay — sending a secret to
 * a public mirror because a URL comparison was sloppy is the failure this
 * function exists to make impossible.
 *
 * @param {string} endpoint Mirror about to be called.
 * @param {Object} options
 * @param {string} options.userAgent Agent string for every Overpass request.
 * @param {string|null} [options.relayEndpoint] Resolved relay URL, if any.
 * @param {string|null} [options.relayToken] Shared secret, if any.
 * @returns {Record<string, string>}
 */
export function overpassRequestHeaders(endpoint, { userAgent, relayEndpoint = null, relayToken = null }) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': userAgent,
  };
  if (relayEndpoint && relayToken && endpoint === relayEndpoint) {
    headers[OVERPASS_RELAY_TOKEN_HEADER] = relayToken;
  }
  return headers;
}

/**
 * What the relay should do with an inbound request, before it touches a socket.
 *
 * Ordered so that the cheapest refusal comes first and so that an ATTACKER
 * learns as little as possible: a wrong method and a wrong path are answered
 * before the token is compared at all, and a missing server-side secret is a
 * 503 rather than a 401, because "this relay is misconfigured" and "your token
 * is wrong" are different problems and only one of them is the caller's.
 *
 * @param {Object} request
 * @param {string} request.method HTTP method.
 * @param {string} request.path Request path.
 * @param {string|null} request.token Token the caller presented.
 * @param {number|null} [request.bodyBytes] Declared body length, when known.
 * @param {string|null} expectedToken Secret configured on the relay.
 * @returns {{ok: true} | {ok: false, status: number, reason: string}}
 */
export function relayVerdict({ method, path, token, bodyBytes = null }, expectedToken) {
  if (String(method || '').toUpperCase() !== 'POST') {
    return { ok: false, status: 405, reason: 'method' };
  }
  if (String(path || '').replace(/\/+$/, '') !== OVERPASS_RELAY_PATH) {
    return { ok: false, status: 404, reason: 'path' };
  }
  const expected = String(expectedToken ?? '');
  if (!expected) return { ok: false, status: 503, reason: 'unconfigured' };
  if (!constantTimeEquals(String(token ?? ''), expected)) {
    return { ok: false, status: 401, reason: 'token' };
  }
  if (Number.isFinite(bodyBytes) && bodyBytes > OVERPASS_RELAY_MAX_BODY_BYTES) {
    return { ok: false, status: 413, reason: 'body' };
  }
  return { ok: true };
}

/**
 * Compare two secrets without leaking their length through timing.
 *
 * A plain `===` on strings short-circuits at the first differing byte, which
 * over enough requests tells a caller how much of the token they have right.
 * The relay is a public URL, so that is a real channel and not a theoretical
 * one. The length difference is XOR-ed into the accumulator rather than
 * returned early, so a wrong length is indistinguishable from a wrong byte and
 * `diff === 0` already implies equal lengths.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function constantTimeEquals(a, b) {
  let diff = a.length ^ b.length;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
