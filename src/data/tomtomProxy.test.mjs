// The TomTom proxy's daily governor, driven through the real middleware: what
// the traffic layer receives when the day's tiles are spent. The plugin is
// built with a temporary working directory, so its tile cache and budget file
// land there and never in a checkout's own `.gev-cache/`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_DAILY_TILE_BUDGET } from './tomtomTiles.js';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'tomtom-proxy-'));
const repoCwd = process.cwd();
process.chdir(tmp);
const { default: createViteConfig } = await import('../../vite.config.js');
const plugin = createViteConfig({ mode: 'test' }).plugins.flat().find((p) => p?.name === 'tomtom-proxy');
process.chdir(repoCwd);

let handler = null;
plugin.configureServer({ middlewares: { use(mount, fn) { if (mount === '/api/tomtom') handler = fn; } } });

let upstreamCalls = 0;
const realFetch = globalThis.fetch;
const savedEnv = {
  TOMTOM_API_KEY: process.env.TOMTOM_API_KEY,
  TOMTOM_DAILY_TILE_BUDGET: process.env.TOMTOM_DAILY_TILE_BUDGET,
};

before(() => {
  process.env.TOMTOM_API_KEY = 'test-key';
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://api.tomtom.com/')) upstreamCalls += 1;
    return new Response(new Uint8Array([0x1a, 0x02, 0x08, 0x01]), {
      status: 200,
      headers: { 'content-type': 'application/x-protobuf' },
    });
  };
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(tmp, { recursive: true, force: true });
});

/** One request through the middleware, as connect would hand it over. */
function call(url) {
  assert.ok(handler, '/api/tomtom is installed');
  return new Promise((resolve) => {
    let status = 200;
    let headers = {};
    const res = {
      headersSent: false,
      writeHead(code, head = {}) {
        status = code;
        headers = Object.fromEntries(Object.entries(head).map(([k, v]) => [k.toLowerCase(), v]));
        this.headersSent = true;
      },
      end(body) {
        const text = body === undefined ? '' : Buffer.from(body).toString('utf8');
        const json = String(headers['content-type'] || '').includes('json');
        resolve({ status, headers, body: json && text ? JSON.parse(text) : null });
      },
    };
    handler({ method: 'GET', url, headers: {}, socket: { remoteAddress: '203.0.113.7' } }, res);
  });
}

test('the default cap keeps a 31-day month inside the free 200,000 tiles', async () => {
  delete process.env.TOMTOM_DAILY_TILE_BUDGET;
  const status = await call('/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.budget, DEFAULT_DAILY_TILE_BUDGET);
  assert.equal(status.body.budget, 6451);
  assert.ok(status.body.budget * 31 <= 200_000);
});

test('the operator\'s override still wins', async () => {
  process.env.TOMTOM_DAILY_TILE_BUDGET = '1';
  assert.equal((await call('/status')).body.budget, 1);
});

test('a spent budget stops the upstream and says why, with the wait to midnight UTC', async () => {
  process.env.TOMTOM_DAILY_TILE_BUDGET = '1';
  const first = await call('/flow/12/2074/1409.pbf');
  assert.equal(first.status, 200);
  assert.equal(first.headers['x-tomtom-cache'], 'MISS');
  assert.equal(upstreamCalls, 1);

  const spent = await call('/flow/12/2075/1409.pbf');
  assert.equal(spent.status, 429);
  assert.deepEqual(spent.body, { error: 'budget' });
  // The label the layer reads to say "TomTom daily budget reached" rather than
  // blaming an edge throttle — see `flowTiles.classifyThrottle`.
  assert.equal(spent.headers['x-tomtom-limit'], 'budget');
  const retryAfter = Number(spent.headers['retry-after']);
  assert.ok(retryAfter >= 1 && retryAfter <= 86_400, `Retry-After ${retryAfter}`);
  assert.equal(upstreamCalls, 1, 'nothing more was billed');

  // The tile already fetched today is still served from the cache.
  const again = await call('/flow/12/2074/1409.pbf');
  assert.equal(again.status, 200);
  assert.equal(again.headers['x-tomtom-cache'], 'HIT');
  assert.equal(upstreamCalls, 1);
});

test('over budget, an old copy is served as stale rather than nothing', async () => {
  process.env.TOMTOM_DAILY_TILE_BUDGET = '1';
  const dir = path.join(tmp, '.gev-cache', 'tomtom');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'flow-12-2076-1409.pbf');
  await writeFile(file, Buffer.from([0x1a, 0x00]));
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
  await utimes(file, tenMinutesAgo, tenMinutesAgo);

  const stale = await call('/flow/12/2076/1409.pbf');
  assert.equal(stale.status, 200);
  assert.equal(stale.headers['x-tomtom-cache'], 'STALE-BUDGET');
  // A stale body promises no freshness, and its stamp says how old it is.
  assert.equal(stale.headers['cache-control'], 'private, max-age=0');
  assert.ok(Number(stale.headers['x-tomtom-fetched-at']) <= tenMinutesAgo.getTime() + 1000);
  assert.equal(upstreamCalls, 1);
});
