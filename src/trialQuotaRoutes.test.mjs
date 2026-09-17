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
  GEV_OWNER_PASS_SECRET: 'routes-owner-secret-routes-owner-secret',
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
const { mintOwnerLink, signOwnerPass, signTrialToken } = await import('./trialQuota.js');

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
    const target = String(url);
    const body = target.includes('/v1/responses')
      ? { output_text: 'Louvre rive droite Paris centre' }
      : target.includes('/realtime/client_secrets')
        ? { value: 'ek_test', session: { model: 'gpt-realtime-2' } }
        : target.includes('openrouter.ai')
          ? { choices: [{ message: { role: 'assistant', content: 'C’est fait.' } }], usage: {} }
          : { places: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
});
after(() => { globalThis.fetch = realFetch; });

async function call(path, {
  method = 'GET', cookie = '', body = '', url = path, contentType = 'application/json', headers: extraHeaders = {},
} = {}) {
  const handler = routes.get(path);
  assert.ok(handler, `${path} is installed`);
  const chunks = body ? [Buffer.from(body)] : [];
  const req = {
    method,
    url,
    headers: { ...(cookie ? { cookie } : {}), 'content-type': contentType, ...extraHeaders },
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
        const json = String(headers.get('content-type') || '').includes('json');
        resolve({
          status: this.statusCode,
          body: payload && json ? JSON.parse(payload) : null,
          text: payload ? String(payload) : '',
          cookie: setCookie ? setCookie[0].split(';')[0] : null,
          headers,
        });
      },
    };
    void handler(req, res, () => resolve({ status: 404 }));
  });
}

const summary = (cookie) => call('/api/openai/hud-summary', { method: 'POST', cookie, body: '{}' });
const nearby = (cookie) => call('/api/google/nearby-places', { cookie, url: '/api/google/nearby-places?lat=48.86&lon=2.34' });

test('the HUD takes every try but the voice’s, then goes quiet — and nothing is spent on the refusal', async () => {
  const first = await summary('');
  assert.equal(first.status, 200);
  assert.equal(first.body.summary, 'Louvre rive droite Paris centre');
  const spentBefore = upstreamCalls;
  const second = await summary(first.cookie);
  assert.equal(second.status, 429);
  assert.equal(second.body.quota, 'reserved', 'not the card: the visitor still has the voice');
  assert.equal(second.headers.get('retry-after'), undefined);
  assert.equal(second.cookie, null);
  assert.equal(upstreamCalls, spentBefore, 'a refused try never reaches OpenAI');

  const trial = await call('/api/trial', { cookie: first.cookie });
  assert.equal(trial.body.remaining, 1);
  assert.equal(trial.body.waitlist.action, 'https://buttondown.com/api/emails/embed-subscribe/surplomb');
  assert.equal((await call('/api/voice/config', { cookie: first.cookie })).body.waitlist, null);

  const freshBrowser = await summary('');
  assert.equal(freshBrowser.status, 200, 'another browser starts at zero');
});

test('a spent trial refuses the place lookups too, with their own contract', async () => {
  const spent = `gev_trial=${signTrialToken({ used: 2, voiceUsed: 0, id: 'spentbrowser1' }, process.env.GEV_TRIAL_SECRET)}`;
  const refused = await summary(spent);
  assert.equal(refused.body.quota, 'exhausted');
  for (const path of ['/api/google/nearby-places', '/api/google/text-search']) {
    const lookup = await call(path, { cookie: spent, url: `${path}?lat=48.86&lon=2.34&q=louvre` });
    assert.equal(lookup.status, 429, path);
    assert.deepEqual(lookup.body.places, [], path);
    assert.equal(lookup.body.quota, 'exhausted', path);
  }
});

test('nearby places are gated but not counted: the summary is the try', async () => {
  const first = await summary('');
  const places = await nearby(first.cookie);
  assert.equal(places.status, 200);
  assert.equal(places.cookie, null, 'no new count written');
});

const token = (cookie) => call('/api/realtime/token', { cookie });

test('a realtime session is the whole voice trial: three requests, one try, once', async () => {
  const config = await call('/api/voice/config');
  assert.equal(config.status, 200);
  assert.equal(config.body.provider, 'openai');
  assert.equal(config.body.waitlist, null, 'a new browser may try the voice');

  const minted = await token('');
  assert.equal(minted.status, 200);
  assert.equal(minted.headers.get('x-gev-trial-voice-turns'), '3', 'the page closes the session after three');
  const trial = await call('/api/trial', { cookie: minted.cookie });
  assert.deepEqual(trial.body.voice, { limit: 3, used: 3, remaining: 0 });
  assert.equal(trial.body.remaining, 1, 'the voice trial took one of the two tries');

  // A second session is the premium card, not three more requests.
  const spentBefore = upstreamCalls;
  const again = await token(minted.cookie);
  assert.equal(again.status, 429);
  assert.equal(again.body.quota, 'voice');
  assert.equal(again.body.error, 'Essai de la voix terminé');
  assert.equal(upstreamCalls, spentBefore, 'a refused session never reaches OpenAI');
  assert.equal((await call('/api/voice/config', { cookie: minted.cookie })).body.waitlist, 'voice');

  // The try that remains still buys a summary.
  assert.equal((await summary(minted.cookie)).status, 200);
});

test('a browser that explored first still opens the voice trial, and the voice keeps its place names', async () => {
  const first = await summary('');
  const reserved = await summary(first.cookie);
  assert.equal(reserved.body.quota, 'reserved');
  const minted = await token(first.cookie);
  assert.equal(minted.status, 200, 'the last try was kept for the voice');
  const trial = await call('/api/trial', { cookie: minted.cookie });
  assert.equal(trial.body.remaining, 0);

  // Every try is spent now, but the session is running and asks place names.
  assert.equal((await nearby(minted.cookie)).status, 200);
  // The HUD, once the session closes, has nothing left.
  assert.equal((await summary(minted.cookie)).body.quota, 'exhausted');
});

test('the text brain counts the voice trial one spoken request at a time', async () => {
  const saved = { provider: process.env.GEV_VOICE_PROVIDER, key: process.env.OPENROUTER_API_KEY };
  Object.assign(process.env, { GEV_VOICE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'or-test' });
  try {
    const turn = (cookie, messages) => call('/api/voice/brain', {
      method: 'POST', cookie, body: JSON.stringify({ messages }),
    });
    const spoken = [{ role: 'user', content: 'zoom sur Lyon' }];
    let cookie = '';
    for (let request = 1; request <= 3; request += 1) {
      const answered = await turn(cookie, spoken);
      assert.equal(answered.status, 200, `request ${request}`);
      cookie = answered.cookie;
      // A tool round inside the same request costs nothing more.
      const toolRound = await turn(cookie, [
        ...spoken,
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'fly_to_location', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' },
      ]);
      assert.equal(toolRound.status, 200);
      assert.equal(toolRound.cookie, null, `no count on the tool round of request ${request}`);
    }
    const trial = await call('/api/trial', { cookie });
    assert.deepEqual(trial.body.voice, { limit: 3, used: 3, remaining: 0 });
    assert.equal(trial.body.used, 1, 'three requests, one try');
    const fourth = await turn(cookie, spoken);
    assert.equal(fourth.status, 429);
    assert.equal(fourth.body.quota, 'voice');
  } finally {
    Object.assign(process.env, { GEV_VOICE_PROVIDER: saved.provider, OPENROUTER_API_KEY: saved.key });
  }
});

const ownerSecret = () => process.env.GEV_OWNER_PASS_SECRET;
const redeem = (t, host = 'surplomb.app') => call('/api/owner-pass', {
  method: 'POST',
  url: '/',
  body: `t=${encodeURIComponent(t)}`,
  contentType: 'application/x-www-form-urlencoded',
  headers: { host, 'x-forwarded-proto': 'https' },
});

test('the owner\'s browser: one link, then every keyed route open and nothing counted', async () => {
  const t = new URL(mintOwnerLink('https://surplomb.app', ownerSecret())).searchParams.get('t');
  const page = await call('/api/owner-pass', { url: `/?t=${encodeURIComponent(t)}`, headers: { host: 'surplomb.app' } });
  assert.equal(page.status, 200);
  assert.match(page.text, /Activer sur ce navigateur/);
  assert.equal(page.cookie, null, 'the page itself spends nothing');

  const redeemed = await redeem(t, 'www.surplomb.app');
  assert.equal(redeemed.status, 303);
  assert.equal(redeemed.headers.get('location'), '/');
  assert.match(redeemed.headers.get('set-cookie')[0], /^gev_owner=o1\..*; HttpOnly; SameSite=Lax; Domain=surplomb\.app; Secure$/);
  assert.equal((await redeem(t)).status, 410, 'a link works once');

  // Over a trial that is spent to the last request.
  const spent = `gev_trial=${signTrialToken({ used: 2, voiceUsed: 3, id: 'spentowner01' }, process.env.GEV_TRIAL_SECRET)}`;
  const cookie = `${spent}; ${redeemed.cookie}`;
  for (let i = 0; i < 4; i += 1) {
    const answered = await summary(cookie);
    assert.equal(answered.status, 200, `summary ${i + 1}`);
    assert.equal(answered.cookie, null, 'never counted');
  }
  assert.equal((await nearby(cookie)).status, 200);
  const minted = await token(cookie);
  assert.equal(minted.status, 200);
  assert.equal(minted.cookie, null);
  assert.equal(minted.headers.get('x-gev-trial-voice-turns'), undefined, 'no turn limit: the page keeps the session open');
  assert.equal((await call('/api/voice/config', { cookie })).body.waitlist, null);
  const trial = await call('/api/trial', { cookie });
  assert.equal(trial.body.enabled, false, 'no crown, no count');
  assert.equal(trial.body.owner, true);

  // The same trial cookie without the pass is refused as before.
  assert.equal((await summary(spent)).body.quota, 'exhausted');
});

test('a pass or a link from another secret is nobody\'s', async () => {
  const foreignPass = `gev_owner=${signOwnerPass({ issuedAt: 1, id: 'foreign-pass-0001' }, 'not-this-servers-secret-not-this-one')}`;
  const spent = `gev_trial=${signTrialToken({ used: 2, voiceUsed: 3, id: 'spentowner02' }, process.env.GEV_TRIAL_SECRET)}`;
  assert.equal((await summary(`${spent}; ${foreignPass}`)).body.quota, 'exhausted');
  const foreignLink = new URL(mintOwnerLink('https://surplomb.app', 'not-this-servers-secret-not-this-one')).searchParams.get('t');
  const refused = await redeem(foreignLink);
  assert.equal(refused.status, 410);
  assert.equal(refused.cookie, null);
});
