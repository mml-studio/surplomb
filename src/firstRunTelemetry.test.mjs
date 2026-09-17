import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_RUN_EVENTS_URL,
  attachFirstRunMilestones,
  bucketQueryLength,
  bucketViewport,
  createFirstRunTelemetry,
  sendFirstRunReport,
} from './firstRunTelemetry.js';
import { FIRST_RUN_REPORT_FIELDS, sanitizeFirstRunReport } from './firstRunAb.js';

function harness(overrides = {}) {
  let clock = 1_000_000;
  const timers = [];
  const sends = [];
  const telemetry = createFirstRunTelemetry({
    enabled: true,
    variant: 'A',
    forced: false,
    newVisitor: true,
    visitorId: 'abcdefghij012345',
    shell: 'desktop',
    input: 'fine',
    viewport: 'l',
    reducedMotion: false,
    bootMs: 5432,
    now: () => clock,
    random: () => 0.5,
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    send: (payload) => { sends.push(JSON.parse(JSON.stringify(payload))); return true; },
    ...overrides,
  });
  return {
    telemetry,
    sends,
    tick: (ms) => { clock += ms; },
    runTimers: () => { for (const fn of timers.splice(0)) fn(); },
  };
}

test('the typed text becomes a bucket, the screen a family', () => {
  assert.deepEqual([0, 1, 3, 4, 10, 11, 30, 31, 400, -2, 'x', undefined].map(bucketQueryLength),
    ['0', '1-3', '1-3', '4-10', '4-10', '11-30', '11-30', '31+', '31+', '0', '0', '0']);
  assert.deepEqual([320, 399, 400, 599, 600, 799, 800, 1079, 1080, 2160, Number.NaN].map(bucketViewport),
    ['xs', 'xs', 's', 's', 'm', 'm', 'l', 'l', 'xl', 'xl', 'xs']);
});

test('nothing is kept or sent before the card was painted', () => {
  const { telemetry, sends, runTimers } = harness();
  telemetry.record({ type: 'action', kind: 'address', outcome: 'found', queryLength: 5 });
  telemetry.record({ type: 'dismiss', via: 'esc' });
  runTimers();
  assert.equal(telemetry.flush('hide'), false);
  assert.deepEqual(sends, []);
});

test('a found address is one terminal report, then one cumulative report on hide', () => {
  const { telemetry, sends, tick, runTimers } = harness();
  telemetry.record({ type: 'impression', shell: 'desktop' });
  tick(4200);
  telemetry.record({ type: 'action', kind: 'address', outcome: 'found', queryLength: 17, layerIds: ['dvf-sales', 'ads-fr', 'dpe-fr'] });
  telemetry.record({ type: 'dismiss', via: 'choice' });
  assert.deepEqual(sends, [], 'the terminal report waits for the same tick to finish');
  runTimers();
  assert.equal(sends.length, 1);
  const first = sends[0];
  assert.equal(first.seq, 1);
  assert.equal(first.dwellMs, null);
  assert.equal(first.bootMs, 5400);
  assert.deepEqual(first.events, [
    { t: 0, type: 'impression' },
    { t: 4200, type: 'action', kind: 'address', outcome: 'found', qLen: '11-30' },
    { t: 4200, type: 'dismiss', via: 'choice' },
  ]);

  // The card's own layers are not the visitor's doing; a later one is.
  tick(3000);
  telemetry.milestone('layer', { layerId: 'dpe-fr' });
  telemetry.milestone('layer', { layerId: 'flights' });
  telemetry.milestone('layer', { layerId: 'schools-fr' });
  telemetry.milestone('search');
  tick(60_000);
  assert.equal(telemetry.flush('hide'), true);
  assert.equal(sends.length, 2);
  const second = sends[1];
  assert.equal(second.seq, 2);
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.dwellMs, 67_200);
  assert.deepEqual(second.events.slice(3), [
    { t: 7200, type: 'milestone', kind: 'layer' },
    { t: 7200, type: 'milestone', kind: 'search' },
  ]);
  // Never a third.
  assert.equal(telemetry.flush('hide'), false);
  assert.equal(telemetry.flush('terminal'), false);
  telemetry.record({ type: 'dismiss', via: 'esc' });
  runTimers();
  assert.equal(sends.length, 2);
});

test('the payload is the schema, exactly, and the server accepts it untouched', () => {
  const { telemetry, sends, runTimers } = harness({ variant: 'C', forced: true });
  telemetry.record({ type: 'impression', shell: 'desktop' });
  telemetry.record({
    type: 'action', kind: 'address', outcome: 'not-found', queryLength: 17, query: '12 rue de la Paix', lat: 48.87, lon: 2.33,
  });
  runTimers();
  const body = sends[0];
  assert.deepEqual(Object.keys(body), [...FIRST_RUN_REPORT_FIELDS]);
  assert.equal(body.forced, true);
  const text = JSON.stringify(body);
  assert.ok(!text.includes('rue de la Paix'));
  assert.ok(!text.includes('48.87'));
  assert.equal(body.events[1].qLen, '11-30');
  const checked = sanitizeFirstRunReport(body, { variants: ['A', 'B'] });
  assert.equal(checked.ok, true, checked.reason);
  assert.deepEqual(checked.record, body);
});

test('milestones wait for the card to close, and count once', () => {
  const { telemetry, sends, runTimers } = harness();
  telemetry.record({ type: 'impression' });
  telemetry.milestone('layer', { layerId: 'flights' });
  telemetry.milestone('search');
  telemetry.record({ type: 'dismiss', via: 'click-away' });
  telemetry.milestone('waitlist');
  telemetry.milestone('waitlist');
  runTimers();
  telemetry.flush('hide');
  assert.deepEqual(sends.at(-1).events.map((event) => event.kind || event.type), ['impression', 'dismiss', 'waitlist']);
});

test('64 events, then silence — and the report still fits the server cap', () => {
  const { telemetry, sends, runTimers } = harness();
  telemetry.record({ type: 'impression' });
  for (let i = 0; i < 100; i += 1) telemetry.record({ type: 'action', kind: 'address', outcome: 'not-found', queryLength: 40 });
  runTimers();
  telemetry.flush('hide');
  assert.equal(sends.at(-1).events.length, 64);
  assert.ok(Buffer.byteLength(JSON.stringify(sends.at(-1))) < 16 * 1024);
});

test('a returning visitor sends one report with no events', () => {
  const { telemetry, sends, tick, runTimers } = harness({ returnVisit: true, newVisitor: false });
  telemetry.record({ type: 'impression' });
  telemetry.record({ type: 'dismiss', via: 'esc' });
  runTimers();
  assert.deepEqual(sends, []);
  tick(90_000);
  assert.equal(telemetry.flush('hide'), true);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].returnVisit, true);
  assert.equal(sends[0].seq, 2);
  assert.deepEqual(sends[0].events, []);
  assert.equal(sends[0].dwellMs, 90_000);
  assert.equal(sanitizeFirstRunReport(sends[0], { variants: ['A', 'B', 'C'] }).ok, true);
});

test('switched off, it records and sends nothing', () => {
  for (const overrides of [{ enabled: false }, { visitorId: null }, { variant: undefined }]) {
    const { telemetry, sends, runTimers } = harness(overrides);
    assert.equal(telemetry.active, false);
    telemetry.record({ type: 'impression' });
    telemetry.record({ type: 'dismiss', via: 'esc' });
    runTimers();
    telemetry.flush('hide');
    assert.deepEqual(sends, []);
  }
});

test('a throwing transport never reaches the card', () => {
  const { telemetry, runTimers } = harness({ send: () => { throw new Error('offline'); } });
  telemetry.record({ type: 'impression' });
  telemetry.record({ type: 'dismiss', via: 'esc' });
  assert.doesNotThrow(runTimers);
  assert.doesNotThrow(() => telemetry.flush('hide'));
});

test('the transport is a beacon first, then a keepalive fetch without credentials', async () => {
  const beacons = [];
  const accepted = sendFirstRunReport({ v: 1 }, {
    nav: { sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true; } },
    fetchImpl: () => { throw new Error('must not fetch'); },
  });
  assert.equal(accepted, true);
  assert.equal(beacons[0].url, FIRST_RUN_EVENTS_URL);
  assert.equal(beacons[0].blob.type, 'application/json');
  assert.equal(await beacons[0].blob.text(), '{"v":1}');

  const fetches = [];
  sendFirstRunReport({ v: 1 }, {
    nav: { sendBeacon: () => false },
    fetchImpl: (url, init) => { fetches.push({ url, init }); return Promise.resolve(); },
  });
  assert.equal(fetches[0].url, '/api/first-run/events');
  assert.equal(fetches[0].init.method, 'POST');
  assert.equal(fetches[0].init.keepalive, true);
  assert.equal(fetches[0].init.credentials, 'omit');
  assert.equal(sendFirstRunReport({ v: 1 }, { nav: null, fetchImpl: null }), false);
});

function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) { listeners.set(type, [...(listeners.get(type) || []), handler]); },
    removeEventListener(type, handler) { listeners.set(type, (listeners.get(type) || []).filter((h) => h !== handler)); },
    fire(type, event = {}) { for (const handler of listeners.get(type) || []) handler(event); },
    count() { return [...listeners.values()].reduce((sum, list) => sum + list.length, 0); },
  };
}

test('the page wiring: layer requests, the dock search, the waitlist, and leaving', () => {
  const calls = [];
  const fake = {
    active: true,
    milestone: (kind, options) => calls.push(['milestone', kind, options?.layerId ?? null]),
    flush: (reason) => calls.push(['flush', reason]),
  };
  let visibilityListener = null;
  const dataManager = {
    subscribeVisibilityRequests(callback) {
      visibilityListener = callback;
      return () => { visibilityListener = null; };
    },
  };
  const form = target();
  const field = { value: '' };
  const documentRef = Object.assign(target(), {
    visibilityState: 'visible',
    getElementById: (id) => ({ 'location-search-form': form, 'location-search': field })[id] || null,
  });
  const windowRef = target();
  const detach = attachFirstRunMilestones(fake, { dataManager, documentRef, windowRef });

  visibilityListener({ type: 'visibility-request', layerId: 'flights', enabled: true, origin: 'user' });
  visibilityListener({ type: 'visibility-request', layerId: 'traffic', enabled: true, origin: 'programmatic' });
  visibilityListener({ type: 'visibility-request', layerId: 'flights', enabled: false, origin: 'user' });
  form.fire('submit');
  field.value = 'Lyon';
  form.fire('submit');
  windowRef.fire('gev:waitlist-open');
  documentRef.fire('visibilitychange');
  documentRef.visibilityState = 'hidden';
  documentRef.fire('visibilitychange');
  windowRef.fire('pagehide');
  assert.deepEqual(calls, [
    ['milestone', 'layer', 'flights'],
    ['milestone', 'search', null],
    ['milestone', 'waitlist', null],
    ['flush', 'hide'],
    ['flush', 'hide'],
  ]);
  assert.ok(!JSON.stringify(calls).includes('Lyon'));

  detach();
  assert.equal(visibilityListener, null);
  assert.equal(form.count() + documentRef.count() + windowRef.count(), 0);
  assert.equal(typeof attachFirstRunMilestones({ active: false }), 'function');
});
