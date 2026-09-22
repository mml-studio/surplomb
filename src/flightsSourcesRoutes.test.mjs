// GEV_NONCOMMERCIAL_SOURCES wired into the real flight middlewares of
// vite.config.js: `/api/opensky` (the civil feed), `/api/opensky-track` (the
// followed aircraft's history) and `/api/adsblol/mil`. Upstream fetches are
// stubbed and logged, so "never asked OpenSky, not even for a token" is
// asserted on the wire.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { GEV_TRIAL_LIMIT: '', GEV_FIRST_RUN_AB: '', OPENSKY_AUTH_MODE: 'anon' });
delete process.env.GEV_NONCOMMERCIAL_SOURCES;

const { default: createViteConfig, _resetAdsbLolFeedForTest } = await import('../vite.config.js');

const routes = new Map();
for (const plugin of createViteConfig({ mode: 'test' }).plugins.flat()) {
  if (!plugin?.configurePreviewServer) continue;
  if (!['opensky-proxy', 'track-backfill-proxies', 'adsblol-proxy'].includes(plugin.name)) continue;
  plugin.configurePreviewServer({
    middlewares: {
      use(route, handler) {
        if (typeof route === 'string') routes.set(route, handler);
      },
    },
    httpServer: null,
  });
}

const upstream = [];
const realFetch = globalThis.fetch;
const realWarn = console.warn;
const realLog = console.log;

function adsbLolAnswer(url) {
  const match = /lat\/([-\d.]+)\/lon\/([-\d.]+)/.exec(url);
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  return {
    now: Date.now(),
    ac: [
      // One aircraft at each circle's centre, and one every circle hears.
      { hex: `c${String(Math.round((lat + 90) * 10)).padStart(4, '0')}${Math.abs(Math.round(lon)) % 10}`, flight: 'AFR1234 ', lat, lon, seen_pos: 1, seen: 1, alt_baro: 35000, t: 'A20N', r: 'F-HAAA' },
      { hex: '39c4a1', flight: 'EZY1 ', lat: 46.2, lon: 2.1, seen_pos: 0, seen: 0, alt_baro: 30000, t: 'A320' },
    ],
  };
}

// The stub every upstream call meets — the paced adsb.lol queue gets it
// explicitly too, so nothing it still holds after the last test can reach the
// real network.
async function stubFetch(input) {
    const url = String(input);
    upstream.push(url);
    const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    if (url.startsWith('https://api.adsb.lol/v2/lat/')) return json(adsbLolAnswer(url));
    if (url === 'https://api.adsb.lol/v2/mil') return json({ now: Date.now(), ac: [{ hex: 'ae1234', flight: 'RCH123', lat: 50, lon: 7 }] });
    if (url.startsWith('https://opensky-network.org/api/states/all')) {
      return json({ time: Math.floor(Date.now() / 1000), states: [['4ca123', 'RYR1 ', 'Ireland', 1, 1, 2, 48, 10000, false, 230, 90, 0, null, 10100, null, false, 0, 0]] });
    }
    if (url.startsWith('https://opensky-network.org/api/tracks/all')) return json({ icao24: '4ca123', path: [] });
    return new Response('not stubbed', { status: 599 });
}

before(() => {
  console.warn = () => {};
  console.log = () => {};
  globalThis.fetch = stubFetch;
  _resetAdsbLolFeedForTest({ gapMs: 5, fetchImpl: stubFetch });
});

after(() => {
  // Stopped BEFORE the real fetch is back: a queue left running would ask
  // adsb.lol for real.
  _resetAdsbLolFeedForTest({ fetchImpl: stubFetch });
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  console.log = realLog;
  delete process.env.GEV_NONCOMMERCIAL_SOURCES;
});

async function call(url) {
  const route = [...routes.keys()].sort((a, b) => b.length - a.length)
    .find((prefix) => url === prefix || url.startsWith(`${prefix}?`));
  assert.ok(route, `${url} has a route`);
  const req = { method: 'GET', url: url.slice(route.length) || '/', headers: {}, socket: { remoteAddress: '198.51.100.7' } };
  return new Promise((resolve) => {
    const headers = new Map();
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader(name, value) { headers.set(name.toLowerCase(), value); },
      writeHead(status, values = {}) {
        this.statusCode = status;
        this.headersSent = true;
        for (const [name, value] of Object.entries(values)) headers.set(name.toLowerCase(), value);
      },
      end(payload) {
        resolve({ status: this.statusCode, headers, body: payload ? JSON.parse(payload) : null });
      },
    };
    void routes.get(route)(req, res, () => resolve({ status: 'next' }));
  });
}

const openSkyCalls = () => upstream.filter((url) => url.includes('opensky-network.org')).length;
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

test('off: a view over France gets the French adsb.lol circles, and OpenSky is never asked, not even for a token', async () => {
  process.env.GEV_NONCOMMERCIAL_SOURCES = 'off';
  _resetAdsbLolFeedForTest({ gapMs: 5, fetchImpl: stubFetch });
  const before = openSkyCalls();

  const cold = await call('/api/opensky?lat=43.30&lon=5.40');
  assert.equal(cold.status, 200);
  assert.equal(cold.headers.get('x-flight-source'), 'adsb.lol');
  assert.equal(cold.headers.get('x-flight-coverage-area'), 'fr-metro');
  assert.equal(cold.headers.get('x-flight-coverage-cells'), '1/4', 'from cold, the circle nearest Marseille answers first');
  assert.equal(upstream.at(-1), 'https://api.adsb.lol/v2/lat/43.75/lon/5.9/dist/250');
  assert.equal(cold.body.states[0][18], 'A20N', 'the feed type rides at [18]');

  await settle();
  const warm = await call('/api/opensky?lat=48.86&lon=2.35');
  assert.equal(warm.headers.get('x-flight-coverage-cells'), '4/4');
  assert.equal(warm.body.states.length, 5, 'four centres and one aircraft heard by all four, drawn once');
  assert.match(warm.headers.get('x-flight-ttl-seconds'), /^\d+$/, 'the refresh period the page judges age against');
  assert.equal(openSkyCalls(), before, 'nothing went to opensky-network.org or its auth server');
});

test('off: a view outside France gets one circle around it', async () => {
  process.env.GEV_NONCOMMERCIAL_SOURCES = 'off';
  const before = openSkyCalls();
  const answer = await call('/api/opensky?lat=40.42&lon=-3.70');
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get('x-flight-source'), 'adsb.lol');
  assert.equal(answer.headers.get('x-flight-coverage-nm'), '250');
  assert.equal(answer.headers.get('x-flight-coverage-area'), undefined);
  assert.equal(upstream.at(-1), 'https://api.adsb.lol/v2/lat/40.5/lon/-3.75/dist/250');
  assert.equal(openSkyCalls(), before);
});

test('off: the followed aircraft\'s history is not asked of OpenSky', async () => {
  process.env.GEV_NONCOMMERCIAL_SOURCES = 'off';
  const before = openSkyCalls();
  const answer = await call('/api/opensky-track?icao24=4ca123');
  assert.equal(answer.status, 404);
  assert.equal(answer.body.status, 'off');
  assert.equal(openSkyCalls(), before);
});

test('the military list goes through the same paced queue and is shared', async () => {
  // One slot a minute: the second read can only be the queue's copy.
  _resetAdsbLolFeedForTest({ gapMs: 60_000, fetchImpl: stubFetch });
  const first = await call('/api/adsblol/mil');
  assert.equal(first.status, 200);
  assert.equal(first.body.ac[0].flight, 'RCH123');
  const milCalls = upstream.filter((url) => url.endsWith('/v2/mil')).length;
  const second = await call('/api/adsblol/mil');
  assert.equal(second.status, 200);
  assert.equal(upstream.filter((url) => url.endsWith('/v2/mil')).length, milCalls, 'answered from the queue\'s copy');
});

test('unset: a clone keeps OpenSky as its primary source', async () => {
  delete process.env.GEV_NONCOMMERCIAL_SOURCES;
  const before = openSkyCalls();
  const answer = await call('/api/opensky?lat=48.86&lon=2.35');
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get('x-flight-source'), undefined);
  assert.equal(answer.body.states[0][0], '4ca123');
  assert.equal(openSkyCalls(), before + 1);
  const track = await call('/api/opensky-track?icao24=4ca123');
  assert.equal(track.status, 200);
  assert.equal(openSkyCalls(), before + 2);
});
