// src/data/trafficRetrySchedule.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROAD_RETRY_STEPS_MS,
  ROAD_RETRY_CEILING_MS,
  ROAD_RETRY_MAX_ATTEMPTS,
  roadRetryDelayMs,
  roadRetryExhausted,
  roadRetrySleepTotalMs,
} from './trafficRetrySchedule.js';

test('the head of the curve is unchanged: the first two kicks still cost 1.5 s', () => {
  // The boot-order race this kick exists for is decided in the first three
  // seconds. Slowing the head would fix the outage by breaking the feature.
  assert.equal(roadRetryDelayMs(0), 1_500);
  assert.equal(roadRetryDelayMs(1), 1_500);
});

test('the curve doubles, then flattens at the ceiling', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map(roadRetryDelayMs),
    [1_500, 1_500, 3_000, 6_000, 12_000, 24_000],
  );
  for (const attempt of [6, 7, 11, 40, 10_000]) {
    assert.equal(roadRetryDelayMs(attempt), ROAD_RETRY_CEILING_MS, `attempt ${attempt}`);
  }
});

test('the ceiling is the cost of ONE degraded rotation, not half a cooldown', () => {
  // Deliberately NOT tied to OVERPASS_OUTAGE_COOLDOWN_MS: that parking is never
  // armed on the 429 path, which is the path this incident took. What paces the
  // client is what a rotation costs — ~20-30 s once `overpassMirrors.js` bounds
  // it — because asking sooner only queues behind the one already running.
  assert.equal(ROAD_RETRY_CEILING_MS, 30_000);
  assert.ok(ROAD_RETRY_CEILING_MS >= ROAD_RETRY_STEPS_MS[ROAD_RETRY_STEPS_MS.length - 1]);
});

test('the schedule never decreases', () => {
  for (let i = 1; i <= ROAD_RETRY_MAX_ATTEMPTS + 4; i++) {
    assert.ok(
      roadRetryDelayMs(i) >= roadRetryDelayMs(i - 1),
      `step ${i} (${roadRetryDelayMs(i)}) is shorter than step ${i - 1}`,
    );
  }
});

test('no input produces a 0 ms timer — the hot loop this file removes', () => {
  for (const bad of [NaN, undefined, null, -1, -Infinity, Infinity, 'x', {}]) {
    const delay = roadRetryDelayMs(bad);
    assert.ok(Number.isFinite(delay) && delay > 0, `${String(bad)} -> ${delay}`);
  }
  // A non-integer attempt floors rather than interpolating into a gap.
  assert.equal(roadRetryDelayMs(2.9), roadRetryDelayMs(2));
});

test('the budget is exhausted at 12 attempts and not before', () => {
  assert.equal(ROAD_RETRY_MAX_ATTEMPTS, 12);
  assert.equal(roadRetryExhausted(11), false);
  assert.equal(roadRetryExhausted(12), true);
  assert.equal(roadRetryExhausted(13), true);
  // A corrupt counter reads as EXHAUSTED. `attempts += 1` propagates a NaN
  // forever, and guessing the other way is a silent hot loop.
  assert.equal(roadRetryExhausted(NaN), true);
  assert.equal(roadRetryExhausted(undefined), true);
  assert.equal(roadRetryExhausted(Infinity), true);
  assert.equal(roadRetryExhausted(0), false);
});

test('the budget spends 3 min 48 s ASLEEP — the wall clock is that plus the fetches', () => {
  assert.equal(roadRetrySleepTotalMs(ROAD_RETRY_MAX_ATTEMPTS), 228_000);
  assert.equal(roadRetrySleepTotalMs(0), 0);
  assert.equal(roadRetrySleepTotalMs(-3), 0);
  assert.equal(roadRetrySleepTotalMs(NaN), 0);
  assert.equal(roadRetrySleepTotalMs(1), 1_500);
  assert.equal(roadRetrySleepTotalMs(6), ROAD_RETRY_STEPS_MS.reduce((a, b) => a + b, 0));
});

test('the budget cuts the measured KICK count by more than 100x', () => {
  // Measured 2026-09-16, 11:03Z-11:57Z: ~2 160 kicks at a fixed 1.5 s. This is a
  // claim about kicks and about browser POSTs, NOT about upstream rotations —
  // the proxy coalesces identical in-flight queries, so the two counts differ.
  const outageMs = 54 * 60 * 1_000;
  const oldKicks = Math.floor(outageMs / 1_500);
  assert.ok(oldKicks > 2_000, `sanity: ${oldKicks}`);
  assert.ok(roadRetrySleepTotalMs(ROAD_RETRY_MAX_ATTEMPTS) < outageMs);
  assert.ok(oldKicks / ROAD_RETRY_MAX_ATTEMPTS > 100, `cut is only ${oldKicks / ROAD_RETRY_MAX_ATTEMPTS}x`);
});

test('the steps table is frozen — a caller cannot rewrite the cadence in place', () => {
  assert.throws(() => { ROAD_RETRY_STEPS_MS[0] = 1; }, TypeError);
});
