/**
 * Bison Futé *Action b* — the credentialed road-event stream that covers the
 * conceded motorways, read server-side and merged into the open DIR snapshot.
 *
 * WHAT IT ADDS. The open `Evenementiel-DIR` aggregate (`bisonFuteFeed.js`)
 * covers the réseau routier national NON concédé and nothing else. The
 * motorways the concession companies run — ASF, APRR, Cofiroute, Sanef,
 * Escota, Aréa — publish their events to the same national access point, but
 * only behind the *Action b* reuse licence (règlement délégué (UE) 2015/962),
 * which requires a signed licence and a login. Surplomb holds one since
 * 2026-09-21. This module is what that login buys, and it runs only where the
 * login is configured: the open-source build stays keyless and draws exactly
 * what it drew before.
 *
 * THE SHAPE IS A STREAM, NOT A SNAPSHOT. MEASURED 2026-09-21: `grt/ACTION-B/`
 * is an Apache directory index of ~2 200 small files covering the last ~24 h,
 * one DATEX II `SituationPublication` per file, each carrying ONE situation at
 * one version (`allElementUpdate`), named by a rising sequence number. About
 * 1.5 new files a minute; 6–13 KB each; a situation is re-sent at every change,
 * three to four times on average, and its last message usually ends it. So the
 * current state is not downloaded, it is REPLAYED: every message is read once,
 * the newest version of each situation wins, and an ended situation is dropped.
 * Situation ids are Tipi's own (`260921-003186`), the same namespace as the open
 * aggregate, which is what lets the two merge without duplicates.
 *
 * WHAT THE LICENCE ASKS, and where each ask is met:
 *   - Art. 5, duration: the right to reuse dynamic data lasts "until the end of
 *     the event or a change of state". An ended situation is DELETED from the
 *     store — only its id and version survive, as a tombstone that stops an
 *     older copy from resurrecting it — and nothing here ever reaches the
 *     chronicle.
 *   - Art. 5, attribution: "Information fournie par" + the producer, and the
 *     timestamp of the last update, shown to the end user. Every event this
 *     module serves carries `licence: 'action-b'`, and the card prints both.
 *   - Not a licence clause but the same courtesy: the national access point is
 *     a shared public server. See `ACTION_B_POLL_MS` and
 *     `ACTION_B_FILE_SPACING_MS` for the load this puts on it.
 */

import { projectRoadEvents, resolveEventState } from './bisonFuteFeed.js';

/** Tag carried by every event this stream serves; the card keys on it. */
export const ACTION_B_LICENCE = 'action-b';

/**
 * How often the directory index is re-read.
 *
 * MEASURED 2026-09-21: the index is 443 KB as HTML and 22 KB gzipped on the
 * wire, and the origin sends no `ETag` or `Last-Modified` on it, so every read
 * is a full (gzipped) read. Five minutes is the open layer's own cadence and
 * costs ~6 MB a day; the files themselves add ~17 MB a day, each read once.
 * Bison Futé publishes no quota — one was asked for on 2026-09-21 — so this
 * stays at the open layer's pace until they name one.
 */
export const ACTION_B_POLL_MS = 5 * 60_000;

/**
 * Pause between two file downloads: at most two requests a second, one at a
 * time. It only matters on a cold start, when the whole ~2 200-file window is
 * replayed (~20 min); in steady state a poll finds seven or eight new files.
 */
export const ACTION_B_FILE_SPACING_MS = 500;

/**
 * A store not polled for this long is discarded and replayed from scratch.
 *
 * The directory keeps ~24 h. A gap longer than that means some END messages
 * have already rotated out, and a store that missed an end keeps drawing an
 * accident that was cleared hours ago — the one error this layer must not make.
 * Half the window leaves room for a slow replay.
 */
export const ACTION_B_RESYNC_AFTER_MS = 12 * 3_600_000;

/** How long an ended situation's id is remembered. Twice the window. */
export const ACTION_B_TOMBSTONE_TTL_MS = 48 * 3_600_000;

/** After a rejected login, wait this long before trying again. */
export const ACTION_B_AUTH_BACKOFF_MS = 60 * 60_000;

/**
 * List the message files of an Apache directory index, oldest first.
 * @param {string} html
 * @returns {Array<{name:string, seq:number}>}
 */
export function parseActionBListing(html) {
  const seen = new Set();
  const files = [];
  for (const match of String(html ?? '').matchAll(/href="(\d{1,15})\.xml"/g)) {
    const seq = Number(match[1]);
    if (!Number.isSafeInteger(seq) || seen.has(seq)) continue;
    seen.add(seq);
    files.push({ name: `${match[1]}.xml`, seq });
  }
  return files.sort((a, b) => a.seq - b.seq);
}

/**
 * Whether `candidate` is a later version of the same situation than `known`.
 * The situation's own `version` first; its version time breaks a tie.
 * @param {{version:?number, updated:?number}} candidate
 * @param {{version:?number, updated:?number}} known
 * @returns {boolean}
 */
export function isNewerSituation(candidate, known) {
  const a = candidate?.version ?? 0;
  const b = known?.version ?? 0;
  if (a !== b) return a > b;
  return (candidate?.updated ?? 0) > (known?.updated ?? 0);
}

/**
 * The replayed state of the stream: live situations and recent tombstones.
 *
 * @param {object} [options]
 * @param {number} [options.tombstoneTtlMs]
 */
export function createActionBStore({ tombstoneTtlMs = ACTION_B_TOMBSTONE_TTL_MS } = {}) {
  /** @type {Map<string, object>} */
  const live = new Map();
  /** @type {Map<string, {at:number, version:?number, updated:?number}>} */
  const tombstones = new Map();
  const state = {
    lastSeq: 0,
    lastPollAt: 0,
    // Set once a replay has read the whole window. Until then some situations
    // are missing their end, so nothing is served.
    synced: false,
    messages: 0,
  };

  function bury(event, nowMs) {
    live.delete(event.id);
    tombstones.set(event.id, { at: nowMs, version: event.version ?? null, updated: event.updated ?? null });
  }

  /**
   * Read one message.
   * @param {string} xml One file's body.
   * @param {object} [options]
   * @param {number} [options.seq] The file's sequence number.
   * @param {number} [options.nowMs]
   * @param {?Function} [options.traceCarriageway] As for `projectRoadEvents`.
   * @returns {{added:number, updated:number, ended:number, ignored:number}}
   */
  function ingest(xml, { seq = null, nowMs = Date.now(), traceCarriageway = null } = {}) {
    const tally = { added: 0, updated: 0, ended: 0, ignored: 0 };
    const { events } = projectRoadEvents(xml, { nowMs, traceCarriageway });
    for (const event of events) {
      const known = live.get(event.id);
      const tomb = tombstones.get(event.id);
      // An older copy arriving late — a replay out of order — never overwrites
      // a newer one, and never resurrects a situation already ended.
      if ((known && !isNewerSituation(event, known)) || (tomb && !isNewerSituation(event, tomb))) {
        tally.ignored += 1;
        continue;
      }
      if (event.state === 'ended') {
        bury(event, nowMs);
        tally.ended += 1;
        continue;
      }
      if (tomb) tombstones.delete(event.id);
      live.set(event.id, { ...event, licence: ACTION_B_LICENCE });
      if (known) tally.updated += 1; else tally.added += 1;
    }
    if (Number.isSafeInteger(seq) && seq > state.lastSeq) state.lastSeq = seq;
    state.messages += 1;
    return tally;
  }

  /**
   * The situations to draw now. Expires what has run past its window, and
   * forgets tombstones older than their TTL.
   * @param {number} [nowMs]
   * @returns {object[]}
   */
  function snapshot(nowMs = Date.now()) {
    const out = [];
    for (const event of [...live.values()]) {
      const next = resolveEventState({ ended: false, start: event.start ?? null, end: event.end ?? null, nowMs });
      if (next === 'ended') { bury(event, nowMs); continue; }
      out.push(next === event.state ? event : { ...event, state: next });
    }
    for (const [id, tomb] of tombstones) {
      if (nowMs - tomb.at > tombstoneTtlMs) tombstones.delete(id);
    }
    return out;
  }

  /** Forget everything: the next poll replays the whole window. */
  function reset() {
    live.clear();
    tombstones.clear();
    state.lastSeq = 0;
    state.synced = false;
    state.messages = 0;
  }

  return {
    ingest,
    snapshot,
    reset,
    state,
    tombstone: (id) => tombstones.get(id) || null,
    get size() { return live.size; },
    /** Only live situations and tombstones are written: ended data is not kept. */
    toJSON() {
      return {
        v: 1,
        ...state,
        events: [...live.values()],
        tombstones: [...tombstones.entries()],
      };
    },
    /** @param {unknown} saved */
    load(saved) {
      reset();
      if (!saved || saved.v !== 1) return false;
      for (const event of Array.isArray(saved.events) ? saved.events : []) {
        if (event?.id) live.set(event.id, { ...event, licence: ACTION_B_LICENCE });
      }
      for (const entry of Array.isArray(saved.tombstones) ? saved.tombstones : []) {
        if (Array.isArray(entry) && entry[0] && entry[1]) tombstones.set(entry[0], entry[1]);
      }
      state.lastSeq = Number.isSafeInteger(saved.lastSeq) ? saved.lastSeq : 0;
      state.lastPollAt = Number.isFinite(saved.lastPollAt) ? saved.lastPollAt : 0;
      state.synced = saved.synced === true;
      state.messages = Number.isFinite(saved.messages) ? saved.messages : 0;
      return true;
    },
  };
}

/**
 * Tally a served event list the way `projectRoadEvents` tallies its own.
 * @param {object[]} events
 * @returns {Record<string, number>}
 */
export function countRoadEvents(events) {
  const counts = {
    situations: events.length, points: 0, segments: 0, shaped: 0,
    active: 0, planned: 0, ended: 0, safety: 0, actionB: 0,
  };
  for (const event of events) {
    if (event.geometry?.kind === 'segment') counts.segments += 1; else counts.points += 1;
    if (event.geometry?.shaped === 'carriageway') counts.shaped += 1;
    if (Object.hasOwn(counts, event.state)) counts[event.state] += 1;
    if (event.safety) counts.safety += 1;
    if (event.licence === ACTION_B_LICENCE) counts.actionB += 1;
  }
  return counts;
}

/**
 * Merge the open DIR snapshot with the Action b stream.
 *
 * The two share Tipi's situation ids. The later version of a situation wins,
 * whichever side it came from — the stream is real time and the aggregate is
 * republished hourly, so the stream usually does. A situation the stream has
 * ENDED stays ended even while the hourly aggregate still carries the version
 * before the end.
 *
 * @param {object[]} openEvents Served events of the open aggregate.
 * @param {object[]} streamEvents `store.snapshot()`.
 * @param {(id:string) => ?{version:?number, updated:?number}} [tombstoneOf]
 * @returns {object[]} Newest first, as `projectRoadEvents` orders them.
 */
export function mergeRoadEventFeeds(openEvents, streamEvents, tombstoneOf = () => null) {
  const byId = new Map();
  for (const event of Array.isArray(openEvents) ? openEvents : []) {
    const tomb = tombstoneOf(event.id);
    byId.set(event.id, tomb && !isNewerSituation(event, tomb) ? { ...event, state: 'ended' } : event);
  }
  for (const event of Array.isArray(streamEvents) ? streamEvents : []) {
    const open = byId.get(event.id);
    if (!open || !isNewerSituation(open, event)) byId.set(event.id, event);
  }
  return [...byId.values()].sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0) || a.id.localeCompare(b.id));
}

/**
 * The poller: reads the directory index, downloads each new file once, one at
 * a time, and feeds the store.
 *
 * Everything with a side effect is injected so a test can drive it without a
 * network or a clock.
 *
 * @param {object} options
 * @param {ReturnType<typeof createActionBStore>} options.store
 * @param {string} options.baseUrl Directory URL, trailing slash included.
 * @param {() => ?{user:string, password:string}} options.credentials Read lazily.
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(ms:number) => Promise<void>} [options.sleep]
 * @param {() => number} [options.now]
 * @param {() => ?Function} [options.tracer] Returns the carriageway tracer.
 * @param {(store:object) => Promise<void>|void} [options.persist]
 * @param {number} [options.spacingMs]
 * @param {number} [options.timeoutMs]
 * @param {Pick<Console,'log'|'warn'>} [options.log]
 */
export function createActionBPoller({
  store,
  baseUrl,
  credentials,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => { const timer = setTimeout(resolve, ms); timer.unref?.(); }),
  now = Date.now,
  tracer = () => null,
  persist = () => {},
  spacingMs = ACTION_B_FILE_SPACING_MS,
  timeoutMs = 20_000,
  log = console,
}) {
  const status = { lastError: null, authFailedAt: 0, pending: 0, running: false };

  const headers = () => {
    const cred = credentials();
    if (!cred) return null;
    const token = btoa(`${cred.user}:${cred.password}`);
    return { Authorization: `Basic ${token}`, 'Accept-Encoding': 'gzip' };
  };

  async function get(url, auth) {
    const response = await fetchImpl(url, { headers: auth, signal: AbortSignal.timeout(timeoutMs) });
    if (response.status === 401 || response.status === 403) {
      const error = new Error(`login rejected (HTTP ${response.status})`);
      error.auth = true;
      throw error;
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  /**
   * One poll: the index, then every file newer than the last one read.
   * @returns {Promise<{files:number, skipped:boolean}>}
   */
  async function pollOnce() {
    const auth = headers();
    if (!auth) return { files: 0, skipped: true };
    if (status.authFailedAt && now() - status.authFailedAt < ACTION_B_AUTH_BACKOFF_MS) {
      return { files: 0, skipped: true };
    }
    if (store.state.lastPollAt && now() - store.state.lastPollAt > ACTION_B_RESYNC_AFTER_MS) {
      log.log('[bison-fute-action-b] store older than the directory window — replaying it');
      store.reset();
    }
    let read = 0;
    try {
      const listing = await get(baseUrl, auth);
      const fresh = parseActionBListing(listing).filter((file) => file.seq > store.state.lastSeq);
      status.pending = fresh.length;
      const traceCarriageway = tracer();
      for (const file of fresh) {
        if (read > 0) await sleep(spacingMs);
        const body = await get(`${baseUrl}${file.name}`, auth);
        // A file can rotate out between the index and its download. Skipping
        // it is right: its situation has been re-sent in a later file.
        if (body) {
          try {
            store.ingest(body, { seq: file.seq, nowMs: now(), traceCarriageway });
          } catch (error) {
            // One unreadable message must not stall the stream: without this
            // the next poll would ask for the same file forever.
            log.warn(`[bison-fute-action-b] ${file.name} unreadable (${error?.message || error}) — skipped`);
          }
        }
        store.state.lastSeq = Math.max(store.state.lastSeq, file.seq);
        read += 1;
        status.pending -= 1;
        if (read % 100 === 0) await persist(store);
      }
      store.state.lastPollAt = now();
      store.state.synced = true;
      status.lastError = null;
      status.authFailedAt = 0;
    } catch (error) {
      status.lastError = error?.message || String(error);
      if (error?.auth) status.authFailedAt = now();
      log.warn(`[bison-fute-action-b] poll failed after ${read} files: ${status.lastError}`);
    }
    await persist(store);
    return { files: read, skipped: false };
  }

  /**
   * Poll forever, `intervalMs` apart. Idempotent: a second call is a no-op.
   * @param {number} [intervalMs]
   */
  function start(intervalMs = ACTION_B_POLL_MS) {
    if (status.running) return;
    status.running = true;
    (async () => {
      while (status.running) {
        try {
          await pollOnce();
        } catch (error) {
          log.warn(`[bison-fute-action-b] poll crashed: ${error?.message || error}`);
        }
        await sleep(intervalMs);
      }
    })();
  }

  return {
    pollOnce,
    start,
    stop() { status.running = false; },
    status,
  };
}
