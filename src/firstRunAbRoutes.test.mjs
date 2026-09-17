// The first-run A/B sink wired into the real middlewares of vite.config.js:
// `/api/first-run/events` and the switch on `/api/trial`. The switch is read
// per request, so each test sets it for itself.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-first-run-ab-'));
Object.assign(process.env, {
  GEV_FIRST_RUN_AB: 'A,B,C',
  GEV_FIRST_RUN_AB_DIR: DIR,
  GEV_TRIAL_LIMIT: '',
});

const { default: createViteConfig, sweepFirstRunAbDir } = await import('../vite.config.js');

const routes = new Map();
for (const plugin of createViteConfig({ mode: 'test' }).plugins.flat()) {
  if (!plugin?.configurePreviewServer) continue;
  if (!['trial-quota', 'first-run-ab'].includes(plugin.name)) continue;
  plugin.configurePreviewServer({
    middlewares: { use(route, handler) { routes.set(route, handler); } },
    httpServer: null,
  });
}

after(() => fs.rmSync(DIR, { recursive: true, force: true }));

async function call(route, { method = 'GET', body = '' } = {}) {
  const handler = routes.get(route);
  assert.ok(handler, `${route} is installed`);
  const chunks = body ? [Buffer.from(body)] : [];
  const req = {
    method,
    url: route,
    // What a real beacon carries. None of it may reach the file.
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0 (Macintosh) Secret-UA/9.9',
      cookie: 'gev_trial=v2.1.0.cookie-id-xyz.sig',
      referer: 'https://surplomb.app/?q=12-rue-de-la-paix',
    },
    socket: { remoteAddress: '198.51.100.23' },
    resume() {},
    async *[Symbol.asyncIterator]() { yield* chunks; },
  };
  const headers = new Map();
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader(name, value) { headers.set(name.toLowerCase(), value); },
      end(payload) {
        resolve({ status: this.statusCode, body: payload ? JSON.parse(payload) : null, headers });
      },
    };
    void handler(req, res, () => resolve({ status: 'next' }));
  });
}

const report = (overrides = {}) => JSON.stringify({
  v: 1,
  exp: 'first-run',
  variant: 'C',
  forced: false,
  visitorId: 'abcdefghij012345',
  sessionId: '0123456789abcdef',
  seq: 1,
  newVisitor: true,
  returnVisit: false,
  shell: 'phone',
  input: 'coarse',
  viewport: 'xs',
  reducedMotion: false,
  bootMs: 2100,
  dwellMs: null,
  events: [
    { t: 0, type: 'impression' },
    { t: 3100, type: 'action', kind: 'hint-click', outcome: 'found' },
    { t: 3101, type: 'dismiss', via: 'choice' },
  ],
  ...overrides,
});

const files = () => fs.readdirSync(DIR).filter((name) => name.endsWith('.jsonl'));
const lines = () => files().flatMap((name) => fs.readFileSync(path.join(DIR, name), 'utf8').trim().split('\n'));

test('/api/trial names the variants while the test runs', async () => {
  process.env.GEV_FIRST_RUN_AB = 'A,B,C';
  const on = await call('/api/trial');
  assert.equal(on.status, 200);
  assert.deepEqual(on.body.experiments, { firstRun: { variants: ['A', 'B', 'C'] } });
});

test('a valid report is one line, with the time it arrived and nothing of the request', async () => {
  process.env.GEV_FIRST_RUN_AB = 'A,B,C';
  const before = lines().length;
  const sent = await call('/api/first-run/events', {
    method: 'POST',
    body: report({ ip: '203.0.113.9', query: '12 rue de la Paix' }),
  });
  assert.equal(sent.status, 204);
  const written = lines();
  assert.equal(written.length, before + 1);
  const line = written.at(-1);
  const record = JSON.parse(line);
  assert.match(record.receivedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(record.variant, 'C');
  assert.deepEqual(record.events.map((event) => event.type), ['impression', 'action', 'dismiss']);
  for (const leak of ['198.51.100', '203.0.113', 'Secret-UA', 'cookie-id-xyz', 'gev_trial', 'rue-de-la-paix', 'rue de la Paix', 'Mozilla']) {
    assert.ok(!line.includes(leak), `${leak} reached the file`);
  }
  assert.match(files()[0], /^events-\d{4}-\d{2}-\d{2}\.jsonl$/);
});

test('free text, a wrong method, and garbage are refused without a write or an echo', async () => {
  process.env.GEV_FIRST_RUN_AB = 'A,B,C';
  const before = lines().length;
  const freeText = await call('/api/first-run/events', {
    method: 'POST',
    body: report({ events: [{ t: 0, type: 'impression' }, { t: 1, type: 'action', kind: '12 rue de la Paix', outcome: 'found' }] }),
  });
  assert.equal(freeText.status, 400);
  assert.ok(!JSON.stringify(freeText.body).includes('rue de la Paix'), 'the refusal never echoes the input');
  assert.equal((await call('/api/first-run/events', { method: 'POST', body: '{not json' })).status, 400);
  assert.equal((await call('/api/first-run/events', { method: 'POST', body: 'x'.repeat(20_000) })).status, 400);
  assert.equal((await call('/api/first-run/events', { method: 'GET' })).status, 405);
  // A variant the test is not running is not a drawn report.
  process.env.GEV_FIRST_RUN_AB = 'A,B';
  assert.equal((await call('/api/first-run/events', { method: 'POST', body: report() })).status, 400);
  assert.equal(lines().length, before);
});

test('without the variable, the route is a 404 that stores nothing, and /api/trial says so', async () => {
  const before = lines().length;
  for (const value of ['', 'A', undefined]) {
    if (value === undefined) delete process.env.GEV_FIRST_RUN_AB;
    else process.env.GEV_FIRST_RUN_AB = value;
    const off = await call('/api/first-run/events', { method: 'POST', body: report() });
    assert.equal(off.status, 404);
    assert.equal((await call('/api/trial')).body.experiments, null);
  }
  assert.equal(lines().length, before);
  process.env.GEV_FIRST_RUN_AB = 'A,B,C';
});

test('a flood from one address is cut at twelve a minute', async () => {
  process.env.GEV_FIRST_RUN_AB = 'A,B,C';
  const statuses = [];
  for (let i = 0; i < 14; i += 1) {
    statuses.push((await call('/api/first-run/events', { method: 'POST', body: report({ sessionId: `flood${String(i).padStart(11, '0')}` }) })).status);
  }
  assert.ok(statuses.includes(429), statuses.join(','));
  assert.ok(statuses.filter((status) => status === 204).length <= 12);
});

test('the sweep deletes day files past ninety days and nothing else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-first-run-sweep-'));
  try {
    const now = Date.UTC(2026, 11, 31, 12);
    for (const name of [
      'events-2026-09-01.jsonl', // 121 days: gone
      'events-2026-10-01.jsonl', // 91 days: gone
      'events-2026-10-03.jsonl', // 89 days: kept
      'events-2026-12-31.jsonl',
      'notes.txt',
      'events-2026-09-01.jsonl.bak',
      'chronicle-2026-01-01.jsonl',
    ]) fs.writeFileSync(path.join(dir, name), '{}\n');
    const deleted = sweepFirstRunAbDir(dir, now);
    assert.deepEqual(deleted.sort(), ['events-2026-09-01.jsonl', 'events-2026-10-01.jsonl']);
    assert.deepEqual(fs.readdirSync(dir).sort(), [
      'chronicle-2026-01-01.jsonl',
      'events-2026-09-01.jsonl.bak',
      'events-2026-10-03.jsonl',
      'events-2026-12-31.jsonl',
      'notes.txt',
    ]);
    assert.deepEqual(sweepFirstRunAbDir(path.join(dir, 'missing'), now), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the handler never reads a request header of its own', () => {
  const source = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const start = source.indexOf("middlewares.use('/api/first-run/events'");
  const body = source.slice(start, source.indexOf("name: 'first-run-ab'", start));
  assert.ok(start > 0 && body.length > 0);
  assert.doesNotMatch(body, /req\.headers|getHeader|cookie|user-agent|referer/i);
  // The address feeds the limiter and nothing else.
  assert.equal((body.match(/clientKey\(req\)/g) || []).length, 1);
  assert.doesNotMatch(body, /remoteAddress|clientKeyFor/);
});
