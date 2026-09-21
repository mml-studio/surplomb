// src/data/traffic.test.mjs
// Feed-state honesty for the traffic layer (roadmap L7).
//
// A launch-day stranger runs a keyless build. The layer then simulates
// traffic, and every surface it drives — the toggle chip, the panel meta
// line, the traffic sync chip — has to say so. The two pure helpers below own
// that contract; the layer's getStats() is a thin caller.
import test from 'node:test';
import assert from 'node:assert/strict';
import trafficLayer, {
  FLOW_REFRESH_MAX_PER_VIEW,
  FLOW_REFRESH_MS,
  deriveRoadGraphError,
  deriveTrafficFlowError,
  dutyCycleDelay,
  flowRefreshDecision,
  oldestFetchedAt,
  trafficFeedPresentation,
  trafficLegendNote,
} from './traffic.js';
import { withLocale } from '../i18n/testing.js';
import { DataLayerManager, layerFeedState } from './manager.js';

/**
 * The app's live markers. Case-SENSITIVE on purpose: uppercase LIVE/GPS is
 * how this UI asserts a real feed ("LIVE · TomTom flow", the old "initiating
 * global GPS sync"), while lowercase "add TomTom key for live" names the
 * remedy without claiming one.
 */
const LIVE_CLAIM = /\bLIVE\b|\bGPS\b|\breal[- ]?time\b/;

test('a superseded flow fetch is not an outage', () => {
  assert.equal(deriveTrafficFlowError({ name: 'AbortError', message: 'aborted' }), null);
  assert.equal(deriveTrafficFlowError(null), null);
  assert.equal(deriveTrafficFlowError(undefined), null);
});

test('flow failures map onto short, specific reasons', () => {
  const reason = (message) => deriveTrafficFlowError(new Error(message));
  assert.equal(reason('flow tile 12/1/1: HTTP 503'), 'TomTom key unavailable');
  assert.equal(reason('flow tile 12/1/1: HTTP 429'), 'Flow rate limited (HTTP 429)');
  assert.equal(reason('flow tile 12/1/1: HTTP 502'), 'TomTom upstream unreachable');
  assert.equal(reason('flow tile 12/1/1: HTTP 504'), 'TomTom upstream unreachable');
  assert.equal(reason('flow tile 12/1/1: HTTP 418'), 'TomTom flow error (HTTP 418)');
  assert.equal(reason('flow fetch failed'), 'TomTom flow unavailable');
});

test('a 429 names WHOSE limit it was, or refuses to guess', () => {
  const typed = (status, why) => {
    const err = new Error(`flow tile 12/1/1: HTTP ${status}`);
    err.status = status;
    err.reason = why;
    return deriveTrafficFlowError(err);
  };
  // Ours: the daily tile budget, and only tomorrow changes it.
  assert.equal(typed(429, 'budget'), 'TomTom daily budget reached');
  // The edge rule in front of the origin: seconds, and no bill anywhere.
  assert.equal(typed(429, 'edge'), 'Rate limited by the server, not by TomTom');
  // Unlabelled — it must not send a reader looking for a bill.
  assert.match(typed(429, null), /HTTP 429/);
  assert.doesNotMatch(typed(429, null), /budget/i);
});

test('the typed status wins over the message it was formatted into', () => {
  const err = new Error('flow tile 12/1/1: HTTP 429');
  err.status = 503;
  assert.equal(deriveTrafficFlowError(err), 'TomTom key unavailable');
});

test('keyless traffic names the mode and the remedy, loading or idle', () => {
  const idle = trafficFeedPresentation({ liveMode: false, fetching: false });
  const loading = trafficFeedPresentation({ liveMode: false, fetching: true });
  assert.equal(idle.mode, 'sim');
  assert.equal(loading.mode, 'sim');
  // Keyless is a designed fallback, not a fault — no error, or every keyless
  // build would boot with a red chip.
  assert.equal(idle.error, null);
  assert.equal(loading.error, null);
  // One terse line in both states; the chip's progress text carries "working".
  assert.equal(idle.loadingLabel, 'SIMULATED — add TomTom key for live');
  assert.equal(loading.loadingLabel, 'SIMULATED — add TomTom key for live');
});

test('no keyless label ever implies a live feed', () => {
  const labels = [
    trafficFeedPresentation({ liveMode: false, fetching: false }),
    trafficFeedPresentation({ liveMode: false, fetching: true }),
    trafficFeedPresentation({ statusUnavailable: true }),
    trafficFeedPresentation({ liveMode: true, flowError: 'TomTom flow unavailable' }),
    trafficFeedPresentation({ liveMode: true, fetching: true, flowError: 'TomTom flow unavailable' }),
  ].map((feed) => feed.loadingLabel);
  for (const label of labels) {
    assert.ok(!LIVE_CLAIM.test(label), `label implies live data: ${label}`);
    assert.ok(label.startsWith('SIMULATED'), `fallback label must lead with the mode: ${label}`);
  }
});

test('simulating because the status probe failed reads differently from keyless by design', () => {
  const probeDown = trafficFeedPresentation({ statusUnavailable: true });
  assert.equal(probeDown.mode, 'sim');
  assert.equal(probeDown.loadingLabel, 'SIMULATED — traffic service unreachable');
});

test('a healthy keyed layer reports live flow with its real coverage', () => {
  const idle = trafficFeedPresentation({ liveMode: true, coveragePct: 87 });
  assert.deepEqual(idle, {
    mode: 'live',
    error: null,
    loadingLabel: 'LIVE · TomTom flow · 87% cov',
  });
  assert.equal(
    trafficFeedPresentation({ liveMode: true, fetching: true }).loadingLabel,
    'syncing LIVE traffic flow',
  );
});

test('a mid-session flow outage degrades instead of reporting stale live coverage', () => {
  const down = trafficFeedPresentation({
    liveMode: true,
    flowError: 'TomTom daily budget reached',
    coveragePct: 87, // last-good number — must not be presented as current
  });
  // error and loadingLabel are ONE string: the manager's error branch renders
  // `error` and drops `loadingLabel`, so the copy has to live in both.
  assert.equal(down.error, 'SIMULATED — TomTom daily budget reached');
  assert.equal(down.loadingLabel, down.error);
  assert.ok(!down.loadingLabel.includes('87'));
  const busy = trafficFeedPresentation({
    liveMode: true,
    fetching: true,
    flowError: 'TomTom daily budget reached',
  });
  assert.deepEqual(busy, down, 'the degraded state reads the same whether or not a load is in flight');
});

test('the rendered steady-state meta line carries the SIMULATED copy', () => {
  const mgr = new DataLayerManager({});
  const stats = (feed) => ({ count: 544, lastUpdate: Date.now(), ...feed });
  assert.equal(
    mgr._buildMetaText({
      source: 'OpenStreetMap',
      stats: stats(trafficFeedPresentation({ liveMode: false })),
    }),
    'FALLBACK · OpenStreetMap · SIMULATED — add TomTom key for live',
  );
  assert.equal(
    mgr._buildMetaText({
      source: 'OpenStreetMap',
      stats: stats(trafficFeedPresentation({
        liveMode: true,
        flowError: 'TomTom daily budget reached',
      })),
    }),
    'DEGRADED · OpenStreetMap · SIMULATED — TomTom daily budget reached',
  );
});

test('a superseded road fetch is not an outage either', () => {
  assert.equal(deriveRoadGraphError({ name: 'AbortError', message: 'aborted' }), null);
  assert.equal(deriveRoadGraphError(null), null);
  assert.equal(deriveRoadGraphError(undefined), null);
});

test('road-graph failures read the proxy status out of fetchRoads own wording', () => {
  // `fetchRoads` raises `Overpass API returned NNN`, NOT `HTTP NNN` — a parse
  // borrowed from `deriveTrafficFlowError` would match nothing and every
  // outage would read as the same generic line.
  const reason = (message) => deriveRoadGraphError(new Error(message));
  // Whose 429 it is cannot be known from here: under a retry loop the likeliest
  // author is our own origin, not OpenStreetMap. It must blame nobody.
  assert.equal(reason('Overpass API returned 429'), 'Road graph rate limited (HTTP 429)');
  assert.ok(!/OpenStreetMap|TomTom|Cloudflare/.test(reason('Overpass API returned 429')));
  assert.equal(reason('Overpass API returned 503'), 'Road graph server busy');
  assert.equal(reason('Overpass API returned 502'), 'Road graph source unreachable (Overpass)');
  assert.equal(reason('Overpass API returned 504'), 'Road graph source unreachable (Overpass)');
  assert.equal(reason('Overpass API returned 418'), 'Road graph error (HTTP 418)');
  // The shape an aborted-then-rethrown network error actually has.
  assert.equal(reason('This operation was aborted'), 'Road graph unavailable (Overpass)');
  assert.equal(deriveRoadGraphError({ status: 502 }), 'Road graph source unreachable (Overpass)');
});

test('no road graph outranks any flow verdict, keyed or keyless', () => {
  // 2026-09-16: Overpass was down, the TomTom ribbon still painted, and the row
  // said "add TomTom key for live" over a city with zero cars in it.
  const roadDown = 'Road graph source unreachable (Overpass)';
  for (const feed of [
    trafficFeedPresentation({ liveMode: false, roadError: roadDown }),
    trafficFeedPresentation({ liveMode: true, roadError: roadDown }),
    trafficFeedPresentation({ liveMode: true, flowError: 'TomTom daily budget reached', roadError: roadDown }),
    trafficFeedPresentation({ liveMode: true, fetching: true, roadError: roadDown }),
  ]) {
    assert.ok(feed.error.startsWith(roadDown), feed.error);
    assert.equal(feed.loadingLabel, feed.error);
    assert.ok(!/TomTom/.test(feed.error), `flow blamed for a road outage: ${feed.error}`);
    assert.ok(!LIVE_CLAIM.test(feed.loadingLabel), `outage label implies live data: ${feed.loadingLabel}`);
  }
  // `mode` still reports the CONFIGURED source, not this instant's health.
  assert.equal(trafficFeedPresentation({ liveMode: true, roadError: roadDown }).mode, 'live');
  assert.equal(trafficFeedPresentation({ liveMode: false, roadError: roadDown }).mode, 'sim');
});

test('the outage line names the CARS, and does not deny a ribbon that is painted', () => {
  // The TomTom tiles carry their own geometry and land in ~200 ms, so the
  // Overpass-down state is coloured roads with nobody on them — which is
  // precisely what the reader wrote in to ask about. Saying "nothing on screen"
  // would be false, and saying "TomTom problem" would be false twice.
  const roadDown = 'Road graph source unreachable (Overpass)';
  const withRibbon = trafficFeedPresentation({ liveMode: true, roadError: roadDown, ribbonPainted: true });
  const without = trafficFeedPresentation({ liveMode: true, roadError: roadDown, ribbonPainted: false });
  assert.match(withRibbon.error, /no vehicles, flow ribbon only/);
  assert.equal(without.error, `${roadDown} — no vehicles`);
});

test('a spent retry budget says what brings the layer back', () => {
  const roadDown = 'Road graph source unreachable (Overpass)';
  const retrying = trafficFeedPresentation({ liveMode: true, roadError: roadDown });
  const gaveUp = trafficFeedPresentation({ liveMode: true, roadError: roadDown, roadRetryGaveUp: true });
  assert.ok(!/move the camera/.test(retrying.error), 'a layer still retrying must not ask for help');
  assert.match(gaveUp.error, /move the camera to retry/);
  // Giving up with nothing wrong must stay silent — the flag alone is not an error.
  assert.equal(trafficFeedPresentation({ liveMode: true, roadRetryGaveUp: true }).error, null);
});

test('a road outage reads UNAVAILABLE with nothing drawn, DEGRADED once something was', () => {
  // The chip colour is not a detail: with zero dots and no prior load the layer
  // IS unavailable, and calling that "degraded" would promise data that is not
  // there. `layerFeedState` draws the line on prior data, not on the message.
  const mgr = new DataLayerManager({});
  const feed = trafficFeedPresentation({
    liveMode: true,
    roadError: 'Road graph source unreachable (Overpass)',
  });
  assert.equal(layerFeedState({ count: 0, lastUpdate: null, ...feed }), 'unavailable');
  assert.equal(layerFeedState({ count: 0, lastUpdate: Date.now(), ...feed }), 'degraded');
  assert.equal(
    mgr._buildMetaText({
      source: 'OpenStreetMap',
      stats: { count: 0, lastUpdate: Date.now(), ...feed, retryInSec: 24 },
    }),
    'DEGRADED · OpenStreetMap · Road graph source unreachable (Overpass) — no vehicles · nouvelle tentative dans 24 s',
  );
});

test('the manager reads keyless as FALLBACK and an outage as DEGRADED', () => {
  const settled = { count: 4200, lastUpdate: Date.now() };
  assert.equal(
    layerFeedState({ ...settled, ...trafficFeedPresentation({ liveMode: false }) }),
    'fallback',
  );
  assert.equal(
    layerFeedState({ ...settled, ...trafficFeedPresentation({ liveMode: true }) }),
    'nominal',
  );
  assert.equal(
    layerFeedState({
      ...settled,
      ...trafficFeedPresentation({ liveMode: true, flowError: 'TomTom flow unavailable' }),
    }),
    'degraded',
  );
});

test('the shipped layer boots keyless-honest before any status check', () => {
  const stats = trafficLayer.getStats();
  assert.equal(stats.mode, 'sim');
  assert.equal(stats.error, null);
  assert.ok(!LIVE_CLAIM.test(stats.loadingLabel), `boot label implies live data: ${stats.loadingLabel}`);
  assert.equal(layerFeedState(stats), 'fallback');
});


// ─── Ground-seating duty cycle ────────────────────────────────────────────
// The loop that seats roads on the drawn surface buys its readings in
// batches, and on the photorealistic mesh a batch costs about 120 ms. What
// keeps that off the frame budget is not the batch — it is the quiet after
// it. These are the two ends of that rule.

test('a cheap pass keeps the plain tick, so the globe path is unchanged', () => {
  // `globe.getHeight` costs ~0.02 ms a reading; a pass that spent 1 ms inside
  // its probes must come straight back, exactly as it did before the duty
  // cycle existed. Keying this off the WHOLE pass instead of the probes was
  // measured taking qa-traffic-floor from converging in 7 s to not converging
  // inside 90 s.
  assert.equal(dutyCycleDelay(0), 250);
  assert.equal(dutyCycleDelay(1), 250);
  assert.equal(dutyCycleDelay(50), 250);
});

test('an expensive pass is followed by four times its own cost in quiet', () => {
  // 20 % duty: 120 ms of probes earns 480 ms of silence.
  assert.equal(dutyCycleDelay(120), 480);
  assert.equal(dutyCycleDelay(200), 800);
});

test('the quiet is capped, so one pathological probe cannot park the loop', () => {
  assert.equal(dutyCycleDelay(5000), 2000);
  assert.equal(dutyCycleDelay(Number.POSITIVE_INFINITY), 250);
  assert.equal(dutyCycleDelay(Number.NaN), 250);
  assert.equal(dutyCycleDelay(-10), 250);
});


// ─── What the key says about the vehicles, and when ──────────────────────
// The key used to say "rafraîchi toutes les 60 s" while nothing re-fetched the
// flow on a still camera. It now says the vehicles are simulated and prints
// when the oldest tile on screen left TomTom.

test('the key opens on simulated vehicles and prints when the speeds left TomTom', () => {
  const noon = Date.UTC(2026, 8, 21, 10, 16, 0);
  const line = withLocale('fr', () => trafficLegendNote({
    liveMode: true, fetchedAt: noon - 60_000, now: noon, timeZone: 'UTC',
  }));
  assert.equal(line, 'Véhicules simulés, animés d’après les vitesses reçues de TomTom à 10:15');
  const stale = withLocale('fr', () => trafficLegendNote({
    liveMode: true, fetchedAt: noon - 20 * 3_600_000, now: noon, timeZone: 'UTC',
  }));
  assert.match(stale, /reçues de TomTom le 20 sept\.? à 14:16$/, 'yesterday says so');
  assert.equal(
    withLocale('fr', () => trafficLegendNote({ liveMode: true, fetchedAt: null })),
    'Véhicules simulés, animés d’après les vitesses reçues de TomTom',
  );
});

test('a keyless key never implies a feed', () => {
  const line = withLocale('fr', () => trafficLegendNote({ liveMode: false, fetchedAt: Date.now() }));
  assert.equal(line, 'Véhicules simulés : aucune vitesse n’est mesurée ici');
  assert.ok(!LIVE_CLAIM.test(line));
});

test('the time printed is the OLDEST tile on screen, not the newest', () => {
  assert.equal(oldestFetchedAt([{ fetchedAt: 300 }, { fetchedAt: 100 }, {}, { fetchedAt: 200 }]), 100);
  assert.equal(oldestFetchedAt([]), null);
  assert.equal(oldestFetchedAt([{ fetchedAt: Number.NaN }]), null);
});

// ─── The quiet refresh of a parked view ──────────────────────────────────

test('a parked view refreshes only once the caches behind it have expired', () => {
  // Proxy TTL and client decode TTL are both 120 s: any sooner and the answer
  // is the tiles already on screen.
  assert.ok(FLOW_REFRESH_MS > 120_000);
  assert.ok(FLOW_REFRESH_MS < 180_000);
});

test('the refresh waits behind a camera load and a hidden tab, and stops keyless', () => {
  const base = {
    enabled: true, liveMode: true, hasBox: true, fetching: false, flowPending: 0, hidden: false, spent: 0,
  };
  assert.equal(flowRefreshDecision(base), 'refresh');
  assert.equal(flowRefreshDecision({ ...base, fetching: true }), 'wait');
  assert.equal(flowRefreshDecision({ ...base, flowPending: 1 }), 'wait');
  assert.equal(flowRefreshDecision({ ...base, hidden: true }), 'wait');
  assert.equal(flowRefreshDecision({ ...base, liveMode: false }), 'stop');
  assert.equal(flowRefreshDecision({ ...base, enabled: false }), 'stop');
  assert.equal(flowRefreshDecision({ ...base, hasBox: false }), 'stop');
});

test('one parked view spends a bounded number of refreshes on the shared budget', () => {
  const base = {
    enabled: true, liveMode: true, hasBox: true, fetching: false, flowPending: 0, hidden: false,
  };
  assert.equal(flowRefreshDecision({ ...base, spent: FLOW_REFRESH_MAX_PER_VIEW - 1 }), 'refresh');
  assert.equal(flowRefreshDecision({ ...base, spent: FLOW_REFRESH_MAX_PER_VIEW }), 'stop');
  // About ten minutes of watching, not a day.
  assert.ok(FLOW_REFRESH_MAX_PER_VIEW * FLOW_REFRESH_MS <= 15 * 60_000);
});

// ─── The diagnostic frames ────────────────────────────────────────────────

test('the VEH frames are off by default and are the only claim on detection', () => {
  assert.equal(trafficLayer.getParams().vehicleFrames, 'off');
  assert.deepEqual(trafficLayer.getDetectableObjects({ maxCount: 10 }), []);
  assert.equal(trafficLayer.demandsDetection(), false);
  trafficLayer.setParams({ vehicleFrames: 'on' });
  try {
    assert.equal(trafficLayer.getParams().vehicleFrames, 'on');
    // A disabled layer claims nothing, chip or not.
    assert.equal(trafficLayer.demandsDetection(), false);
  } finally {
    trafficLayer.setParams({ vehicleFrames: 'off' });
  }
  trafficLayer.setParams({ vehicleFrames: 'sideways' });
  assert.equal(trafficLayer.getParams().vehicleFrames, 'off', 'an unknown value is ignored');
});
