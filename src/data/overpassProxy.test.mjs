// Overpass proxy Tier A hardening (voice-engine evaluation doc §4.1, field test
// 2026-07-23): region/state boundary pivots return multi-MB coastline geometry that
// blew the old 12 MB read cap and 16 s client budget (Sicily never traced). The proxy
// now simplifies giant `out geom` payloads server-side before caching/serving, and
// boundary-class queries (is_in / pivot) get a longer disk TTL — boundaries change
// ≈never. Pure-function tests, no network.
//
// Run with: npm test   (node --test)
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import createViteConfig, {
  simplifyOverpassPayloadBody,
  isOverpassBoundaryQuery,
  resolveOverpassPreflight,
  overpassAttemptDisposition,
  overpassPayloadIsData,
  readOverpassDisk,
  fetchOverpassPayload,
  resetOverpassMirrorHealth,
  overpassUpstreams,
  OVERPASS_SLOT_LIMIT,
} from '../../vite.config.js';

// The middleware tests below call `fetchOverpassPayload` with NO injected deps,
// so they reach the module-level mirror health and park the three REAL
// production hosts for twenty seconds of wall time. Passing a fresh Map at each
// of the direct call sites is necessary but not sufficient — this is the belt.
beforeEach(() => { resetOverpassMirrorHealth(); });

test('preflight checks memory, in-flight, then disk before consuming limiter quota', async () => {
  const key = 'normalized query';
  const fresh = { id: 'memory', status: 200, cachedAt: 900 };
  const joined = { id: 'inflight', status: 200, cachedAt: 950 };
  const disk = { id: 'disk', status: 200, cachedAt: 975 };
  let diskReads = 0;
  let limiterCalls = 0;
  const allowUpstream = () => { limiterCalls += 1; return true; };

  const memoryHit = await resolveOverpassPreflight({
    cacheKey: key,
    memoryCache: new Map([[key, fresh]]),
    inFlight: new Map([[key, Promise.resolve(joined)]]),
    readDisk: async () => { diskReads += 1; return disk; },
    allowUpstream,
    now: 1000,
    cacheMs: 200,
  });
  assert.equal(memoryHit.source, 'HIT');
  assert.equal(memoryHit.payload, fresh);
  assert.equal(diskReads, 0, 'memory hit must short-circuit before disk');
  assert.equal(limiterCalls, 0, 'memory hit must not consume limiter quota');

  const inFlightHit = await resolveOverpassPreflight({
    cacheKey: key,
    memoryCache: new Map([[key, { id: 'stale', status: 200, cachedAt: 0 }]]),
    inFlight: new Map([[key, Promise.resolve(joined)]]),
    readDisk: async () => { diskReads += 1; return disk; },
    allowUpstream,
    now: 1000,
    cacheMs: 200,
  });
  assert.equal(inFlightHit.source, 'INFLIGHT');
  assert.equal(inFlightHit.payload, joined);
  assert.equal(diskReads, 0, 'in-flight join must short-circuit before disk');
  assert.equal(limiterCalls, 0, 'in-flight join must not consume limiter quota');

  const diskHit = await resolveOverpassPreflight({
    cacheKey: key,
    memoryCache: new Map(),
    inFlight: new Map(),
    readDisk: async () => { diskReads += 1; return disk; },
    allowUpstream,
  });
  assert.equal(diskHit.source, 'DISK');
  assert.equal(diskHit.payload, disk);
  assert.equal(diskReads, 1);
  assert.equal(limiterCalls, 0, 'disk hit must not consume limiter quota');

  const upstreamMiss = await resolveOverpassPreflight({
    cacheKey: key,
    memoryCache: new Map(),
    inFlight: new Map(),
    readDisk: async () => { diskReads += 1; return null; },
    allowUpstream,
  });
  assert.equal(upstreamMiss.source, 'UPSTREAM');
  assert.equal(diskReads, 2, 'disk must be checked before upstream admission');
  assert.equal(limiterCalls, 1, 'only a complete cache miss consumes quota');

  const denied = await resolveOverpassPreflight({
    cacheKey: key,
    memoryCache: new Map(),
    inFlight: new Map(),
    readDisk: async () => null,
    allowUpstream: () => false,
  });
  assert.equal(denied.source, 'RATE_LIMITED');
});

test('a cached refusal is a miss, on both the memory and the disk arm', async () => {
  // An older build's write guard read `< 500`, so a mirror's 406 could be
  // persisted under a boundary query's month-long TTL. Serving it back as a
  // HIT meant the mirrors were never asked again for as long as it lived.
  for (const refusal of [{ status: 406 }, { status: 429, rateLimited: true },
    { status: 200, runtimeError: true }, { status: 302 }, { cachedAt: 1 }]) {
    let admissions = 0;
    const result = await resolveOverpassPreflight({
      cacheKey: 'refused',
      memoryCache: new Map([['refused', { ...refusal, cachedAt: Date.now() }]]),
      inFlight: new Map(),
      readDisk: async () => ({ ...refusal, cachedAt: Date.now() }),
      allowUpstream: () => { admissions += 1; return true; },
    });
    assert.equal(result.source, 'UPSTREAM', `status ${refusal.status} must not be served as data`);
    assert.equal(admissions, 1, 'a miss admits exactly once — no double spend');
  }
});

test('what may be cached and what may be replaced by stale is ONE question', () => {
  // The write guard and the serve-stale guard were two separate comparisons.
  // Whatever splits them lets a refusal be both cached and un-replaceable.
  const cases = [
    [{ status: 200 }, true],
    [{ status: 204 }, true],
    [{ status: 299 }, true],
    [{ status: 200, rateLimited: true }, false],
    [{ status: 200, runtimeError: true }, false],
    [{ status: 302 }, false],
    [{ status: 406 }, false],
    [{ status: 429 }, false],
    [{ status: 502 }, false],
    [{ status: '200' }, true],
    [{}, false],
    [null, false],
    [undefined, false],
  ];
  for (const [payload, expected] of cases) {
    assert.equal(overpassPayloadIsData(payload), expected, JSON.stringify(payload));
  }
});

/** Synthetic dense ring: N points on a circle with sub-tolerance jitter. */
function denseRing(n, { latC = 37.5, lonC = 14.2, radiusDeg = 0.5 } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    // Jitter far below the simplification tolerance so the ring is genuinely
    // redundant — a correct simplifier should collapse most of it.
    const jitter = (i % 7) * 0.000004;
    pts.push({
      lat: latC + Math.sin(a) * (radiusDeg + jitter),
      lon: lonC + Math.cos(a) * (radiusDeg + jitter),
    });
  }
  pts.push({ ...pts[0] }); // closed ring
  return pts;
}

const TEST_OPTS = { minBytes: 0, minPoints: 200, toleranceDeg: 0.0004 };

test('simplify: giant way geometry is decimated, endpoints preserved', () => {
  const ring = denseRing(4000);
  const body = JSON.stringify({ elements: [{ type: 'way', id: 1, geometry: ring }] });
  const out = JSON.parse(simplifyOverpassPayloadBody(body, TEST_OPTS));
  const g = out.elements[0].geometry;
  assert.ok(g.length < ring.length * 0.5, `should shed most redundant points, got ${g.length}/${ring.length}`);
  assert.ok(g.length >= 16, `must keep enough points to stay a ring, got ${g.length}`);
  assert.deepEqual(g[0], ring[0]);
  assert.deepEqual(g[g.length - 1], ring[ring.length - 1]);
});

test('simplify: relation member geometries are decimated too', () => {
  const ring = denseRing(3000);
  const body = JSON.stringify({
    elements: [{
      type: 'relation',
      id: 2,
      members: [
        { type: 'way', role: 'outer', geometry: ring },
        { type: 'node', role: 'admin_centre' }, // no geometry — must survive untouched
      ],
    }],
  });
  const out = JSON.parse(simplifyOverpassPayloadBody(body, TEST_OPTS));
  assert.ok(out.elements[0].members[0].geometry.length < ring.length * 0.5);
  assert.equal(out.elements[0].members[1].geometry, undefined);
});

test('simplify: small geometries (building footprints) pass through untouched', () => {
  const square = [
    { lat: 30.27, lon: -97.74 }, { lat: 30.271, lon: -97.74 },
    { lat: 30.271, lon: -97.741 }, { lat: 30.27, lon: -97.741 },
    { lat: 30.27, lon: -97.74 },
  ];
  const body = JSON.stringify({ elements: [{ type: 'way', id: 3, geometry: square }] });
  const out = JSON.parse(simplifyOverpassPayloadBody(body, TEST_OPTS));
  assert.deepEqual(out.elements[0].geometry, square);
});

test('simplify: geometry stays within tolerance of the original shape', () => {
  const ring = denseRing(4000);
  const body = JSON.stringify({ elements: [{ type: 'way', id: 4, geometry: ring }] });
  const out = JSON.parse(simplifyOverpassPayloadBody(body, TEST_OPTS));
  const g = out.elements[0].geometry;
  // Every original vertex must lie near SOME kept vertex — a circle of kept
  // points at spacing s has every dropped point within ~s/2 along the arc, and
  // DP guarantees perpendicular deviation ≤ tolerance. Loose sanity bound: no
  // original point farther than 8× tolerance from the nearest kept point pair
  // is possible for a smooth ring; check a sampled subset for speed.
  for (let i = 0; i < ring.length; i += 97) {
    const p = ring[i];
    let best = Infinity;
    for (let j = 1; j < g.length; j++) {
      const d = pointSegDistDeg(p, g[j - 1], g[j]);
      if (d < best) best = d;
    }
    assert.ok(best <= TEST_OPTS.toleranceDeg * 1.01, `vertex ${i} deviates ${best} deg`);
  }
});

test('simplify: sub-threshold bodies and non-JSON pass through byte-identical', () => {
  const tiny = JSON.stringify({ elements: [{ type: 'way', geometry: denseRing(3000) }] });
  assert.equal(simplifyOverpassPayloadBody(tiny, { ...TEST_OPTS, minBytes: tiny.length + 1 }), tiny);
  const junk = 'this is not json {';
  assert.equal(simplifyOverpassPayloadBody(junk, TEST_OPTS), junk);
});

test('boundary-class queries detected for the long disk TTL', () => {
  assert.equal(isOverpassBoundaryQuery(
    '[out:json][timeout:25];is_in(37.5,14.2)->.a;area.a["boundary"="administrative"]["admin_level"];out tags;',
  ), true);
  assert.equal(isOverpassBoundaryQuery(
    '[out:json][timeout:25];area(3600039152)->.x;rel(pivot.x);out geom;',
  ), true);
  // The enclosing-compound sweep and road fetches keep the default TTL.
  assert.equal(isOverpassBoundaryQuery(
    '[out:json][timeout:25];( way(around:1200,30.27,-97.74)["leisure"]["name"]; );out geom;',
  ), false);
  assert.equal(isOverpassBoundaryQuery(
    '[out:json][timeout:12];way["highway"~"motorway|trunk"](30.1,-97.9,30.5,-97.5);out geom;',
  ), false);
});

/** Perpendicular distance (deg, planar approx) from p to segment a-b. */
function pointSegDistDeg(p, a, b) {
  const vx = b.lon - a.lon;
  const vy = b.lat - a.lat;
  const wx = p.lon - a.lon;
  const wy = p.lat - a.lat;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(wx, wy);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.lon - b.lon, p.lat - b.lat);
  const t = c1 / c2;
  return Math.hypot(wx - t * vx, wy - t * vy);
}

// ---------------------------------------------------------------------------
// Mirror rotation (field test 2026-09-01: "Sites militaires — Error loading")
//
// overpass-api.de's front-end answered 406 Not Acceptable to the proxy's old
// agent string on most requests. The rotation accepted 4xx as a final answer,
// so mirrors 2-4 were never tried and the mapped-installations layer — which
// reads `status >= 400` as a failure — went dark while three mirrors were fine.
// ---------------------------------------------------------------------------

/** One Overpass mirror answer, shaped for the injected fetch below. */
function mirrorResponse(status, body = '{"elements":[]}') {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

const FOUR_MIRRORS = ['https://a.test/i', 'https://b.test/i', 'https://c.test/i', 'https://d.test/i'];

test('disposition: a 4xx refusal is a mirror verdict, not a query verdict', () => {
  const at = (status, extra = {}) => overpassAttemptDisposition({
    status, rateLimited: false, runtimeError: false, ...extra,
  });
  assert.equal(at(200), 'accept');
  assert.equal(at(406), 'client-error', '406 must rotate, not terminate');
  assert.equal(at(403), 'client-error');
  assert.equal(at(400), 'client-error');
  assert.equal(at(502), 'server-error');
  assert.equal(at(200, { runtimeError: true }), 'runtime-error');
  assert.equal(at(429, { rateLimited: true }), 'rate-limited');
  // Rate limiting outranks the status code: a mirror can rate-limit inside a 200.
  assert.equal(at(200, { rateLimited: true }), 'rate-limited');
});

test('a 406 from the first mirror falls through to a healthy one', async () => {
  const tried = [];
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage: { until: 0 },
    fetchImpl: async (endpoint) => {
      tried.push(endpoint);
      return endpoint === FOUR_MIRRORS[0]
        ? mirrorResponse(406, '<html><title>406 Not Acceptable</title></html>')
        : mirrorResponse(200, '{"elements":[{"type":"node","id":1}]}');
    },
  });
  assert.deepEqual(tried, FOUR_MIRRORS.slice(0, 2), 'must try mirror 2 after the 406');
  assert.equal(payload.status, 200);
  assert.equal(payload.endpoint, FOUR_MIRRORS[1]);
  assert.match(payload.body, /"id":1/);
});

test('every mirror refusing surfaces the 4xx, so a malformed query is still reported', async () => {
  const tried = [];
  const payload = await fetchOverpassPayload('data=nonsense', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage: { until: 0 },
    fetchImpl: async (endpoint) => {
      tried.push(endpoint);
      return mirrorResponse(400, 'line 1: parse error');
    },
  });
  assert.equal(tried.length, 4, 'all mirrors get a turn before giving up');
  assert.equal(payload.status, 400);
  assert.equal(payload.body, 'line 1: parse error');
});

test('a rate-limited mirror outranks a refusing one when all fail', async () => {
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage: { until: 0 },
    sleep: async () => {},
    fetchImpl: async (endpoint) => (endpoint === FOUR_MIRRORS[3]
      ? mirrorResponse(429, 'rate_limited')
      : mirrorResponse(406, '<html>406 Not Acceptable</html>')),
  });
  assert.equal(payload.status, 429, 'the actionable answer wins over the opaque refusal');
  assert.equal(payload.rateLimited, true);
});

test('a mirror that throws does not end the rotation', async () => {
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage: { until: 0 },
    fetchImpl: async (endpoint) => {
      if (endpoint !== FOUR_MIRRORS[2]) throw new Error('ECONNREFUSED');
      return mirrorResponse(200, '{"elements":[]}');
    },
  });
  assert.equal(payload.endpoint, FOUR_MIRRORS[2]);
});

test('all mirrors unreachable still throws rather than inventing an answer', async () => {
  await assert.rejects(
    fetchOverpassPayload('data=[out:json];out;', 1024, {
      endpoints: FOUR_MIRRORS,
      mirrorHealth: new Map(),
      outage: { until: 0 },
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    }),
    /ECONNREFUSED/,
  );
});

// A 429 is a verdict on the IP, not on the mirror: every mirror in the rotation
// resolves to one per-IP slot budget (overpass-api.de and lz4 even announce the
// same backend), so walking to the next one answers the same 429. Waiting is
// the only move that works, and not making it was what turned a busy upstream
// into "Mapped installation context is temporarily unavailable".
test('a rate limit is waited out, not rotated away', async () => {
  const rounds = [];
  const waits = [];
  let round = 0;
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage: { until: 0 },
    sleep: async (ms) => { waits.push(ms); round += 1; },
    fetchImpl: async (endpoint) => {
      rounds.push(`${round}:${endpoint}`);
      // Busy for the whole first pass, answering once the wait has happened.
      return round === 0
        ? mirrorResponse(429, 'rate_limited')
        : mirrorResponse(200, '{"elements":[{"type":"node","id":7}]}');
    },
  });
  assert.equal(waits.length, 1, 'one wait was enough; no further rotation');
  assert.ok(waits[0] > 0, 'the retry actually waits rather than spinning');
  assert.equal(rounds.filter((r) => r.startsWith('0:')).length, 4, 'first pass tries every mirror');
  assert.equal(payload.status, 200);
  assert.match(payload.body, /"id":7/);
});

test('a rotation with no rate limit is never re-run', async () => {
  let waited = 0;
  let attempts = 0;
  await assert.rejects(
    fetchOverpassPayload('data=[out:json];out;', 1024, {
      endpoints: FOUR_MIRRORS,
      mirrorHealth: new Map(),
      outage: { until: 0 },
      sleep: async () => { waited += 1; },
      fetchImpl: async () => { attempts += 1; throw new Error('ECONNREFUSED'); },
    }),
    /ECONNREFUSED/,
  );
  assert.equal(waited, 0, 'unreachable mirrors are not a rate limit — no backoff');
  assert.equal(attempts, 4, 'exactly one pass over the rotation');
});

test('a rate limit that never clears still gives back the actionable 429', async () => {
  const waits = [];
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage: { until: 0 },
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => mirrorResponse(429, 'rate_limited'),
  });
  assert.ok(waits.length >= 1, 'it retried before giving up');
  assert.ok(
    waits.every((ms, i) => i === 0 || ms >= waits[i - 1]),
    'each wait is at least as long as the one before it',
  );
  assert.equal(payload.status, 429, 'the caller still learns it was rate-limited');
  assert.equal(payload.rateLimited, true);
});

// The queue is what stops the 429 being manufactured in the first place: panning
// the globe with the installations layer on fired a burst straight past the
// mirrors' 2-slot budget, because that proxy called through with no gate at all.
test('concurrent requests never exceed the mirrors\' slot budget', async () => {
  let live = 0;
  let peak = 0;
  const oneRequest = () => fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage: { until: 0 },
    fetchImpl: async () => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((resolve) => { setTimeout(resolve, 5); });
      live -= 1;
      return mirrorResponse(200, '{"elements":[]}');
    },
  });
  const answers = await Promise.all(Array.from({ length: 6 }, oneRequest));
  assert.equal(peak, OVERPASS_SLOT_LIMIT, 'the gate holds the burst at the budget');
  assert.equal(answers.length, 6, 'and every queued request is still served');
  assert.ok(answers.every((a) => a.status === 200));
});

// A slot leaked on the failure path starves every later request — the layer would
// go quiet minutes after one bad rotation rather than at the moment of failure.
test('a failed rotation releases its slot', async () => {
  await assert.rejects(
    fetchOverpassPayload('data=[out:json];out;', 1024, {
      endpoints: FOUR_MIRRORS,
      mirrorHealth: new Map(),
      outage: { until: 0 },
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    }),
    /ECONNREFUSED/,
  );
  let live = 0;
  let peak = 0;
  const answers = await Promise.all(Array.from({ length: 4 }, () => fetchOverpassPayload(
    'data=[out:json];out;',
    1024,
    {
      endpoints: FOUR_MIRRORS,
      mirrorHealth: new Map(),
      outage: { until: 0 },
      fetchImpl: async () => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((resolve) => { setTimeout(resolve, 5); });
        live -= 1;
        return mirrorResponse(200, '{"elements":[]}');
      },
    },
  )));
  assert.equal(peak, OVERPASS_SLOT_LIMIT, 'the budget survived the failure intact');
  assert.ok(answers.every((a) => a.status === 200));
});

// The cooldown exists because overpass-api.de answers a noisy IP with silence,
// not a 429: every mirror times out, and each fresh rotation spends ~45 s
// relearning that while keeping the offending traffic flowing.
test('a total outage parks the rotation instead of re-timing-out', async () => {
  const outage = { until: 0 };
  let clock = 1_000;
  const call = (fetchImpl) => fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage,
    now: () => clock,
    outageCooldownMs: 60_000,
    fetchImpl,
  });

  let attempts = 0;
  await assert.rejects(call(async () => { attempts += 1; throw new Error('ETIMEDOUT'); }), /ETIMEDOUT/);
  assert.equal(attempts, 4, 'the first caller pays for the full rotation');

  // Second caller, one second later: no mirror is touched at all.
  clock += 1_000;
  let touched = 0;
  await assert.rejects(
    call(async () => { touched += 1; return mirrorResponse(200); }),
    /cooldown for another 59s/,
  );
  assert.equal(touched, 0, 'the parked rotation contacts nobody');

  // Once it lapses, a healthy mirror is reached again and clears the park.
  clock += 60_000;
  const payload = await call(async () => mirrorResponse(200, '{"elements":[{"type":"node","id":3}]}'));
  assert.equal(payload.status, 200);
  assert.equal(outage.until, 0, 'success un-parks the rotation');
});

test('a rate limit is not treated as an outage', async () => {
  const outage = { until: 0 };
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage,
    sleep: async () => {},
    fetchImpl: async () => mirrorResponse(429, 'rate_limited'),
  });
  assert.equal(payload.status, 429);
  assert.equal(outage.until, 0, 'a recoverable wait must not blind the layer for a minute');
});

// ---------------------------------------------------------------------------
// What a degraded rotation costs (field test 2026-09-16, 11:03Z-11:57Z)
//
// Measured from inside the VPS container, one Biarritz road query per mirror:
// overpass-api.de 200 in 394 ms; lz4.overpass-api.de 429 in 13.1 s (same
// machine, shared quota); overpass.private.coffee gave up at 30 s. So when
// FOSSGIS refused, ONE pass cost ~35 s to learn nothing and the loop ran three
// of them — 112 s and nine upstream requests per uncached query, every one of
// them feeding the quota that caused the refusal.
// ---------------------------------------------------------------------------

/** The real rotation, so the machine grouping below is the production one. */
const REAL_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

test('a 429 skips the other facade of the SAME machine for that pass', async () => {
  const tried = [];
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: REAL_MIRRORS,
    mirrorHealth: new Map(),
    outage: { until: 0 },
    now: () => 1_000,
    sleep: async () => {},
    fetchImpl: async (endpoint) => {
      tried.push(endpoint);
      return endpoint === REAL_MIRRORS[2]
        ? mirrorResponse(200, '{"elements":[{"type":"node","id":9}]}')
        : mirrorResponse(429, 'rate_limited');
    },
  });
  assert.ok(
    !tried.includes(REAL_MIRRORS[1]),
    'lz4 is one of the addresses overpass-api.de answers with — asking it re-learns the same 429',
  );
  assert.deepEqual(tried, [REAL_MIRRORS[0], REAL_MIRRORS[2]]);
  assert.equal(payload.status, 200);
});

test('a runtime error does NOT suppress the machine — re-asking it is a real retry', async () => {
  // The two FOSSGIS facades are listed adjacent precisely for this case: a
  // runtime error is per-QUERY, so the same backend is worth asking again.
  const tried = [];
  await assert.rejects(
    fetchOverpassPayload('data=[out:json];out;', 1024, {
      endpoints: REAL_MIRRORS,
      mirrorHealth: new Map(),
      outage: { until: 0 },
      now: () => 1_000,
      fetchImpl: async (endpoint) => {
        tried.push(endpoint);
        return mirrorResponse(200, '{"remark":"runtime error: Query timed out"}');
      },
    }),
    /runtime error/,
  );
  assert.deepEqual(tried, REAL_MIRRORS, 'every mirror, including the sibling facade');
});

test('a dead mirror is parked, so the NEXT request does not pay its timeout again', async () => {
  const health = new Map();
  let clock = 0;
  const tried = [];
  const call = () => fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: REAL_MIRRORS,
    mirrorHealth: health,
    outage: { until: 0 },
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async (endpoint) => {
      tried.push(endpoint);
      if (endpoint === REAL_MIRRORS[2]) { clock += 22_000; throw new Error('ETIMEDOUT'); }
      clock += 394;
      return mirrorResponse(200, '{"elements":[{"type":"node","id":1}]}');
    },
  });

  await call();
  assert.equal(tried.length, 1, 'a healthy first mirror ends the pass');

  // Now FOSSGIS is gone and private.coffee eats 22 s. That is paid ONCE.
  const deadFossgis = () => fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: REAL_MIRRORS,
    mirrorHealth: health,
    outage: { until: 0 },
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    fetchImpl: async (endpoint) => {
      tried.push(endpoint);
      clock += endpoint === REAL_MIRRORS[2] ? 22_000 : 394;
      throw new Error('ETIMEDOUT');
    },
  });
  tried.length = 0;
  await assert.rejects(deadFossgis(), /ETIMEDOUT/);
  assert.equal(tried.length, 3, 'the first caller still pays for the whole rotation');

  // A second caller one second later no longer pays the 22 s host. The two
  // FOSSGIS facades are back (their 20 s parking lapsed WHILE private.coffee
  // was timing out, which is the point — the cheap hosts recover first), but
  // the expensive one is still parked, so the rotation costs under a second
  // instead of 22.8 s.
  clock += 1_000;
  const before = clock;
  tried.length = 0;
  await assert.rejects(deadFossgis(), /ETIMEDOUT/);
  assert.ok(
    !tried.includes(REAL_MIRRORS[2]),
    'the mirror that ate 22 s must stay out of the rotation while it is parked',
  );
  assert.ok(
    clock - before < 1_000,
    `the parked rotation still cost ${clock - before} ms; the whole point is that it does not`,
  );
});

test('everything parked still costs ONE probe — the rotation cannot latch shut', async () => {
  const health = new Map();
  let clock = 0;
  const tried = [];
  // Instantaneous failures, so no mirror's parking can lapse while another is
  // being tried: after one pass all three are parked for 20 s at once.
  const call = () => fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: REAL_MIRRORS,
    mirrorHealth: health,
    outage: { until: 0 },
    now: () => clock,
    fetchImpl: async (endpoint) => { tried.push(endpoint); throw new Error('ECONNREFUSED'); },
  });

  await assert.rejects(call(), /ECONNREFUSED/);
  assert.equal(tried.length, 3, 'the first caller pays for the full rotation');

  clock += 1_000;
  tried.length = 0;
  await assert.rejects(call(), /ECONNREFUSED/);
  assert.equal(tried.length, 1, 'a fully parked rotation costs one probe, not three');

  // And once the windows lapse, all three come back in their original order —
  // parking is a delay, never a removal.
  clock += 60_000;
  tried.length = 0;
  await assert.rejects(call(), /ECONNREFUSED/);
  assert.deepEqual(tried, REAL_MIRRORS);
});

test('the rotation is bounded in wall time, backoffs included', async () => {
  // The exact 2026-09-16 shape, replayed on a virtual clock: FOSSGIS 429s in
  // 394 ms, lz4 429s in 13.1 s, private.coffee dies at 22 s.
  let clock = 0;
  const tried = [];
  const start = clock;
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: REAL_MIRRORS,
    mirrorHealth: new Map(),
    outage: { until: 0 },
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    rotationBudgetMs: 30_000,
    fetchImpl: async (endpoint) => {
      tried.push(endpoint);
      if (endpoint === REAL_MIRRORS[0]) { clock += 394; return mirrorResponse(429, 'rate_limited'); }
      if (endpoint === REAL_MIRRORS[1]) { clock += 13_100; return mirrorResponse(429, 'rate_limited'); }
      clock += 22_000;
      throw new Error('ETIMEDOUT');
    },
  });

  const elapsed = clock - start;
  assert.ok(elapsed <= 40_000, `the rotation ran ${elapsed} ms; the old loop ran ~112 000 ms`);
  assert.ok(
    !tried.includes(REAL_MIRRORS[1]),
    'the sibling facade is never asked after its machine has already refused',
  );
  assert.ok(tried.length <= 4, `${tried.length} upstream requests; the old loop issued 9`);
  // The caller still learns the actionable thing: it was rate-limited.
  assert.equal(payload.status, 429);
  assert.equal(payload.rateLimited, true);
});

test('the per-attempt leash is REAL: each mirror is aborted at the budget it was given', async () => {
  // The whole point of this chantier is the leash, and until now no fake fetch
  // in this file read `init.signal` at all — so the budget could have been any
  // number and every test would still have passed. `setTimeoutImpl` hands the
  // armed delay straight to the assertion, and the fake honours the abort.
  const leashes = [];
  const aborts = [];
  let clock = 0;
  await assert.rejects(
    fetchOverpassPayload('data=[out:json];out;', 1024, {
      endpoints: FOUR_MIRRORS,
      mirrorHealth: new Map(),
      outage: { until: 0 },
      now: () => clock,
      rotationBudgetMs: 40_000,
      mirrorTimeoutMs: 22_000,
      fallbackTimeoutMs: 12_000,
      minAttemptMs: 3_000,
      setTimeoutImpl: (onAbort, ms) => { leashes.push(ms); return { onAbort, ms }; },
      fetchImpl: async (_endpoint, init) => {
        // Every mirror hangs: the leash is the only thing that ends the attempt.
        const leash = leashes[leashes.length - 1];
        clock += leash;
        assert.equal(init?.signal?.aborted, false, 'the signal must be live when the fetch starts');
        aborts.push(leash);
        const error = new Error('ETIMEDOUT');
        error.name = 'TimeoutError';
        throw error;
      },
    }),
    /ETIMEDOUT/,
  );

  // 40 s shared evenly across 4 mirrors: nobody grabs 22 s and starves the
  // mirror documented alive at 5-20 s cold.
  assert.deepEqual(leashes, [10_000, 10_000, 10_000, 10_000]);
  assert.deepEqual(aborts, leashes, 'every attempt must actually have run under its leash');
  assert.equal(clock, 40_000, 'the rotation spends its budget exactly, and no more');

  // With fewer mirrors the RANK cap is what binds: the first attempt gets its
  // full leash, and the fallback behind it a shorter one.
  const twoLeashes = [];
  let twoClock = 0;
  await assert.rejects(
    fetchOverpassPayload('data=[out:json];out;', 1024, {
      endpoints: FOUR_MIRRORS.slice(0, 2),
      mirrorHealth: new Map(),
      outage: { until: 0 },
      now: () => twoClock,
      rotationBudgetMs: 40_000,
      mirrorTimeoutMs: 22_000,
      fallbackTimeoutMs: 12_000,
      minAttemptMs: 3_000,
      setTimeoutImpl: (onAbort, ms) => { twoLeashes.push(ms); return { onAbort, ms }; },
      fetchImpl: async () => {
        twoClock += twoLeashes[twoLeashes.length - 1];
        throw new Error('ETIMEDOUT');
      },
    }),
    /ETIMEDOUT/,
  );
  assert.deepEqual(twoLeashes, [20_000, 12_000]);
});

test('a busy slot queue must not be reported as a dead world', async () => {
  // The rotation budget is started AFTER the upstream slot is acquired. Charged
  // before, a 20 s queue wait would leave no budget, contact nobody, and arm the
  // 60 s GLOBAL parking — blinding every Overpass layer over our own queue,
  // which is the exact failure the queue was added to prevent.
  const outage = { until: 0 };
  let clock = 0;
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints: FOUR_MIRRORS,
    mirrorHealth: new Map(),
    outage,
    now: () => clock,
    rotationBudgetMs: 30_000,
    fetchImpl: async (endpoint) => {
      clock += 400;
      return endpoint === FOUR_MIRRORS[0]
        ? mirrorResponse(500)
        : mirrorResponse(200, '{"elements":[{"type":"node","id":5}]}');
    },
  });
  assert.equal(payload.status, 200);
  assert.equal(outage.until, 0);
});

// A heavy query times out INSIDE a healthy mirror, which answers 200 with a
// `remark`. Parking the whole Overpass path on that would let one over-broad
// boundary pivot blind every other layer for a minute.
test('a query too heavy for the mirrors does not park them', async () => {
  const outage = { until: 0 };
  await assert.rejects(
    fetchOverpassPayload('data=[out:json];out;', 1024, {
      endpoints: FOUR_MIRRORS,
      mirrorHealth: new Map(),
      outage,
      now: () => 1_000,
      fetchImpl: async () => mirrorResponse(
        200,
        '{"version":0.6,"remark":"runtime error: Query timed out in \"query\" at line 1"}',
      ),
    }),
    /runtime error/,
  );
  assert.equal(outage.until, 0, 'the mirrors answered — they are not down');
});


// ── The proxy itself: one query, two callers, one verdict ────────────────────

const OVERPASS_DISK_DIR = path.join(process.cwd(), '.gev-cache', 'overpass');
const diskPathFor = (cacheKey) => path.join(OVERPASS_DISK_DIR, `${createHash('sha1').update(cacheKey).digest('hex')}.json`);

function proxyHandler() {
  const plugin = createViteConfig({ mode: 'test' }).plugins.find((candidate) => candidate.name === 'overpass-proxy');
  const routes = new Map();
  plugin.configureServer({ middlewares: { use: (route, handler) => routes.set(route, handler) } });
  return routes.get('/api/overpass');
}

function invoke(handler, body) {
  const req = Readable.from([Buffer.from(body)]);
  Object.assign(req, { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } });
  return new Promise((resolve, reject) => {
    const res = {
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(responseBody) { resolve({ status: this.status, headers: this.headers, body: responseBody }); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

test('a cached refusal never comes back from disk, at any age', async () => {
  const key = `overpass-refusal-${randomUUID()}`;
  const file = diskPathFor(key);
  await mkdir(OVERPASS_DISK_DIR, { recursive: true });
  try {
    for (const refusal of [{ status: 406 }, { status: 429 }, { status: 503 },
      { status: 200, rateLimited: true }, { status: 200, runtimeError: true }]) {
      await writeFile(file, JSON.stringify({ status: 200, body: '{"elements":[]}', cachedAt: Date.now(), ...refusal }));
      assert.equal(await readOverpassDisk(key, 60_000), null, `fresh ${JSON.stringify(refusal)}`);
      assert.equal(await readOverpassDisk(key, Infinity), null, `stale ${JSON.stringify(refusal)}`);
    }
    // The point of rejecting refusals is to protect real last-good data, which
    // must still survive an outage of any length.
    const good = { status: 200, body: '{"elements":[]}', cachedAt: Date.now() - 120_000 };
    await writeFile(file, JSON.stringify(good));
    assert.equal(await readOverpassDisk(key, 60_000), null, 'expired data misses the normal TTL');
    assert.deepEqual(await readOverpassDisk(key, Infinity), good, 'last-good data survives at any age');
  } finally {
    await unlink(file).catch(() => {});
  }
});

test('the caller that JOINS a failing request gets the same last-good roads as the one that made it', async (t) => {
  // Before: the originating caller fell through to serve-stale, while the
  // coalesced caller was handed the raw refusal — two answers to one query,
  // in the same second. 406 is the measured refusal: overpass-api.de's abuse
  // filter answers it to this proxy's User-Agent.
  const handler = proxyHandler();
  const query = `[out:json][timeout:12];node(around:10,48.58,7.75)["name"="${randomUUID()}"];out;`;
  const body = `data=${encodeURIComponent(query)}`;
  const cacheKey = body.replace(/\s+/g, ' ').trim();
  const file = diskPathFor(cacheKey);
  await mkdir(OVERPASS_DISK_DIR, { recursive: true });
  // Older than any TTL, so the preflight misses it and only serve-stale can
  // reach it.
  const stale = { status: 200, body: '{"elements":[{"type":"node","id":1}]}', contentType: 'application/json', cachedAt: Date.now() - 40 * 86_400_000 };
  await writeFile(file, JSON.stringify(stale));

  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  let fetches = 0;
  const mock = t.mock.method(globalThis, 'fetch', async () => {
    fetches += 1;
    entered.resolve();
    await release.promise;
    return new Response('<html>Not Acceptable</html>', { status: 406, headers: { 'content-type': 'text/html' } });
  });

  try {
    const first = invoke(handler, body);
    await entered.promise;
    const second = invoke(handler, body);
    // Let the second request read its in-memory body and join the pending
    // promise before upstream answers. No sleep, no network.
    await new Promise((resolve) => { setImmediate(resolve); });
    release.resolve();

    for (const response of await Promise.all([first, second])) {
      assert.equal(response.status, 200, 'both callers are served last-good data, not the 406');
      assert.equal(response.body, stale.body);
      assert.equal(response.headers['X-Overpass-Cache'], 'STALE');
    }
    // Counted against the LIST rather than a literal: the claim under test is
    // "one rotation, not two", and hard-coding its length turns every added
    // mirror into a red test that says nothing about coalescing.
    assert.equal(fetches, overpassUpstreams().length, 'one shared rotation over the mirrors, not two');
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), stale, 'the refusal never overwrote the cache');
  } finally {
    release.resolve();
    mock.mock.restore();
    await unlink(file).catch(() => {});
  }
});

// ─── Egress relay ────────────────────────────────────────────
// The VPS's only address is banned by overpass-api.de (measured 2026-09-16:
// connection refused in under 200 ms on every address, v4 and v6, while the
// same query answered 200 in 0.20 s from another network). These two tests
// cover the only two ways that fix can go wrong: the relay not being in the
// list, and the secret leaving for somewhere that is not the relay.

test('the relay is read from the environment at request time, and leads the rotation', () => {
  const relayUrl = 'https://surplomb-overpass-relay.example.workers.dev';
  const before = {
    url: process.env.GEV_OVERPASS_RELAY_URL,
    token: process.env.GEV_OVERPASS_RELAY_TOKEN,
  };
  try {
    const direct = overpassUpstreams();
    assert.ok(direct.length >= 3);
    assert.match(direct[0], /overpass-api\.de/, 'without a relay, FOSSGIS still leads');

    process.env.GEV_OVERPASS_RELAY_URL = relayUrl;
    process.env.GEV_OVERPASS_RELAY_TOKEN = 'secret';
    const relayed = overpassUpstreams();
    assert.equal(relayed[0], `${relayUrl}/api/interpreter`);
    assert.deepEqual(relayed.slice(1), direct, 'the public mirrors keep their order behind it');

    // Half a configuration is no configuration: a relay with no secret would be
    // a guaranteed 401 in front of every request.
    delete process.env.GEV_OVERPASS_RELAY_TOKEN;
    assert.deepEqual(overpassUpstreams(), direct);
  } finally {
    if (before.url === undefined) delete process.env.GEV_OVERPASS_RELAY_URL;
    else process.env.GEV_OVERPASS_RELAY_URL = before.url;
    if (before.token === undefined) delete process.env.GEV_OVERPASS_RELAY_TOKEN;
    else process.env.GEV_OVERPASS_RELAY_TOKEN = before.token;
  }
});

test('the relay secret reaches the relay and no public mirror, across a whole rotation', async () => {
  const relay = 'https://surplomb-overpass-relay.example.workers.dev/api/interpreter';
  const endpoints = [relay, ...FOUR_MIRRORS];
  const seen = new Map();
  const payload = await fetchOverpassPayload('data=[out:json];out;', 1024, {
    endpoints,
    relay: { endpoint: relay, token: 'the-secret' },
    mirrorHealth: new Map(),
    outage: { until: 0 },
    fetchImpl: async (endpoint, init) => {
      seen.set(endpoint, init.headers);
      // The relay fails so the rotation carries on to the public mirrors — the
      // only arrangement where a leak would actually show up.
      return endpoint === relay
        ? mirrorResponse(502, '')
        : mirrorResponse(200, '{"elements":[{"type":"node","id":1}]}');
    },
  });
  assert.equal(payload.status, 200);
  assert.equal(seen.get(relay)['x-surplomb-relay-token'], 'the-secret');
  for (const mirror of FOUR_MIRRORS) {
    if (!seen.has(mirror)) continue;
    assert.equal(
      seen.get(mirror)['x-surplomb-relay-token'],
      undefined,
      `${mirror} must never receive the relay secret`,
    );
  }
  assert.ok(seen.size >= 2, 'a rotation that stopped at the relay proves nothing');
});
