import { test } from 'node:test';
import assert from 'node:assert/strict';
import createViteConfig, {
  adsbLolFallbackAnchor,
  coalesceProxyRequest,
  launchLibraryRequestHeaders,
  LL2_CACHE_TTL_MS,
  readResponseJsonCapped,
  regionalBriefHasAnySource,
  regionalBriefPayload,
  validMilitaryInstallationBox,
  validRegionalPoint,
} from '../../vite.config.js';

test('regional proxy rejects absent and blank coordinates instead of coercing them to zero', () => {
  assert.equal(validRegionalPoint(new URLSearchParams('longitude=12.5')), null);
  assert.equal(validRegionalPoint(new URLSearchParams('latitude=12.5')), null);
  assert.equal(validRegionalPoint(new URLSearchParams('latitude=&longitude=12.5')), null);
  assert.deepEqual(
    validRegionalPoint(new URLSearchParams('latitude=0&longitude=0')),
    { latitude: 0, longitude: 0 },
  );
});

test('adjacent proxy validators also require every coordinate explicitly', () => {
  assert.equal(
    validMilitaryInstallationBox(new URLSearchParams('west=-1&north=1&east=1')),
    null,
  );
  assert.equal(adsbLolFallbackAnchor({ url: '?lat=12.5' }), null);
  assert.equal(adsbLolFallbackAnchor({ url: '?lon=12.5' }), null);
});

test('new data proxies install the same routes in dev and preview servers', () => {
  const config = createViteConfig({ mode: 'test' });
  const byName = new Map(config.plugins.map((plugin) => [plugin.name, plugin]));
  for (const name of [
    'rocket-launches-proxy',
    'military-installations-proxy',
    'regional-brief-proxy',
    'weather-effects-proxy',
    'edf-plants-proxy',
  ]) {
    assert.equal(typeof byName.get(name)?.configureServer, 'function', `${name} dev hook`);
    assert.equal(typeof byName.get(name)?.configurePreviewServer, 'function', `${name} preview hook`);
  }
});

test('Launch Library uses a 15-minute cache and optional server-side token header', () => {
  assert.equal(LL2_CACHE_TTL_MS, 15 * 60_000);
  assert.deepEqual(launchLibraryRequestHeaders(''), { Accept: 'application/json' });
  assert.deepEqual(launchLibraryRequestHeaders(' secret '), {
    Accept: 'application/json',
    Authorization: 'Token secret',
  });
});

test('proxy request coalescing shares one per-key refresh and clears it after settlement', async () => {
  const inFlight = new Map();
  let refreshCount = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = coalesceProxyRequest(inFlight, 'cell', async () => {
    refreshCount += 1;
    await gate;
    return 'fresh';
  });
  const second = coalesceProxyRequest(inFlight, 'cell', () => {
    refreshCount += 1;
    return 'duplicate';
  });
  assert.equal(first.shared, false);
  assert.equal(second.shared, true);
  assert.equal(first.promise, second.promise);
  release();
  assert.equal(await second.promise, 'fresh');
  assert.equal(refreshCount, 1);
  assert.equal(inFlight.size, 0);
});

test('bounded JSON reader rejects oversized upstream bodies', async () => {
  assert.deepEqual(await readResponseJsonCapped(new Response('{"ok":true}'), 32), { ok: true });
  await assert.rejects(
    readResponseJsonCapped(new Response(JSON.stringify({ value: 'x'.repeat(64) })), 32),
    (error) => error?.code === 'RESPONSE_TOO_LARGE',
  );
});

test('regional brief treats an all-source outage as total failure', () => {
  assert.equal(regionalBriefHasAnySource({
    place: null,
    weather: null,
    news: { status: 'unavailable' },
  }), false);
  assert.equal(regionalBriefHasAnySource({
    place: { country: 'United States' },
    weather: null,
    news: { status: 'unavailable' },
  }), true);
});

test('a brief without weather is partial where weather was due, and complete where it is switched off', () => {
  const point = { latitude: 44.84, longitude: -0.58 };
  const place = { label: 'Bordeaux' };
  const news = { status: 'ready', query: 'Bordeaux', articles: [], source: 'Google News RSS' };
  const retrievedAt = '2026-09-22T08:00:00.000Z';

  const missing = regionalBriefPayload({ point, place, weather: null, news, retrievedAt });
  assert.equal(missing.status, 'partial');
  assert.equal(missing.weatherStatus, 'unavailable');

  const off = regionalBriefPayload({ point, place, weather: null, weatherOn: false, news, retrievedAt });
  assert.equal(off.status, 'ready');
  assert.equal(off.weatherStatus, 'off');
  assert.equal(off.weather, null);

  // Even handed a reading, a switched-off deployment does not pass it on.
  const leaked = regionalBriefPayload({ point, place, weather: { temperatureC: 18 }, weatherOn: false, news, retrievedAt });
  assert.equal(leaked.weather, null);

  const full = regionalBriefPayload({ point, place, weather: { temperatureC: 18 }, news, retrievedAt });
  assert.equal(full.status, 'ready');
  assert.equal(full.weatherStatus, 'ready');
  assert.deepEqual(Object.keys(full), [
    'status', 'retrievedAt', 'coordinates', 'place', 'placeStatus', 'weather',
    'weatherStatus', 'newsStatus', 'newsQuery', 'newsSource', 'articles',
  ]);
});
