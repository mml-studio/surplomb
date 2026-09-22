/**
 * @module adsbLolFeed
 * @description Every request the server makes to api.adsb.lol, paced as one
 * queue, and the four circles that cover metropolitan France. SERVER-ONLY:
 * loaded by `vite.config.js`, never by the page.
 *
 * WHY ONE QUEUE. adsb.lol's API has no published quota, but it refuses bursts:
 * measured 2026-09-22 from one address, three calls 1.7 s apart passed and the
 * fourth and fifth answered 429 (nginx); calls 8 s apart failed one in four;
 * calls 20 s apart passed 12 out of 12. That fits a limiter of about three
 * requests a minute per IP with a burst of two. Every visitor of the hosted
 * site reaches adsb.lol from the server's single address, so the ceiling is
 * the whole audience's, and the civil flights, the military layer and the
 * regional circles all spend it. Before this module each of them fetched on
 * its own 12 s cache, and one visitor with both layers on already asked four
 * times a minute.
 *
 * WHAT IT DOES. One departure at a time, at least {@link ADSBLOL_MIN_GAP_MS}
 * apart, whatever asks. A route handler says what it WANTS (`want`) and reads
 * the newest answer on hand; it only waits (`next`) when it has nothing at
 * all to show. The queue then serves whoever is waiting first, then whatever
 * it has never fetched, then the oldest answer. A job nobody has asked for in
 * {@link ADSBLOL_WANT_TTL_MS} stops being refreshed, so with nobody watching
 * the server sends nothing. A 429 in spite of all that pauses the queue for
 * {@link ADSBLOL_429_PAUSE_MS}.
 *
 * WHAT A VISITOR GETS FOR IT. Each answer is shared by everybody who wants the
 * same circle, so the cost is set by how many DIFFERENT circles are wanted,
 * not by how many people look at them: France is four circles, refreshed in
 * turn, each every 80 s while nothing else is wanted.
 */

import { readResponseTextCapped } from './data/httpCapped.js';
import { normalizeAdsbLolPointResponse } from './data/adsbLolFallback.js';

/** The API's own ceiling for a point query, in nautical miles. */
export const ADSBLOL_RADIUS_NM = 250;

/** Shortest spacing between two api.adsb.lol requests from this server. */
export const ADSBLOL_MIN_GAP_MS = 20_000;

/** A job nobody asked for in this long stops being refreshed (2.5 client polls). */
export const ADSBLOL_WANT_TTL_MS = 75_000;

/** Pause after a 429 in spite of the pacing. */
export const ADSBLOL_429_PAUSE_MS = 60_000;

/**
 * An answer older than this is never drawn: it is what is left when adsb.lol
 * has been unreachable that long.
 */
export const ADSBLOL_RECORD_MAX_AGE_MS = 10 * 60_000;

/**
 * An answer older than this — or than one and a half rounds of the queue,
 * whichever is longer — was not being refreshed: the queue went idle because
 * nobody was looking. The first request after that waits for a fresh answer
 * (under a second when the queue is idle) rather than open on a map several
 * minutes old, and falls back to the old one only if the fresh one fails.
 */
export const ADSBLOL_SERVE_MIN_AGE_MS = 150_000;

/** Upstream request timeout. */
export const ADSBLOL_TIMEOUT_MS = 10_000;

/** Largest body read from a point query (a 250 NM circle over Europe is ~1 MB). */
export const ADSBLOL_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const USER_AGENT = 'surplomb-adsblol/1.0 (+https://surplomb.app)';

/**
 * Metropolitan France and Corsica, with the margin a view from over the border
 * still reads as "France": 41.3–51.1 N, 5.2 W–9.6 E.
 */
export const FRANCE_BBOX = Object.freeze({ south: 41.3, west: -5.2, north: 51.1, east: 9.6 });

/**
 * Four 250 NM circles centred on the quarters of {@link FRANCE_BBOX}. The
 * farthest corner of a quarter is 412 km from its centre, inside the 463 km
 * radius, so the four together cover every point of the box (the unit test
 * walks it on a 0.1° grid). Over the box they also reach the Channel, the
 * Benelux, Switzerland, northern Italy and northern Spain.
 */
export const FRANCE_CELLS = Object.freeze([
  Object.freeze({ key: 'fr-nw', lat: 48.65, lon: -1.5 }),
  Object.freeze({ key: 'fr-ne', lat: 48.65, lon: 5.9 }),
  Object.freeze({ key: 'fr-sw', lat: 43.75, lon: -1.5 }),
  Object.freeze({ key: 'fr-se', lat: 43.75, lon: 5.9 }),
]);

/** @param {number} lat @param {number} lon */
export function inFranceZone(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= FRANCE_BBOX.south && lat <= FRANCE_BBOX.north
    && lon >= FRANCE_BBOX.west && lon <= FRANCE_BBOX.east;
}

/** Great-circle distance, km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The point-query URL for one circle. */
export function pointUrl(lat, lon, radiusNm = ADSBLOL_RADIUS_NM) {
  return `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radiusNm}`;
}

/**
 * A point answer as the flights layer reads it: OpenSky-shaped state vectors.
 * @param {string} text
 */
export function parsePointAnswer(text) {
  const normalized = normalizeAdsbLolPointResponse(JSON.parse(text));
  return { time: normalized.time, states: normalized.states, count: normalized.states.length };
}

/**
 * One snapshot out of several circles: every aircraft once, from whichever
 * circle heard it last (index 4, last contact). The snapshot's `time` is the
 * OLDEST circle's, so an age computed from it never flatters the data.
 *
 * @param {Array<{time: number, states: Array[]}>} records
 * @returns {{time: number, states: Array[]}}
 */
export function mergeCellSnapshots(records) {
  const byHex = new Map();
  let time = Infinity;
  for (const record of records) {
    if (!record) continue;
    if (Number.isFinite(record.time)) time = Math.min(time, record.time);
    for (const state of record.states || []) {
      const previous = byHex.get(state[0]);
      if (!previous || (Number(state[4]) || 0) > (Number(previous[4]) || 0)) byHex.set(state[0], state);
    }
  }
  return { time: Number.isFinite(time) ? time : Math.floor(Date.now() / 1000), states: [...byHex.values()] };
}

/**
 * The paced queue.
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {(fn: Function, ms: number) => any} [options.setTimer]
 * @param {(handle: any) => void} [options.clearTimer]
 * @param {number} [options.gapMs]
 * @param {number} [options.wantTtlMs]
 * @param {number} [options.pauseMs]
 * @param {number} [options.maxJobs] Jobs kept at once; the least recently wanted go first.
 * @param {{warn?: Function}} [options.log]
 */
export function createAdsbLolScheduler({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  setTimer = (fn, ms) => {
    const handle = setTimeout(fn, ms);
    handle?.unref?.();
    return handle;
  },
  clearTimer = (handle) => clearTimeout(handle),
  gapMs = ADSBLOL_MIN_GAP_MS,
  wantTtlMs = ADSBLOL_WANT_TTL_MS,
  pauseMs = ADSBLOL_429_PAUSE_MS,
  maxJobs = 24,
  log = console,
} = {}) {
  /** @type {Map<string, object>} */
  const jobs = new Map();
  let lastDepartureAt = -Infinity;
  let pausedUntil = 0;
  let timer = null;
  let departures = 0;
  let refusals = 0;
  let disposed = false;

  const isActive = (job, t) => job.waiters.length > 0 || t - job.wantedAt <= wantTtlMs;

  function trim() {
    if (jobs.size <= maxJobs) return;
    const idle = [...jobs.values()]
      .filter((job) => !job.inFlight && !job.waiters.length && !job.pinned)
      .sort((a, b) => a.wantedAt - b.wantedAt);
    while (jobs.size > maxJobs && idle.length) jobs.delete(idle.shift().key);
  }

  function arm() {
    if (timer !== null || disposed) return;
    const t = now();
    const at = Math.max(t, lastDepartureAt + gapMs, pausedUntil);
    timer = setTimer(tick, at - t);
  }

  function pick(t) {
    let best = null;
    for (const job of jobs.values()) {
      if (job.inFlight || !isActive(job, t)) continue;
      if (!best) { best = job; continue; }
      const waiting = (job.waiters.length > 0) - (best.waiters.length > 0);
      if (waiting > 0) { best = job; continue; }
      if (waiting < 0) continue;
      const unanswered = (job.record === null) - (best.record === null);
      if (unanswered > 0) { best = job; continue; }
      if (unanswered < 0) continue;
      const age = (job.record?.fetchedAt ?? 0) - (best.record?.fetchedAt ?? 0);
      if (age < 0 || (age === 0 && job.wantedAt < best.wantedAt)) best = job;
    }
    return best;
  }

  function settle(job) {
    const waiters = job.waiters.splice(0);
    for (const waiter of waiters) {
      clearTimer(waiter.timer);
      waiter.resolve(job.record);
    }
  }

  async function run(job) {
    job.inFlight = true;
    try {
      const response = await fetchImpl(job.url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(ADSBLOL_TIMEOUT_MS),
      });
      // 429, and 420 ("enhance your calm"), which adsb.lol's front also sends
      // to a client it considers too eager.
      if (response.status === 429 || response.status === 420) {
        refusals += 1;
        pausedUntil = now() + pauseMs;
        throw new Error(`upstream HTTP ${response.status} — queue paused`);
      }
      if (!response.ok) throw new Error(`upstream HTTP ${response.status}`);
      const text = await readResponseTextCapped(response, ADSBLOL_MAX_RESPONSE_BYTES);
      job.record = { ...job.parse(text), fetchedAt: now() };
      job.error = null;
    } catch (error) {
      job.error = error?.message || String(error);
      log.warn?.(`[adsb.lol] ${job.key}: ${job.error}`);
    } finally {
      job.inFlight = false;
      settle(job);
    }
  }

  function tick() {
    timer = null;
    if (disposed) return;
    const t = now();
    if (t < lastDepartureAt + gapMs || t < pausedUntil) {
      arm();
      return;
    }
    for (const job of jobs.values()) {
      // Forget answers nobody wants and nobody could still draw.
      if (!isActive(job, t) && !job.inFlight && (!job.record || t - job.record.fetchedAt > ADSBLOL_RECORD_MAX_AGE_MS)) {
        jobs.delete(job.key);
      }
    }
    const job = pick(t);
    if (!job) return; // idle until somebody wants something
    lastDepartureAt = t;
    departures += 1;
    void run(job);
    arm();
  }

  return {
    /**
     * Say a job is wanted now, creating it on first sight. Returns its newest
     * answer (or null) without waiting.
     * @param {string} key
     * @param {{url: string, parse: (text: string) => object, pinned?: boolean}} spec
     */
    want(key, spec) {
      let job = jobs.get(key);
      if (!job) {
        if (!spec?.url || typeof spec.parse !== 'function') return null;
        job = {
          key,
          url: spec.url,
          parse: spec.parse,
          pinned: Boolean(spec.pinned),
          record: null,
          error: null,
          wantedAt: 0,
          waiters: [],
          inFlight: false,
        };
        jobs.set(key, job);
        trim();
      }
      job.wantedAt = now();
      arm();
      return job.record;
    },
    /** The newest answer for a job, or null. */
    record(key) {
      return jobs.get(key)?.record ?? null;
    },
    /**
     * Wait for the job's next answer, at most `waitMs`. Resolves to whatever
     * the job then holds — possibly an older answer, possibly null.
     */
    next(key, waitMs) {
      const job = jobs.get(key);
      if (!job) return Promise.resolve(null);
      return new Promise((resolve) => {
        const waiter = { resolve, timer: null };
        waiter.timer = setTimer(() => {
          const index = job.waiters.indexOf(waiter);
          if (index >= 0) job.waiters.splice(index, 1);
          resolve(job.record);
        }, waitMs);
        job.waiters.push(waiter);
        arm();
      });
    },
    /** Jobs within a distance of a point, for reusing a nearby circle. */
    jobsNear(lat, lon, km, prefix = '') {
      const found = [];
      for (const job of jobs.values()) {
        if (!job.key.startsWith(prefix) || !Number.isFinite(job.lat)) continue;
        const d = distanceKm(lat, lon, job.lat, job.lon);
        if (d <= km) found.push({ key: job.key, distanceKm: d, record: job.record });
      }
      return found.sort((a, b) => a.distanceKm - b.distanceKm);
    },
    /** Attach a centre to a job, for `jobsNear`. */
    locate(key, lat, lon) {
      const job = jobs.get(key);
      if (job) { job.lat = lat; job.lon = lon; }
    },
    /** The oldest answer still worth serving without first asking for a new one. */
    maxServeAgeMs() {
      return Math.max(ADSBLOL_SERVE_MIN_AGE_MS, 1.5 * this.roundSeconds() * 1000);
    },
    /** How many jobs are being refreshed now: one of each per this many seconds. */
    roundSeconds() {
      const t = now();
      let active = 0;
      for (const job of jobs.values()) if (isActive(job, t)) active += 1;
      return Math.max(1, active) * (gapMs / 1000);
    },
    /** Stop for good: no further departure, every waiter answered now. */
    dispose() {
      disposed = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
      for (const job of jobs.values()) settle(job);
      jobs.clear();
    },
    stats() {
      const t = now();
      return {
        jobs: jobs.size,
        active: [...jobs.values()].filter((job) => isActive(job, t)).map((job) => job.key),
        departures,
        refusals,
        pausedForSeconds: Math.max(0, Math.ceil((pausedUntil - t) / 1000)),
      };
    },
  };
}

/**
 * What the flights endpoint serves when adsb.lol is the PRIMARY source (the
 * hosted build, where OpenSky is off): the four French circles merged when the
 * view is over France, one circle around the view elsewhere.
 *
 * @param {ReturnType<typeof createAdsbLolScheduler>} scheduler
 * @param {{lat: number, lon: number}|null} anchor The followed aircraft or the camera subpoint.
 * @param {{waitMs?: number, now?: () => number}} [options]
 * @returns {Promise<null|{area: 'fr-metro', cells: number, time: number, states: Array[], roundSeconds: number}>}
 */
export async function franceSnapshot(scheduler, anchor, { waitMs = 25_000, now = () => Date.now() } = {}) {
  for (const cell of FRANCE_CELLS) {
    scheduler.want(cell.key, { url: pointUrl(cell.lat, cell.lon), parse: parsePointAnswer, pinned: true });
  }
  const within = (maxAgeMs) => FRANCE_CELLS
    .map((cell) => scheduler.record(cell.key))
    .filter((record) => record && now() - record.fetchedAt <= maxAgeMs);
  const fresh = () => within(scheduler.maxServeAgeMs());
  let records = fresh();
  if (!records.length) {
    // Nothing yet, or nothing refreshed since the queue went idle: wait for
    // the circle nearest the view, which the queue serves first because
    // somebody is waiting on it. The other three follow one per slot; until
    // then France fills in, rather than opening on a map minutes old.
    const nearest = [...FRANCE_CELLS].sort((a, b) => (
      distanceKm(anchor?.lat ?? 46.5, anchor?.lon ?? 2.5, a.lat, a.lon)
      - distanceKm(anchor?.lat ?? 46.5, anchor?.lon ?? 2.5, b.lat, b.lon)
    ))[0];
    await scheduler.next(nearest.key, waitMs);
    records = fresh();
    // adsb.lol not answering: the last circles it gave, up to ten minutes
    // old, which the page labels by their age.
    if (!records.length) records = within(ADSBLOL_RECORD_MAX_AGE_MS);
  }
  if (!records.length) return null;
  const merged = mergeCellSnapshots(records);
  return {
    area: 'fr-metro',
    cells: records.length,
    time: merged.time,
    states: merged.states,
    roundSeconds: scheduler.roundSeconds(),
  };
}

/** A circle already wanted this close to the view is reused rather than a new one queued. */
export const ADSBLOL_REUSE_KM = 185; // 100 NM

/**
 * One 250 NM circle around the view, shared with any circle already wanted
 * within {@link ADSBLOL_REUSE_KM}: a panning visitor, or a followed aircraft,
 * does not queue a new circle every 28 km.
 *
 * @param {ReturnType<typeof createAdsbLolScheduler>} scheduler
 * @param {{lat: number, lon: number}} anchor
 * @param {{waitMs?: number, now?: () => number}} [options]
 * @returns {Promise<null|{key: string, record: {time: number, states: Array[], count: number, fetchedAt: number}, stale: boolean}>}
 *   `record` is the queue's own object, the same one every visitor of that
 *   circle receives until the next answer — a stable key for a body cache.
 */
export async function regionalSnapshot(scheduler, anchor, { waitMs = 25_000, now = () => Date.now() } = {}) {
  const lat = Math.round(anchor.lat * 4) / 4;
  const lon = Math.round(anchor.lon * 4) / 4;
  const near = scheduler.jobsNear(anchor.lat, anchor.lon, ADSBLOL_REUSE_KM, 'pt:');
  const key = near[0]?.key ?? `pt:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const centre = near[0] ? null : { lat, lon };
  const url = centre ? pointUrl(centre.lat, centre.lon) : null;
  let record = scheduler.want(key, { url, parse: parsePointAnswer });
  if (centre) scheduler.locate(key, centre.lat, centre.lon);
  if (!record || now() - record.fetchedAt > scheduler.maxServeAgeMs()) {
    record = await scheduler.next(key, waitMs);
  }
  if (!record || now() - record.fetchedAt > ADSBLOL_RECORD_MAX_AGE_MS) return null;
  return { key, record, stale: now() - record.fetchedAt > ADSBLOL_MIN_GAP_MS * 2 };
}
