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
  voiceReserve,
  voiceTrialSpend,
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
    assert.equal(trialRefusalReason('summary', { remaining: 0 }, off), null);
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

test('the voice trial is three spoken requests unless GEV_TRIAL_VOICE says otherwise', () => {
  assert.equal(config().voiceTurns, 3);
  assert.equal(config({ GEV_TRIAL_VOICE: '5' }).voiceTurns, 5);
  assert.equal(config({ GEV_TRIAL_VOICE: '500' }).voiceTurns, 20, 'a trial, not a subscription');
  for (const out of ['0', 'waitlist', 'OFF']) {
    assert.equal(config({ GEV_TRIAL_VOICE: out }).voiceTurns, 0, out);
  }
  // The first spelling of this variable was `trial`; it is not a number.
  const typo = config({ GEV_TRIAL_VOICE: 'trial' });
  assert.equal(typo.voiceTurns, 3);
  assert.ok(typo.warnings.some((w) => /not a number of spoken requests/.test(w)));
  assert.equal(resolveTrialConfig({ GEV_TRIAL_VOICE: '3' }).voiceTurns, 0, 'nothing when the trial is off');
});

test('voice is one of the five tries, and happens once: 3 requests, not 5 × 3', () => {
  const on = config();
  const fresh = { remaining: 5, voiceUsed: 0, voiceRemaining: 3 };
  assert.equal(trialRefusalReason('voice', fresh, on), null);
  // Its requests are spent: refused, however many comfort tries are left.
  assert.equal(trialRefusalReason('voice', { remaining: 4, voiceUsed: 3, voiceRemaining: 0 }, on), 'voice');
  // Every try is gone (another way than summaries, which keep one back): the
  // voice trial cannot open.
  assert.equal(trialRefusalReason('voice', { remaining: 0, voiceUsed: 0, voiceRemaining: 3 }, on), 'exhausted');
  // A trial already opened (the brain path counts one request at a time) has
  // paid its try; the comfort count running out meanwhile does not end it.
  assert.equal(trialRefusalReason('voice', { remaining: 0, voiceUsed: 1, voiceRemaining: 2 }, on), null);
  // And a summary never looks at the spent voice count.
  assert.equal(trialRefusalReason('summary', { remaining: 4, voiceUsed: 3, voiceRemaining: 0 }, on), null);

  const closed = config({ GEV_TRIAL_VOICE: '0' });
  assert.equal(trialRefusalReason('voice', { remaining: 5, voiceUsed: 0, voiceRemaining: 0 }, closed), 'voice');
});

test('the HUD cannot spend the try the voice trial opens with', () => {
  const on = config();
  const unopened = (remaining) => ({ remaining, voiceUsed: 0, voiceRemaining: 3 });
  assert.equal(trialRefusalReason('summary', unopened(2), on), null);
  assert.equal(trialRefusalReason('summary', unopened(1), on), 'reserved');
  // Nearby places are not counted, so the reserve does not stop them.
  assert.equal(trialRefusalReason('lookup', unopened(1), on), null);
  // The try is still there for the voice.
  assert.equal(trialRefusalReason('voice', unopened(1), on), null);
  // Once the voice trial has opened, the summaries may have what is left.
  assert.equal(trialRefusalReason('summary', { remaining: 1, voiceUsed: 3, voiceRemaining: 0 }, on), null);
  assert.equal(trialRefusalReason('summary', { remaining: 0, voiceUsed: 3, voiceRemaining: 0 }, on), 'exhausted');
  // Voice out of the trial: nothing to keep back.
  const closed = config({ GEV_TRIAL_VOICE: '0' });
  assert.equal(trialRefusalReason('summary', { remaining: 1, voiceUsed: 0, voiceRemaining: 0 }, closed), null);
  assert.equal(voiceReserve({ voiceUsed: 0 }, closed), 0);
  assert.equal(voiceReserve({ voiceUsed: 0 }, on), 1);
});

test('place lookups stay open while a voice trial runs, even on its last try', () => {
  const on = config();
  // Opening the voice took the last try; its commands still need place names.
  assert.equal(trialRefusalReason('lookup', { remaining: 0, voiceUsed: 3, voiceRemaining: 0 }, on), null);
  assert.equal(trialRefusalReason('lookup', { remaining: 0, voiceUsed: 0, voiceRemaining: 3 }, on), 'exhausted');
  const closed = config({ GEV_TRIAL_VOICE: '0' });
  assert.equal(trialRefusalReason('lookup', { remaining: 0, voiceUsed: 0, voiceRemaining: 0 }, closed), 'exhausted');
});

test('opening the voice trial costs one try; the requests after it cost none', () => {
  assert.deepEqual(voiceTrialSpend({ voiceUsed: 0, voiceRemaining: 3 }), { comfort: 1, voice: 1 });
  assert.deepEqual(voiceTrialSpend({ voiceUsed: 1, voiceRemaining: 2 }), { comfort: 0, voice: 1 });
  // Minting a realtime session spends every request at once.
  assert.deepEqual(voiceTrialSpend({ voiceUsed: 0, voiceRemaining: 3 }, { all: true }), { comfort: 1, voice: 3 });
});

test('a token verifies only with its own secret and its own counts', () => {
  const token = signTrialToken({ used: 3, voiceUsed: 2, id: 'abcdefgh1234' }, SECRET);
  assert.deepEqual(verifyTrialToken(token, SECRET), { used: 3, voiceUsed: 2, id: 'abcdefgh1234' });
  assert.equal(verifyTrialToken(token, `${SECRET}-rotated`), null);
  // Editing a count down is the whole attack; the signature must catch it.
  const [v, used, voice, id, sig] = token.split('.');
  assert.equal(verifyTrialToken([v, '0', voice, id, sig].join('.'), SECRET), null);
  assert.equal(verifyTrialToken([v, used, '0', id, sig].join('.'), SECRET), null);
  for (const junk of ['', 'v2', 'v1.1.abcdefgh.x', 'v2.x.0.abcdefgh.sig', 'v2.1.x.abcdefgh.sig', 'v2.1.0.a.sig', `${token}.extra`]) {
    assert.equal(verifyTrialToken(junk, SECRET), null, junk);
  }
  // The first format carried no voice count; it reads as a new browser.
  const legacy = 'v1.3.abcdefgh1234.sig';
  assert.equal(verifyTrialToken(legacy, SECRET), null);
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
    consumeTrial(requestWith(cookie), res, on, undefined, () => 'fixedid12345');
    const [setCookie] = res.getHeader('Set-Cookie');
    cookie = setCookie.split(';')[0];
    counts.push(readTrialState(requestWith(cookie), on));
  }
  assert.deepEqual(counts, [
    { used: 1, remaining: 1, voiceUsed: 0, voiceRemaining: 3, id: 'fixedid12345' },
    { used: 2, remaining: 0, voiceUsed: 0, voiceRemaining: 3, id: 'fixedid12345' },
  ]);
  assert.equal(trialRefusalReason('lookup', counts[1], on), 'exhausted');
  assert.deepEqual(readTrialState(requestWith('gev_trial=v2.0.0.fixedid12345.forged'), on),
    { used: 0, remaining: 2, voiceUsed: 0, voiceRemaining: 3, id: null });
});

test('a voice spend moves both counts in one cookie, and keeps the browser id', () => {
  const on = config();
  const res = fakeResponse();
  const before = `gev_trial=${signTrialToken({ used: 1, id: 'fixedid12345' }, SECRET)}`;
  consumeTrial(requestWith(before), res, on, { comfort: 1, voice: 3 });
  const [setCookie] = res.getHeader('Set-Cookie');
  assert.deepEqual(readTrialState(requestWith(setCookie.split(';')[0]), on),
    { used: 2, remaining: 3, voiceUsed: 3, voiceRemaining: 0, id: 'fixedid12345' });
});

test('the cookie is HttpOnly, Lax, long-lived, and Secure only over HTTPS', () => {
  const on = config();
  const plain = fakeResponse();
  consumeTrial(requestWith(), plain, on);
  const [cookie] = plain.getHeader('Set-Cookie');
  assert.match(cookie, /^gev_trial=v2\.1\.0\./);
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

test('the voice refusal says whether the trial was used or never offered', () => {
  const used = fakeResponse();
  sendTrialRefusal(used, 'voice', config());
  assert.equal(JSON.parse(used.body).error, 'Essai de la voix terminé');
  const never = fakeResponse();
  sendTrialRefusal(never, 'voice', config({ GEV_TRIAL_VOICE: '0' }));
  assert.equal(JSON.parse(never.body).error, 'La voix n’est pas incluse dans l’essai');
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
  const cookie = `gev_trial=${signTrialToken({ used: 4, voiceUsed: 3, id: 'abcdefgh1234' }, SECRET)}`;
  assert.deepEqual(describeTrial(requestWith(cookie), on), {
    enabled: true,
    limit: 5,
    used: 4,
    remaining: 1,
    voice: { limit: 3, used: 3, remaining: 0 },
    waitlist: on.waitlist,
    experiments: null,
  });
  assert.deepEqual(describeTrial(requestWith(), resolveTrialConfig({})), {
    enabled: false,
    limit: null,
    used: null,
    remaining: null,
    voice: null,
    waitlist: null,
    experiments: null,
  });
  // The first-run A/B switch travels on the same probe, and spends nothing.
  assert.deepEqual(
    describeTrial(requestWith(), resolveTrialConfig({}), { variants: ['A', 'B', 'C'] }).experiments,
    { firstRun: { variants: ['A', 'B', 'C'] } },
  );
});
