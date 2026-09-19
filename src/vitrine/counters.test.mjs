// The live figures on the page: what is revealed, and what never is.
//
// A small stand-in for the four entries of index.html — the real markup is
// read to build it, so a renamed `data-live` key fails here and not on the
// home page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PULSE_URL, applyPulse, counterValue, nextExpiryMs, scheduleCounters } from './counters.js';

const INDEX_HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const MARKUP_KEYS = [...INDEX_HTML.matchAll(/data-live="counter:([a-z]+)"/g)].map((match) => match[1]);

function fakeElement(attributes = {}) {
  const attrs = new Map(Object.entries(attributes));
  return {
    hidden: true,
    textContent: '',
    children: [],
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute: (name, value) => { attrs.set(name, String(value)); },
  };
}

/** The group as index.html ships it: everything hidden, every value empty. */
function fakePanel(keys = MARKUP_KEYS) {
  const counters = keys.map((key) => {
    const counter = fakeElement({ 'data-value': '' });
    counter.slot = fakeElement({ 'data-live': `counter:${key}` });
    counter.querySelector = (selector) => (selector.startsWith('[data-live^="counter:"]') ? counter.slot : null);
    return counter;
  });
  const panel = fakeElement({ 'data-live': 'counters' });
  panel.counters = counters;
  panel.querySelectorAll = (selector) => (selector === '.counter' ? counters : []);
  return panel;
}

const AT = '2026-09-19T12:10:00.000Z';
const pulse = (entries) => ({ at: AT, maxAgeMs: 600_000, ...entries });

test('the markup carries the four keys the server answers with', () => {
  assert.deepEqual(MARKUP_KEYS, ['avions', 'navires', 'bus', 'meteo']);
  assert.match(INDEX_HTML, /<section class="panel counter-panel" data-live="counters" hidden/);
  assert.equal((INDEX_HTML.match(/<div class="counter" data-value="" hidden>/g) || []).length, 4);
});

test('a figure is a positive whole number inside the answer\'s own window', () => {
  const clock = { builtAt: Date.parse(AT), maxAgeMs: 600_000 };
  assert.equal(counterValue({ value: 454, at: '2026-09-19T12:09:30Z' }, clock), 454);
  assert.equal(counterValue({ value: 454, at: '2026-09-19T12:00:00Z' }, clock), 454, 'exactly ten minutes');
  assert.equal(counterValue({ value: 454, at: '2026-09-19T11:59:59Z' }, clock), null, 'older than the window');
  for (const value of [0, -3, 12.5, '454', null, undefined, Number.NaN, Infinity]) {
    assert.equal(counterValue({ value, at: AT }, clock), null, String(value));
  }
  assert.equal(counterValue({ value: 454 }, clock), null, 'a figure without a time');
  assert.equal(counterValue(null, clock), null);
  assert.equal(counterValue({ value: 454, at: AT }, { builtAt: Number.NaN, maxAgeMs: 600_000 }), null);
  assert.equal(counterValue({ value: 454, at: AT }, { builtAt: Date.parse(AT), maxAgeMs: undefined }), null);
});

test('nothing backed: the group stays hidden, and so does every entry', () => {
  const panel = fakePanel();
  assert.deepEqual(applyPulse(panel, pulse({ avions: null, navires: null, bus: null, meteo: null })), []);
  assert.equal(panel.hidden, true);
  for (const counter of panel.counters) {
    assert.equal(counter.hidden, true);
    assert.equal(counter.getAttribute('data-value'), '');
    assert.equal(counter.slot.textContent, '');
  }
});

test('one figure backed: that entry and the group, nothing else — and never a zero', () => {
  const panel = fakePanel();
  const shown = applyPulse(panel, pulse({
    avions: { value: 0, at: AT },
    navires: { value: 1925, at: AT },
    bus: null,
    meteo: { value: 190, at: '2026-09-08T21:00:00Z' },
  }));
  assert.deepEqual(shown, ['navires']);
  assert.equal(panel.hidden, false);
  const [avions, navires, bus, meteo] = panel.counters;
  assert.equal(avions.hidden, true);
  assert.equal(avions.getAttribute('data-value'), '');
  assert.equal(navires.hidden, false);
  assert.equal(navires.getAttribute('data-value'), '1925');
  // French grouping: a narrow no-break space, never a comma or a dot.
  assert.equal(navires.slot.textContent, '1 925');
  assert.equal(bus.hidden, true);
  assert.equal(meteo.hidden, true, 'an eleven-day-old round is not « en ce moment »');
});

test('a later empty answer takes back what an earlier one showed', () => {
  const panel = fakePanel();
  applyPulse(panel, pulse({ avions: { value: 454, at: AT } }));
  assert.equal(panel.hidden, false);
  applyPulse(panel, pulse({ avions: null }));
  assert.equal(panel.hidden, true);
  assert.equal(panel.counters[0].hidden, true);
  assert.equal(panel.counters[0].slot.textContent, '');
});

test('an answer ages on screen: a figure is taken down when it leaves the window', () => {
  const panel = fakePanel();
  const answer = pulse({
    avions: { value: 454, at: '2026-09-19T12:09:00.000Z' }, // 1 min old on arrival
    navires: { value: 1925, at: '2026-09-19T12:05:00.000Z' }, // 5 min old on arrival
  });
  assert.deepEqual(applyPulse(panel, answer), ['avions', 'navires']);
  assert.equal(nextExpiryMs(answer, ['avions', 'navires']), 5 * 60_000, 'the navires leave first');
  assert.deepEqual(applyPulse(panel, answer, { elapsedMs: 5 * 60_000 + 1 }), ['avions']);
  assert.equal(panel.counters[1].hidden, true);
  assert.equal(nextExpiryMs(answer, ['avions'], 5 * 60_000 + 1), 4 * 60_000 - 1);
  assert.deepEqual(applyPulse(panel, answer, { elapsedMs: 9 * 60_000 + 1 }), []);
  assert.equal(panel.hidden, true, 'the group goes with the last figure');
  assert.equal(nextExpiryMs(answer, []), null);
});

test('an answer of the wrong shape shows nothing', () => {
  for (const answer of [null, 'ok', [], { avions: 454 }, { at: 'yesterday', maxAgeMs: 600_000, avions: { value: 4, at: AT } }]) {
    const panel = fakePanel();
    assert.deepEqual(applyPulse(panel, answer), [], JSON.stringify(answer));
    assert.equal(panel.hidden, true);
  }
  assert.deepEqual(applyPulse(null, pulse({})), []);
});

/** A window that runs its idle callback at once and records what it was asked. */
function fakeWindow() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    requestIdleCallback: (fn) => { queueMicrotask(fn); return 7; },
    cancelIdleCallback: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
}

function settled(run) {
  return new Promise((resolve) => { run(resolve); });
}

test('one request, after `load`, and the answer lands in the group', async () => {
  const win = fakeWindow();
  const documentRef = { readyState: 'interactive' };
  const panel = fakePanel();
  const calls = [];
  const fetchRef = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => pulse({ avions: { value: 454, at: AT } }) };
  };
  const state = await settled((onSettled) => {
    scheduleCounters({ panel, win, documentRef, fetchRef, onSettled });
    assert.equal(calls.length, 0, 'nothing is asked before the page has loaded');
    win.listeners.get('load')();
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, PULSE_URL);
  assert.deepEqual(state, { phase: 'done', status: 200, shown: ['avions'] });
  assert.equal(panel.hidden, false);
});

test('an error status or a dead network leaves everything hidden, silently', async () => {
  for (const fetchRef of [
    async () => ({ ok: false, status: 503, json: async () => pulse({ avions: { value: 454, at: AT } }) }),
    async () => ({ ok: false, status: 404, json: async () => ({}) }),
    async () => { throw new TypeError('Failed to fetch'); },
    // A server without the route answers the page itself: not JSON.
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }),
  ]) {
    const panel = fakePanel();
    const state = await settled((onSettled) => {
      scheduleCounters({ panel, win: fakeWindow(), documentRef: { readyState: 'complete' }, fetchRef, onSettled });
    });
    assert.equal(state.phase, 'failed');
    assert.equal(panel.hidden, true);
    assert.ok(panel.counters.every((counter) => counter.hidden));
  }
});

test('leaving for the globe before idle cancels the request', async () => {
  const win = fakeWindow();
  let asked = false;
  const scheduled = scheduleCounters({
    panel: fakePanel(),
    win,
    documentRef: { readyState: 'interactive' },
    fetchRef: async () => { asked = true; return { ok: true, status: 200, json: async () => ({}) }; },
  });
  scheduled.cancel();
  assert.equal(win.listeners.has('load'), false);
  await new Promise((resolve) => { setTimeout(resolve, 5); });
  assert.equal(asked, false);
  assert.equal(scheduled.getState().phase, 'waiting');
});

test('the page takes the figures down by itself, on its own monotonic clock', async () => {
  const timers = [];
  let clock = 1000;
  const win = {
    ...fakeWindow(),
    performance: { now: () => clock },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  };
  const panel = fakePanel();
  const phases = [];
  await settled((resolve) => {
    scheduleCounters({
      panel,
      win,
      documentRef: { readyState: 'complete' },
      fetchRef: async () => ({ ok: true, status: 200, json: async () => pulse({ navires: { value: 1925, at: '2026-09-19T12:08:00.000Z' } }) }),
      onSettled: (state) => { phases.push(state); if (phases.length === 1) resolve(); },
    });
  });
  assert.equal(panel.hidden, false);
  // The fetch deadline, then the take-down two minutes (and a millisecond) later.
  const takeDown = timers.at(-1);
  assert.equal(takeDown.ms, 8 * 60_000 + 1);
  clock += takeDown.ms;
  takeDown.fn();
  assert.equal(panel.hidden, true);
  assert.deepEqual(phases.at(-1).shown, []);
});
