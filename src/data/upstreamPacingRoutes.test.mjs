// What a visitor receives when the server's own pacing (src/upstreamPacing.js)
// refuses a call, driven through the real middlewares of vite.config.js. The
// pacing is swapped for a scripted one, so a full queue is a line of test data
// rather than seconds of real waiting.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { upstreamLimitFor } from '../upstreamPacing.js';
import { serverMessage } from '../i18n/serverMessages.js';

const { default: createViteConfig, setUpstreamPacing } = await import('../../vite.config.js');

const routes = new Map();
for (const plugin of createViteConfig({ mode: 'test' }).plugins.flat()) {
  if (!['georisques-proxy', 'keyless-geocode-proxy'].includes(plugin?.name)) continue;
  plugin.configureServer({ middlewares: { use(mount, handler) { routes.set(mount, handler); } } });
}

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const REPORT = fixture('georisques-rapport-sample.json');
const ICPE = fixture('georisques-icpe-sample.json');
const RADON = fixture('georisques-radon-sample.json');
const BAN_REVERSE = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [2.376, 48.83] },
    properties: { label: '38 Rue des Cadets de la France Libre 75013 Paris', city: 'Paris', citycode: '75113', distance: 8 },
  }],
};
const IGN_HIT = {
  type: 'FeatureCollection',
  features: [{
    geometry: { coordinates: [2.35995, 48.855602] },
    properties: { _type: 'address', type: 'housenumber', label: '12 Rue de Rivoli 75004 Paris', score: 0.95 },
  }],
};

/** Upstream calls that actually left, by host. */
const sent = [];
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    sent.push(target.host + target.pathname);
    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { 'content-type': 'application/json' },
    });
    if (target.pathname.includes('resultats_rapport_risque')) return json(REPORT);
    if (target.pathname.includes('installations_classees')) return json(ICPE);
    if (target.pathname.includes('/radon')) return json(RADON);
    if (target.host === 'api-adresse.data.gouv.fr') return json(BAN_REVERSE);
    if (target.host === 'data.geopf.fr') return json(IGN_HIT);
    return json({ error: 'not found' }, 404);
  };
});

let restorePacing = null;
after(() => {
  globalThis.fetch = realFetch;
  if (restorePacing) setUpstreamPacing(restorePacing);
});

/**
 * A pacing that refuses the named upstreams and lets everything else go at
 * once, recording which visitor every call was made for.
 */
function scriptedPacing(refused, retryAfterSec = { 'georisques-report': 4 }) {
  const asked = [];
  const pacing = {
    asked,
    async acquire(url, { key = null } = {}) {
      const limit = upstreamLimitFor(url);
      asked.push({ upstream: limit?.id ?? null, key });
      if (limit && refused.has(limit.id)) {
        return { ok: false, upstream: limit.id, reason: 'queue', retryAfterSec: retryAfterSec[limit.id] ?? 2 };
      }
      return { ok: true, upstream: limit?.id ?? null, waitMs: 0 };
    },
    penalize() { return null; },
  };
  const previous = setUpstreamPacing(pacing);
  restorePacing ??= previous;
  return pacing;
}

function call(mount, url, ip = '203.0.113.7') {
  const handler = routes.get(mount);
  assert.ok(handler, `${mount} is installed`);
  return new Promise((resolve) => {
    let status = 200;
    const headers = new Map();
    const res = {
      headersSent: false,
      setHeader(name, value) { headers.set(name.toLowerCase(), String(value)); },
      writeHead(code, head = {}) {
        status = code;
        for (const [name, value] of Object.entries(head)) headers.set(name.toLowerCase(), String(value));
        this.headersSent = true;
      },
      end(body) {
        resolve({ status, headers, body: body ? JSON.parse(String(body)) : null });
      },
    };
    handler({ method: 'GET', url, headers: {}, socket: { remoteAddress: ip } }, res);
  });
}

test('every paced call inside a scan is made for the visitor who asked', async () => {
  const pacing = scriptedPacing(new Set());
  const answer = await call('/api/georisques', '/?lat=48.8301&lon=2.3761');
  assert.equal(answer.status, 200);
  const paced = pacing.asked.filter((entry) => entry.upstream);
  assert.ok(paced.length >= 3, 'report, ICPE, radon and the BAN reverse are paced');
  assert.ok(paced.every((entry) => entry.key === '203.0.113.7'), JSON.stringify(paced));
});

test('a scan our pacing left with nothing is a 503 with the wait, in the reader\'s words', async () => {
  scriptedPacing(new Set(['georisques-report', 'georisques-v1', 'geoplateforme-geocoding']));
  const before = sent.length;
  const answer = await call('/api/georisques', '/?lat=48.8402&lon=2.3862');
  assert.equal(answer.status, 503);
  assert.equal(answer.headers.get('retry-after'), '4', 'the longest wait among the refusals');
  assert.equal(answer.headers.get('cache-control'), 'no-store');
  assert.equal(answer.body.code, 'upstream-paced');
  assert.deepEqual(answer.body.params, { seconds: 4 });
  assert.equal(sent.length, before, 'nothing left for a paced upstream');
  assert.equal(
    serverMessage(answer.body),
    'Cette source est très sollicitée en ce moment — réessaie dans 4 s',
  );
});

test('a scan missing only its paced part is served, and kept by nobody', async () => {
  scriptedPacing(new Set(['georisques-report']));
  const first = await call('/api/georisques', '/?lat=48.8503&lon=2.3963');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.ok(Array.isArray(first.body.icpe) && first.body.icpe.length > 0, 'the ICPE half still answered');
  // Not cached: the same point asks again, and now gets the report too.
  scriptedPacing(new Set());
  const reportsBefore = sent.filter((entry) => entry.includes('resultats_rapport_risque')).length;
  const second = await call('/api/georisques', '/?lat=48.8503&lon=2.3963');
  assert.equal(second.status, 200);
  assert.match(second.headers.get('cache-control'), /max-age=/);
  const reportsAfter = sent.filter((entry) => entry.includes('resultats_rapport_risque')).length;
  assert.equal(reportsAfter, reportsBefore + 1, 'the report was fetched on the second scan');
});

test('Nominatim refused: the search falls through to the IGN geocoder, uncached', async () => {
  scriptedPacing(new Set(['nominatim']));
  const answer = await call('/api/geocode', '/?q=12%20rue%20de%20rivoli%20paris-pacing-1');
  assert.equal(answer.status, 200);
  assert.equal(answer.body.result?.source, 'geoplateforme');
  assert.equal(answer.headers.get('cache-control'), 'no-store');
});

test('every geocoder refused: 503 with the wait, never "no such place"', async () => {
  scriptedPacing(new Set(['nominatim', 'geoplateforme-geocoding']), { nominatim: 3, 'geoplateforme-geocoding': 1 });
  const answer = await call('/api/geocode', '/?q=nowhere-pacing-2');
  assert.equal(answer.status, 503);
  assert.equal(answer.headers.get('retry-after'), '3');
  assert.equal(answer.body.result, null);
  assert.equal(answer.body.code, 'upstream-paced');
});
