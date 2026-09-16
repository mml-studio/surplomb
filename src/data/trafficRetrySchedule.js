/**
 * @file Retry cadence for the traffic layer's road-graph kick.
 *
 * WHY A SCHEDULE AND NOT AN INTERVAL. The kick that follows `enable()` used to
 * be `setInterval(..., 1500)` whose only stop condition was "something got
 * drawn". Measured 2026-09-16 during the 11:03Z–11:57Z Overpass outage: the
 * client ran 40 kicks/minute for 54 minutes — ~2 160 kicks, ~4 300 POSTs out of
 * the BROWSER. Say that number carefully: it is not 4 300 upstream rotations.
 * The proxy coalesces identical in-flight queries, so a parked camera holding
 * two cache keys reached Overpass far less often than that. What those 4 300
 * POSTs did hit, every single one of them, are the limits we own: the proxy's
 * own 90-per-minute-per-IP limiter, and the 30-requests-per-10-seconds edge
 * rule in front of the hosted origin. A client that asks faster than the source
 * can recover is not retrying, it IS the outage.
 *
 * WHY THE FIRST TWO STEPS STAY AT 1.5 s. The kick's real job (field-test round
 * 1) is a boot-order race: persisted layer state re-enables traffic during the
 * intro flyTo, the first viewport read bails above the altitude bands, and a
 * camera that then parks never re-fires `camera.changed`. That race is decided
 * in the first three seconds or not at all, so the head of the curve has to
 * stay exactly as fast as it was.
 *
 * WHY THE CEILING IS 30 s — and it is NOT half the origin's outage cooldown.
 * That cooldown is deliberately not armed on a rate limit (vite.config.js says
 * so of its own constant, and the code returns the 429 payload before it could
 * be), so on the 429 path — the incident's path — there is no parking window to
 * pace against. The real pacer is what one degraded rotation COSTS: ~112 s
 * before the mirror rotation was bounded, ~20-30 s after it. Asking again
 * sooner than that just queues behind the rotation already running and holds a
 * slot the previous attempt needs. 30 s is one rotation, and it is why this
 * file and `overpassMirrors.js` have to be read together.
 *
 * WHY IT GIVES UP AT 12. The twelve steps below span 228 000 ms of SLEEP, and
 * the wall clock adds one fetch per attempt on top — about half an hour of real
 * time against a rotation that costs 112 s. Past that, on a camera holding
 * nothing, a thirteenth anonymous request is worth less to the reader than a
 * sentence saying why the screen is empty. Re-arming is free and immediate: any
 * camera move the refetch gate accepts, or toggling the layer, hands the whole
 * budget back.
 *
 * Clock-free and Cesium-free on purpose, like `trafficBounds.js`: the caller
 * owns the timer, this file owns the numbers.
 *
 * @module data/trafficRetrySchedule
 */

/** @const {readonly number[]} The head of the curve: fast, then doubling. */
export const ROAD_RETRY_STEPS_MS = Object.freeze([1_500, 1_500, 3_000, 6_000, 12_000, 24_000]);

/** @const {number} Ceiling — what one bounded degraded rotation costs. */
export const ROAD_RETRY_CEILING_MS = 30_000;

/** @const {number} Attempts before the layer stops asking and says so. */
export const ROAD_RETRY_MAX_ATTEMPTS = 12;

/**
 * Delay before the attempt numbered `attempt` (0-based: 0 is the first kick).
 *
 * Never returns 0 or NaN for any input. A NaN handed to `setTimeout` is a 0 ms
 * timer, which is the hot loop this whole file exists to remove.
 *
 * @param {number} attempt - Attempts already made.
 * @returns {number} Milliseconds to wait.
 */
export function roadRetryDelayMs(attempt) {
  const index = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return index < ROAD_RETRY_STEPS_MS.length
    ? ROAD_RETRY_STEPS_MS[index]
    : ROAD_RETRY_CEILING_MS;
}

/**
 * Whether the layer must stop asking.
 *
 * A non-finite counter reads as EXHAUSTED, not as "keep going". `attempts += 1`
 * propagates a NaN forever, and the failure mode of guessing the other way is a
 * silent hot loop — exactly the bug this module exists to remove.
 *
 * @param {number} attempt - Attempts already made.
 * @returns {boolean}
 */
export function roadRetryExhausted(attempt) {
  if (!Number.isFinite(attempt)) return true;
  return attempt >= ROAD_RETRY_MAX_ATTEMPTS;
}

/**
 * Time the first `count` attempts spend ASLEEP.
 *
 * Named for what it is: the wall clock is this plus one fetch per attempt, and
 * a failing fetch is the slow part (~112 s for a degraded rotation before
 * `overpassMirrors.js` bounded it). Computed rather than copied so the number
 * in the doc comment above can never drift from the table.
 *
 * @param {number} count - Number of attempts.
 * @returns {number} Milliseconds.
 */
export function roadRetrySleepTotalMs(count) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  let total = 0;
  for (let i = 0; i < n; i++) total += roadRetryDelayMs(i);
  return total;
}
