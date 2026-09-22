// The upstream pacers: every published per-IP ceiling the hosted server can
// reach through its proxies, and the queue that keeps it under them. Timing is
// tested through `reserve` and an injected clock — nothing here sleeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAX_WAIT_MS,
  DEFAULT_PENALTY_S,
  MAX_PENALTY_S,
  PACING_SHARE,
  UPSTREAM_LIMITS,
  UpstreamBusyError,
  createPacer,
  createUpstreamPacing,
  pacingIntervalMs,
  penaltySeconds,
  upstreamLimitFor,
} from './upstreamPacing.js';

/** A clock the test moves by hand. */
function manualClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance(ms) { t += ms; } };
}

/** Largest number of departures inside any window of `windowMs`. */
function busiestWindow(departures, windowMs = 1000) {
  let best = 0;
  for (let i = 0; i < departures.length; i += 1) {
    const inside = departures.filter((d) => d >= departures[i] && d < departures[i] + windowMs).length;
    best = Math.max(best, inside);
  }
  return best;
}

test('every URL the proxies send reaches the ceiling its publisher states', () => {
  const cases = [
    ['https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque?latlon=2.37,48.83', 'georisques-report', 1],
    ['https://www.georisques.gouv.fr/api/v1/installations_classees?latlon=2.37,48.83&rayon=1000', 'georisques-v1', 5],
    ['https://www.georisques.gouv.fr/api/v1/radon?code_insee=75113', 'georisques-v1', 5],
    ['https://data.geopf.fr/navigation/isochrone?point=2.35,48.85&resource=bdtopo-valhalla', 'geoplateforme-isochrone', 5],
    ['https://data.geopf.fr/wfs/ows?SERVICE=WFS&REQUEST=GetFeature', 'geoplateforme-wfs', 30],
    ['https://data.geopf.fr/geocodage/search?q=rivoli', 'geoplateforme-geocoding', 50],
    ['https://api-adresse.data.gouv.fr/reverse/?lon=2.35&lat=48.85', 'geoplateforme-geocoding', 50],
    ['https://api-adresse.data.gouv.fr/search/csv/', 'geoplateforme-geocoding', 50],
    ['https://api.insee.fr/melodi/data/DS_RP_EMPLOI_LR_PRINC?GEO=COM-75056', 'insee-melodi', 20],
    ['https://nominatim.openstreetmap.org/search?q=Lyon&format=jsonv2', 'nominatim', 1],
    ['https://nominatim.openstreetmap.org/reverse?lat=45.7&lon=4.8', 'nominatim', 1],
    ['https://routing.openstreetmap.de/routed-bike/table/v1/driving/4.8,45.7;4.9,45.8', 'fossgis-osrm', 1],
    ['https://routing.openstreetmap.de/routed-foot/route/v1/foot/4.8,45.7;4.9,45.8', 'fossgis-osrm', 1],
    ['https://api.gdeltproject.org/api/v2/doc/doc?query=%22Lyon%22&mode=artlist&format=json', 'gdelt-doc', 0.2],
  ];
  for (const [url, id, perSecond] of cases) {
    const limit = upstreamLimitFor(url);
    assert.ok(limit, `${url} must be paced`);
    assert.equal(limit.id, id, url);
    assert.equal(limit.publishedPerSecond, perSecond, url);
    assert.match(limit.source, /^https:\/\//, `${id} cites its source`);
  }
});

test('hosts and services with no published ceiling here are left alone', () => {
  for (const url of [
    'https://data.geopf.fr/wms-v/ows?SERVICE=WMS', // WMS-Vecteur: not in this change
    'https://data.geopf.fr/wmts?SERVICE=WMTS', // exempt at the source
    'https://files.data.gouv.fr/geo-dvf/latest/csv/2024/communes/75/75113.csv',
    'https://geo.api.gouv.fr/communes?lat=48.8&lon=2.3',
    'https://api.tomtom.com/traffic/map/4/tile/flow/relative/12/1/1.pbf',
    'https://www.georisques.gouv.fr/mes-risques', // not the API
    'not a url',
  ]) {
    assert.equal(upstreamLimitFor(url), null, url);
  }
});

test('the pacers run at 80 % of each ceiling', () => {
  assert.equal(PACING_SHARE, 0.8);
  assert.equal(pacingIntervalMs(1), 1250);
  assert.equal(pacingIntervalMs(5), 250);
  assert.equal(pacingIntervalMs(20), 63);
  assert.equal(pacingIntervalMs(30), 42);
  assert.equal(pacingIntervalMs(50), 25);
  for (const limit of UPSTREAM_LIMITS) {
    const perSecond = 1000 / pacingIntervalMs(limit.publishedPerSecond);
    assert.ok(perSecond <= limit.publishedPerSecond * PACING_SHARE + 1e-9, limit.id);
  }
  assert.throws(() => pacingIntervalMs(0));
});

test('a burst leaves evenly spaced, and no second ever holds more than the ceiling', () => {
  const clock = manualClock();
  const pacer = createPacer({ intervalMs: pacingIntervalMs(5), now: clock.now });
  const departures = [];
  for (let i = 0; i < 20; i += 1) {
    const verdict = pacer.reserve(null);
    assert.equal(verdict.ok, true, `call ${i} queues`);
    departures.push(clock.now() + verdict.waitMs);
  }
  // 250 ms apart: the twentieth leaves 4.75 s after the first.
  assert.deepEqual(departures.slice(0, 3).map((d) => d - departures[0]), [0, 250, 500]);
  assert.equal(departures[19] - departures[0], 4750);
  assert.ok(busiestWindow(departures) <= 4, 'at most 4 in any second against a ceiling of 5');
});

test('a queue longer than the bound is refused with the wait it would have cost', () => {
  const clock = manualClock();
  const pacer = createPacer({ intervalMs: 1250, maxWaitMs: DEFAULT_MAX_WAIT_MS, now: clock.now });
  // 0, 1.25, 2.5, 3.75, 5.0 s: the fifth waits exactly the bound and is kept.
  for (let i = 0; i < 5; i += 1) assert.equal(pacer.reserve(null).ok, true);
  const refused = pacer.reserve(null);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'queue');
  assert.equal(refused.retryAfterSec, 2, '6.25 s against a 5 s bound, rounded up');
  // A refusal books nothing: the queue drains and the next call gets in.
  clock.advance(1250);
  assert.equal(pacer.reserve(null).ok, true);
});

test('one visitor holds at most half the queue, and the others still get in', () => {
  const clock = manualClock();
  const pacer = createPacer({ intervalMs: 1250, now: clock.now });
  assert.equal(pacer.maxPendingPerKey, 2);
  assert.equal(pacer.reserve('198.51.100.1').ok, true, 'leaves now, so it holds no queue');
  assert.equal(pacer.reserve('198.51.100.1').ok, true);
  assert.equal(pacer.reserve('198.51.100.1').ok, true);
  const greedy = pacer.reserve('198.51.100.1');
  assert.equal(greedy.ok, false);
  assert.equal(greedy.reason, 'visitor');
  assert.equal(greedy.retryAfterSec, 2, 'its first booked departure is 1.25 s away');
  assert.equal(pacer.reserve('203.0.113.9').ok, true, 'another visitor is not blocked by the first');
  // Once the visitor's first booking has left, it may book again.
  clock.advance(1250);
  assert.equal(pacer.reserve('198.51.100.1').ok, true);
});

test('the server\'s own work is never capped per visitor', () => {
  const clock = manualClock();
  const pacer = createPacer({ intervalMs: 1250, now: clock.now });
  for (let i = 0; i < 5; i += 1) assert.equal(pacer.reserve(null).ok, true);
});

test('an upstream 429 stops its pacer for the time it asked, and no longer', () => {
  const clock = manualClock();
  const pacing = createUpstreamPacing({ now: clock.now, sleep: async () => {} });
  const url = 'https://data.geopf.fr/navigation/isochrone?point=2.35,48.85';
  assert.equal(pacing.penalize(url, '3'), 3);
  assert.equal(pacing.pacer('geoplateforme-isochrone').queuedMs(), 3000);
  // The WFS is another API with its own block: untouched.
  assert.equal(pacing.pacer('geoplateforme-wfs').queuedMs(), 0);
  assert.equal(pacing.penalize('https://example.org/', '3'), null);
});

test('a missing, absurd or huge Retry-After becomes a bounded pause', () => {
  const now = () => Date.UTC(2026, 8, 22, 12, 0, 0);
  assert.equal(penaltySeconds(null, now), DEFAULT_PENALTY_S);
  assert.equal(penaltySeconds('soon', now), DEFAULT_PENALTY_S);
  assert.equal(penaltySeconds('0', now), DEFAULT_PENALTY_S);
  assert.equal(penaltySeconds('12', now), 12);
  assert.equal(penaltySeconds('86400', now), MAX_PENALTY_S);
  assert.equal(penaltySeconds('Tue, 22 Sep 2026 12:00:30 GMT', now), 30);
});

test('acquire sleeps until the slot, and answers at once for an unpaced host', async () => {
  const clock = manualClock();
  const slept = [];
  const pacing = createUpstreamPacing({ now: clock.now, sleep: async (ms) => { slept.push(ms); } });
  const nominatim = 'https://nominatim.openstreetmap.org/search?q=Lyon';
  assert.deepEqual(await pacing.acquire(nominatim), { ok: true, upstream: 'nominatim', waitMs: 0 });
  assert.deepEqual(await pacing.acquire(nominatim), { ok: true, upstream: 'nominatim', waitMs: 1250 });
  assert.deepEqual(slept, [1250]);
  assert.deepEqual(await pacing.acquire('https://geo.api.gouv.fr/communes'), { ok: true, upstream: null, waitMs: 0 });
});

test('the two geocoding hosts spend one bucket', async () => {
  const clock = manualClock();
  const pacing = createUpstreamPacing({ now: clock.now, sleep: async () => {} });
  await pacing.acquire('https://api-adresse.data.gouv.fr/reverse/?lon=2&lat=48');
  const second = await pacing.acquire('https://data.geopf.fr/geocodage/search?q=x');
  assert.equal(second.waitMs, 25, 'the second host waits behind the first');
});

test('a refusal names the upstream and the wait, for a 503 with Retry-After', async () => {
  const clock = manualClock();
  const pacing = createUpstreamPacing({ now: clock.now, sleep: async () => {} });
  const url = 'https://www.georisques.gouv.fr/api/v1/resultats_rapport_risque?latlon=2,48';
  const verdicts = [];
  for (let i = 0; i < 6; i += 1) verdicts.push(await pacing.acquire(url));
  const refused = verdicts.at(-1);
  assert.equal(refused.ok, false);
  assert.equal(refused.upstream, 'georisques-report');
  assert.ok(refused.retryAfterSec >= 1);
  const error = new UpstreamBusyError(refused.upstream, refused.retryAfterSec);
  assert.equal(error.name, 'UpstreamBusyError');
  assert.equal(error.retryAfterSec, refused.retryAfterSec);
});
