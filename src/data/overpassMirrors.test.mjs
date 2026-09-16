// src/data/overpassMirrors.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OVERPASS_MIRROR_PROFILES,
  OVERPASS_MIRROR_PARK_MS,
  OVERPASS_GROUP_RATE_LIMIT_MS,
  mirrorProfile,
  noteMirrorOutcome,
  planRotation,
  attemptTimeoutMs,
  createRotationCursor,
} from './overpassMirrors.js';

const FOSSGIS = 'https://overpass-api.de/api/interpreter';
const LZ4 = 'https://lz4.overpass-api.de/api/interpreter';
const COFFEE = 'https://overpass.private.coffee/api/interpreter';
const LIST = [FOSSGIS, LZ4, COFFEE];
const FOUR = ['https://a.test/i', 'https://b.test/i', 'https://c.test/i', 'https://d.test/i'];

// ─── Machines ──────────────────────────────────────────────

test('the two FOSSGIS facades are ONE machine, and private.coffee is not', () => {
  // Resolved 2026-09-02: lz4 is one of the addresses overpass-api.de answers
  // with. A 429 is a verdict on our IP, so asking the second re-learns the
  // first's answer — 13.1 s measured for nothing.
  assert.equal(mirrorProfile(FOSSGIS).group, 'fossgis');
  assert.equal(mirrorProfile(LZ4).group, 'fossgis');
  assert.notEqual(mirrorProfile(COFFEE).group, 'fossgis');
});

test('an unknown host is its OWN group, keyed on the full hostname', () => {
  // Grouping on the registrable domain would collapse a.test/b.test/c.test into
  // one machine, and one 429 would suppress mirrors nobody asked to skip.
  assert.notEqual(mirrorProfile(FOUR[0]).group, mirrorProfile(FOUR[1]).group);
  assert.equal(mirrorProfile(FOUR[0]).group, 'a.test');
  assert.equal(mirrorProfile('https://sub.example.org/i').group, 'sub.example.org');
  // A non-URL endpoint still yields a usable, distinct group.
  assert.equal(mirrorProfile('not a url').group, 'not a url');
  assert.equal(mirrorProfile(undefined).group, '');
});

test('the profile table is frozen and carries the measured latencies', () => {
  assert.equal(OVERPASS_MIRROR_PROFILES['overpass-api.de'].typicalMs, 394);
  assert.equal(OVERPASS_MIRROR_PROFILES['lz4.overpass-api.de'].typicalMs, 13_100);
  assert.throws(() => { OVERPASS_MIRROR_PROFILES['overpass-api.de'] = null; }, TypeError);
});

// ─── Health ────────────────────────────────────────────────

test('a failure parks the MACHINE, and a later one parks it longer', () => {
  const health = new Map();
  let clock = 1_000;
  const now = () => clock;
  assert.deepEqual(OVERPASS_MIRROR_PARK_MS, [20_000, 60_000, 300_000]);

  assert.equal(noteMirrorOutcome(health, 'private-coffee', 'throw', { now }).until, 21_000);
  clock = 100_000;
  assert.equal(noteMirrorOutcome(health, 'private-coffee', 'server-error', { now }).until, 160_000);
  clock = 200_000;
  assert.equal(noteMirrorOutcome(health, 'private-coffee', 'throw', { now }).until, 500_000);
  // The window never grows past the last step, however long the outage runs.
  clock = 600_000;
  assert.equal(noteMirrorOutcome(health, 'private-coffee', 'throw', { now }).until, 900_000);
  assert.equal(health.get('private-coffee').fails, 4);
});

test('a failure INSIDE the parking window does not escalate — one machine, one outage', () => {
  // The second FOSSGIS facade refusing right after the first is one machine
  // observed once. Counting it twice pushed a two-hostname machine to the
  // five-minute window at double speed, and left the CHEAP host parked longer
  // than the 22-second one it was supposed to protect us from.
  const health = new Map();
  let clock = 0;
  const now = () => clock;
  assert.equal(noteMirrorOutcome(health, 'fossgis', 'throw', { now }).until, 20_000);
  clock = 400;
  const second = noteMirrorOutcome(health, 'fossgis', 'throw', { now });
  assert.equal(second.fails, 1, 'the sibling facade is the same machine');
  assert.equal(second.until, 20_000, 'and the window must not restart either');
  // Once the window has lapsed, a fresh failure IS a fresh outage.
  clock = 25_000;
  assert.equal(noteMirrorOutcome(health, 'fossgis', 'throw', { now }).fails, 2);
});

test('a 429 parks the machine on its OWN short clock, and never escalates it', () => {
  const health = new Map();
  const now = () => 5_000;
  const entry = noteMirrorOutcome(health, 'fossgis', 'rate-limited', { now, latencyMs: 394 });
  assert.equal(entry.until, 0, 'a rate limit is not a fault — it must not reach the 5 min window');
  assert.equal(entry.fails, 0);
  assert.equal(entry.rateLimitedUntil, 5_000 + OVERPASS_GROUP_RATE_LIMIT_MS);
  // But it DOES take the machine out: bounding the rotation without bounding
  // the rate would just make the client ask a refusing host more often.
  assert.deepEqual(
    planRotation(LIST, { health, now: 6_000 }).attempts.map((a) => a.endpoint),
    [COFFEE],
  );
  // And it must NOT outlast a backoff cycle: the rotation that paid for the
  // wait has to be allowed to spend it, or the only cure for a 429 is deleted.
  assert.ok(OVERPASS_GROUP_RATE_LIMIT_MS < 5_500, 'must not swallow the backoff');
});

test('a 4xx never parks — one malformed query must not blind every layer', () => {
  // `overpassAttemptDisposition` cannot tell a front-end 406 from a 400 raised
  // by the query itself, and the proxy's contract is that a malformed query
  // surfaces after every mirror rejects it.
  const health = new Map();
  const now = () => 1_000;
  assert.equal(noteMirrorOutcome(health, 'fossgis', 'client-error', { now }).until, 0);
  assert.equal(noteMirrorOutcome(health, 'fossgis', 'runtime-error', { now }).until, 0);
  assert.equal(health.get('fossgis').fails, 0);
  assert.deepEqual(planRotation(LIST, { health, now: 2_000 }).attempts.length, 3);
});

test('one good answer clears the whole history', () => {
  const health = new Map();
  let clock = 0;
  const now = () => clock;
  noteMirrorOutcome(health, 'private-coffee', 'throw', { now });
  clock = 30_000;
  noteMirrorOutcome(health, 'private-coffee', 'throw', { now });
  assert.equal(health.get('private-coffee').fails, 2);
  clock = 500_000;
  const ok = noteMirrorOutcome(health, 'private-coffee', 'accept', { now, latencyMs: 2_100 });
  assert.equal(ok.fails, 0);
  assert.equal(ok.until, 0);
  assert.equal(ok.rateLimitedUntil, 0);
  assert.equal(ok.lastOkAt, 500_000);
});

// ─── Plan ──────────────────────────────────────────────────

test('planRotation FILTERS and never reorders — latency must not promote a mirror', () => {
  // The dangerous mirror is the FAST one: a regional instance answers 200 with
  // an empty element list in 0.3 s for the whole planet, and the proxy would
  // cache that void for up to 30 days. Order is editorial and stays put.
  const health = new Map();
  assert.deepEqual(planRotation(LIST, { health, now: 0 }).attempts.map((a) => a.endpoint), LIST);
  assert.equal(planRotation(LIST, { health, now: 0 }).halfOpen, false);

  noteMirrorOutcome(health, 'fossgis', 'throw', { now: () => 0 });
  // BOTH facades go, because the parking is on the machine.
  assert.deepEqual(
    planRotation(LIST, { health, now: 1_000 }).attempts.map((a) => a.endpoint),
    [COFFEE],
  );
  // And once the parking expires they come back in their original positions.
  assert.deepEqual(planRotation(LIST, { health, now: 21_000 }).attempts.map((a) => a.endpoint), LIST);
});

test('an empty health map plans every endpoint — no module-level state leaks in', () => {
  assert.deepEqual(
    planRotation(FOUR, { health: new Map(), now: 999_999_999 }).attempts.map((a) => a.endpoint),
    FOUR,
  );
  assert.deepEqual(planRotation([], { health: new Map(), now: 0 }), { attempts: [], halfOpen: false });
});

test('everything parked still yields ONE half-open probe — the state cannot latch', () => {
  const health = new Map();
  const now = () => 0;
  noteMirrorOutcome(health, 'fossgis', 'throw', { now });          // until 20 000
  noteMirrorOutcome(health, 'private-coffee', 'throw', { now });
  health.set('private-coffee', { ...health.get('private-coffee'), until: 300_000 });

  const plan = planRotation(LIST, { health, now: 10_000 });
  assert.equal(plan.halfOpen, true);
  assert.equal(plan.attempts.length, 1, 'a rotation must never plan zero attempts');
  assert.equal(plan.attempts[0].endpoint, FOSSGIS, 'the probe is the machine expiring soonest');
});

// ─── Budget ────────────────────────────────────────────────

test('the budget is SHARED across the mirrors left, not grabbed by the first', () => {
  // The repo's own pattern (`fetchOsmCameraElements`, `fetchPowerGridElements`):
  // a greedy first attempt eats the rotation and the last mirror — the one
  // documented alive at 5-20 s — is never contacted at all.
  const args = { remainingMs: 30_000, timeoutMs: 22_000, fallbackTimeoutMs: 12_000, minAttemptMs: 3_000 };
  assert.equal(attemptTimeoutMs({ ...args, attemptIndex: 0, attemptsLeft: 3 }), 10_000);
  assert.equal(attemptTimeoutMs({ ...args, attemptIndex: 1, attemptsLeft: 2 }), 12_000);
  assert.equal(attemptTimeoutMs({ ...args, attemptIndex: 2, attemptsLeft: 1 }), 12_000);
  // Alone against the whole budget, rank 0 still stops at its own leash.
  assert.equal(attemptTimeoutMs({ ...args, attemptIndex: 0, attemptsLeft: 1 }), 22_000);
});

test('minAttemptMs is a FLOOR that guarantees a try, never a gate that refuses one', () => {
  // Getting this backwards is how a busy queue becomes "every mirror is dead".
  const args = { timeoutMs: 22_000, fallbackTimeoutMs: 12_000, minAttemptMs: 3_000 };
  assert.equal(attemptTimeoutMs({ ...args, attemptIndex: 1, attemptsLeft: 1, remainingMs: 900 }), 3_000);
  assert.equal(attemptTimeoutMs({ ...args, attemptIndex: 0, attemptsLeft: 4, remainingMs: 1_000 }), 3_000);
  // Zero only when the budget is genuinely gone.
  assert.equal(attemptTimeoutMs({ ...args, attemptIndex: 0, attemptsLeft: 1, remainingMs: 0 }), 0);
  assert.equal(attemptTimeoutMs({ ...args, attemptIndex: 0, attemptsLeft: 1, remainingMs: -5_000 }), 0);
});

// ─── Cursor ────────────────────────────────────────────────

const cursorFor = (endpoints, health, clockRef, over = {}) => createRotationCursor({
  endpoints,
  health,
  now: () => clockRef.t,
  budgetMs: 30_000,
  timeoutMs: 22_000,
  fallbackTimeoutMs: 12_000,
  minAttemptMs: 3_000,
  ...over,
});

test('the cursor starts its clock on the first pass, not at construction', () => {
  // Between construction and the first pass sits `acquireOverpassSlot`, which
  // blocks up to 20 s. Charging that wait to the rotation budget is what turned
  // a busy local queue into a 60 s global outage for every Overpass layer.
  const clock = { t: 0 };
  const cursor = cursorFor(LIST, new Map(), clock);
  clock.t = 20_000; // queued for a slot
  cursor.newPass();
  const first = cursor.next();
  assert.equal(first.done, undefined, 'the rotation must still get its full budget');
  assert.equal(first.endpoint, FOSSGIS);
  assert.equal(first.timeoutMs, 10_000);
});

test('a 429 takes the machine out of THIS pass, and the next pass puts it back', () => {
  const clock = { t: 0 };
  const health = new Map();
  const cursor = cursorFor(LIST, health, clock);
  cursor.newPass();
  const first = cursor.next();
  assert.equal(first.endpoint, FOSSGIS);
  cursor.note(first.group, 'rate-limited');
  // lz4 is the same machine: skipped without a request.
  assert.equal(cursor.next().endpoint, COFFEE);
  assert.equal(cursor.next().done, true);
  assert.equal(cursor.startedCount, 2, 'the skipped facade must not count as an attempt');

  // After the backoff the machine is asked again — that wait exists precisely
  // because one short pause usually converts a 429 into an answer. The 15 s
  // rate-limit parking is what stops a NEW rotation from re-asking immediately.
  clock.t = 5_500;
  cursor.newPass();
  assert.equal(cursor.next().endpoint, FOSSGIS);
});

test('a mirror nobody tried does not push the next one onto the short leash', () => {
  // private.coffee is the only host that can answer here, and it is documented
  // alive at 5-20 s cold. Charging it the 12 s fallback because two untried
  // facades sat above it in the LIST would deny it on a technicality. Rank is
  // counted in attempts STARTED, so a parked machine costs it nothing.
  const clock = { t: 0 };
  const health = new Map();
  noteMirrorOutcome(health, 'fossgis', 'throw', { now: () => 0 });
  clock.t = 1_000;
  const cursor = cursorFor(LIST, health, clock);
  cursor.newPass();
  const coffee = cursor.next();
  assert.equal(coffee.endpoint, COFFEE, 'both FOSSGIS facades are parked with their machine');
  assert.equal(coffee.timeoutMs, 22_000, 'nothing was tried before it — it is rank 0');
  assert.equal(cursor.next().done, true);
});

test('the cursor stops on budget, and says so, so nobody calls it an outage', () => {
  const clock = { t: 0 };
  const cursor = cursorFor(FOUR, new Map(), clock);
  cursor.newPass();
  assert.equal(cursor.next().done, undefined);
  clock.t = 30_000; // the first attempt ate everything
  const stopped = cursor.next();
  assert.deepEqual(stopped, { done: true, reason: 'budget' });
  assert.equal(cursor.stoppedOnBudget, true);
  assert.equal(cursor.startedCount, 1);
});

test('the cursor refuses a backoff it cannot follow with a real attempt', () => {
  const clock = { t: 0 };
  const cursor = cursorFor(LIST, new Map(), clock);
  cursor.newPass();
  assert.equal(cursor.canAffordBackoff(4_000), true);
  clock.t = 28_000;
  assert.equal(cursor.canAffordBackoff(4_000), false, 'a wait with no attempt after it is pure latency');
});
