/**
 * @file Surplomb — Overpass egress relay (Cloudflare Worker).
 *
 * WHY THIS EXISTS. The VPS that serves surplomb.app is banned by
 * overpass-api.de: measured 2026-09-16 from inside the container, both FOSSGIS
 * facades refuse the TCP connection in under 200 ms on every address, v4 and
 * v6, while the same query from another network answers 200 in 0.20 s. The box
 * has one egress address, so the only lever left is to leave by another one.
 * The whole reasoning, and the conditions under which this should be switched
 * OFF again, are in `src/data/overpassRelay.js`.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *  - It does not anonymise us. The upstream request carries this app's real
 *    `User-Agent` with its contact URL, plus a header naming the hop, so FOSSGIS
 *    can identify and refuse the relay with a single rule.
 *  - It does not rotate mirrors. One upstream, so the server's own rotation
 *    (`overpassMirrors.js`) stays the only place that decides who to ask.
 *  - It does not cache. The server holds 24 h in memory and 7 to 30 days on
 *    disk; a second, shorter, invisible cache here would only make a stale
 *    answer harder to explain.
 *
 * Deploy:  see README.md in this directory.
 */

import {
  OVERPASS_RELAY_MARK_HEADER,
  OVERPASS_RELAY_MAX_BODY_BYTES,
  OVERPASS_RELAY_TOKEN_HEADER,
  OVERPASS_RELAY_UPSTREAM,
  relayVerdict,
} from '../../../src/data/overpassRelay.js';

/**
 * Agent string, kept BYTE-IDENTICAL to `OVERPASS_USER_AGENT` in vite.config.js.
 *
 * Not imported: that constant lives in a 27 000-line Vite config that pulls in
 * Node builtins, and bundling it into a Worker to read one string would drag
 * the whole server in. The value is duplicated on purpose and the duplication
 * is cheap to check — `grep OVERPASS_USER_AGENT vite.config.js`. Getting it
 * wrong is not cosmetic: measured 2026-09-01, an agent string FOSSGIS dislikes
 * drew a bare 406 on 8 of 11 attempts.
 */
const USER_AGENT = 'surplomb/1.0 (+https://github.com/mml-studio/surplomb)';

/**
 * Longest this relay waits on FOSSGIS before giving up.
 *
 * Under the server's own per-mirror leash (22 s at rank 0) so that the client
 * sees the relay's own verdict rather than an abort, and under the Worker
 * platform's own wall-clock ceiling. A relay that outlives the caller waiting
 * on it just burns quota on an answer nobody will read.
 */
const UPSTREAM_TIMEOUT_MS = 20_000;

export default {
  /**
   * @param {Request} request
   * @param {{RELAY_TOKEN?: string, OVERPASS_LIMITER?: {limit: (o: {key: string}) => Promise<{success: boolean}>}}} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const declared = Number(request.headers.get('content-length'));
    const verdict = relayVerdict(
      {
        method: request.method,
        path: url.pathname,
        token: request.headers.get(OVERPASS_RELAY_TOKEN_HEADER),
        bodyBytes: Number.isFinite(declared) ? declared : null,
      },
      env.RELAY_TOKEN,
    );
    if (!verdict.ok) return refuse(verdict.status, verdict.reason);

    // A cap that survives a regression in the CLIENT. The ban was earned by
    // ~4 300 POST/hour from a bug where the browser and the server re-triggered
    // each other; the fix shipped, and this is what stops the next one from
    // spending the goodwill of an unblock. One honest session costs 26.
    if (env.OVERPASS_LIMITER) {
      const { success } = await env.OVERPASS_LIMITER.limit({ key: 'overpass' });
      if (!success) return refuse(429, 'relay-rate-limit');
    }

    // Read the body OURSELVES rather than streaming it through. `content-length`
    // is a claim, not a measurement, and a chunked request carries none at all —
    // so the size cap above is only real once the bytes are in hand. Buffered as
    // BYTES, not text: `String.length` counts UTF-16 code units, which is under
    // the byte count for anything non-ASCII and would let a cap stated in bytes
    // be walked past by a body full of them.
    const body = await request.arrayBuffer();
    if (body.byteLength > OVERPASS_RELAY_MAX_BODY_BYTES) return refuse(413, 'body');

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(OVERPASS_RELAY_UPSTREAM, {
        method: 'POST',
        headers: {
          'Content-Type': request.headers.get('content-type') || 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          [OVERPASS_RELAY_MARK_HEADER]: 'surplomb.app',
        },
        body,
        signal: abort.signal,
      });
      // Status and body pass through UNTOUCHED, 429 and 504 included. The
      // server's rotation reads the status to decide whether to back off, park
      // the host, or surface a malformed query — flattening any of that here
      // would make every upstream verdict look like the same relay failure.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-store',
          [OVERPASS_RELAY_MARK_HEADER]: 'surplomb.app',
        },
      });
    } catch (error) {
      // 502, not 504: the caller's own rotation treats both as "this host did
      // not answer", and 502 says the failure was on the far side of the hop
      // rather than in the relay's own budget.
      return refuse(502, abort.signal.aborted ? 'upstream-timeout' : 'upstream-unreachable');
    } finally {
      clearTimeout(timer);
    }
  },
};

/**
 * A refusal that says what it is in a header and nothing in its body.
 *
 * The reason rides in a header rather than the body because the server caches
 * and serves Overpass bodies: a relay explaining itself in JSON would end up in
 * the disk cache looking like an Overpass answer with no elements.
 *
 * @param {number} status
 * @param {string} reason
 * @returns {Response}
 */
function refuse(status, reason) {
  return new Response(null, {
    status,
    headers: {
      [OVERPASS_RELAY_MARK_HEADER]: `refused:${reason}`,
      'Cache-Control': 'no-store',
    },
  });
}
