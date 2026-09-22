// GEV_NONCOMMERCIAL_SOURCES wired into the real middlewares of vite.config.js:
// the two routes that call Open-Meteo, and the two answers that report the
// switch (`/api/trial`, which the page reads, and `/healthz`, which a deploy
// check reads). Upstream fetches are stubbed and logged, so "no request to
// Open-Meteo" is asserted on the wire, not inferred from a payload.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { GEV_TRIAL_LIMIT: '', GEV_FIRST_RUN_AB: '' });
delete process.env.GEV_NONCOMMERCIAL_SOURCES;

const { default: createViteConfig } = await import('../vite.config.js');

const routes = new Map();
for (const plugin of createViteConfig({ mode: 'test' }).plugins.flat()) {
  if (!plugin?.configurePreviewServer) continue;
  if (!['trial-quota', 'regional-brief-proxy', 'weather-effects-proxy', 'gev-access-gate'].includes(plugin.name)) continue;
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

before(() => {
  console.warn = () => {};
  globalThis.fetch = async (input) => {
    const url = String(input);
    upstream.push(url);
    const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    if (url.startsWith('https://nominatim.openstreetmap.org/')) {
      return json({ address: { city: 'Bordeaux', state: 'Nouvelle-Aquitaine', country: 'France', country_code: 'fr' } });
    }
    if (url.startsWith('https://news.google.com/')) {
      return new Response('<rss><channel><item><title>Tram works on the quays</title>'
        + '<link>https://example.org/tram</link><source>Example</source>'
        + '<pubDate>Tue, 22 Sep 2026 08:00:00 GMT</pubDate></item></channel></rss>');
    }
    if (url.startsWith('https://api.open-meteo.com/')) {
      return json({ current: { time: '2026-09-22T08:00', temperature_2m: 18.4, weather_code: 3, cloud_cover: 90 } });
    }
    return new Response('not stubbed', { status: 599 });
  };
});

after(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  delete process.env.GEV_NONCOMMERCIAL_SOURCES;
});

async function call(url) {
  const route = [...routes.keys()].find((prefix) => url === prefix || url.startsWith(`${prefix}?`));
  assert.ok(route, `${url} has a route`);
  const req = {
    method: 'GET',
    url: url.slice(route.length) || '/',
    headers: {},
    socket: { remoteAddress: '198.51.100.7' },
  };
  return new Promise((resolve) => {
    const headers = new Map();
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader(name, value) { headers.set(name.toLowerCase(), value); },
      writeHead(status, values = {}) {
        this.statusCode = status;
        for (const [name, value] of Object.entries(values)) headers.set(name.toLowerCase(), value);
      },
      end(payload) {
        resolve({ status: this.statusCode, headers, body: payload ? JSON.parse(payload) : null });
      },
    };
    void routes.get(route)(req, res, () => resolve({ status: 'next' }));
  });
}

const openMeteoCalls = () => upstream.filter((url) => url.startsWith('https://api.open-meteo.com/')).length;

test('off: the cockpit clouds route answers `off` at once, with no upstream call', async () => {
  process.env.GEV_NONCOMMERCIAL_SOURCES = 'off';
  const before = upstream.length;
  const answer = await call('/api/weather-effects?latitude=44.84&longitude=-0.58');
  assert.equal(answer.status, 200, '`off` is a state, not a failure the page would retry');
  assert.equal(answer.body.status, 'off');
  assert.equal(answer.body.weather, null);
  assert.equal(answer.headers.get('x-weather-effects'), 'OFF');
  assert.equal(upstream.length, before, 'nothing left the server');
});

test('off: the regional brief keeps its place and news, and never asks Open-Meteo', async () => {
  process.env.GEV_NONCOMMERCIAL_SOURCES = 'off';
  const meteoBefore = openMeteoCalls();
  const answer = await call('/api/regional-brief?latitude=44.84&longitude=-0.58');
  assert.equal(answer.status, 200);
  assert.equal(answer.body.weatherStatus, 'off');
  assert.equal(answer.body.weather, null);
  assert.equal(answer.body.place.label, 'Bordeaux, Nouvelle-Aquitaine');
  assert.equal(answer.body.articles.length, 1);
  assert.equal(answer.body.status, 'ready', 'no weather is not a partial brief where there is none to have');
  assert.equal(openMeteoCalls(), meteoBefore);
});

test('off: /api/trial and /healthz both say which sources are off', async () => {
  process.env.GEV_NONCOMMERCIAL_SOURCES = 'off';
  assert.deepEqual((await call('/api/trial')).body.sourcesOff, ['open-meteo', 'esri-world-imagery']);
  assert.deepEqual((await call('/healthz')).body.sourcesOff, ['open-meteo', 'esri-world-imagery']);
});

test('unset: a clone is unchanged — both routes use Open-Meteo, and nothing is reported off', async () => {
  delete process.env.GEV_NONCOMMERCIAL_SOURCES;
  assert.deepEqual((await call('/api/trial')).body.sourcesOff, []);
  assert.deepEqual((await call('/healthz')).body.sourcesOff, []);

  const meteoBefore = openMeteoCalls();
  const effects = await call('/api/weather-effects?latitude=48.86&longitude=2.35');
  assert.equal(effects.status, 200);
  assert.equal(effects.body.status, 'ready');
  assert.equal(effects.body.weather.temperatureC, 18.4);

  const brief = await call('/api/regional-brief?latitude=48.86&longitude=2.35');
  assert.equal(brief.body.weatherStatus, 'ready');
  assert.equal(brief.body.weather.temperatureC, 18.4);
  assert.equal(openMeteoCalls(), meteoBefore + 2);
});

test('a brief cached with its weather never answers once the switch is off', async () => {
  // The cell of the previous test, cached with Open-Meteo in it.
  process.env.GEV_NONCOMMERCIAL_SOURCES = 'off';
  const answer = await call('/api/regional-brief?latitude=48.86&longitude=2.35');
  assert.equal(answer.body.weatherStatus, 'off');
  assert.equal(answer.body.weather, null);
  assert.equal(answer.headers.get('x-regional-brief'), 'MISS');
});
