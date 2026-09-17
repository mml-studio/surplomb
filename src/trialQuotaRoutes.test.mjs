// The trial wired into the real middlewares of vite.config.js: the five keyed
// routes, /api/voice/config and /api/trial. The config is read once per
// process, so the environment is set before the first request.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  GEV_TRIAL_LIMIT: '2',
  GEV_TRIAL_SECRET: 'routes-test-secret-routes-test-secret',
  GEV_TRIAL_VOICE: '',
  GEV_WAITLIST_BUTTONDOWN: 'surplomb',
  GEV_WAITLIST_PRICE: '',
  OPENAI_API_KEY: 'sk-test',
  OPENROUTER_API_KEY: '',
  GOOGLE_MAPS_API_KEY: 'test-google-key',
  GEV_VOICE_PROVIDER: 'openai',
  GEV_RATELIMIT_OPENAI_PER_MIN: '',
  GEV_RATELIMIT_OPENAI_GLOBAL_PER_MIN: '',
  GEV_RATELIMIT_GOOGLE_PER_MIN: '',
  GEV_RATELIMIT_GOOGLE_GLOBAL_PER_MIN: '',
  GEV_RATELIMIT_VOICE_BRAIN_PER_MIN: '',
  GEV_RATELIMIT_VOICE_BRAIN_GLOBAL_PER_MIN: '',
});

const { default: createViteConfig } = await import('../vite.config.js');

const routes = new Map();
for (const plugin of createViteConfig({ mode: 'test' }).plugins.flat()) {
  if (!plugin?.configurePreviewServer) continue;
  if (!['trial-quota', 'openai-realtime-proxy', 'voice-brain-proxy', 'google-places-context-proxy'].includes(plugin.name)) continue;
  plugin.configurePreviewServer({
    middlewares: { use(path, handler) { routes.set(path, handler); } },
    httpServer: null,
  });
}

let upstreamCalls = 0;
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url) => {
    upstreamCalls += 1;
    const body = String(url).includes('/v1/responses')
      ? { output_text: 'Louvre rive droite Paris centre' }
      : { places: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
});
after(() => { globalThis.fetch = realFetch; });

async function call(path, { method = 'GET', cookie = '', body = '', url = path } = {}) {
  const handler = routes.get(path);
  assert.ok(handler, `${path} is installed`);
  const chunks = body ? [Buffer.from(body)] : [];
  const req = {
    method,
    url,
    headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' },
    socket: { remoteAddress: '203.0.113.7' },
    async *[Symbol.asyncIterator]() { yield* chunks; },
    on(event, listener) {
      if (event === 'data') for (const chunk of chunks) listener(chunk);
      if (event === 'end') queueMicrotask(listener);
      return this;
    },
  };
  const headers = new Map();
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader(name, value) { headers.set(name.toLowerCase(), value); },
      getHeader(name) { return headers.get(name.toLowerCase()); },
      end(payload) {
        this.headersSent = true;
        const setCookie = headers.get('set-cookie');
        resolve({
          status: this.statusCode,
          body: payload ? JSON.parse(payload) : null,
          cookie: setCookie ? setCookie[0].split(';')[0] : null,
          headers,
        });
      },
    };
    void handler(req, res, () => resolve({ status: 404 }));
  });
}

const summary = (cookie) => call('/api/openai/hud-summary', { method: 'POST', cookie, body: '{}' });

test('two HUD summaries per browser, then the trial refusal — and nothing is spent on the third', async () => {
  const first = await summary('');
  assert.equal(first.status, 200);
  assert.equal(first.body.summary, 'Louvre rive droite Paris centre');
  const second = await summary(first.cookie);
  assert.equal(second.status, 200);
  const spentBefore = upstreamCalls;
  const third = await summary(second.cookie);
  assert.equal(third.status, 429);
  assert.equal(third.body.quota, 'exhausted');
  assert.equal(third.headers.get('retry-after'), undefined);
  assert.equal(upstreamCalls, spentBefore, 'a refused try never reaches OpenAI');

  // Nearby places and text search share the verdict, with their own contract.
  for (const path of ['/api/google/nearby-places', '/api/google/text-search']) {
    const refused = await call(path, { cookie: second.cookie, url: `${path}?lat=48.86&lon=2.34&q=louvre` });
    assert.equal(refused.status, 429, path);
    assert.deepEqual(refused.body.places, [], path);
    assert.equal(refused.body.quota, 'exhausted', path);
  }

  const trial = await call('/api/trial', { cookie: second.cookie });
  assert.equal(trial.body.remaining, 0);
  assert.equal(trial.body.waitlist.action, 'https://buttondown.com/api/emails/embed-subscribe/surplomb');

  const freshBrowser = await summary('');
  assert.equal(freshBrowser.status, 200, 'another browser starts at zero');
});

test('nearby places are gated but not counted: the summary is the try', async () => {
  const first = await summary('');
  const places = await call('/api/google/nearby-places', { cookie: first.cookie, url: '/api/google/nearby-places?lat=48.86&lon=2.34' });
  assert.equal(places.status, 200);
  assert.equal(places.cookie, null, 'no new count written');
});

test('voice is out of the trial: the config says so and both voice routes refuse', async () => {
  const config = await call('/api/voice/config');
  assert.equal(config.status, 200);
  assert.equal(config.body.provider, 'openai');
  assert.equal(config.body.waitlist, 'voice');

  const spentBefore = upstreamCalls;
  const token = await call('/api/realtime/token');
  assert.equal(token.status, 429);
  assert.equal(token.body.quota, 'voice');
  const brain = await call('/api/voice/brain', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'zoom' }] }) });
  assert.equal(brain.status, 429);
  assert.equal(brain.body.quota, 'voice');
  assert.equal(upstreamCalls, spentBefore);
});
