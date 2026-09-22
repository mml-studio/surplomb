/**
 * @module upstreamPacing
 * @description Paces the server's calls to the free public APIs that publish a
 * per-IP request ceiling. SERVER-ONLY: loaded by `vite.config.js`, never by
 * the page.
 *
 * WHY THE SERVER HAS TO DO THIS. On the hosted site every visitor reaches these
 * services through the proxies in `vite.config.js`, so they all arrive from ONE
 * address. A ceiling written "per IP" is therefore a ceiling for the whole
 * audience, and three people scanning addresses at once are enough to cross
 * Géorisques' one report a second. The publishers answer that with a 429 and,
 * in their own terms, a right to block "abusive" use without notice. The
 * per-visitor limiters next to each route (`makeRateLimiter` in
 * `vite.config.js`) cannot prevent it: they count one visitor's requests over a
 * minute, and the ceiling is about everybody's requests over a second.
 *
 * WHAT IT DOES. Each upstream gets a pacer that spaces departures evenly at
 * {@link PACING_SHARE} of the published rate. Even spacing rather than a burst
 * allowance on purpose: a gateway that meters with a leaky bucket (nginx's
 * `limit_req`, for one) refuses two requests that arrive closer than 1/rate
 * apart even when the second-long total is under the limit, and network jitter
 * can push a burst sent at the end of one second into the next. A call that
 * would wait longer than {@link DEFAULT_MAX_WAIT_MS} is refused at once with a
 * Retry-After instead of joining an ever longer queue, and one visitor may hold
 * only {@link PER_VISITOR_SHARE} of that queue, so a single tab cannot keep
 * everybody else waiting. When the upstream answers 429 anyway, `penalize`
 * stops the pacer for the Retry-After it sent, instead of spending more
 * requests that would lengthen the block.
 *
 * WHAT IT IS NOT. A scheduler, a cache or a retry policy. The routes keep
 * their own caches, coalescing and stale fallbacks; this module only decides
 * when a call may leave, or that it may not.
 */

/** Share of each published ceiling the pacers actually use. */
export const PACING_SHARE = 0.8;

/** Longest a call may queue for its slot before it is refused. */
export const DEFAULT_MAX_WAIT_MS = 5_000;

/** Share of one pacer's queue a single visitor may hold. */
export const PER_VISITOR_SHARE = 0.5;

/** Pause after an upstream 429 that sent no usable Retry-After. */
export const DEFAULT_PENALTY_S = 5;

/** Longest pause an upstream's own Retry-After can impose on a pacer. */
export const MAX_PENALTY_S = 60;

/**
 * The published ceilings, first match wins.
 *
 * Every figure was read at its source on 2026-09-22. The Géoplateforme ones are
 * also sent back live as `ratelimit-limit` response headers (5 on the
 * isochrone, 30 on the WFS, 50 on the geocoder), which is what the pacers would
 * be re-checked against.
 *
 * @type {ReadonlyArray<{
 *   id: string,
 *   hosts: ReadonlyArray<string>,
 *   path: RegExp,
 *   publishedPerSecond: number,
 *   source: string,
 * }>}
 */
export const UPSTREAM_LIMITS = Object.freeze([
  // Géorisques API v1, keyless. The OpenAPI description reads « 1 appel/s pour
  // api/v1/resultats_rapport_risque », « 1 appel/s pour api/v1/rapport_pdf »
  // and « 5 appels/s pour api/v1/** ». The report is paced on its own AND the
  // rest of v1 at 80 % of five, so the two together stay under five a second
  // even if the gateway counts the report inside `api/v1/**` too.
  // https://www.georisques.gouv.fr/doc-api
  // (spec: https://www.georisques.gouv.fr/api/v3/api-docs/georisques-api-v1)
  {
    id: 'georisques-report',
    hosts: Object.freeze(['www.georisques.gouv.fr', 'georisques.gouv.fr']),
    path: /^\/api\/v1\/(resultats_rapport_risque|rapport_pdf)(\/|$)/,
    publishedPerSecond: 1,
    source: 'https://www.georisques.gouv.fr/doc-api',
  },
  {
    id: 'georisques-v1',
    hosts: Object.freeze(['www.georisques.gouv.fr', 'georisques.gouv.fr']),
    path: /^\/api\/v1\//,
    publishedPerSecond: 5,
    source: 'https://www.georisques.gouv.fr/doc-api',
  },
  // cartes.gouv.fr « Limites d'usage des API » (modified 2026-08-07): per IP,
  // « Calcul d'isochrone/isodistance 5 », « WFS 30 », « Géocodage 50 »; over
  // it, an HTML 429 and a five-second block of that API only.
  // https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/limites-d-usage/
  {
    id: 'geoplateforme-isochrone',
    hosts: Object.freeze(['data.geopf.fr']),
    path: /^\/navigation\/isochrone(\/|$)/,
    publishedPerSecond: 5,
    source: 'https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/limites-d-usage/',
  },
  {
    id: 'geoplateforme-wfs',
    hosts: Object.freeze(['data.geopf.fr']),
    path: /^\/wfs(\/|$)/,
    publishedPerSecond: 30,
    source: 'https://cartes.gouv.fr/aide/fr/guides-utilisateur/utiliser-les-services-de-la-geoplateforme/limites-d-usage/',
  },
  // ONE bucket for the Géoplateforme geocoder and the old API Adresse host.
  // The API Adresse page states « 50 appels/IP/seconde », and the old host is
  // now served by the Géoplateforme: measured 2026-09-22, a `/reverse/` there
  // answers `x-infra: gpf`, `ratelimit-limit: 50` and
  // `x-api-new-host: https://data.geopf.fr/geocodage/`. Two buckets would
  // allow twice the ceiling if the two hosts share one counter.
  // https://adresse.data.gouv.fr/outils/api-doc/adresse
  {
    id: 'geoplateforme-geocoding',
    hosts: Object.freeze(['data.geopf.fr']),
    path: /^\/geocodage(\/|$)/,
    publishedPerSecond: 50,
    source: 'https://adresse.data.gouv.fr/outils/api-doc/adresse',
  },
  {
    id: 'geoplateforme-geocoding',
    hosts: Object.freeze(['api-adresse.data.gouv.fr']),
    path: /^\//,
    publishedPerSecond: 50,
    source: 'https://adresse.data.gouv.fr/outils/api-doc/adresse',
  },
  // INSEE Melodi CGU § 4, « Version du 09/07/2024 »: « une limite de 20
  // interrogations par seconde dans le cadre d'une navigation sans
  // identification ». data.gouv.fr's record of the same API and INSEE's own R
  // package say 30 calls a minute instead; measured 2026-09-22, 48 anonymous
  // calls inside a minute all answered 200, so the per-second figure of the
  // CGU is the one enforced today.
  // https://portail-api.insee.fr/catalog/api/a890b735-159c-4c91-90b7-35159c7c9126/doc?page=e58bbbe2-e906-4ac9-8bbb-e2e9069ac9d9
  {
    id: 'insee-melodi',
    hosts: Object.freeze(['api.insee.fr']),
    path: /^\/melodi\//,
    publishedPerSecond: 20,
    source: 'https://portail-api.insee.fr/catalog/api/a890b735-159c-4c91-90b7-35159c7c9126/doc?page=e58bbbe2-e906-4ac9-8bbb-e2e9069ac9d9',
  },
  // OSMF Nominatim usage policy: « an absolute maximum of 1 request per
  // second », for the whole application — the search box and the cockpit's
  // reverse geocode share this one pacer.
  // https://operations.osmfoundation.org/policies/nominatim/
  {
    id: 'nominatim',
    hosts: Object.freeze(['nominatim.openstreetmap.org']),
    path: /^\//,
    publishedPerSecond: 1,
    source: 'https://operations.osmfoundation.org/policies/nominatim/',
  },
  // FOSSGIS routing servers: « One request per second max », « No scraping,
  // no heavy usage ». Every profile on the host shares it: `/api/route` and
  // the cycling isochrone's `/table` both land here.
  // https://routing.openstreetmap.de/about.html
  {
    id: 'fossgis-osrm',
    // i18n-ignore-next-line — a host name; the scanner reads its `.de` as French.
    hosts: Object.freeze(['routing.openstreetmap.de']),
    path: /^\//,
    publishedPerSecond: 1,
    source: 'https://routing.openstreetmap.de/about.html',
  },
]);

/**
 * Milliseconds between two departures for a published per-second ceiling.
 * @param {number} publishedPerSecond
 * @param {number} [share=PACING_SHARE]
 * @returns {number}
 */
export function pacingIntervalMs(publishedPerSecond, share = PACING_SHARE) {
  if (!(publishedPerSecond > 0) || !(share > 0)) {
    throw new Error('upstreamPacing: a ceiling and a share must both be positive');
  }
  return Math.ceil(1000 / (publishedPerSecond * share));
}

/**
 * The first ceiling a URL falls under, or null when its host publishes none
 * this module knows.
 * @param {string|URL} url
 * @param {typeof UPSTREAM_LIMITS} [limits=UPSTREAM_LIMITS]
 * @returns {?(typeof UPSTREAM_LIMITS)[number]}
 */
export function upstreamLimitFor(url, limits = UPSTREAM_LIMITS) {
  let parsed;
  try {
    parsed = url instanceof URL ? url : new URL(String(url));
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  return limits.find((limit) => limit.hosts.includes(host) && limit.path.test(parsed.pathname)) ?? null;
}

/** Whole seconds, at least one, for a Retry-After header. */
function retryAfterSeconds(ms) {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * One upstream's pacer: evenly spaced departures, a bounded queue, and a cap
 * on one visitor's share of it.
 *
 * `reserve` is synchronous and books the slot; the caller sleeps until it.
 * Splitting the two is what lets a test check every timing decision without
 * waiting for a single one.
 *
 * @param {object} options
 * @param {number} options.intervalMs Minimum gap between two departures.
 * @param {number} [options.maxWaitMs=DEFAULT_MAX_WAIT_MS] Longest acceptable queue.
 * @param {number} [options.maxPendingPerKey] Departures one key may have booked
 *   and not yet reached. Derived from {@link PER_VISITOR_SHARE} when omitted.
 * @param {() => number} [options.now=Date.now]
 */
export function createPacer({
  intervalMs,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  maxPendingPerKey,
  now = Date.now,
}) {
  if (!(intervalMs > 0)) throw new Error('upstreamPacing: intervalMs must be positive');
  const perKey = maxPendingPerKey
    ?? Math.max(1, Math.floor((maxWaitMs / intervalMs) * PER_VISITOR_SHARE));
  /** Earliest time the next call may leave. */
  let nextAt = 0;
  /** @type {Map<string, number[]>} key -> booked departures, ascending. */
  const pendingByKey = new Map();

  /** Forget departures that have already happened. */
  function prune(t) {
    for (const [key, times] of pendingByKey) {
      while (times.length && times[0] <= t) times.shift();
      if (!times.length) pendingByKey.delete(key);
    }
  }

  return {
    intervalMs,
    maxWaitMs,
    maxPendingPerKey: perKey,
    /**
     * Book the next departure.
     * @param {?string} [key=null] The visitor; null for the server's own work,
     *   which is never capped (it is already coalesced and cached).
     * @returns {{ok: true, waitMs: number} | {ok: false, reason: 'queue'|'visitor', retryAfterSec: number}}
     */
    reserve(key = null) {
      const t = now();
      prune(t);
      const departAt = Math.max(t, nextAt);
      const waitMs = departAt - t;
      if (waitMs > maxWaitMs) {
        return { ok: false, reason: 'queue', retryAfterSec: retryAfterSeconds(waitMs - maxWaitMs) };
      }
      if (key !== null && key !== undefined) {
        const mine = pendingByKey.get(key);
        if (mine && mine.length >= perKey) {
          return { ok: false, reason: 'visitor', retryAfterSec: retryAfterSeconds(mine[0] - t) };
        }
        if (departAt > t) {
          if (mine) mine.push(departAt);
          else pendingByKey.set(key, [departAt]);
        }
      }
      nextAt = departAt + intervalMs;
      return { ok: true, waitMs };
    },
    /** Let nothing leave before `untilMs` (epoch ms). Never shortens a wait. */
    pauseUntil(untilMs) {
      if (Number.isFinite(untilMs)) nextAt = Math.max(nextAt, untilMs);
    },
    /** Milliseconds a call booked now would wait. */
    queuedMs() {
      return Math.max(0, nextAt - now());
    },
  };
}

/**
 * Parse an upstream's Retry-After into a bounded pause, in seconds.
 * Accepts delta-seconds and HTTP dates; anything else is the default.
 * @param {?string} header
 * @param {() => number} [now=Date.now]
 * @returns {number}
 */
export function penaltySeconds(header, now = Date.now) {
  const raw = String(header ?? '').trim();
  let seconds = null;
  if (/^\d+$/.test(raw)) {
    seconds = Number(raw);
  } else if (raw) {
    const at = Date.parse(raw);
    if (Number.isFinite(at)) seconds = Math.ceil((at - now()) / 1000);
  }
  if (!Number.isFinite(seconds) || seconds < 1) return DEFAULT_PENALTY_S;
  return Math.min(MAX_PENALTY_S, seconds);
}

/**
 * Every pacer, keyed by URL.
 *
 * @param {object} [options]
 * @param {typeof UPSTREAM_LIMITS} [options.limits=UPSTREAM_LIMITS]
 * @param {number} [options.maxWaitMs=DEFAULT_MAX_WAIT_MS]
 * @param {() => number} [options.now=Date.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 */
export function createUpstreamPacing({
  limits = UPSTREAM_LIMITS,
  maxWaitMs = DEFAULT_MAX_WAIT_MS,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }),
} = {}) {
  /** @type {Map<string, ReturnType<typeof createPacer>>} */
  const pacers = new Map();
  for (const limit of limits) {
    if (pacers.has(limit.id)) continue; // one bucket may be reached through two hosts
    pacers.set(limit.id, createPacer({
      intervalMs: pacingIntervalMs(limit.publishedPerSecond),
      maxWaitMs,
      now,
    }));
  }

  return {
    /** The pacer behind an upstream id, for inspection. */
    pacer(id) {
      return pacers.get(id) ?? null;
    },
    /**
     * Wait for `url`'s slot. A URL with no published ceiling goes at once.
     * @param {string|URL} url
     * @param {{key?: ?string}} [options]
     * @returns {Promise<{ok: true, upstream: ?string, waitMs: number}
     *   | {ok: false, upstream: string, reason: 'queue'|'visitor', retryAfterSec: number}>}
     */
    async acquire(url, { key = null } = {}) {
      const limit = upstreamLimitFor(url, limits);
      if (!limit) return { ok: true, upstream: null, waitMs: 0 };
      const verdict = pacers.get(limit.id).reserve(key);
      if (!verdict.ok) return { ...verdict, upstream: limit.id };
      if (verdict.waitMs > 0) await sleep(verdict.waitMs);
      return { ok: true, upstream: limit.id, waitMs: verdict.waitMs };
    },
    /**
     * The upstream said 429 anyway: stop its pacer for as long as it asked.
     * @param {string|URL} url
     * @param {?string} retryAfterHeader
     * @returns {?number} The pause in seconds, or null for an unpaced URL.
     */
    penalize(url, retryAfterHeader) {
      const limit = upstreamLimitFor(url, limits);
      if (!limit) return null;
      const seconds = penaltySeconds(retryAfterHeader, now);
      pacers.get(limit.id).pauseUntil(now() + seconds * 1000);
      return seconds;
    },
  };
}

/**
 * Raised where a paced call is refused and the caller's contract is to throw.
 * Carries what a route needs to answer 503 with a Retry-After.
 */
export class UpstreamBusyError extends Error {
  /**
   * @param {string} upstream
   * @param {number} retryAfterSec
   */
  constructor(upstream, retryAfterSec) {
    super(`${upstream} is paced: try again in ${retryAfterSec} s`);
    this.name = 'UpstreamBusyError';
    this.upstream = upstream;
    this.retryAfterSec = retryAfterSec;
  }
}
