import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_RUN_PROBE_BUDGET_MS, firstRunContext, startFirstRunExperience } from './firstRunBoot.js';
import { FIRST_RUN_STORAGE_KEY, FIRST_RUN_VARIANT_KEY } from './firstRunExperience.js';
import { FIRST_RUN_OPTOUT_KEY } from './firstRunOptOut.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const probeWith = (body) => {
  const asked = [];
  return { asked, within: async (ms) => { asked.push(ms); return body; } };
};
const ON = { enabled: false, experiments: { firstRun: { variants: ['A', 'B', 'C'] } } };
const OFF = { enabled: false, experiments: null };
const device = { shell: 'desktop', input: 'fine', viewport: 'l', reducedMotion: false, bootMs: 5000 };
const target = () => ({ addEventListener() {}, removeEventListener() {}, getElementById: () => null, visibilityState: 'visible' });

function start(overrides = {}) {
  const inits = [];
  const run = startFirstRunExperience({
    styleManager: { hasShareState: false },
    dataManager: { subscribeVisibilityRequests: () => () => {} },
    phoneSheet: { selectTab() {} },
    location: { search: '' },
    storage: memoryStorage(),
    documentRef: target(),
    windowRef: target(),
    context: device,
    init: (input) => { inits.push(input); return { dismiss() {} }; },
    ...overrides,
  });
  return { run, inits };
}

test('without the test, it is the plain A card with a sink that sends nothing', async () => {
  const probe = probeWith(OFF);
  const { run, inits } = start({ probe });
  const result = await run;
  assert.deepEqual(probe.asked, [FIRST_RUN_PROBE_BUDGET_MS]);
  assert.equal(inits.length, 1);
  assert.equal(inits[0].variant, 'A');
  assert.equal(typeof inits[0].onEvent, 'function');
  assert.equal(result.telemetry.active, false);
  assert.equal(result.assignment.telemetry, false);
  // A failed or slow probe measures nothing — and erases nothing.
  const drawn = memoryStorage({
    [FIRST_RUN_VARIANT_KEY]: JSON.stringify({ variant: 'B', assignedAt: Date.now() - 1000, visitorId: 'abcdefghij012345' }),
  });
  for (const body of [null, undefined]) {
    const again = await start({ probe: probeWith(body), storage: drawn }).run;
    assert.equal(again.assignment.variant, 'B', 'the stored card is kept');
    assert.equal(again.telemetry.active, false);
    assert.ok(drawn.values.has(FIRST_RUN_VARIANT_KEY), 'a missing answer is not a switched-off test');
  }
  // An answer that names no test is one, and it does forget.
  const answered = await start({ probe: probeWith({ experiments: {} }), storage: drawn }).run;
  assert.equal(answered.assignment.variant, 'A');
  assert.equal(drawn.values.has(FIRST_RUN_VARIANT_KEY), false);
  assert.equal((await start({ probe: null }).run).assignment.variant, 'A');
});

test('with the test, the drawn card is shown and measured, and passes everything through', async () => {
  const storage = memoryStorage();
  const phoneSheet = { selectTab() {} };
  const dataManager = { subscribeVisibilityRequests: () => () => {} };
  const { run, inits } = start({ probe: probeWith(ON), storage, phoneSheet, dataManager });
  const result = await run;
  assert.equal(result.telemetry.active, true);
  assert.ok(['A', 'B', 'C'].includes(inits[0].variant));
  assert.equal(inits[0].variant, result.assignment.variant);
  assert.equal(inits[0].phoneSheet, phoneSheet);
  assert.equal(inits[0].dataManager, dataManager);
  assert.equal(inits[0].storage, storage);
  assert.ok(storage.values.has(FIRST_RUN_VARIANT_KEY));
});

test('a returning visitor gets no card and one "came back" report', async () => {
  const sent = [];
  const storage = memoryStorage({ [FIRST_RUN_STORAGE_KEY]: 'suppressed' });
  const windowRef = Object.assign(target(), {
    listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
  });
  const realBeacon = globalThis.navigator?.sendBeacon;
  const nav = globalThis.navigator;
  const restore = [];
  if (nav) {
    const descriptor = Object.getOwnPropertyDescriptor(nav, 'sendBeacon');
    Object.defineProperty(nav, 'sendBeacon', { configurable: true, value: (url, blob) => { sent.push({ url, blob }); return true; } });
    restore.push(() => {
      if (descriptor) Object.defineProperty(nav, 'sendBeacon', descriptor);
      else delete nav.sendBeacon;
    });
  }
  try {
    const result = await start({ probe: probeWith(ON), storage, windowRef, init: () => null }).run;
    assert.equal(result.card, null);
    assert.equal(result.telemetry.active, true);
    windowRef.listeners.pagehide();
    if (nav) {
      assert.equal(sent.length, 1);
      const body = JSON.parse(await sent[0].blob.text());
      assert.equal(body.returnVisit, true);
      assert.deepEqual(body.events, []);
    }
  } finally {
    for (const step of restore) step();
    void realBeacon;
  }

  // Not a return: a share link, `?welcome=0`, a forced card, a first visit with no card.
  for (const overrides of [
    { styleManager: { hasShareState: true } },
    { location: { search: '?welcome=0' } },
    { location: { search: '?welcome=B' }, init: () => null },
    { storage: memoryStorage() },
  ]) {
    const quiet = await start({ probe: probeWith(ON), storage, init: () => null, ...overrides }).run;
    assert.equal(quiet.telemetry, null, JSON.stringify(overrides).slice(0, 60));
  }
});

test('a visitor who refused is never measured, even when the test runs', async () => {
  const storage = memoryStorage({ [FIRST_RUN_OPTOUT_KEY]: 'refused' });
  const { run, inits } = start({ probe: probeWith(ON), storage });
  const result = await run;
  assert.equal(inits[0].variant, 'A');
  assert.equal(result.telemetry.active, false);
  assert.equal(storage.values.has(FIRST_RUN_VARIANT_KEY), false);
});

test('the device is described in families only', () => {
  const context = firstRunContext({
    documentRef: { documentElement: { dataset: { shell: 'phone', input: 'coarse' } } },
    windowRef: { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: true }) },
    performanceRef: { now: () => 4321.7 },
  });
  assert.deepEqual(context, { shell: 'phone', input: 'coarse', viewport: 'xs', reducedMotion: true, bootMs: 4322 });
  assert.deepEqual(firstRunContext({ documentRef: null, windowRef: null, performanceRef: null }), {
    shell: 'desktop', input: 'fine', viewport: 'xs', reducedMotion: false, bootMs: 0,
  });
  const throwing = firstRunContext({
    documentRef: { documentElement: { dataset: {} } },
    windowRef: { innerWidth: 1440, innerHeight: 900, matchMedia: () => { throw new Error('no'); } },
    performanceRef: { now: () => 1 },
  });
  assert.equal(throwing.reducedMotion, false);
  assert.equal(throwing.viewport, 'l');
});
