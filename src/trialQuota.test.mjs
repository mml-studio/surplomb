// The hosted trial: a signed cookie counts tries at the keyed comfort routes.
// These pin the parts that fail silently — a config that looks on and is off,
// a cookie that can be edited, a refusal the page cannot tell from load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIAL_COOKIE,
  consumeTrial,
  describeTrial,
  readCookie,
  readTrialState,
  resolveTrialConfig,
  sendTrialRefusal,
  signTrialToken,
  trialRefusalReason,
  verifyTrialToken,
} from './trialQuota.js';

const SECRET = 'a-test-secret-that-is-long-enough';
const config = (env = {}) => resolveTrialConfig({
  GEV_TRIAL_LIMIT: '5',
  GEV_TRIAL_SECRET: SECRET,
  GEV_WAITLIST_BUTTONDOWN: 'surplomb',
  ...env,
});

function fakeResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(body) { this.body = body; this.headersSent = true; },
    headers,
  };
}

const requestWith = (cookie, headers = {}) => ({
  headers: { ...(cookie ? { cookie } : {}), ...headers },
  socket: {},
});

test('the trial is OFF unless a limit is set — an open-source clone owes nobody a waitlist', () => {
  for (const value of [undefined, '', '0', '-3', 'five']) {
    const off = resolveTrialConfig({ GEV_TRIAL_LIMIT: value, GEV_TRIAL_SECRET: SECRET });
    assert.equal(off.enabled, false, `GEV_TRIAL_LIMIT=${value}`);
    assert.equal(trialRefusalReason('comfort', { remaining: 0 }, off), null);
    assert.equal(trialRefusalReason('voice', { remaining: 0 }, off), null, 'voice stays open too');
  }
  const res = fakeResponse();
  consumeTrial(requestWith(), res, resolveTrialConfig({}));
  assert.equal(res.getHeader('Set-Cookie'), undefined, 'nothing is written when off');
});

test('a limit without a secret still works, and says a restart will reset everyone', () => {
  const noSecret = resolveTrialConfig({ GEV_TRIAL_LIMIT: '5' }, () => 'generated-secret-generated-secret');
  assert.equal(noSecret.enabled, true);
  assert.equal(noSecret.secret, 'generated-secret-generated-secret');
  assert.ok(noSecret.warnings.some((w) => /GEV_TRIAL_SECRET is unset/.test(w)));
  assert.ok(resolveTrialConfig({ GEV_TRIAL_LIMIT: '5', GEV_TRIAL_SECRET: 'short' })
    .warnings.some((w) => /shorter than/.test(w)));
});

test('a trial without a waitlist is flagged: the card would have nowhere to send anyone', () => {
  const bare = resolveTrialConfig({ GEV_TRIAL_LIMIT: '5', GEV_TRIAL_SECRET: SECRET });
  assert.equal(bare.waitlist, null);
  assert.ok(bare.warnings.some((w) => /GEV_WAITLIST_BUTTONDOWN is not/.test(w)));
});

test('the waitlist target is built from a Buttondown username, never from a URL', () => {
  assert.deepEqual(config().waitlist, {
    action: 'https://buttondown.com/api/emails/embed-subscribe/surplomb',
  });
  const hostile = config({ GEV_WAITLIST_BUTTONDOWN: 'https://evil.example/x' });
  assert.equal(hostile.waitlist, null);
  assert.ok(hostile.warnings.some((w) => /not a Buttondown username/.test(w)));
});

test('voice is out of the trial unless GEV_TRIAL_VOICE=trial', () => {
  const on = config();
  assert.equal(on.voice, 'waitlist');
  assert.equal(trialRefusalReason('voice', { remaining: 5 }, on), 'voice');
  const counted = config({ GEV_TRIAL_VOICE: 'TRIAL' });
  assert.equal(trialRefusalReason('voice', { remaining: 5 }, counted), null);
  assert.equal(trialRefusalReason('voice', { remaining: 0 }, counted), 'exhausted');
});

test('a token verifies only with its own secret and its own count', () => {
  const token = signTrialToken({ used: 3, id: 'abcdefgh1234' }, SECRET);
  assert.deepEqual(verifyTrialToken(token, SECRET), { used: 3, id: 'abcdefgh1234' });
  assert.equal(verifyTrialToken(token, `${SECRET}-rotated`), null);
  // Editing the count down is the whole attack; the signature must catch it.
  const [v, , id, sig] = token.split('.');
  assert.equal(verifyTrialToken([v, '0', id, sig].join('.'), SECRET), null);
  for (const junk of ['', 'v1', 'v2.1.abcdefgh.x', 'v1.x.abcdefgh.sig', 'v1.1.a.sig', `${token}.extra`]) {
    assert.equal(verifyTrialToken(junk, SECRET), null, junk);
  }
});

test('the cookie is read by name, not by substring', () => {
  assert.equal(readCookie('other=1; gev_trial=abc; x=y', TRIAL_COOKIE), 'abc');
  assert.equal(readCookie('not_gev_trial=abc', TRIAL_COOKIE), null);
  assert.equal(readCookie(undefined, TRIAL_COOKIE), null);
});

test('each consumed try moves the count by one, and a forged cookie is a new browser', () => {
  const on = config({ GEV_TRIAL_LIMIT: '2' });
  let cookie = '';
  const counts = [];
  for (let i = 0; i < 2; i += 1) {
    const res = fakeResponse();
    consumeTrial(requestWith(cookie), res, on, () => 'fixedid12345');
    const [setCookie] = res.getHeader('Set-Cookie');
    cookie = setCookie.split(';')[0];
    counts.push(readTrialState(requestWith(cookie), on));
  }
  assert.deepEqual(counts, [
    { used: 1, remaining: 1, id: 'fixedid12345' },
    { used: 2, remaining: 0, id: 'fixedid12345' },
  ]);
  assert.equal(trialRefusalReason('comfort', counts[1], on), 'exhausted');
  assert.deepEqual(readTrialState(requestWith('gev_trial=v1.0.fixedid12345.forged'), on),
    { used: 0, remaining: 2, id: null });
});

test('the cookie is HttpOnly, Lax, long-lived, and Secure only over HTTPS', () => {
  const on = config();
  const plain = fakeResponse();
  consumeTrial(requestWith(), plain, on);
  const [cookie] = plain.getHeader('Set-Cookie');
  assert.match(cookie, /^gev_trial=v1\.1\./);
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Max-Age=34560000/);
  assert.doesNotMatch(cookie, /Secure/);
  const tunnelled = fakeResponse();
  consumeTrial(requestWith('', { 'x-forwarded-proto': 'https' }), tunnelled, on);
  assert.match(tunnelled.getHeader('Set-Cookie')[0], /; Secure$/);
});

test('a cookie set by another middleware survives ours', () => {
  const res = fakeResponse();
  res.setHeader('Set-Cookie', 'session=1');
  consumeTrial(requestWith(), res, config());
  const cookies = res.getHeader('Set-Cookie');
  assert.equal(cookies.length, 2);
  assert.equal(cookies[0], 'session=1');
});

test('the refusal is a 429 the page can tell from load: a quota field and no Retry-After', () => {
  const res = fakeResponse();
  sendTrialRefusal(res, 'exhausted', config(), { places: [] });
  assert.equal(res.statusCode, 429);
  assert.equal(res.getHeader('Retry-After'), undefined);
  assert.equal(res.getHeader('Cache-Control'), 'no-store');
  assert.deepEqual(JSON.parse(res.body), { places: [], error: 'Essai terminé', quota: 'exhausted', limit: 5 });
});

test('/api/trial reports the state without spending it', () => {
  const on = config();
  const cookie = `gev_trial=${signTrialToken({ used: 4, id: 'abcdefgh1234' }, SECRET)}`;
  assert.deepEqual(describeTrial(requestWith(cookie), on), {
    enabled: true,
    limit: 5,
    used: 4,
    remaining: 1,
    voice: 'waitlist',
    waitlist: on.waitlist,
  });
  assert.deepEqual(describeTrial(requestWith(), resolveTrialConfig({})), {
    enabled: false,
    limit: null,
    used: null,
    remaining: null,
    voice: 'open',
    waitlist: null,
  });
});
