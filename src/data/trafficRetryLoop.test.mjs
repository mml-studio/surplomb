// src/data/trafficRetryLoop.test.mjs
//
// THE MEASUREMENT, not the arithmetic. `trafficRetrySchedule.test.mjs` pins the
// numbers; this file drives the real layer against a dead Overpass and counts
// what actually leaves the client.
//
// Measured 2026-09-16, 11:03Z–11:57Z: the shipped `setInterval(…, 1500)` ran 40
// kicks a minute for 54 minutes and each kick issued a major AND a full pass —
// roughly 4 300 POSTs out of the browser at exactly the moment the upstream was
// refusing. Those POSTs are the count this file bounds. They are NOT 4 300
// upstream rotations: the proxy coalesces identical in-flight queries. What
// every one of them did hit are the limits we own — the origin's own
// 90-per-minute limiter and the 30-per-10-seconds edge rule.
//
// TWO REGIMES, because the curve and the cap do different jobs:
//   - FAST failure (the proxy answers 429 in ~1 ms): the BACKOFF is what paces
//     this one, since nothing else does.
//   - SLOW failure (the rotation hangs for ~112 s): the CAP is what stops this
//     one, since the fetch duration already paces it.
// A change that only fixes one of them is not a fix.
import assert from 'node:assert/strict';
import test from 'node:test';

import trafficLayer from './traffic.js';
import { ROAD_RETRY_MAX_ATTEMPTS } from './trafficRetrySchedule.js';

/** Minimal event channel matching Cesium's add/removeEventListener shape. */
function eventChannel() {
  const listeners = new Set();
  const channel = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  channel.addEventListener = channel;
  channel.removeEventListener = (listener) => listeners.delete(listener);
  channel.raise = (...args) => { for (const listener of [...listeners]) listener(...args); };
  return channel;
}

/**
 * Drive the layer against a failing Overpass on a virtual clock.
 *
 * @param {Object} options
 * @param {number} options.fetchMs Virtual ms one failed road fetch takes.
 * @param {number} options.runMs Virtual ms to simulate.
 * @param {(harness: Object) => Promise<void>} [options.after] Runs BEFORE
 *   teardown — the layer is disabled and the clock restored on the way out, so
 *   a closure called after this returns would be driving a dead layer.
 * @returns {Promise<Object>} Counters plus the layer's own stats.
 */
async function runOutage({ fetchMs, runMs, after = null }) {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalDateNow = Date.now;
  const originalLog = console.log;
  const originalWarn = console.warn;

  let virtualNow = 1_700_000_000_000;
  let timerId = 0;
  const timers = new Map();
  const armedDelays = [];
  let overpassPosts = 0;
  let tomtomPosts = 0;
  let viewer = null;

  try {
    globalThis.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/api/tomtom/status')) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ hasKey: false }) };
      }
      if (href.includes('/api/tomtom')) {
        tomtomPosts += 1;
        return { ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) };
      }
      if (href.includes('/api/overpass')) {
        overpassPosts += 1;
        // The clock only moves for the road fetch: that is the duration that
        // separates the two regimes.
        const landsAt = virtualNow + fetchMs;
        await new Promise((resolve) => {
          const id = ++timerId;
          timers.set(id, { callback: resolve, dueAt: landsAt, delay: fetchMs, internal: true });
        });
        // What the origin answers while the mirrors refuse: its own rate limit,
        // which `fetchRoads` turns into `Overpass API returned 429`.
        return { ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) };
      }
      return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
    };
    globalThis.setTimeout = (callback, delay = 0) => {
      const id = ++timerId;
      const ms = Number(delay) || 0;
      timers.set(id, { callback, dueAt: virtualNow + ms, delay: ms });
      armedDelays.push(ms);
      return id;
    };
    globalThis.clearTimeout = (id) => timers.delete(id);
    Date.now = () => virtualNow;
    console.log = () => {};
    console.warn = () => {};

    const camera = {
      moveEnd: eventChannel(),
      changed: eventChannel(),
      percentageChanged: 0.5,
      // Street band (< 4 500 m): the only band that publishes BOTH a major and
      // a full pass, so one attempt costs two POSTs — the shape the outage had.
      positionCartographic: {
        latitude: 30.2672 * Math.PI / 180,
        longitude: -97.7431 * Math.PI / 180,
        height: 2_000,
      },
      computeViewRectangle() {
        const west = -97.7431 * Math.PI / 180;
        return {
          south: 30.2672 * Math.PI / 180,
          west,
          north: 30.2872 * Math.PI / 180,
          east: west + 0.02 * Math.PI / 180,
        };
      },
    };
    viewer = {
      camera,
      scene: {
        canvas: { clientWidth: 0, clientHeight: 0, width: 0, height: 0 },
        preRender: eventChannel(),
        postRender: eventChannel(),
        primitives: { add: (primitive) => primitive, remove: () => true },
        groundPrimitives: { add: (primitive) => primitive, remove: () => true },
      },
    };

    // `destroy` then `init`: the tile cache survives `disable` alone, and a
    // warm cache answers the second box with zero POSTs — which would measure
    // nothing at all.
    try { trafficLayer.destroy(viewer); } catch { /* first run has nothing to tear down */ }
    trafficLayer.init(viewer);
    trafficLayer.enable(viewer);

    const deadline = virtualNow + runMs;
    for (let guard = 0; guard < 200_000; guard++) {
      let nextId = null;
      let next = null;
      for (const [id, timer] of timers) {
        if (!next || timer.dueAt < next.dueAt) { nextId = id; next = timer; }
      }
      if (!next || next.dueAt > deadline) break;
      timers.delete(nextId);
      virtualNow = Math.max(virtualNow, next.dueAt);
      next.callback();
      for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
    }
    virtualNow = Math.max(virtualNow, deadline);

    const advance = async (ms) => {
      const until = virtualNow + ms;
      for (let guard = 0; guard < 100_000; guard++) {
        let nextId = null;
        let next = null;
        for (const [id, timer] of timers) {
          if (!next || timer.dueAt < next.dueAt) { nextId = id; next = timer; }
        }
        if (!next || next.dueAt > until) break;
        timers.delete(nextId);
        virtualNow = Math.max(virtualNow, next.dueAt);
        next.callback();
        for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
      }
      virtualNow = Math.max(virtualNow, until);
    };

    const harness = {
      stats: trafficLayer.getStats(),
      camera,
      viewer,
      advance,
      posts: () => overpassPosts,
      // Every delay the layer armed, minus the two debounces it is not about
      // (320 ms fetch, 400 ms draw-set re-cull) and the fake fetch duration —
      // what is left is the retry curve itself.
      retryDelays: armedDelays.filter((ms) => ms !== 320 && ms !== 400 && ms !== fetchMs),
      timersLeft: [...timers.values()].filter((t) => !t.internal).length,
    };
    if (after) await after(harness);
    harness.overpassPosts = overpassPosts;
    harness.tomtomPosts = tomtomPosts;
    return harness;
  } finally {
    try { trafficLayer.disable(viewer); } catch { /* stub viewer */ }
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    Date.now = originalDateNow;
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

test('FAST failures: the curve paces them, and the cap ends them', async () => {
  // The proxy answering 429 in ~1 ms is the regime where nothing but the
  // backoff stands between the client and 40 requests a minute.
  const run = await runOutage({ fetchMs: 1, runMs: 60 * 60 * 1_000 });

  // `enable()`'s own viewport check is a load, not a retry, so it is not
  // charged: one pass pair for it, then 12 charged attempts at a pair each.
  assert.equal(
    run.overpassPosts,
    2 * (1 + ROAD_RETRY_MAX_ATTEMPTS),
    `budget leaked or starved: ${run.overpassPosts} POSTs in one simulated hour`,
  );
  assert.equal(run.stats.roadRetryAttempts, ROAD_RETRY_MAX_ATTEMPTS);
  assert.equal(run.stats.retryInSec, 0, 'a layer that gave up must not advertise a countdown');
  assert.equal(run.timersLeft, 0, 'a tab left open overnight must cost nothing further');

  // The curve itself, read off the delays the layer armed. Duplicates are
  // expected and correct — a failed load re-arms at the CURRENT step, so the
  // same delay appears more than once before the budget advances. What must
  // hold is that the steps only ever climb, and climb through the whole table.
  assert.ok(
    run.retryDelays.every((ms, i) => i === 0 || ms >= run.retryDelays[i - 1]),
    `the curve went backwards: ${run.retryDelays.join(', ')}`,
  );
  assert.deepEqual(
    [...new Set(run.retryDelays)],
    [1_500, 3_000, 6_000, 12_000, 24_000, 30_000],
    'every step of the table must be reached, in order, and none invented',
  );
});

test('SLOW failures: the cap ends them too, where a backoff alone would not', async () => {
  // The 2026-09-16 regime: a degraded rotation took ~112 s, so the fetch
  // duration already paced the client and the curve bought almost nothing. The
  // cap is the only thing that stops this one.
  const run = await runOutage({ fetchMs: 112_000, runMs: 6 * 60 * 60 * 1_000 });
  assert.ok(
    run.overpassPosts <= 2 * (1 + ROAD_RETRY_MAX_ATTEMPTS),
    `budget leaked: ${run.overpassPosts} POSTs across six simulated hours`,
  );
  assert.equal(run.timersLeft, 0, 'the schedule must stop even when every fetch is slow');
});

test('the reader is told why the city is empty, and what brings it back', async () => {
  const run = await runOutage({ fetchMs: 1, runMs: 60 * 60 * 1_000 });
  assert.match(run.stats.error, /Road graph/);
  assert.match(run.stats.error, /no vehicles/);
  assert.match(run.stats.error, /move the camera to retry/);
  assert.ok(!/TomTom/.test(run.stats.error), `flow blamed for a road outage: ${run.stats.error}`);
});

test('a camera move hands the budget back — the layer is not dead until reload', async () => {
  let before = null;
  let afterMove = null;
  await runOutage({
    fetchMs: 1,
    runMs: 60 * 60 * 1_000,
    after: async (run) => {
      assert.ok(run.stats.roadRetryGaveUp !== undefined || run.stats.error, 'precondition: it gave up');
      before = run.posts();
      run.camera.positionCartographic.longitude = -97.70 * Math.PI / 180;
      run.camera.changed.raise();
      await run.advance(10_000);
      afterMove = run.posts();
    },
  });
  assert.ok(
    afterMove > before,
    `a camera move must hand the retry budget back: ${before} -> ${afterMove} POSTs`,
  );
});
