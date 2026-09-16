/**
 * @file Which Overpass mirror is worth asking, and for how long.
 *
 * THE COST THIS ANSWERS. Measured 2026-09-16 from inside the VPS container,
 * one Biarritz road query per mirror:
 *
 *   overpass-api.de        200 in   394 ms   the only one working
 *   lz4.overpass-api.de    429 in 13 100 ms  same machine, shared quota
 *   overpass.private.coffee  gave up at 30 s  dead weight
 *
 * So when FOSSGIS refuses, one pass costs ~35 s to learn nothing, and the
 * rotation runs that pass up to three times (a 429 is the one verdict a fresh
 * pass cannot fix, so it retries behind a backoff) — 112 s and nine upstream
 * requests per uncached query, every one of them feeding the quota that caused
 * the refusal.
 *
 * WHY A SECOND MEMORY, ALONGSIDE THE GLOBAL PARKING. `_overpassOutage` in
 * vite.config.js already parks the WHOLE rotation for a minute, but only when
 * no payload came back at all. A 429 DOES come back as a payload, so the
 * global parking is structurally blind to exactly the outage measured above.
 * This file is the per-mirror half: one dead host stops costing 22 s on every
 * request while the others keep answering.
 *
 * WHAT THIS FILE REFUSES TO DO. It never REORDERS the mirror list, only filters
 * it. The order in `OVERPASS_UPSTREAMS` is a dated editorial judgement — FOSSGIS
 * first because it is the only host measured healthy, lz4 adjacent because
 * re-asking the same backend is a real retry for a runtime error, private.coffee
 * demoted so its dead weight is only ever paid after the host that answers has
 * already failed. Sorting by latency would promote the single most dangerous
 * mirror there is: a REGIONAL instance answers 200 with `elements: []` in 0.3 s
 * for the whole planet, and this proxy cannot tell that from "there is genuinely
 * nothing here" — it would cache the void for the 7-to-30-day disk TTL.
 *
 * Clock-free and I/O-free, like `trafficBounds.js`: callers pass `now` and own
 * the map.
 *
 * @module data/overpassMirrors
 */

/**
 * Hostname → machine group and measured typical latency.
 *
 * `fossgis` carries TWO hostnames on purpose. Resolved 2026-09-02:
 * `lz4.overpass-api.de` is 65.109.112.52, one of the two addresses
 * `overpass-api.de` itself answers with, and both facades report
 * `Announced endpoint: lambert.openstreetmap.de/` on /api/status. A rate limit
 * is a verdict on the IP, so asking the second facade after the first refused
 * re-learns the same 429 — 13.1 s measured, and one more request against the
 * quota that produced it.
 *
 * `typicalMs` is descriptive only: nothing in this module ranks on it. It is
 * here so an operator reading a parking warning can see whether a mirror is
 * slow or newly slow.
 *
 * @type {Readonly<Record<string, {group: string, typicalMs: number}>>}
 */
export const OVERPASS_MIRROR_PROFILES = Object.freeze({
  'overpass-api.de': Object.freeze({ group: 'fossgis', typicalMs: 394 }),
  'lz4.overpass-api.de': Object.freeze({ group: 'fossgis', typicalMs: 13_100 }),
  'overpass.private.coffee': Object.freeze({ group: 'private-coffee', typicalMs: 20_000 }),
});

/**
 * The machine an endpoint sits on, and what it usually costs.
 *
 * An unknown host is its OWN group, keyed on the FULL hostname and never on the
 * registrable domain. That is not a detail: collapsing `a.test` and `b.test`
 * into one group would make one mirror's 429 suppress every other fixture, and
 * a grouping rule that guesses is a rule that silently stops trying mirrors
 * nobody asked it to skip. Groups are declared here, from a dated resolution,
 * or they do not exist.
 *
 * @param {string} endpoint Mirror URL.
 * @returns {{host: string, group: string, typicalMs: number|null}}
 */
export function mirrorProfile(endpoint) {
  let host = String(endpoint || '');
  try {
    host = new URL(endpoint).host;
  } catch {
    // A non-URL endpoint is its own group under its own literal name; the
    // rotation still works, it just gains no grouping.
  }
  const known = OVERPASS_MIRROR_PROFILES[host];
  return known
    ? { host, group: known.group, typicalMs: known.typicalMs }
    : { host, group: host, typicalMs: null };
}

/**
 * Parking windows after 1, 2, and 3-or-more consecutive failures.
 *
 * 20 s — longer than a whole backoff cycle (1.5 + 4 = 5.5 s), so passes 1 and 2
 * of the SAME rotation already skip the mirror, while an unrelated request half
 * a minute later looks at it fresh.
 *
 * 60 s — the interval this codebase already chose for "this host is not
 * answering" (`OVERPASS_OUTAGE_COOLDOWN_MS`).
 *
 * 300 s — the 2026-09-16 outage lasted 54 minutes. At five minutes a dead
 * mirror is probed eleven times across it instead of thousands.
 *
 * @type {readonly number[]}
 */
export const OVERPASS_MIRROR_PARK_MS = Object.freeze([20_000, 60_000, 300_000]);

/**
 * How long a MACHINE stays out of the rotation after answering 429.
 *
 * A rate limit is a verdict on our IP, so no mirror order can dodge it — but
 * something has to slow us down, and nothing did. Bounding the rotation without
 * bounding the RATE just makes the client ask a refusing host more often.
 *
 * DELIBERATELY SHORTER than a whole backoff cycle (1.5 + 4 = 5.5 s). The
 * rotation that took the 429 has already paid for that wait, and the reason it
 * waits is measured: "one short wait usually converts a 429 into an answer".
 * A longer parking here would silently delete the backoff, which is the only
 * cure this proxy has for a rate limit. What 5 s does brake is the OTHER
 * rotations — a stampede of fresh callers arriving while the first one is still
 * being refused, which is the traffic that keeps a 429 alive.
 *
 * It is a separate field from `until` on purpose: a rate limit must never
 * escalate a mirror toward the five-minute failure parking, because the mirror
 * did nothing wrong.
 */
export const OVERPASS_GROUP_RATE_LIMIT_MS = 5_000;

/**
 * Record what one machine just did, and park it if it owes us silence.
 *
 * KEYED BY MACHINE, not by hostname. Documented case: "overpass-api.de does not
 * just rate-limit a noisy IP, it stops answering it" — and `lz4` is the same
 * box, so parking only the hostname leaves the sibling facade burning an
 * attempt on every rotation for as long as the block lasts.
 *
 * Two dispositions deliberately do NOT park at all:
 *  - `client-error`: `overpassAttemptDisposition` cannot tell a front-end 406
 *    from a 400 raised by a malformed query, and this proxy's contract is that
 *    "a genuinely malformed query still surfaces: every mirror rejects it".
 *    Parking on it would let ONE bad query take every Overpass layer down for
 *    up to five minutes. There is nothing to win either — a 4xx comes back in
 *    ~0.4 s, so no dead time is being recovered.
 *  - `runtime-error`: the mirror is alive and said THIS QUERY was too heavy.
 *
 * Mutates `health` and returns the entry, so a caller can compare `until`
 * before and after to log a parking exactly once.
 *
 * @param {Map<string, {fails:number, until:number, rateLimitedUntil:number, lastOkAt:number, lastLatencyMs:number|null}>} health
 * @param {string} group Machine key, from {@link mirrorProfile}.
 * @param {'accept'|'rate-limited'|'runtime-error'|'server-error'|'client-error'|'throw'} disposition
 * @param {Object} [options]
 * @param {() => number} [options.now] Clock, injected.
 * @param {number|null} [options.latencyMs] Observed round-trip, for operators.
 * @returns {{fails:number, until:number, rateLimitedUntil:number, lastOkAt:number, lastLatencyMs:number|null}}
 */
export function noteMirrorOutcome(health, group, disposition, { now = Date.now, latencyMs = null } = {}) {
  const at = now();
  const previous = health.get(group)
    || { fails: 0, until: 0, rateLimitedUntil: 0, lastOkAt: 0, lastLatencyMs: null };
  let entry;
  if (disposition === 'accept') {
    entry = { fails: 0, until: 0, rateLimitedUntil: 0, lastOkAt: at, lastLatencyMs: latencyMs };
  } else if (disposition === 'rate-limited') {
    entry = {
      ...previous,
      rateLimitedUntil: at + OVERPASS_GROUP_RATE_LIMIT_MS,
      lastLatencyMs: latencyMs,
    };
  } else if (disposition === 'runtime-error' || disposition === 'client-error') {
    entry = { ...previous, lastLatencyMs: latencyMs };
  } else if (previous.until > at) {
    // Already parked, and this failure is inside that window — the second
    // FOSSGIS facade refusing right after the first is ONE machine observed
    // once, not two outages. Escalating here would double-count every rotation
    // and push a two-hostname machine to the five-minute window twice as fast
    // as a one-hostname one, which is how the cheap host ends up parked longer
    // than the expensive one it was meant to protect us from.
    entry = { ...previous, lastLatencyMs: latencyMs };
  } else {
    const fails = previous.fails + 1;
    const window = OVERPASS_MIRROR_PARK_MS[
      Math.min(fails - 1, OVERPASS_MIRROR_PARK_MS.length - 1)
    ];
    entry = {
      fails,
      until: at + window,
      rateLimitedUntil: previous.rateLimitedUntil,
      lastOkAt: previous.lastOkAt,
      lastLatencyMs: latencyMs,
    };
  }
  health.set(group, entry);
  return entry;
}

/** Epoch ms before which a machine must not be contacted, for any reason. */
function groupBlockedUntil(health, group) {
  const entry = health?.get(group);
  if (!entry) return 0;
  return Math.max(entry.until || 0, entry.rateLimitedUntil || 0);
}

/**
 * Which mirrors this rotation should actually contact, in the list's own order.
 *
 * A FILTER, never a sort — see the module comment for why ranking by latency is
 * the one change that could poison the cache.
 *
 * When every mirror is parked the plan is not empty: it carries exactly ONE
 * probe, the mirror whose parking expires soonest, flagged `halfOpen`. That is
 * what stops a parked state from latching — a rotation always costs at most one
 * timeout to discover that the world came back, and never zero attempts, which
 * would freeze the proxy behind its own bookkeeping.
 *
 * @param {readonly string[]} endpoints Mirrors, in preference order.
 * @param {Object} options
 * @param {Map<string, {until:number}>} options.health Per-mirror memory.
 * @param {number} options.now Epoch ms.
 * @returns {{attempts: Array<{endpoint:string, host:string, group:string}>, halfOpen: boolean}}
 */
export function planRotation(endpoints, { health, now }) {
  const all = (endpoints || []).map((endpoint) => {
    const { host, group } = mirrorProfile(endpoint);
    return { endpoint, host, group };
  });
  const live = all.filter((candidate) => groupBlockedUntil(health, candidate.group) <= now);
  if (live.length) return { attempts: live, halfOpen: false };
  if (!all.length) return { attempts: [], halfOpen: false };
  let soonest = all[0];
  let soonestUntil = groupBlockedUntil(health, soonest.group);
  for (const candidate of all.slice(1)) {
    const until = groupBlockedUntil(health, candidate.group);
    if (until < soonestUntil) {
      soonest = candidate;
      soonestUntil = until;
    }
  }
  return { attempts: [soonest], halfOpen: true };
}

/**
 * How long one attempt may take, given what the rotation has left to spend.
 *
 * SHARES the remainder rather than grabbing it, which is the pattern this repo
 * already runs in `fetchOsmCameraElements` and `fetchPowerGridElements`:
 * `max(MIN, floor(remaining / mirrors_left))`. `minAttemptMs` there is a FLOOR
 * that guarantees a useful attempt, never a gate that refuses one — get that
 * backwards and a busy moment turns into "every mirror is dead", which is the
 * exact failure the slot queue was added to prevent.
 *
 * On top of the share, a RANK cap: the first attempt of a pass gets the full
 * per-mirror timeout because it is the one the caller is really waiting on;
 * everything after it exists only because the mirror before did not answer, so
 * the caller has already waited once and a shorter leash is the honest trade.
 *
 * @param {Object} args
 * @param {number} args.attemptIndex Attempts STARTED in this pass (0 = first).
 *   Started, not planned: a mirror skipped because its machine already refused
 *   has not been tried, and must not push the mirror after it onto the short
 *   leash.
 * @param {number} args.attemptsLeft Mirrors still to try, including this one.
 * @param {number} args.remainingMs What is left of the rotation budget.
 * @param {number} args.timeoutMs Budget for the first attempt of a pass.
 * @param {number} args.fallbackTimeoutMs Budget for every attempt after it.
 * @param {number} args.minAttemptMs Floor below which an attempt is pointless.
 * @returns {number} Milliseconds, or 0 only when the budget is fully spent.
 */
export function attemptTimeoutMs({
  attemptIndex, attemptsLeft, remainingMs, timeoutMs, fallbackTimeoutMs, minAttemptMs,
}) {
  if (!(remainingMs > 0)) return 0;
  const rankBudget = attemptIndex === 0 ? timeoutMs : fallbackTimeoutMs;
  const share = Math.floor(remainingMs / Math.max(1, attemptsLeft || 1));
  return Math.max(minAttemptMs, Math.min(rankBudget, share));
}

/**
 * One rotation's worth of decisions, with its state closed over.
 *
 * FIVE decisions used to live as inline `if`s inside a 27 000-line config file,
 * where the only way to reach them was to stand up a middleware and mock the
 * network: which mirror is next, whether its machine has already answered this
 * pass, how long it may take, whether the budget is spent, and how many
 * attempts actually started. Every one of them is a place this proxy has
 * regressed before. They are here instead, and a test reaches them in three
 * lines with no server.
 *
 * The caller still owns the socket: `next()` says who and for how long,
 * `note()` records what came back, `newPass()` starts a round after a backoff.
 *
 * @param {Object} args
 * @param {readonly string[]} args.endpoints Mirrors, in preference order.
 * @param {Map} args.health Per-machine memory, shared across rotations.
 * @param {() => number} args.now Clock.
 * @param {number} args.budgetMs Ceiling on the whole rotation, set when the
 *   FIRST pass begins — not at construction. Time spent queueing for an
 *   upstream slot is not time spent talking to a mirror, and charging it here
 *   is what turns a busy local queue into a 60 s global outage.
 * @param {number} args.timeoutMs Per-mirror budget at rank 0.
 * @param {number} args.fallbackTimeoutMs Per-mirror budget after rank 0.
 * @param {number} args.minAttemptMs Floor on any single attempt.
 * @returns {Object} The cursor.
 */
export function createRotationCursor({
  endpoints, health, now, budgetMs, timeoutMs, fallbackTimeoutMs, minAttemptMs,
}) {
  let deadline = 0;
  let plan = { attempts: [], halfOpen: false };
  let index = 0;
  let startedThisPass = 0;
  let startedTotal = 0;
  let budgetStopped = false;
  const suppressed = new Set();

  return {
    /**
     * Begin a pass. Starts the rotation clock on the first call, and clears the
     * machine suppressions — which last ONE pass by design: carrying them
     * across the backoff would stop the rotation re-asking the machine after
     * the wait, and a short wait is exactly what converts a 429 into an answer.
     */
    newPass() {
      if (!deadline) deadline = now() + budgetMs;
      suppressed.clear();
      plan = planRotation(endpoints, { health, now: now() });
      index = 0;
      startedThisPass = 0;
    },
    /** @returns {{endpoint:string, group:string, timeoutMs:number}|{done:true, reason:'exhausted'|'budget'}} */
    next() {
      for (;;) {
        if (index >= plan.attempts.length) return { done: true, reason: 'exhausted' };
        const candidate = plan.attempts[index];
        index += 1;
        if (suppressed.has(candidate.group)) continue;
        let left = 0;
        for (let i = index - 1; i < plan.attempts.length; i += 1) {
          if (!suppressed.has(plan.attempts[i].group)) left += 1;
        }
        const ms = attemptTimeoutMs({
          attemptIndex: startedThisPass,
          attemptsLeft: left,
          remainingMs: deadline - now(),
          timeoutMs,
          fallbackTimeoutMs,
          minAttemptMs,
        });
        if (ms === 0) {
          budgetStopped = true;
          return { done: true, reason: 'budget' };
        }
        startedThisPass += 1;
        startedTotal += 1;
        return { endpoint: candidate.endpoint, group: candidate.group, timeoutMs: ms };
      }
    },
    /**
     * Record an answer. A rate limit also takes the machine out of THIS pass:
     * the two FOSSGIS facades share one quota, so asking the second re-learns
     * the first's 429 for 13.1 s and one more request against that quota.
     * @returns {{parked:boolean, entry:Object}} `parked` is true only on the
     *   transition into a failure parking, so an operator sees one line per
     *   outage rather than one per skipped request.
     */
    note(group, disposition, { latencyMs = null } = {}) {
      if (disposition === 'rate-limited') suppressed.add(group);
      const before = health.get(group)?.until || 0;
      const entry = noteMirrorOutcome(health, group, disposition, { now, latencyMs });
      return { parked: entry.until > 0 && before === 0, entry };
    },
    /** Whether a wait of `ms` still leaves room for a real attempt after it. */
    canAffordBackoff(ms) {
      return deadline - now() >= ms + minAttemptMs;
    },
    /** Attempts actually started, across every pass. */
    get startedCount() { return startedTotal; },
    /** Whether the rotation stopped because it ran out of budget. */
    get stoppedOnBudget() { return budgetStopped; },
  };
}
