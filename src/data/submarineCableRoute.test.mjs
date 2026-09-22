// The TeleGeography cable map behind `/api/submarine-cables/`, through the
// real middleware of vite.config.js, and the reason it is behind a route at
// all: a bundled asset is served by every build, a route can be refused where
// GEV_NONCOMMERCIAL_SOURCES=off. The last test holds the layer module to it —
// a `new URL(…json, import.meta.url)` there would put the files back in
// `dist/assets/`, where no switch reaches them.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  SUBMARINE_CABLE_DATA_DIR,
  SUBMARINE_CABLE_FILES,
  SUBMARINE_CABLE_ROUTE,
  submarineCableUrl,
} from './submarineCableFiles.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

delete process.env.GEV_NONCOMMERCIAL_SOURCES;
const { default: createViteConfig } = await import('../../vite.config.js');

const plugin = createViteConfig({ mode: 'test' }).plugins.flat().find((entry) => entry?.name === 'submarine-cables');
const routes = new Map();
for (const hook of ['configureServer', 'configurePreviewServer']) {
  assert.equal(typeof plugin?.[hook], 'function', `the route exists in dev and preview (${hook})`);
}
plugin.configurePreviewServer({
  middlewares: { use(route, handler) { routes.set(route, handler); } },
  httpServer: null,
});

after(() => { delete process.env.GEV_NONCOMMERCIAL_SOURCES; });

async function call(url, { method = 'GET', headers = {} } = {}) {
  assert.ok(url.startsWith(`${SUBMARINE_CABLE_ROUTE}/`), url);
  const handler = routes.get(SUBMARINE_CABLE_ROUTE);
  const req = { method, url: url.slice(SUBMARINE_CABLE_ROUTE.length), headers };
  return new Promise((resolve) => {
    const res = {
      writeHead(status, values = {}) {
        this.status = status;
        this.headers = Object.fromEntries(Object.entries(values).map(([name, value]) => [name.toLowerCase(), value]));
      },
      end(body) { resolve({ status: this.status, headers: this.headers, body: body ?? null }); },
    };
    void handler(req, res, () => resolve({ status: 'next' }));
  });
}

const onDisk = (file) => fs.readFileSync(path.join(ROOT, ...SUBMARINE_CABLE_DATA_DIR, file));

test('a clone serves both files from the checkout, compressed when the browser can read it', async () => {
  for (const file of Object.values(SUBMARINE_CABLE_FILES)) {
    const plain = await call(submarineCableUrl(file));
    assert.equal(plain.status, 200, file);
    assert.equal(plain.headers['content-type'], 'application/json');
    assert.equal(plain.headers['cache-control'], 'private, max-age=86400', 'no shared cache keeps a copy');
    assert.deepEqual(plain.body, onDisk(file));
    assert.equal(JSON.parse(plain.body).type, 'FeatureCollection');

    const gzipped = await call(submarineCableUrl(file), { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(gzipped.headers['content-encoding'], 'gzip');
    assert.deepEqual(zlib.gunzipSync(gzipped.body), onDisk(file));

    const revalidated = await call(submarineCableUrl(file), { headers: { 'if-none-match': plain.headers.etag } });
    assert.equal(revalidated.status, 304);
  }
});

test('a clone answers 404 for anything but the two files', async () => {
  for (const url of [`${SUBMARINE_CABLE_ROUTE}/source.json`, `${SUBMARINE_CABLE_ROUTE}/../../../package.json`, `${SUBMARINE_CABLE_ROUTE}/`]) {
    assert.equal((await call(url)).status, 404, url);
  }
});

test('off: neither file is served, and the refusal says why', async () => {
  process.env.GEV_NONCOMMERCIAL_SOURCES = 'off';
  for (const file of Object.values(SUBMARINE_CABLE_FILES)) {
    const answer = await call(submarineCableUrl(file), { headers: { 'accept-encoding': 'br, gzip' } });
    assert.equal(answer.status, 404, file);
    assert.equal(answer.headers['x-source-off'], 'telegeography');
    assert.equal(answer.headers['cache-control'], 'no-store');
    const body = JSON.parse(answer.body);
    assert.equal(body.status, 'off');
    assert.equal(body.type, undefined, 'no GeoJSON in the refusal');
  }
  delete process.env.GEV_NONCOMMERCIAL_SOURCES;
});

test('the layer fetches the route, never a bundled copy of the files', () => {
  const layer = fs.readFileSync(path.join(ROOT, 'src', 'data', 'telegeographySubmarineCables.js'), 'utf8');
  assert.doesNotMatch(layer, /import\.meta\.url/, 'new URL(…, import.meta.url) makes Vite emit the file into dist/assets');
  assert.doesNotMatch(layer, /from\s+['"][^'"]*\.json['"]/, 'a JSON import would inline it into the bundle');
  assert.match(layer, /submarineCableUrl\(SUBMARINE_CABLE_FILES\.cables\)/);
  assert.match(layer, /submarineCableUrl\(SUBMARINE_CABLE_FILES\.landingPoints\)/);
  // The unit tests of the layer tell the two fetches apart by this word.
  assert.match(submarineCableUrl(SUBMARINE_CABLE_FILES.landingPoints), /landing-point/);
  assert.doesNotMatch(submarineCableUrl(SUBMARINE_CABLE_FILES.cables), /landing-point/);
});
