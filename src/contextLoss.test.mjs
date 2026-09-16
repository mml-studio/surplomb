// The lost-context recovery's contract. What makes this worth pinning is that
// the failure it handles is invisible until it happens on somebody's phone,
// and that every wrong answer is worse than the bug: a reload loop on a page
// whose context dies on every boot, a page that reloads itself while nobody is
// looking, or a reader left staring at the English panel Cesium ships.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTEXT_LOST_RELOAD_STORAGE_KEY,
  contextLossNotice,
  contextLossPlan,
  installContextLossRecovery,
} from './contextLoss.js';
import {
  STALE_BUILD_RELOAD_STORAGE_KEY,
  claimStaleBuildAutoReload,
} from './staleBuildRecovery.js';

function fakeStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    store,
  };
}

/** A viewer, a canvas and a document, with the handlers reachable by hand. */
function harness({ visibilityState = 'visible', storage = fakeStorage() } = {}) {
  const canvasListeners = new Map();
  const docListeners = new Map();
  const notices = [];
  let reloads = 0;
  const viewer = { useDefaultRenderLoop: true, scene: { canvas: {
    addEventListener: (type, fn) => canvasListeners.set(type, fn),
    removeEventListener: (type) => canvasListeners.delete(type),
  } } };
  const documentRef = {
    visibilityState,
    addEventListener: (type, fn) => docListeners.set(type, fn),
    removeEventListener: (type) => docListeners.delete(type),
    getElementById: () => null,
  };
  let nowMs = 1_000_000;
  const recovery = installContextLossRecovery(viewer, {
    showNotice: (text, options) => notices.push({ text, options }),
    reload: () => { reloads += 1; },
    storage,
    documentRef,
    now: () => nowMs,
  });
  return {
    viewer,
    recovery,
    notices,
    documentRef,
    storage,
    get reloads() { return reloads; },
    lose: () => {
      let defaultPrevented = false;
      canvasListeners.get('webglcontextlost')({ preventDefault: () => { defaultPrevented = true; } });
      return defaultPrevented;
    },
    becomeVisible: () => { documentRef.visibilityState = 'visible'; docListeners.get('visibilitychange')?.(); },
    advance: (ms) => { nowMs += ms; },
    lastAction: () => notices.at(-1)?.options?.action,
  };
}

test('the three plans, and the reader each one is for', () => {
  // Looking at it, budget free: do the thing instead of describing it.
  assert.equal(contextLossPlan({ visibility: 'visible', claimed: true }), 'countdown');
  // A countdown nobody can see is not consent — and a backgrounded tab is
  // exactly where a phone loses its context in the first place.
  assert.equal(contextLossPlan({ visibility: 'hidden', claimed: true }), 'defer');
  assert.equal(contextLossPlan({ visibility: 'hidden', claimed: false }), 'defer');
  // Budget spent, or storage refused the mark: offer the button, loop never.
  assert.equal(contextLossPlan({ visibility: 'visible', claimed: false }), 'manual');
});

test('the notice is in the interface language and names the actor', () => {
  assert.match(contextLossNotice({ plan: 'countdown', secondsLeft: 4 }), /rechargement dans 4 s/);
  assert.match(contextLossNotice({ plan: 'manual' }), /Rechargez/);
  // "le système" — not the app, and not the reader. Neither of them did this.
  for (const plan of ['countdown', 'manual']) {
    assert.match(contextLossNotice({ plan, secondsLeft: 1 }), /interrompu par le système/);
  }
});

test('a lost context stops the render loop before Cesium can throw into it', () => {
  const h = harness();
  assert.equal(h.lose(), true, 'the default action must be prevented');
  assert.equal(h.viewer.useDefaultRenderLoop, false);
  h.recovery.destroy();
});

test('the visible case counts down, and doing nothing is the working path', () => {
  const h = harness();
  h.lose();
  assert.equal(h.recovery.getDiagnostics().plan, 'countdown');
  assert.match(h.notices.at(-1).text, /rechargement dans 6 s/);
  assert.equal(h.notices.at(-1).options.durationMs, Infinity, 'a countdown must not clear itself');
  assert.equal(h.reloads, 0);
  h.advance(6000);
  // The 250 ms tick is what fires it; drive one by hand.
  h.notices.length = 0;
  h.recovery.getDiagnostics();
  return new Promise((resolve) => setTimeout(() => {
    assert.equal(h.reloads, 1);
    h.recovery.destroy();
    resolve();
  }, 300));
});

test('ANNULER stops the clock and leaves the cure in reach', () => {
  const h = harness();
  h.lose();
  const cancel = h.lastAction();
  assert.equal(cancel.label, 'ANNULER');
  cancel.onClick();
  assert.equal(h.recovery.getDiagnostics().plan, 'manual');
  assert.equal(h.lastAction().label, 'RECHARGER');
  assert.equal(h.reloads, 0);
  h.advance(60_000);
  return new Promise((resolve) => setTimeout(() => {
    assert.equal(h.reloads, 0, 'a declined reload must not fire later anyway');
    h.lastAction().onClick();
    assert.equal(h.reloads, 1, 'the button still works');
    h.recovery.destroy();
    resolve();
  }, 300));
});

test('a hidden tab says nothing and reloads when the reader comes back', () => {
  const h = harness({ visibilityState: 'hidden' });
  h.lose();
  assert.equal(h.recovery.getDiagnostics().plan, 'defer');
  // A notice shown to a hidden tab is stale by the time anyone reads it.
  assert.deepEqual(h.notices, []);
  assert.equal(h.reloads, 0);
  h.becomeVisible();
  assert.equal(h.reloads, 1);
  h.recovery.destroy();
});

test('a spent budget offers the button and never reloads on its own', () => {
  const storage = fakeStorage({ [CONTEXT_LOST_RELOAD_STORAGE_KEY]: '999000' });
  const h = harness({ storage });
  h.lose();
  assert.equal(h.recovery.getDiagnostics().plan, 'manual');
  assert.equal(h.lastAction().label, 'RECHARGER');
  h.advance(60_000);
  return new Promise((resolve) => setTimeout(() => {
    assert.equal(h.reloads, 0, 'a context that dies again after a reload is a loop');
    h.recovery.destroy();
    resolve();
  }, 300));
});

test('the two reload budgets are separate keys', () => {
  // Sharing them would let a stale chunk in the morning strand a reader on a
  // dead canvas in the afternoon, with nothing on screen and no explanation.
  assert.notEqual(CONTEXT_LOST_RELOAD_STORAGE_KEY, STALE_BUILD_RELOAD_STORAGE_KEY);
  const storage = fakeStorage();
  assert.equal(claimStaleBuildAutoReload({ storage, nowMs: 1_000_000 }), true);
  assert.equal(
    claimStaleBuildAutoReload({ storage, nowMs: 1_000_000, storageKey: CONTEXT_LOST_RELOAD_STORAGE_KEY }),
    true,
    'spending the stale-build budget must not spend the context-loss one',
  );
  assert.equal(storage.store.size, 2);
});

test('destroy unhooks both listeners', () => {
  const h = harness();
  h.recovery.destroy();
  // Nothing left to fire: `lose()` would throw if the listener were still
  // registered and the map had been cleared, so assert on the map instead.
  assert.throws(() => h.lose(), TypeError);
});
