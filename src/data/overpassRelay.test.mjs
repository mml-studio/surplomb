// src/data/overpassRelay.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OVERPASS_RELAY_MAX_BODY_BYTES,
  OVERPASS_RELAY_PATH,
  OVERPASS_RELAY_TOKEN_HEADER,
  OVERPASS_RELAY_UPSTREAM,
  constantTimeEquals,
  overpassRequestHeaders,
  relayVerdict,
  resolveRelayEndpoint,
  withOverpassRelay,
} from './overpassRelay.js';

const FOSSGIS = 'https://overpass-api.de/api/interpreter';
const COFFEE = 'https://overpass.private.coffee/api/interpreter';
const VK = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const MIRRORS = [FOSSGIS, COFFEE, VK];
const RELAY = 'https://surplomb-overpass-relay.example.workers.dev/api/interpreter';
const UA = 'surplomb/1.0 (+https://github.com/mml-studio/surplomb)';

// ─── Reading what an operator typed ──────────────────────────

test('the three shapes a deploy actually produces all resolve to one endpoint', () => {
  // `wrangler deploy` prints the bare origin; a hand-edited .env usually gains
  // a trailing slash; someone who read the README pastes the full path. All
  // three are the same relay, and a mismatch shows up as a 404 from Cloudflare
  // that reads exactly like a dead mirror.
  for (const typed of [
    'https://surplomb-overpass-relay.example.workers.dev',
    'https://surplomb-overpass-relay.example.workers.dev/',
    'https://surplomb-overpass-relay.example.workers.dev/api/interpreter',
    '  https://surplomb-overpass-relay.example.workers.dev  ',
  ]) {
    assert.equal(resolveRelayEndpoint(typed), RELAY, typed);
  }
});

test('an unusable value leaves the rotation exactly as it was', () => {
  // Never "insert a broken first mirror": every one of these must be null so
  // that `withOverpassRelay` falls through to the untouched list.
  for (const bad of [null, undefined, '', '   ', 'not a url', 'workers.dev/api', 'http://insecure.test']) {
    assert.equal(resolveRelayEndpoint(bad), null, String(bad));
  }
});

test('a query string or fragment is dropped rather than carried upstream', () => {
  assert.equal(
    resolveRelayEndpoint('https://surplomb-overpass-relay.example.workers.dev/?debug=1#x'),
    RELAY,
  );
});

// ─── Where the relay sits ────────────────────────────────────

test('a configured relay goes FIRST, because the direct egress is the banned one', () => {
  // Ranking it behind hosts that refuse us would spend the 30 s rotation budget
  // re-learning the ban: two sub-200 ms refusals, then private.coffee's leash
  // against its measured 38.6 s.
  const list = withOverpassRelay(MIRRORS, { url: RELAY, token: 'secret' });
  assert.deepEqual(list, [RELAY, ...MIRRORS]);
  assert.deepEqual(MIRRORS, [FOSSGIS, COFFEE, VK], 'input list must not be mutated');
});

test('a relay without its secret is not a relay — it is a guaranteed 401 in front', () => {
  assert.deepEqual(withOverpassRelay(MIRRORS, { url: RELAY, token: null }), MIRRORS);
  assert.deepEqual(withOverpassRelay(MIRRORS, { url: RELAY, token: '   ' }), MIRRORS);
  assert.deepEqual(withOverpassRelay(MIRRORS, { url: null, token: 'secret' }), MIRRORS);
  assert.deepEqual(withOverpassRelay(MIRRORS), MIRRORS);
});

test('a relay already in the list is promoted, not duplicated', () => {
  const list = withOverpassRelay([FOSSGIS, RELAY, COFFEE], { url: RELAY, token: 'secret' });
  assert.deepEqual(list, [RELAY, FOSSGIS, COFFEE]);
});

// ─── Who gets the secret ─────────────────────────────────────

test('the shared secret rides on the relay and on nothing else', () => {
  const opts = { userAgent: UA, relayEndpoint: RELAY, relayToken: 'secret' };
  assert.equal(overpassRequestHeaders(RELAY, opts)[OVERPASS_RELAY_TOKEN_HEADER], 'secret');
  for (const mirror of MIRRORS) {
    const headers = overpassRequestHeaders(mirror, opts);
    assert.equal(
      headers[OVERPASS_RELAY_TOKEN_HEADER],
      undefined,
      `${mirror} must never receive the relay secret`,
    );
  }
});

test('every endpoint carries the OSM contact agent, relay included', () => {
  // Measured 2026-09-01: an agent string FOSSGIS dislikes drew a bare 406 on 8
  // of 11 attempts. The relay forwards this on purpose — it identifies us to
  // the operators rather than hiding us from them.
  for (const endpoint of [RELAY, ...MIRRORS]) {
    const headers = overpassRequestHeaders(endpoint, {
      userAgent: UA, relayEndpoint: RELAY, relayToken: 'secret',
    });
    assert.equal(headers['User-Agent'], UA);
    assert.equal(headers['Content-Type'], 'application/x-www-form-urlencoded');
  }
});

test('no relay configured means no relay header anywhere', () => {
  const headers = overpassRequestHeaders(RELAY, { userAgent: UA });
  assert.equal(headers[OVERPASS_RELAY_TOKEN_HEADER], undefined);
});

// ─── What the relay accepts ──────────────────────────────────

const inbound = (over = {}) => ({
  method: 'POST', path: OVERPASS_RELAY_PATH, token: 'secret', bodyBytes: 512, ...over,
});

test('the relay answers only POST on its own path', () => {
  assert.deepEqual(relayVerdict(inbound(), 'secret'), { ok: true });
  assert.equal(relayVerdict(inbound({ method: 'GET' }), 'secret').status, 405);
  assert.equal(relayVerdict(inbound({ path: '/' }), 'secret').status, 404);
  assert.equal(relayVerdict(inbound({ path: '/api/status' }), 'secret').status, 404);
  // A trailing slash is the same path, not a probe.
  assert.deepEqual(relayVerdict(inbound({ path: `${OVERPASS_RELAY_PATH}/` }), 'secret'), { ok: true });
});

test('a missing server secret is 503, not 401 — it is our problem, not the caller\'s', () => {
  const verdict = relayVerdict(inbound(), '');
  assert.equal(verdict.status, 503);
  assert.equal(verdict.reason, 'unconfigured');
  assert.equal(relayVerdict(inbound(), undefined).status, 503);
});

test('a wrong or absent token is refused, and method and path are judged first', () => {
  assert.equal(relayVerdict(inbound({ token: 'wrong' }), 'secret').status, 401);
  assert.equal(relayVerdict(inbound({ token: null }), 'secret').status, 401);
  // An unauthenticated caller must not be able to distinguish paths by status.
  assert.equal(relayVerdict(inbound({ method: 'GET', token: 'wrong' }), 'secret').status, 405);
});

test('an oversized body is refused before a socket is opened', () => {
  assert.deepEqual(relayVerdict(inbound({ bodyBytes: OVERPASS_RELAY_MAX_BODY_BYTES }), 'secret'), { ok: true });
  assert.equal(relayVerdict(inbound({ bodyBytes: OVERPASS_RELAY_MAX_BODY_BYTES + 1 }), 'secret').status, 413);
  // A chunked request declares no length; that is not a reason to refuse it —
  // worker.js re-checks once the bytes are in hand.
  assert.deepEqual(relayVerdict(inbound({ bodyBytes: null }), 'secret'), { ok: true });
});

test('the secret comparison does not short-circuit on the first differing byte', () => {
  assert.equal(constantTimeEquals('abc', 'abc'), true);
  assert.equal(constantTimeEquals('abc', 'abd'), false);
  assert.equal(constantTimeEquals('abc', 'abcd'), false);
  assert.equal(constantTimeEquals('', ''), true);
  assert.equal(constantTimeEquals('a', ''), false);
});

test('the relay forwards to the host that bans us, and to nothing else', () => {
  // One upstream is the contract: the server\'s rotation stays the only place
  // that decides who to ask, and a relayed answer has a known other end.
  assert.equal(OVERPASS_RELAY_UPSTREAM, 'https://overpass-api.de/api/interpreter');
});
