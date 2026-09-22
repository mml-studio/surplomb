// The CCTV frame route's Street View fallback, through the real middleware of
// vite.config.js: where it may look (only at a camera the server itself holds,
// in both builds), and what it answers where GEV_NONCOMMERCIAL_SOURCES=off
// turns Street View off (no Google call, a 404 the panel prints as « IMAGE ·
// INDISPONIBLE »). Upstream fetches are stubbed and logged, so "no Street View
// request" is asserted on the wire.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The CCTV catalog and the OSM camera boxes both keep a disk cache under the
// working directory's `.gev-cache/`. A temporary one keeps a developer's own
// cache out of these assertions, and these writes out of the checkout.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'gev-cctv-street-view-')));

const CATALOG_CAMERA = {
  id: 'test-cam-1',
  name: 'Congress Ave at 6th',
  city: 'Austin',
  lat: 30.2686,
  lon: -97.7428,
  headingDeg: 90,
  fovDeg: 60,
  pitchDeg: -10,
  url: 'https://cams.example/test-cam-1.jpg',
  feedType: 'image',
};

Object.assign(process.env, {
  GOOGLE_MAPS_API_KEY: 'test-server-key',
  CCTV_SOURCES_JSON: JSON.stringify([CATALOG_CAMERA]),
  CCTV_OSM_CAMERAS_ENABLED: '1',
});
delete process.env.GEV_NONCOMMERCIAL_SOURCES;

const { default: createViteConfig, cctvStreetViewTarget } = await import('../../vite.config.js');

const routes = new Map();
for (const plugin of createViteConfig({ mode: 'test' }).plugins.flat()) {
  if (!['cctv-proxy', 'osm-cameras-proxy'].includes(plugin?.name)) continue;
  (plugin.configurePreviewServer || plugin.configureServer)({
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
const realError = console.error;

before(() => {
  console.warn = () => {};
  console.error = () => {};
  globalThis.fetch = async (input) => {
    const url = String(input);
    upstream.push(url);
    if (url.startsWith('https://maps.googleapis.com/maps/api/streetview')) {
      return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'Content-Type': 'image/jpeg' } });
    }
    if (/overpass|interpreter/.test(url)) {
      return new Response(JSON.stringify({
        elements: [{
          type: 'node',
          id: 4242,
          lat: 48.8584,
          lon: 2.2945,
          tags: { man_made: 'surveillance', surveillance: 'public', 'surveillance:type': 'camera', 'camera:direction': '120' },
        }],
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    // The camera's own frame is down, so every request walks the fallback chain.
    return new Response('not stubbed', { status: 599 });
  };
});

after(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  console.error = realError;
  delete process.env.GEV_NONCOMMERCIAL_SOURCES;
});

async function call(url) {
  const route = [...routes.keys()].find((prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`));
  assert.ok(route, `${url} has a route`);
  const req = { method: 'GET', url: url.slice(route.length) || '/', headers: {}, socket: { remoteAddress: '198.51.100.9' } };
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
        resolve({ status: this.statusCode, headers, body: payload });
      },
    };
    void routes.get(route)(req, res, () => resolve({ status: 'next' }));
  });
}

const streetViewCalls = () => upstream.filter((url) => url.startsWith('https://maps.googleapis.com/maps/api/streetview'));

test('the Street View target is the camera the server holds, never the coordinates the request carries', () => {
  const params = new URLSearchParams('lat=51.5007&lon=-0.1246&heading=200&fov=40&pitch=-5');
  assert.equal(cctvStreetViewTarget({ params }), null, 'an unknown camera has no position at all');
  assert.equal(cctvStreetViewTarget({ source: { lat: 'x', lon: 2 }, params }), null);
  assert.deepEqual(
    cctvStreetViewTarget({ source: CATALOG_CAMERA, params }),
    { lat: 30.2686, lon: -97.7428, heading: 200, fov: 40, pitch: -5 },
    'the position is the catalog\'s; the aim may follow the panel\'s CAL controls',
  );
  assert.deepEqual(
    cctvStreetViewTarget({ mapped: { lat: 48.8584, lon: 2.2945, headingDeg: 120, fovDeg: 70, pitchDeg: -12 } }),
    { lat: 48.8584, lon: 2.2945, heading: 120, fov: 70, pitch: -12 },
  );
});

test('a clone: an id the server does not know gets the placeholder, and no Street View call', async () => {
  const before = streetViewCalls().length;
  const answer = await call('/api/cctv/frame/made-up-camera?lat=51.5007&lon=-0.1246&heading=200');
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get('x-cctv-source'), 'synthetic');
  assert.equal(streetViewCalls().length, before, 'arbitrary coordinates no longer reach Google');
});

test('a clone: a catalog camera whose frame fails falls back on Street View at its own position', async () => {
  const before = streetViewCalls().length;
  const answer = await call('/api/cctv/frame/test-cam-1?lat=51.5007&lon=-0.1246&heading=200');
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get('x-cctv-source'), 'streetview');
  const calls = streetViewCalls().slice(before);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get('location'), '30.2686,-97.7428', 'the catalog\'s coordinates, not the query\'s');
  assert.equal(new URL(calls[0]).searchParams.get('heading'), '200');
});

test('a clone: an OSM mapped camera the server served falls back at the position it served', async () => {
  const box = await call('/api/osm-cameras?south=48.8&west=2.2&north=48.9&east=2.4');
  assert.equal(box.status, 200);
  const [camera] = JSON.parse(box.body).cameras;
  assert.ok(camera?.id?.startsWith('osm-'), 'the box served one mapped camera');
  const before = streetViewCalls().length;
  const answer = await call(`/api/cctv/frame/${encodeURIComponent(camera.id)}?lat=51.5007&lon=-0.1246`);
  assert.equal(answer.headers.get('x-cctv-source'), 'streetview');
  const calls = streetViewCalls().slice(before);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get('location'), '48.8584,2.2945');
});

test('off: a camera whose frame fails answers 404 unavailable, with no Street View call and no placeholder', async () => {
  process.env.GEV_NONCOMMERCIAL_SOURCES = 'off';
  const before = streetViewCalls().length;
  const answer = await call('/api/cctv/frame/test-cam-1?lat=30.2686&lon=-97.7428');
  assert.equal(answer.status, 404, 'the panel prints its own bilingual FRAME · UNAVAILABLE on an image error');
  assert.equal(answer.headers.get('x-cctv-source'), 'unavailable');
  assert.equal(JSON.parse(answer.body).sourceKind, 'unavailable');
  assert.equal(streetViewCalls().length, before);

  const health = JSON.parse((await call('/api/cctv/health')).body).cameras.find((entry) => entry.id === 'test-cam-1');
  assert.equal(health.sourceKind, 'unavailable');
});
