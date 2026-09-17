// The A/B/C report, run against logs written here.
//
// Two things matter and neither shows up anywhere else: the statistics must
// match the textbook numbers the stop rule was sized with, and the printed
// report must never carry an identifier from the log.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildReport,
  dedupeSessions,
  isActivated,
  main,
  median,
  minimumDetectableDelta,
  readReports,
  sampleSizePerGroup,
  summarizeVariant,
  terminalOf,
  twoProportionZ,
  wilson,
} from './first-run-ab-report.mjs';

const near = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
};

// --- fixtures --------------------------------------------------------------

const impression = { t: 0, type: 'impression' };
const action = (t, kind, outcome = 'found') => ({ t, type: 'action', kind, outcome });
const dismiss = (t, via) => ({ t, type: 'dismiss', via });
const milestone = (t, kind) => ({ t, type: 'milestone', kind });

/** One log line as the server writes it. Ids are 16 base-36 characters. */
function line({
  sessionId,
  visitorId = 'visitor000000001',
  variant = 'A',
  seq = 1,
  forced = false,
  returnVisit = false,
  dwellMs = null,
  receivedAt = '2026-09-18T10:00:00Z',
  events = [impression],
}) {
  return {
    receivedAt,
    v: 1,
    exp: 'first-run',
    variant,
    forced,
    visitorId,
    sessionId,
    seq,
    newVisitor: !returnVisit,
    returnVisit,
    shell: 'desktop',
    input: 'fine',
    viewport: 'l',
    reducedMotion: false,
    bootMs: 1200,
    dwellMs,
    events,
  };
}

const session = (events) => ({ events });

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-ab-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeLog(dir, date, entries) {
  const text = entries.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))).join('\n');
  fs.writeFileSync(path.join(dir, `events-${date}.jsonl`), `${text}\n`);
}

// --- statistics ------------------------------------------------------------

test('two-proportion z-test: 30/100 against 45/100', () => {
  const { z, p } = twoProportionZ(30, 100, 45, 100);
  near(z, -2.19, 0.01, 'z');
  near(p, 0.028, 0.002, 'p');
  assert.deepEqual(twoProportionZ(0, 0, 3, 10), { z: null, p: null }, 'an empty group has no test');
});

test('Wilson interval for 30/100', () => {
  const [low, high] = wilson(30, 100);
  near(low, 0.218, 0.002, 'low');
  near(high, 0.397, 0.002, 'high');
  assert.deepEqual(wilson(0, 0), [0, 1]);
});

test('sample size for +10 points from 30 %, alpha 0.05 two-sided, power 0.80, is the announced 356', () => {
  assert.equal(sampleSizePerGroup(0.3, 0.1), 356);
  assert.ok(sampleSizePerGroup(0.3, 0.1, 0.025) > 356, 'the Bonferroni threshold needs more');
});

test('minimum detectable difference at n = 200 from 30 % is about 13 points', () => {
  near(minimumDetectableDelta(0.3, 200), 0.13, 0.01, 'delta');
  assert.equal(minimumDetectableDelta(0.3, 0), null);
});

test('median of nothing is null, not a throw', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

// --- sessions --------------------------------------------------------------

test('dedupe: the cumulative seq 2 beats seq 1, whatever the order received', () => {
  const first = line({ sessionId: 'session000000001', seq: 1, receivedAt: '2026-09-18T10:00:05Z', events: [impression, action(900, 'geoloc', 'not-found')] });
  const exit = line({
    sessionId: 'session000000001',
    seq: 2,
    dwellMs: 60_000,
    receivedAt: '2026-09-18T10:00:00Z',
    events: [impression, action(900, 'geoloc', 'not-found'), dismiss(2000, 'esc')],
  });
  const [kept, ...rest] = dedupeSessions([first, exit]);
  assert.equal(rest.length, 0);
  assert.equal(kept.seq, 2);
  assert.equal(kept.dwellMs, 60_000);
  assert.equal(kept.firstReceivedMs, Date.parse('2026-09-18T10:00:00Z'), 'first receipt of the session is kept');
});

test('dedupe: at equal seq the last received wins', () => {
  const early = line({ sessionId: 'session000000002', receivedAt: '2026-09-18T10:00:00Z', events: [impression] });
  const late = line({ sessionId: 'session000000002', receivedAt: '2026-09-18T10:00:09Z', events: [impression, dismiss(500, 'choice')] });
  const [kept] = dedupeSessions([late, early]);
  assert.equal(kept.events.length, 2);
});

test('terminal: the first action or dismissal after the impression', () => {
  assert.equal(terminalOf(session([impression])), null);
  assert.equal(terminalOf(session([])), null, 'a return visit has no terminal');
  const terminal = terminalOf(session([impression, action(1500, 'address', 'not-found'), dismiss(4000, 'esc')]));
  assert.equal(terminal.t, 1500);
});

test('activation: a found activating action counts', () => {
  assert.equal(isActivated(session([impression, action(800, 'address'), dismiss(800, 'choice')])), true);
  assert.equal(isActivated(session([impression, action(800, 'tile:live'), dismiss(800, 'choice')])), true);
  assert.equal(isActivated(session([impression, action(800, 'address', 'not-found'), dismiss(2000, 'esc')])), false);
});

test('activation: a layer or search milestone AFTER the terminal counts, at or before it does not', () => {
  assert.equal(isActivated(session([impression, dismiss(1000, 'esc'), milestone(5000, 'layer')])), true);
  assert.equal(isActivated(session([impression, dismiss(1000, 'esc'), milestone(5000, 'search')])), true);
  assert.equal(isActivated(session([impression, dismiss(1000, 'esc'), milestone(1000, 'layer')])), false, 'same t');
  assert.equal(isActivated(session([impression, milestone(500, 'layer'), dismiss(1000, 'esc')])), false, 'before');
  assert.equal(isActivated(session([impression, dismiss(1000, 'esc'), milestone(5000, 'waitlist')])), false, 'waitlist');
  assert.equal(isActivated(session([impression, milestone(5000, 'layer')])), false, 'no terminal');
});

test('activation: tile:explore, explore and hint-click alone do not count', () => {
  assert.equal(isActivated(session([impression, action(700, 'tile:explore'), dismiss(700, 'choice')])), false);
  assert.equal(isActivated(session([impression, action(700, 'explore'), dismiss(700, 'choice')])), false);
  assert.equal(isActivated(session([impression, action(700, 'hint-click')])), false);
});

test('return rate: a return visit ≥ 24 h after the first impression, among visitors seen ≥ 24 h ago', () => {
  const [seen, early, late] = [
    line({ sessionId: 'session000000010', visitorId: 'visitor000000010', receivedAt: '2026-09-18T08:00:00Z' }),
    line({ sessionId: 'session000000011', visitorId: 'visitor000000011', receivedAt: '2026-09-18T08:00:00Z' }),
    line({ sessionId: 'session000000012', visitorId: 'visitor000000012', receivedAt: '2026-09-19T20:00:00Z' }),
  ];
  const returns = [
    line({ sessionId: 'session000000020', visitorId: 'visitor000000010', returnVisit: true, events: [], receivedAt: '2026-09-19T09:00:00Z' }),
    line({ sessionId: 'session000000021', visitorId: 'visitor000000011', returnVisit: true, events: [], receivedAt: '2026-09-18T10:00:00Z' }),
  ];
  const sessions = dedupeSessions([seen, early, late]);
  const summary = summarizeVariant(sessions, dedupeSessions(returns), { asOfMs: Date.parse('2026-09-19T21:00:00Z') });
  assert.deepEqual(summary.returnRate, { eligibleVisitors: 2, returned: 1, rate: 0.5 });
});

test('forced sessions are left out by default and counted with the option', () => {
  const data = {
    records: [
      line({ sessionId: 'session000000030', variant: 'A' }),
      line({ sessionId: 'session000000031', variant: 'B', forced: true, visitorId: 'visitor000000031' }),
    ],
  };
  const byDefault = buildReport(data);
  assert.equal(byDefault.variants.A.impressions, 1);
  assert.equal(byDefault.variants.B.impressions, 0);
  assert.equal(byDefault.data.forcedSessions, 1);
  const included = buildReport(data, { includeForced: true });
  assert.equal(included.variants.B.impressions, 1);
  assert.equal(included.planning.unforcedImpressions.B, 0, 'the stop rule never counts forced sessions');
});

// --- files -----------------------------------------------------------------

test('readReports skips a corrupt line and filters files by their date', (t) => {
  const dir = tempDir(t);
  writeLog(dir, '2026-09-17', [line({ sessionId: 'session000000040', receivedAt: '2026-09-17T12:00:00Z' })]);
  writeLog(dir, '2026-09-18', [
    line({ sessionId: 'session000000041' }),
    '{"receivedAt": "2026-09-18T10:00:00Z", "v": 1, "exp"',
    line({ sessionId: 'session000000042', variant: 'Z' }),
  ]);
  writeLog(dir, '2026-09-19', [line({ sessionId: 'session000000043', receivedAt: '2026-09-19T12:00:00Z' })]);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a log\n');

  const all = readReports(dir);
  assert.equal(all.records.length, 3);
  assert.equal(all.unreadable, 2, 'truncated JSON and an unknown variant');
  assert.deepEqual(all.files, ['events-2026-09-17.jsonl', 'events-2026-09-18.jsonl', 'events-2026-09-19.jsonl']);

  const window = readReports(dir, { since: '2026-09-18', until: '2026-09-18' });
  assert.deepEqual(window.files, ['events-2026-09-18.jsonl']);
  assert.deepEqual(window.records.map((record) => record.sessionId), ['session000000041']);
  assert.equal(window.unreadable, 2);
});

test('the printed report carries no visitor or session id, in text or JSON', (t) => {
  const dir = tempDir(t);
  const ids = [];
  const entries = [];
  ['A', 'B', 'C'].forEach((variant, v) => {
    for (let i = 0; i < 4; i += 1) {
      const visitorId = `vis${variant.toLowerCase()}00000000000${i}`;
      const sessionId = `ses${variant.toLowerCase()}00000000000${i}`;
      ids.push(visitorId, sessionId);
      const events = i % 2
        ? [impression, action(1200 + v, 'address'), dismiss(1200 + v, 'choice')]
        : [impression, dismiss(3000, 'esc'), milestone(9000, 'layer')];
      entries.push(line({ sessionId, visitorId, variant, receivedAt: `2026-09-18T1${i}:00:00Z`, events }));
      if (i === 0) entries.push(line({ sessionId, visitorId, variant, seq: 2, dwellMs: 125_000, receivedAt: '2026-09-18T19:00:00Z', events }));
    }
  });
  writeLog(dir, '2026-09-18', entries);

  let text = '';
  assert.equal(main([dir], { write: (chunk) => { text += chunk; } }), 0);
  let json = '';
  assert.equal(main([dir, '--json'], { write: (chunk) => { json += chunk; } }), 0);

  assert.match(text, /Variante A/);
  assert.match(text, /NON ATTEINTE/, 'twelve sessions do not reach the stop rule');
  assert.match(text, /peeking/);
  for (const id of ids) {
    assert.equal(text.includes(id), false, `text leaks ${id}`);
    assert.equal(json.includes(id), false, `JSON leaks ${id}`);
  }
  const parsed = JSON.parse(json);
  assert.equal(parsed.variants.A.impressions, 4);
  assert.equal(parsed.variants.A.activation.successes, 4);
  assert.equal(parsed.variants.A.seq2Coverage.sessions, 1);
});

test('a bad argument exits 2 without reading anything', () => {
  let error = '';
  assert.equal(main(['--alpha', '2'], { write: () => {}, writeError: (chunk) => { error += chunk; } }), 2);
  assert.match(error, /--alpha/);
});
