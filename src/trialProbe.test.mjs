import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIAL_PROBE_URL, createTrialProbe } from './trialProbe.js';

const json = (body, ok = true) => ({ ok, json: async () => body });

test('one request, however many readers', async () => {
  const calls = [];
  const probe = createTrialProbe({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return json({ enabled: true, experiments: null });
    },
  });
  const [a, b] = await Promise.all([probe.read(), probe.read()]);
  assert.deepEqual(a, { enabled: true, experiments: null });
  assert.equal(a, b);
  assert.equal((await probe.within(50)).enabled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/trial');
  assert.equal(TRIAL_PROBE_URL, '/api/trial');
  assert.equal(calls[0].init.cache, 'no-store', 'a cached answer would outlive the switch');
});

test('it never rejects: failures read as null', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('offline'); },
    async () => json({ error: 'nope' }, false),
    async () => ({ ok: true, json: async () => { throw new SyntaxError('html'); } }),
    async () => json(['not', 'an', 'object']),
    async () => json(null),
  ]) {
    assert.equal(await createTrialProbe({ fetchImpl }).read(), null);
  }
});

test('within() gives up on time without rejecting, and the read still lands', async () => {
  let release;
  const timers = [];
  const probe = createTrialProbe({
    fetchImpl: () => new Promise((resolve) => { release = () => resolve(json({ enabled: false })); }),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: () => {},
  });
  const bounded = probe.within(1500);
  assert.equal(timers[0].ms, 1500);
  timers[0].fn();
  assert.equal(await bounded, null);
  release();
  assert.deepEqual(await probe.read(), { enabled: false });
});
