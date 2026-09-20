// The hosted trial: a signed cookie counts tries at the keyed comfort routes.
// These pin the parts that fail silently — a config that looks on and is off,
// a cookie that can be edited, a refusal the page cannot tell from load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNER_LINK_TTL_S,
  TRIAL_COOKIE,
  consumeTrial,
  describeTrial,
  handleOwnerPass,
  hasOwnerPass,
  mintOwnerLink,
  ownerCookieDomain,
  readCookie,
  readTrialState,
  resolveTrialConfig,
  sendTrialRefusal,
  signOwnerLink,
  signOwnerPass,
  signTrialToken,
  trialRefusalReason,
  verifyOwnerLink,
  verifyOwnerPass,
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
    { used: 1, remaining: 1, voiceUsed: 0, voiceRemaining: 3, id: 'fixedid12345', owner: false },
    { used: 2, remaining: 0, voiceUsed: 0, voiceRemaining: 3, id: 'fixedid12345', owner: false },
  ]);
  assert.equal(trialRefusalReason('lookup', counts[1], on), 'exhausted');
  assert.deepEqual(readTrialState(requestWith('gev_trial=v2.0.0.fixedid12345.forged'), on),
    { used: 0, remaining: 2, voiceUsed: 0, voiceRemaining: 3, id: null, owner: false });
});

test('a voice spend moves both counts in one cookie, and keeps the browser id', () => {
  const on = config();
  const res = fakeResponse();
  const before = `gev_trial=${signTrialToken({ used: 1, id: 'fixedid12345' }, SECRET)}`;
  consumeTrial(requestWith(before), res, on, { comfort: 1, voice: 3 });
  const [setCookie] = res.getHeader('Set-Cookie');
  assert.deepEqual(readTrialState(requestWith(setCookie.split(';')[0]), on),
    { used: 2, remaining: 3, voiceUsed: 3, voiceRemaining: 0, id: 'fixedid12345', owner: false });
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
  assert.equal(JSON.parse(used.body).code, 'trial-voice-spent');
  const never = fakeResponse();
  sendTrialRefusal(never, 'voice', config({ GEV_TRIAL_VOICE: '0' }));
  assert.equal(JSON.parse(never.body).error, 'La voix n’est pas incluse dans l’essai');
  // The two refusals differ in kind, so they differ in code: one trial was
  // spent, the other was never offered.
  assert.equal(JSON.parse(never.body).code, 'trial-voice-closed');
});

test('the refusal is a 429 the page can tell from load: a quota field and no Retry-After', () => {
  const res = fakeResponse();
  sendTrialRefusal(res, 'exhausted', config(), { places: [] });
  assert.equal(res.statusCode, 429);
  assert.equal(res.getHeader('Retry-After'), undefined);
  assert.equal(res.getHeader('Cache-Control'), 'no-store');
  assert.deepEqual(JSON.parse(res.body), {
    places: [], error: 'Essai terminé', code: 'trial-exhausted', quota: 'exhausted', limit: 5,
  });
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

// ── The owner pass ──────────────────────────────────────────────────────────

const OWNER_SECRET = 'an-owner-secret-that-is-long-enough-to-count';
const ownerConfig = (env = {}) => config({ GEV_OWNER_PASS_SECRET: OWNER_SECRET, ...env });
const NOW = 1_800_000_000;
const PASS_ID = 'owner-pass-id-0001';
const ownerCookie = (secret = OWNER_SECRET) => `gev_owner=${signOwnerPass({ issuedAt: NOW, id: PASS_ID }, secret)}`;

test('owner passes are off without a trial, and off with a secret short enough to guess', () => {
  assert.equal(ownerConfig().ownerSecret, OWNER_SECRET);
  assert.equal(resolveTrialConfig({ GEV_OWNER_PASS_SECRET: OWNER_SECRET }).ownerSecret, null, 'no trial, nothing to step over');
  const short = ownerConfig({ GEV_OWNER_PASS_SECRET: 'x'.repeat(31) });
  assert.equal(short.ownerSecret, null);
  assert.ok(short.warnings.some((w) => w.includes('owner passes are OFF')));
  assert.equal(config().ownerSecret, null);
  assert.ok(!config().warnings.some((w) => w.includes('GEV_OWNER_PASS_SECRET')), 'unset is not a mistake');
  // A pass is worthless where passes are off.
  assert.equal(hasOwnerPass(requestWith(ownerCookie()), config()), false);
});

test('a link and a pass are signed apart: neither stands in for the other', () => {
  const link = signOwnerLink({ expiresAt: NOW + 60, nonce: PASS_ID }, OWNER_SECRET);
  const pass = signOwnerPass({ issuedAt: NOW + 60, id: PASS_ID }, OWNER_SECRET);
  assert.notEqual(link, pass);
  assert.deepEqual(verifyOwnerLink(link, OWNER_SECRET, NOW), { expiresAt: NOW + 60, nonce: PASS_ID });
  assert.deepEqual(verifyOwnerPass(pass, OWNER_SECRET), { issuedAt: NOW + 60, id: PASS_ID });
  assert.equal(verifyOwnerPass(link, OWNER_SECRET), null, 'a link is not a pass');
  assert.equal(verifyOwnerLink(pass, OWNER_SECRET, NOW), null, 'a pass is not a link');
  // Nor is a trial cookie, signed with the same primitive.
  assert.equal(verifyOwnerPass(signTrialToken({ used: 0, id: PASS_ID }, OWNER_SECRET), OWNER_SECRET), null);
  assert.equal(verifyOwnerPass(pass, 'another-secret-another-secret-another'), null);
  assert.equal(verifyOwnerPass(pass.replace(`.${NOW + 60}.`, `.${NOW + 61}.`), OWNER_SECRET), null);
  for (const junk of ['', 'o1', 'o1.1.short.sig', `v2.${NOW}.${PASS_ID}.x`, `${pass}.extra`]) {
    assert.equal(verifyOwnerPass(junk, OWNER_SECRET), null, junk);
  }
});

test('a link lives ten minutes, and cannot claim to live longer', () => {
  const mint = (expiresAt) => signOwnerLink({ expiresAt, nonce: PASS_ID }, OWNER_SECRET);
  assert.ok(verifyOwnerLink(mint(NOW + OWNER_LINK_TTL_S), OWNER_SECRET, NOW));
  assert.ok(verifyOwnerLink(mint(NOW), OWNER_SECRET, NOW), 'still good on its last second');
  assert.equal(verifyOwnerLink(mint(NOW - 1), OWNER_SECRET, NOW), null, 'expired');
  assert.equal(verifyOwnerLink(mint(NOW + 30 * 24 * 3600), OWNER_SECRET, NOW), null, 'a month-long link was not minted here');

  const url = new URL(mintOwnerLink('https://surplomb.app/some/path', OWNER_SECRET, { now: NOW, makeNonce: () => PASS_ID }));
  assert.equal(url.origin + url.pathname, 'https://surplomb.app/api/owner-pass');
  assert.deepEqual(verifyOwnerLink(url.searchParams.get('t'), OWNER_SECRET, NOW), { expiresAt: NOW + OWNER_LINK_TTL_S, nonce: PASS_ID });
});

test('the pass covers the site and its www. name, and stays host-only elsewhere', () => {
  assert.equal(ownerCookieDomain('surplomb.app'), 'surplomb.app');
  assert.equal(ownerCookieDomain('www.surplomb.app'), 'surplomb.app');
  assert.equal(ownerCookieDomain('WWW.Surplomb.app:443'), 'surplomb.app');
  assert.equal(ownerCookieDomain('box.tail0000.ts.net:4173'), 'box.tail0000.ts.net');
  for (const host of ['localhost:4173', '127.0.0.1:4173', '100.94.222.110', '[::1]:4173', 'www.app', '', undefined, 'evil.com/x']) {
    assert.equal(ownerCookieDomain(host), null, String(host));
  }
});

test('an owner is never counted and never refused, even over a spent trial cookie', () => {
  const on = ownerConfig();
  const spent = `gev_trial=${signTrialToken({ used: 5, voiceUsed: 3, id: 'abcdefgh1234' }, SECRET)}`;
  const req = requestWith(`${spent}; ${ownerCookie()}`);
  const state = readTrialState(req, on);
  assert.equal(state.owner, true);
  for (const kind of ['summary', 'lookup', 'voice']) {
    assert.equal(trialRefusalReason(kind, state, on), null, kind);
  }
  const res = fakeResponse();
  consumeTrial(req, res, on, voiceTrialSpend(state, { all: true }));
  assert.equal(res.getHeader('Set-Cookie'), undefined, 'nothing written');
  assert.deepEqual(describeTrial(req, on), {
    enabled: false,
    owner: true,
    limit: null,
    used: null,
    remaining: null,
    voice: null,
    waitlist: on.waitlist,
    experiments: null,
  });
  // A pass outlives nothing: past 400 days the server refuses it too.
  assert.equal(hasOwnerPass(requestWith(ownerCookie()), on, NOW + 400 * 86400), true);
  assert.equal(hasOwnerPass(requestWith(ownerCookie()), on, NOW + 400 * 86400 + 1), false);
  // A pass signed with another secret (a rotated one) is a visitor again.
  const revoked = requestWith(`${spent}; ${ownerCookie('the-old-secret-the-old-secret-the-old')}`);
  assert.equal(readTrialState(revoked, on).owner, false);
  assert.equal(trialRefusalReason('summary', readTrialState(revoked, on), on), 'exhausted');
});

function ownerRequest({ method = 'GET', url = '/', body = '', headers = {} } = {}) {
  const chunks = body ? [Buffer.from(body)] : [];
  return {
    method,
    url,
    headers: { host: 'surplomb.app', ...headers },
    socket: {},
    async *[Symbol.asyncIterator]() { yield* chunks; },
  };
}

test('the route: 404 where passes are off, one button on GET, one cookie on POST, once', async () => {
  const off = fakeResponse();
  await handleOwnerPass(ownerRequest(), off, config());
  assert.equal(off.statusCode, 404);

  const on = ownerConfig();
  const redeemed = new Map();
  const t = signOwnerLink({ expiresAt: NOW + 60, nonce: PASS_ID }, OWNER_SECRET);
  const options = { clock: () => NOW, redeemed, makeId: () => 'issued-pass-id-0001' };

  const page = fakeResponse();
  await handleOwnerPass(ownerRequest({ url: `/?t=${t}` }), page, on, options);
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /<form method="post" action="\/api\/owner-pass">/);
  assert.ok(page.body.includes(`value="${t}"`));
  assert.equal(page.getHeader('Set-Cookie'), undefined, 'a preview bot fetching the link spends nothing');
  assert.equal(page.getHeader('Cache-Control'), 'no-store');
  assert.equal(page.getHeader('Referrer-Policy'), 'no-referrer');

  const post = fakeResponse();
  await handleOwnerPass(ownerRequest({
    method: 'POST',
    body: `t=${encodeURIComponent(t)}`,
    headers: { host: 'www.surplomb.app', 'x-forwarded-proto': 'https' },
  }), post, on, options);
  assert.equal(post.statusCode, 303);
  assert.equal(post.getHeader('Location'), '/');
  const [cookie] = post.getHeader('Set-Cookie');
  assert.equal(
    cookie,
    `gev_owner=${signOwnerPass({ issuedAt: NOW, id: 'issued-pass-id-0001' }, OWNER_SECRET)}; Path=/; Max-Age=34560000; HttpOnly; SameSite=Lax; Domain=surplomb.app; Secure`,
  );
  assert.equal(hasOwnerPass(requestWith(cookie.split(';')[0]), on), true);

  for (const replay of [
    ownerRequest({ method: 'POST', body: `t=${t}` }),
    ownerRequest({ url: `/?t=${t}` }),
  ]) {
    const res = fakeResponse();
    await handleOwnerPass(replay, res, on, options);
    assert.equal(res.statusCode, 410, `${replay.method} after redemption`);
    assert.equal(res.getHeader('Set-Cookie'), undefined);
  }
});

test('the route refuses what was not minted here, and what is too big to be a link', async () => {
  const on = ownerConfig();
  const options = { clock: () => NOW, redeemed: new Map() };
  const refused = async (req) => {
    const res = fakeResponse();
    await handleOwnerPass(req, res, on, options);
    assert.equal(res.getHeader('Set-Cookie'), undefined);
    return res.statusCode;
  };
  const foreign = signOwnerLink({ expiresAt: NOW + 60, nonce: PASS_ID }, 'someone-elses-secret-someone-elses');
  const expired = signOwnerLink({ expiresAt: NOW - 1, nonce: PASS_ID }, OWNER_SECRET);
  const pass = signOwnerPass({ issuedAt: NOW + 60, id: PASS_ID }, OWNER_SECRET);
  for (const t of [foreign, expired, pass, '', '<script>']) {
    assert.equal(await refused(ownerRequest({ method: 'POST', body: `t=${encodeURIComponent(t)}` })), 410, t);
    assert.equal(await refused(ownerRequest({ url: `/?t=${encodeURIComponent(t)}` })), 410, t);
  }
  const good = signOwnerLink({ expiresAt: NOW + 60, nonce: PASS_ID }, OWNER_SECRET);
  assert.equal(await refused(ownerRequest({ method: 'POST', body: `t=${good}&pad=${'x'.repeat(5000)}` })), 410);
  assert.equal(await refused(ownerRequest({ method: 'PUT' })), 405);
  // The oversized body did not spend the link.
  const res = fakeResponse();
  await handleOwnerPass(ownerRequest({ method: 'POST', body: `t=${good}` }), res, on, options);
  assert.equal(res.statusCode, 303);
});

test('a POST is judged when its body has arrived, not when it opened', async () => {
  const on = ownerConfig();
  const redeemed = new Map();
  let now = NOW;
  const options = { clock: () => now, redeemed, makeId: () => 'issued-pass-id-0002' };
  const t = signOwnerLink({ expiresAt: NOW + 60, nonce: PASS_ID }, OWNER_SECRET);

  // The owner redeems the link; a later redemption prunes it once expired.
  const owner = fakeResponse();
  await handleOwnerPass(ownerRequest({ method: 'POST', body: `t=${t}` }), owner, on, options);
  assert.equal(owner.statusCode, 303);

  // A copy of the link whose body trickles in past the expiry.
  const held = ownerRequest({ method: 'POST' });
  held[Symbol.asyncIterator] = async function* trickle() {
    now = NOW + 120;
    const later = signOwnerLink({ expiresAt: now + 60, nonce: 'another-nonce-0001' }, OWNER_SECRET);
    await handleOwnerPass(ownerRequest({ method: 'POST', body: `t=${later}` }), fakeResponse(), on, options);
    assert.equal(redeemed.has(PASS_ID), false, 'the expired nonce was pruned');
    yield Buffer.from(`t=${t}`);
  };
  const res = fakeResponse();
  await handleOwnerPass(held, res, on, options);
  assert.equal(res.statusCode, 410);
  assert.equal(res.getHeader('Set-Cookie'), undefined);
});
