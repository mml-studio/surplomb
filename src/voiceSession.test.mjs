// A voice session keeps the HUD's paid summaries quiet (src/voiceSession.js).
//
// Seen on surplomb.app, 2026-09-17: three spoken commands, and the « 5 essais
// utilisés » card opened before the voice card. The HUD had spent the other
// four tries summarising the places the commands flew to.
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_SESSION_EVENT, announceVoiceSession, isVoiceSessionOpen } from './voiceSession.js';
import { GevRealtimeController } from './voice/gevRealtime.js';

// `hud.js` names an export of `mgrs` that only its ESM build has, and Node
// loads the CommonJS one, so no test could import the HUD. The HUD's grid
// readout is not under test here: a stub stands in, for this file only.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'mgrs') {
      return { url: 'data:text/javascript,export function forward() { return ""; }', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { IntelHUD } = await import('./hud.js');

function fakeDocument() {
  const doc = new EventTarget();
  doc.documentElement = { dataset: {} };
  const events = [];
  doc.addEventListener(VOICE_SESSION_EVENT, (event) => events.push(event.detail.open));
  return { doc, events };
}

test('the session state lives on <html>, and each change is announced once', () => {
  const { doc, events } = fakeDocument();
  assert.equal(isVoiceSessionOpen(doc), false);
  announceVoiceSession(true, doc);
  announceVoiceSession(true, doc);
  assert.equal(isVoiceSessionOpen(doc), true);
  assert.equal(doc.documentElement.dataset.voiceSession, 'open');
  announceVoiceSession(false, doc);
  assert.equal(isVoiceSessionOpen(doc), false);
  assert.equal('voiceSession' in doc.documentElement.dataset, false);
  assert.deepEqual(events, [true, false]);
  // No document (a test, a worker): nothing to do, nothing thrown.
  announceVoiceSession(true, undefined);
  assert.equal(isVoiceSessionOpen(undefined), false);
});

function withDocument(t) {
  const previous = globalThis.document;
  const fake = fakeDocument();
  globalThis.document = fake.doc;
  t.after(() => { globalThis.document = previous; });
  return fake;
}

test('the voice dock announces the session from CONNECTING, ahead of the mint', (t) => {
  const { events } = withDocument(t);
  const ui = {
    root: { dataset: {}, classList: { remove() {} }, querySelectorAll: () => [] },
    status: { textContent: '' },
    detail: { textContent: '', title: '' },
  };
  const controller = new GevRealtimeController({ runner: async () => ({ ok: true }), ui });
  controller.debugLog = () => {};
  controller.setStatus('connecting', 'Requesting microphone');
  controller.setStatus('listening');
  controller.setStatus('executing', 'Running command');
  controller.setStatus('listening');
  assert.deepEqual(events, [true], 'one announcement for the whole session');
  controller.stop();
  assert.deepEqual(events, [true, false]);
  controller.setStatus('error', 'boom');
  assert.deepEqual(events, [true, false], 'an error is not a session');
});

function hudForSummaries(t) {
  const hud = Object.create(IntelHUD.prototype);
  Object.assign(hud, {
    _userEngaged: true,
    _summaryDisabled: false,
    _latestMetrics: { lat: 45.76, lon: 4.83 },
    _summaryDirty: true,
    _summaryRequest: null,
    _summaryRevision: 0,
    _lastSummarySignature: '',
    _visible: true,
  });
  const shown = [];
  hud._composeSummary = () => 'LYON · LOCAL';
  hud._setSummaryText = (text) => shown.push(text);
  const calls = [];
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  let answer = null;
  globalThis.fetch = (url, options) => {
    calls.push({ url, signal: options.signal });
    return new Promise((resolve, reject) => {
      answer = resolve;
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
  });
  let context = { place: 'Lyon' };
  hud._summaryContext = async () => context;
  return {
    hud,
    shown,
    calls,
    answer: (summary) => answer({ ok: true, status: 200, json: async () => ({ summary }) }),
    moveTo: (place) => { context = { place }; },
  };
}

test('no paid summary is asked for while a voice session is open', async (t) => {
  withDocument(t);
  const { hud, shown, calls } = hudForSummaries(t);
  announceVoiceSession(true);
  await hud._updateSummary(true, true);
  assert.equal(calls.length, 0);
  assert.deepEqual(shown, ['LYON · LOCAL'], 'the free local line stands in');
  assert.equal(hud._summaryDirty, true, 'still owed once the session ends');
});

test('a session opening mid-summary drops it; closing it asks again', async (t) => {
  withDocument(t);
  const { hud, calls, answer, moveTo } = hudForSummaries(t);
  const pending = hud._updateSummary(true, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);

  announceVoiceSession(true);
  hud._handleVoiceSession({ detail: { open: true } });
  assert.equal(calls[0].signal.aborted, true, 'its cookie must not land after the voice mint');
  await pending;
  assert.equal(hud._summaryRequest, null);

  // The session flies somewhere, then ends.
  moveTo('Marseille');
  await hud._updateSummary(true);
  assert.equal(calls.length, 1, 'nothing while it is open');
  announceVoiceSession(false);
  hud._handleVoiceSession({ detail: { open: false } });
  const next = hud._updateSummary(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 2, 'the first tick after the session summarises where it ended');
  answer('Marseille vieux port soleil couchant');
  await next;
});

test('a summary context that resolves after the mic click is not sent', async (t) => {
  withDocument(t);
  const { hud, calls } = hudForSummaries(t);
  hud._summaryContext = async () => {
    announceVoiceSession(true); // the click lands while the scene is walked
    return { place: 'Lyon' };
  };
  await hud._updateSummary(true, true);
  assert.equal(calls.length, 0);
  assert.equal(hud._summaryDirty, true);
});
