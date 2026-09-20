import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_RUN_ASSIGNMENT_TTL_DAYS,
  FIRST_RUN_DEFAULT_VARIANT,
  FIRST_RUN_EVENT_FIELDS,
  FIRST_RUN_KIND_RE,
  FIRST_RUN_REPORT_FIELDS,
  assignFirstRunVariant,
  firstRunExperimentFromEnv,
  isNewVisitor,
  newVisitorId,
  nextFirstRunAssignment,
  parseFirstRunVariants,
  pickFirstRunVariant,
  readFirstRunAssignment,
  sanitizeFirstRunReport,
} from './firstRunAb.js';
import { FIRST_RUN_VARIANT_KEY } from './firstRunExperience.js';
import { useTestLocale } from './i18n/testing.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 17, 12, 0, 0);

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const record = (overrides = {}) => JSON.stringify({
  variant: 'B', assignedAt: NOW - DAY, visitorId: 'abcdefghij012345', ...overrides,
});

// ── The switch ───────────────────────────────────────────────────────────────

test('the variable names the variants, and fewer than two is no test', () => {
  assert.deepEqual(parseFirstRunVariants('A,B,C'), ['A', 'B', 'C']);
  assert.deepEqual(parseFirstRunVariants(' a, b '), ['A', 'B']);
  assert.deepEqual(parseFirstRunVariants('A'), []);
  assert.deepEqual(parseFirstRunVariants('A,A,B'), ['A', 'B']);
  assert.deepEqual(parseFirstRunVariants('A,D'), []);
  assert.deepEqual(parseFirstRunVariants('C,A'), ['C', 'A']);
  assert.deepEqual(parseFirstRunVariants(undefined), []);
  assert.deepEqual(parseFirstRunVariants(''), []);
  assert.deepEqual(firstRunExperimentFromEnv({ GEV_FIRST_RUN_AB: 'A,B,C' }), { variants: ['A', 'B', 'C'] });
  assert.equal(firstRunExperimentFromEnv({ GEV_FIRST_RUN_AB: 'A' }), null);
  assert.equal(firstRunExperimentFromEnv({}), null);
  assert.equal(firstRunExperimentFromEnv(), null);
});

test('the draw is thirds, deterministic for a given roll', () => {
  const variants = ['A', 'B', 'C'];
  assert.equal(pickFirstRunVariant(variants, () => 0), 'A');
  assert.equal(pickFirstRunVariant(variants, () => 0.5), 'B');
  assert.equal(pickFirstRunVariant(variants, () => 0.999), 'C');
  assert.equal(pickFirstRunVariant(variants, () => 1), 'C', 'a roll of exactly 1 stays in range');
  assert.equal(pickFirstRunVariant(variants, () => Number.NaN), 'A');
  assert.equal(pickFirstRunVariant([], () => 0.7), FIRST_RUN_DEFAULT_VARIANT);
  let seed = 0;
  const counts = { A: 0, B: 0, C: 0 };
  for (let i = 0; i < 3000; i += 1) counts[pickFirstRunVariant(variants, () => ((seed += 0.618034) % 1))] += 1;
  for (const variant of variants) assert.ok(Math.abs(counts[variant] - 1000) < 30, JSON.stringify(counts));
});

test('a visitor id is sixteen base-36 characters', () => {
  assert.match(newVisitorId(), /^[0-9a-z]{16}$/);
  assert.equal(newVisitorId(() => 0), '0000000000000000');
  assert.equal(newVisitorId(() => 0.9999), 'zzzzzzzzzzzzzzzz');
});

// ── The stored draw ──────────────────────────────────────────────────────────

test('a stored draw is kept while it is usable, and only then', () => {
  const variants = ['A', 'B', 'C'];
  assert.deepEqual(readFirstRunAssignment(record(), { variants, now: NOW }), {
    variant: 'B', assignedAt: NOW - DAY, visitorId: 'abcdefghij012345',
  });
  // Expired: thirteen months is the ceiling.
  assert.equal(readFirstRunAssignment(record({ assignedAt: NOW - (FIRST_RUN_ASSIGNMENT_TTL_DAYS + 1) * DAY }), { variants, now: NOW }), null);
  assert.ok(readFirstRunAssignment(record({ assignedAt: NOW - (FIRST_RUN_ASSIGNMENT_TTL_DAYS - 1) * DAY }), { variants, now: NOW }));
  // A variant the test no longer runs.
  assert.equal(readFirstRunAssignment(record({ variant: 'C' }), { variants: ['A', 'B'], now: NOW }), null);
  // Malformed, foreign, from the future.
  assert.equal(readFirstRunAssignment('{not json', { variants, now: NOW }), null);
  assert.equal(readFirstRunAssignment('"B"', { variants, now: NOW }), null);
  assert.equal(readFirstRunAssignment(record({ visitorId: 'Robert' }), { variants, now: NOW }), null);
  assert.equal(readFirstRunAssignment(record({ assignedAt: NOW + DAY }), { variants, now: NOW }), null);
  assert.equal(readFirstRunAssignment(record({ assignedAt: '2026-09-17' }), { variants, now: NOW }), null);
  assert.equal(readFirstRunAssignment(null, { variants, now: NOW }), null);

  const kept = nextFirstRunAssignment({ stored: record(), variants, now: NOW, random: () => 0 });
  assert.equal(kept.fresh, false);
  assert.equal(kept.record.variant, 'B');
  const drawn = nextFirstRunAssignment({ stored: 'garbage', variants, now: NOW, random: () => 0.999 });
  assert.equal(drawn.fresh, true);
  assert.equal(drawn.record.variant, 'C');
  assert.equal(drawn.record.assignedAt, NOW);
  assert.match(drawn.record.visitorId, /^[0-9a-z]{16}$/);

  assert.equal(isNewVisitor({ assignedAt: NOW - 60_000 }, NOW), true);
  assert.equal(isNewVisitor({ assignedAt: NOW - DAY }, NOW), false);
  assert.equal(isNewVisitor(null, NOW), false);
});

// ── Assignment ───────────────────────────────────────────────────────────────

const experiment = { variants: ['A', 'B', 'C'] };
const plain = { search: '' };

test('a first visit draws, stores, and is measured', () => {
  const storage = memoryStorage();
  const result = assignFirstRunVariant({ experiment, location: plain, storage, random: () => 0.5, now: NOW });
  assert.equal(result.variant, 'B');
  assert.equal(result.forced, false);
  assert.equal(result.telemetry, true);
  assert.equal(result.newVisitor, true);
  const stored = JSON.parse(storage.values.get(FIRST_RUN_VARIANT_KEY));
  assert.deepEqual(stored, { variant: 'B', assignedAt: NOW, visitorId: result.visitorId });

  // The next visit keeps it, whatever the dice say, and does not re-date it.
  const later = assignFirstRunVariant({ experiment, location: plain, storage, random: () => 0, now: NOW + 2 * DAY });
  assert.equal(later.variant, 'B');
  assert.equal(later.visitorId, result.visitorId);
  assert.equal(later.newVisitor, false);
  assert.equal(JSON.parse(storage.values.get(FIRST_RUN_VARIANT_KEY)).assignedAt, NOW);
});

test('?welcome= forces without touching the draw', () => {
  const storage = memoryStorage({ [FIRST_RUN_VARIANT_KEY]: record({ variant: 'A' }) });
  const before = storage.values.get(FIRST_RUN_VARIANT_KEY);
  const result = assignFirstRunVariant({ experiment, location: { search: '?welcome=b' }, storage, now: NOW });
  assert.equal(result.variant, 'B');
  assert.equal(result.forced, true);
  assert.equal(result.telemetry, true, 'measured, and flagged, while the test runs');
  assert.equal(result.visitorId, 'abcdefghij012345');
  assert.equal(storage.values.get(FIRST_RUN_VARIANT_KEY), before);

  // A fresh browser forced to C gets an id for the report, and nothing stored.
  const fresh = memoryStorage();
  const demo = assignFirstRunVariant({ experiment, location: { search: '?welcome=C' }, storage: fresh, now: NOW });
  assert.equal(demo.variant, 'C');
  assert.match(demo.visitorId, /^[0-9a-z]{16}$/);
  assert.equal(fresh.values.size, 0);

  // Without the test, forcing is a demo and measures nothing.
  const off = assignFirstRunVariant({ experiment: null, location: { search: '?welcome=B' }, storage, now: NOW });
  assert.deepEqual(off, { variant: 'B', forced: true, telemetry: false, newVisitor: false, visitorId: null });
});

test('switching the test off shows A, measures nothing, and forgets the draw', () => {
  const storage = memoryStorage({ [FIRST_RUN_VARIANT_KEY]: record() });
  const result = assignFirstRunVariant({ experiment: null, location: plain, storage, now: NOW });
  assert.deepEqual(result, { variant: 'A', forced: false, telemetry: false, newVisitor: false, visitorId: null });
  assert.equal(storage.values.has(FIRST_RUN_VARIANT_KEY), false);
  // A variable naming one variant is the same as none.
  const one = memoryStorage({ [FIRST_RUN_VARIANT_KEY]: record() });
  assert.equal(assignFirstRunVariant({ experiment: firstRunExperimentFromEnv({ GEV_FIRST_RUN_AB: 'B' }), location: plain, storage: one, now: NOW }).telemetry, false);
  assert.equal(one.values.has(FIRST_RUN_VARIANT_KEY), false);
});

test('a visitor who refused is shown A, measured never, and forgotten', async () => {
  const { FIRST_RUN_OPTOUT_KEY } = await import('./firstRunOptOut.js');
  const storage = memoryStorage({ [FIRST_RUN_VARIANT_KEY]: record(), [FIRST_RUN_OPTOUT_KEY]: 'refused' });
  const result = assignFirstRunVariant({ experiment, location: plain, storage, now: NOW });
  assert.deepEqual(result, { variant: 'A', forced: false, telemetry: false, newVisitor: false, visitorId: null });
  assert.equal(storage.values.has(FIRST_RUN_VARIANT_KEY), false);
  // Forcing a card for a demo still measures nothing.
  const forced = assignFirstRunVariant({ experiment, location: { search: '?welcome=C' }, storage, now: NOW });
  assert.equal(forced.variant, 'C');
  assert.equal(forced.telemetry, false);
  // The Global Privacy Control signal is a refusal without a click.
  const gpc = memoryStorage();
  assert.equal(assignFirstRunVariant({ experiment, location: plain, storage: gpc, now: NOW, refused: true }).telemetry, false);
  assert.equal(gpc.values.size, 0);
});

test('an unanswered switch measures nothing and erases nothing', () => {
  const storage = memoryStorage({ [FIRST_RUN_VARIANT_KEY]: record({ variant: 'C' }) });
  const before = storage.values.get(FIRST_RUN_VARIANT_KEY);
  // The stored card is still the one shown, so a visitor never switches card.
  assert.deepEqual(
    assignFirstRunVariant({ experiment: null, known: false, location: plain, storage, now: NOW }),
    { variant: 'C', forced: false, telemetry: false, newVisitor: false, visitorId: null },
  );
  assert.equal(storage.values.get(FIRST_RUN_VARIANT_KEY), before);
  // No draw yet: A, and still no draw — the dice wait for a real answer.
  const empty = memoryStorage();
  assert.equal(assignFirstRunVariant({ experiment: null, known: false, location: plain, storage: empty, now: NOW }).variant, 'A');
  assert.equal(empty.values.size, 0);
  // A forced card is still forced.
  const forced = assignFirstRunVariant({ experiment: null, known: false, location: { search: '?welcome=b' }, storage, now: NOW });
  assert.deepEqual(forced, { variant: 'B', forced: true, telemetry: false, newVisitor: false, visitorId: null });
  // A refusal still wins, and still forgets.
  assignFirstRunVariant({ experiment: null, known: false, refused: true, location: plain, storage, now: NOW });
  assert.equal(storage.values.has(FIRST_RUN_VARIANT_KEY), false);
});

test('a browser that cannot keep the draw is not measured', () => {
  const blocked = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const result = assignFirstRunVariant({ experiment, location: plain, storage: blocked, random: () => 0.9, now: NOW });
  assert.deepEqual(result, { variant: 'A', forced: false, telemetry: false, newVisitor: false, visitorId: null });
  assert.equal(assignFirstRunVariant({ experiment, location: plain, storage: null, now: NOW }).telemetry, false);
  assert.doesNotThrow(() => assignFirstRunVariant({ experiment: null, location: plain, storage: blocked, now: NOW }));
});

test('a share link is not this module\'s decision: the card never shows there', () => {
  // The draw still happens (and is kept) — the card's own door refuses the
  // share link, so no impression and no report follow from it.
  const storage = memoryStorage();
  const result = assignFirstRunVariant({ experiment, location: { search: '', hash: '#lat=1&lon=2' }, storage, random: () => 0, now: NOW });
  assert.equal(result.variant, 'A');
});

// ── The report ───────────────────────────────────────────────────────────────

const validReport = (overrides = {}) => ({
  v: 1,
  exp: 'first-run',
  variant: 'B',
  forced: false,
  visitorId: 'abcdefghij012345',
  sessionId: '0123456789abcdef',
  seq: 1,
  newVisitor: true,
  returnVisit: false,
  shell: 'desktop',
  input: 'fine',
  viewport: 'l',
  reducedMotion: false,
  bootMs: 4300,
  dwellMs: null,
  events: [
    { t: 0, type: 'impression' },
    { t: 5200, type: 'action', kind: 'tile:sales', outcome: 'found' },
    { t: 5201, type: 'dismiss', via: 'choice' },
    { t: 9000, type: 'milestone', kind: 'search' },
  ],
  ...overrides,
});

test('a valid report is rebuilt field by field, and nothing else survives', () => {
  const sent = validReport({ ip: '203.0.113.9', userAgent: 'Mozilla', events: [
    { t: 0, type: 'impression', url: 'https://surplomb.app/?q=x' },
    { t: 1200, type: 'action', kind: 'address', outcome: 'found', qLen: '11-30', query: '12 rue de la Paix', lat: 48.8 },
    { t: 1201, type: 'dismiss', via: 'choice', layerIds: ['dvf-sales'] },
  ] });
  const result = sanitizeFirstRunReport(sent, { variants: ['A', 'B', 'C'] });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.record), [...FIRST_RUN_REPORT_FIELDS]);
  for (const event of result.record.events) {
    for (const key of Object.keys(event)) assert.ok(FIRST_RUN_EVENT_FIELDS.includes(key), key);
  }
  const text = JSON.stringify(result.record);
  for (const leak of ['203.0.113', 'Mozilla', 'rue de la Paix', 'surplomb.app', '48.8', 'dvf-sales']) {
    assert.ok(!text.includes(leak), `${leak} leaked into the stored record`);
  }
  assert.deepEqual(result.record.events[1], { t: 1200, type: 'action', kind: 'address', outcome: 'found', qLen: '11-30' });
});

test('anything outside the lists rejects the whole report', () => {
  const variants = ['A', 'B', 'C'];
  const rejects = (overrides, reason) => {
    const result = sanitizeFirstRunReport(validReport(overrides), { variants });
    assert.equal(result.ok, false, JSON.stringify(overrides).slice(0, 80));
    if (reason) assert.equal(result.reason, reason);
    assert.equal(result.record, undefined);
  };
  rejects({ v: 2 }, 'version');
  rejects({ exp: 'landing' }, 'experiment');
  rejects({ variant: 'D' }, 'variant');
  rejects({ visitorId: 'marie@example' }, 'visitorId');
  rejects({ sessionId: 42 }, 'sessionId');
  rejects({ seq: 3 }, 'seq');
  rejects({ shell: 'tablet' }, 'shell');
  rejects({ viewport: '1440x900' }, 'viewport');
  rejects({ bootMs: 4321 }, 'bootMs');
  rejects({ dwellMs: -1 }, 'dwellMs');
  rejects({ events: 'none' }, 'events');
  rejects({ events: [{ t: 0, type: 'impression' }, { t: 1, type: 'action', kind: '12 rue de la Paix', outcome: 'found' }] }, 'event');
  rejects({ events: [{ t: 0, type: 'impression' }, { t: 1, type: 'action', kind: 'address', outcome: 'found', qLen: 17 }] }, 'event');
  rejects({ events: [{ t: 0, type: 'impression' }, { t: 1, type: 'dismiss', via: 'swipe' }] }, 'event');
  rejects({ events: [{ t: -5, type: 'impression' }] }, 'event');
  rejects({ events: [{ t: 0, type: 'pageview' }] }, 'event');
  rejects({ events: Array.from({ length: 65 }, (_, i) => ({ t: i, type: 'impression' })) }, 'too-many-events');
  rejects({ events: [] }, 'no-impression');
  assert.deepEqual(sanitizeFirstRunReport(null, { variants }), { ok: false, reason: 'not-an-object' });
  assert.deepEqual(sanitizeFirstRunReport([], { variants }), { ok: false, reason: 'not-an-object' });
  assert.equal(sanitizeFirstRunReport('{"v":1}', { variants }).ok, false);
  // A drawn variant must be one the test runs; a forced one may be any.
  assert.equal(sanitizeFirstRunReport(validReport({ variant: 'C' }), { variants: ['A', 'B'] }).ok, false);
  assert.equal(sanitizeFirstRunReport(validReport({ variant: 'C', forced: true }), { variants: ['A', 'B'] }).ok, true);
});

test('a returning visitor reports once, with no events', () => {
  const result = sanitizeFirstRunReport(validReport({ returnVisit: true, newVisitor: false, seq: 2, dwellMs: 64000, events: [] }), {
    variants: ['A', 'B', 'C'],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.record.events, []);
  assert.equal(result.record.returnVisit, true);
});

test('64 events is the ceiling, and it is accepted', () => {
  const events = [{ t: 0, type: 'impression' }, ...Array.from({ length: 63 }, (_, i) => ({ t: i + 1, type: 'milestone', kind: 'layer' }))];
  assert.equal(sanitizeFirstRunReport(validReport({ events }), { variants: ['A', 'B', 'C'] }).ok, true);
});

test('the kind pattern is exactly the contract', () => {
  for (const kind of ['address', 'geoloc', 'chip', 'tile:sales', 'tile:permits', 'tile:live', 'tile:explore', 'explore', 'hint-click', 'layer', 'search', 'waitlist']) {
    assert.match(kind, FIRST_RUN_KIND_RE);
  }
  for (const kind of ['tile', 'tile:salesX', 'Address', 'address ', '12 rue de la Paix', 'tile.sales']) {
    assert.doesNotMatch(kind, FIRST_RUN_KIND_RE);
  }
});

// ── A reader who is not reading French is not in the test ────────────────────
//
// The three cards were written, worded and argued in French. Measuring an
// English reader against them would attribute to a variant what is really the
// distance between a reader and a card nobody wrote for them.

test('an English page shows A, measures nothing, and never writes a draw', (t) => {
  useTestLocale('en', t);
  const storage = memoryStorage();
  const result = assignFirstRunVariant({ experiment, location: plain, storage, random: () => 0.5, now: NOW });
  assert.deepEqual(result, { variant: 'A', forced: false, telemetry: false, newVisitor: false, visitorId: null });
  assert.equal(storage.values.size, 0, 'nothing is stored for a visitor who is not in the test');
});

test('an English page leaves an existing draw exactly as it found it', (t) => {
  const storage = memoryStorage({ [FIRST_RUN_VARIANT_KEY]: record({ variant: 'B' }) });
  const before = storage.values.get(FIRST_RUN_VARIANT_KEY);
  const restore = useTestLocale('en');
  const english = assignFirstRunVariant({ experiment, location: plain, storage, now: NOW });
  restore();
  assert.equal(english.variant, 'A');
  assert.equal(english.telemetry, false);
  assert.equal(storage.values.get(FIRST_RUN_VARIANT_KEY), before, 'byte for byte the record that was there');

  // Back in French, the same browser resumes its own draw — same group, same
  // id, not a re-roll.
  const french = assignFirstRunVariant({ experiment, location: plain, storage, now: NOW });
  assert.equal(french.variant, 'B');
  assert.equal(french.telemetry, true);
  assert.equal(french.visitorId, 'abcdefghij012345');
  void t;
});

test('an English page may still be forced to a card, for support and demos, unmeasured', (t) => {
  useTestLocale('en', t);
  const storage = memoryStorage();
  const forced = assignFirstRunVariant({ experiment, location: { search: '?welcome=c' }, storage, now: NOW });
  assert.deepEqual(forced, { variant: 'C', forced: true, telemetry: false, newVisitor: false, visitorId: null });
  assert.equal(storage.values.size, 0);
});

test('nothing in a report says which language the reader was in', () => {
  // confidentialite.html promises the language is never sent. The exclusion
  // above is computed from `<html lang>` at draw time and stored nowhere, so
  // the field list is the proof.
  for (const field of [...FIRST_RUN_REPORT_FIELDS, ...FIRST_RUN_EVENT_FIELDS]) {
    assert.doesNotMatch(field, /lang|locale/i, `${field} would tell the server the reader's language`);
  }
});
