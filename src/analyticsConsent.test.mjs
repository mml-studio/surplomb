import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_CONSENT_MAX_AGE_MS,
  readAnalyticsConsent,
  withdrawAnalyticsConsent,
  writeAnalyticsConsent,
} from './analyticsConsent.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get length() { return values.size; },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const NOW = Date.parse('2026-11-18T12:00:00Z');

test('no answer, a broken value, an unknown choice: the banner asks', () => {
  assert.equal(readAnalyticsConsent({ storage: memoryStorage(), now: NOW }), null);
  assert.equal(readAnalyticsConsent({ storage: memoryStorage({ [ANALYTICS_CONSENT_KEY]: '{oops' }), now: NOW }), null);
  assert.equal(readAnalyticsConsent({ storage: memoryStorage({ [ANALYTICS_CONSENT_KEY]: '{"choice":"maybe","at":"2026-11-18T00:00:00Z"}' }), now: NOW }), null);
  assert.equal(readAnalyticsConsent({ storage: null, now: NOW }), null);
});

test('an answer is kept six months, then asked again', () => {
  const storage = memoryStorage();
  assert.equal(writeAnalyticsConsent('granted', { storage, now: NOW }), true);
  assert.equal(readAnalyticsConsent({ storage, now: NOW }), 'granted');
  assert.equal(readAnalyticsConsent({ storage, now: NOW + ANALYTICS_CONSENT_MAX_AGE_MS - 1 }), 'granted');
  assert.equal(readAnalyticsConsent({ storage, now: NOW + ANALYTICS_CONSENT_MAX_AGE_MS }), null);
  writeAnalyticsConsent('denied', { storage, now: NOW });
  assert.equal(readAnalyticsConsent({ storage, now: NOW }), 'denied');
});

test('a date in the future is not an answer (a clock moved, a hand-edited key)', () => {
  const storage = memoryStorage();
  writeAnalyticsConsent('granted', { storage, now: NOW + 10 * 60_000 });
  assert.equal(readAnalyticsConsent({ storage, now: NOW }), null);
});

test('only the two answers are stored, and a refusing browser says so', () => {
  const storage = memoryStorage();
  assert.equal(writeAnalyticsConsent('yes', { storage, now: NOW }), false);
  assert.equal(storage.values.size, 0);
  const throwing = { setItem() { throw new Error('quota'); }, getItem: () => null };
  assert.equal(writeAnalyticsConsent('granted', { storage: throwing, now: NOW }), false);
});

test('withdrawing stores the refusal and erases what PostHog wrote, and nothing else', () => {
  const storage = memoryStorage({
    [ANALYTICS_CONSENT_KEY]: JSON.stringify({ choice: 'granted', at: new Date(NOW).toISOString() }),
    ph_phc_x_posthog: '{"distinct_id":"abc"}',
    __ph_opt_in_out_phc_x: '1',
    'gev:first-run-optout:v1': 'refused',
    'gev:waitlist-joined': '1',
  });
  const written = [];
  const doc = {
    location: { hostname: 'surplomb.app' },
    get cookie() { return 'ph_phc_x_posthog=%7B%7D; gev_trial=abc'; },
    set cookie(value) { written.push(value); },
  };
  assert.equal(withdrawAnalyticsConsent({ storage, doc, now: NOW }), true);
  assert.equal(readAnalyticsConsent({ storage, now: NOW }), 'denied');
  assert.deepEqual([...storage.values.keys()].sort(), [ANALYTICS_CONSENT_KEY, 'gev:first-run-optout:v1', 'gev:waitlist-joined'].sort());
  assert.ok(written.length >= 1 && written.every((c) => c.startsWith('ph_phc_x_posthog=; Max-Age=0')), written.join(' | '));
  assert.ok(written.some((c) => c.includes('Domain=.surplomb.app')), 'the cookie PostHog sets on the parent domain goes too');
  assert.ok(!written.some((c) => c.startsWith('gev_trial')), 'the trial cookie is not ours to erase here');
});
