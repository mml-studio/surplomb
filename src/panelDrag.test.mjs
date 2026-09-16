// src/panelDrag.test.mjs
// The geometry of a panel a reader has moved, and the memory of where they
// left it. The DOM wiring is proved in the browser (`scripts/qa-velo-pulse.mjs`
// drags the Pouls vélo panel and reads back where it landed); what is worth
// holding here is the arithmetic that keeps a panel reachable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LONG_PRESS_HOLD_MS,
  LONG_PRESS_SLOP_PX,
  PANEL_DRAG_INSET_PX,
  attachPanelDrag,
  bindLongPress,
  clampPanelPosition,
  clearPanelPosition,
  panelPositionStorageKey,
  readPanelPosition,
  writePanelPosition,
} from './panelDrag.js';

/** A localStorage stand-in — the real one is not available under `node:test`. */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get size() { return map.size; },
  };
}

const VIEWPORT = { viewportWidth: 1600, viewportHeight: 900 };

test('a panel dragged at an edge keeps a grabbable inset', () => {
  const panel = { width: 620, height: 300, ...VIEWPORT };
  assert.deepEqual(clampPanelPosition({ left: -400, top: -400, ...panel }),
    { left: PANEL_DRAG_INSET_PX, top: PANEL_DRAG_INSET_PX });
  assert.deepEqual(clampPanelPosition({ left: 9999, top: 9999, ...panel }),
    { left: 1600 - 620 - 6, top: 900 - 300 - 6 });
  // And somewhere in the middle is left alone.
  assert.deepEqual(clampPanelPosition({ left: 300, top: 200, ...panel }), { left: 300, top: 200 });
});

test('a panel taller than the window stays reachable rather than pinned off-screen', () => {
  // THE CASE THE GUARD EXISTS FOR. On a short window the room available goes
  // negative; without `Math.max(inset, …)` on the upper bound the clamp would
  // push the panel ABOVE the top of the viewport, where its header — the only
  // surface that can drag it back — is unreachable.
  const tall = {
    width: 620, height: 1200, viewportWidth: 1600, viewportHeight: 700,
  };
  const placed = clampPanelPosition({ left: 100, top: 400, ...tall });
  assert.equal(placed.top, PANEL_DRAG_INSET_PX);
  assert.ok(placed.top >= 0, 'the header must stay on screen');
});

test('a non-finite coordinate is a zero, never a NaN written into a style', () => {
  const panel = { width: 400, height: 200, ...VIEWPORT };
  const placed = clampPanelPosition({ left: Number.NaN, top: undefined, ...panel });
  assert.equal(placed.left, PANEL_DRAG_INSET_PX);
  assert.equal(placed.top, PANEL_DRAG_INSET_PX);
});

test('the storage key is versioned, and it is the one ui.js writes', () => {
  // ui.js imports this very function now: one bump resets every panel at once,
  // including the layer-owned ones that class never sees.
  assert.equal(panelPositionStorageKey('velo-pulse-hud'), 'godsEyeView.v8.panelPos.velo-pulse-hud');
});

test('a position survives a round trip, and a broken record does not restore', () => {
  const storage = fakeStorage();
  assert.equal(writePanelPosition('velo-pulse-hud', { left: 42.6, top: 17.4 }, storage), true);
  assert.deepEqual(readPanelPosition('velo-pulse-hud', storage), { left: 43, top: 17 });
  assert.equal(readPanelPosition('never-saved', storage), null);
  // Half a record is no record: the panel falls back to its stylesheet anchor,
  // which is always somewhere a reader can see.
  storage.setItem(panelPositionStorageKey('half'), '{"left":10}');
  assert.equal(readPanelPosition('half', storage), null);
  storage.setItem(panelPositionStorageKey('junk'), 'not json');
  assert.equal(readPanelPosition('junk', storage), null);
  clearPanelPosition('velo-pulse-hud', storage);
  assert.equal(readPanelPosition('velo-pulse-hud', storage), null);
});

test('storage being unavailable is not an error worth throwing over', () => {
  const hostile = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(readPanelPosition('x', hostile), null);
  assert.equal(writePanelPosition('x', { left: 1, top: 1 }, hostile), false);
  assert.equal(clearPanelPosition('x', hostile), false);
});


// ── The drag's own lifetime ─────────────────────────────────────────────────
// `attachPanelDrag` needs a DOM, and `node:test` has no browser. What it does
// need is an EventTarget, which Node has, plus the four things the module
// touches on the panel: `style`, `classList`, `getBoundingClientRect` and
// `closest`. That is enough to hold the one property this module has to have —
// that every listener it adds, it removes.

/** A panel stand-in with a settable rect. */
function stubPanel(rect = { left: 100, top: 100, width: 620, height: 300 }) {
  const target = new EventTarget();
  const classes = new Set();
  return Object.assign(target, {
    style: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    getBoundingClientRect: () => rect,
    setRect: (next) => Object.assign(rect, next),
    // Node's `EventTarget` makes the dispatching object the event target and
    // `Event.target` is read-only, so the panel itself answers `closest` —
    // which is what the browser does too when the pointer lands on the panel
    // background rather than on one of its controls.
    closest: () => null,
  });
}

/** A window stand-in that counts what is still listening to it. */
function stubWindow() {
  const target = new EventTarget();
  const counts = new Map();
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  return Object.assign(target, {
    innerWidth: 1600,
    innerHeight: 900,
    addEventListener(type, handler, options) {
      counts.set(type, (counts.get(type) || 0) + 1);
      add(type, handler, options);
    },
    removeEventListener(type, handler, options) {
      if (counts.get(type)) counts.set(type, counts.get(type) - 1);
      remove(type, handler, options);
    },
    listening: () => [...counts.values()].reduce((sum, value) => sum + value, 0),
  });
}

/** Run `body` with `globalThis.window` swapped for a stub. */
function withWindow(body) {
  const previous = globalThis.window;
  const stub = stubWindow();
  globalThis.window = stub;
  try {
    return body(stub);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

const pointer = (type, x, y, button = 0) => Object.assign(new Event(type), {
  clientX: x, clientY: y, button, preventDefault() {},
});

test('a second grab while one is live never orphans the first drag\'s listeners', () => {
  // THE BUG THIS TEST EXISTS FOR. `pointerMove`/`pointerUp` were declared once
  // per ATTACH rather than once per DRAG, so a second pointerdown — two fingers
  // on a touchscreen, or a re-grab after a `pointerup` was swallowed by an
  // alt-tab — reassigned both variables. The first release then removed the
  // SECOND drag's handlers and stranded its own on `window`, where nothing
  // could reach them: the panel kept following the mouse with no button held,
  // the disposer could not detach it, and the next click wrote the detached
  // node's (0, 0) rect into storage, so the panel came back in the corner.
  withWindow((win) => {
    const panel = stubPanel();
    const storage = fakeStorage();
    const dispose = attachPanelDrag(panel, { panelId: 'p', storage });
    const idle = win.listening();

    panel.dispatchEvent(pointer('pointerdown', 200, 200));
    panel.dispatchEvent(pointer('pointerdown', 210, 210));
    win.dispatchEvent(pointer('pointerup', 210, 210));
    assert.equal(win.listening(), idle, 'both grabs released every listener they added');

    // And after everything is released, a stray move must not move the panel.
    panel.style.left = 'sentinel';
    win.dispatchEvent(pointer('pointermove', 900, 700));
    assert.equal(panel.style.left, 'sentinel', 'nothing is still dragging');

    dispose();
    assert.equal(win.listening(), 0, 'the disposer leaves the window clean');
  });
});

test('a drag interrupted by the layer switching off saves nothing', () => {
  // `veloPulseHud.destroy()` calls the disposer and then removes the node. A
  // panel measured after it is detached is (0, 0), and persisting that would
  // move it to the top-left corner on the next session.
  withWindow((win) => {
    const panel = stubPanel();
    const storage = fakeStorage();
    const dispose = attachPanelDrag(panel, { panelId: 'p', storage });
    panel.dispatchEvent(pointer('pointerdown', 200, 200));
    win.dispatchEvent(pointer('pointermove', 400, 300));
    dispose();
    assert.equal(readPanelPosition('p', storage), null, 'an interrupted drag persists nothing');
    assert.equal(win.listening(), 0);
  });
});

test('a normal drag ends clean, remembers where it landed, and clamps', () => {
  withWindow((win) => {
    const panel = stubPanel({ left: 100, top: 100, width: 620, height: 300 });
    const storage = fakeStorage();
    const dispose = attachPanelDrag(panel, { panelId: 'p', storage });
    panel.dispatchEvent(pointer('pointerdown', 150, 120));
    win.dispatchEvent(pointer('pointermove', 350, 400));
    assert.equal(panel.style.left, '300px');
    assert.equal(panel.style.top, '380px');
    // The stub's rect does not move, so the SAVED position is the stub's — what
    // matters here is that something was saved and the listeners went away.
    panel.setRect({ left: 300, top: 380, width: 620, height: 300 });
    win.dispatchEvent(pointer('pointerup', 350, 400));
    assert.deepEqual(readPanelPosition('p', storage), { left: 300, top: 380 });
    // Only the resize listener survives a release — it belongs to the attach,
    // not to the drag, and it is what keeps a panel on screen when the window
    // shrinks under it.
    assert.equal(win.listening(), 1, 'a released drag holds nothing of its own');
    // A move beyond the edge is stopped at the inset, not followed off-screen.
    panel.dispatchEvent(pointer('pointerdown', 350, 400));
    win.dispatchEvent(pointer('pointermove', -9000, -9000));
    assert.equal(panel.style.left, `${PANEL_DRAG_INSET_PX}px`);
    win.dispatchEvent(pointer('pointerup', -9000, -9000));
    dispose();
  });
});

test('a pointer landing on a control never starts a drag', () => {
  withWindow((win) => {
    const panel = stubPanel();
    const dispose = attachPanelDrag(panel, { panelId: 'p', ignoreSelector: '[data-pulse-strip]', storage: fakeStorage() });
    panel.closest = (selector) => (selector.includes('data-pulse-strip') ? {} : null);
    panel.dispatchEvent(pointer('pointerdown', 200, 200));
    assert.equal(win.listening(), 1, 'only the resize listener is bound');
    assert.equal(panel.classList.contains('panel-dragging'), false);
    // A right-click is not a drag either.
    panel.closest = () => null;
    panel.dispatchEvent(pointer('pointerdown', 200, 200, 2));
    assert.equal(win.listening(), 1);
    dispose();
  });
});

// ── The second verb, for hands that cannot double-click ─────────────────────

const touch = (type, x, y, pointerType = 'touch') => Object.assign(new Event(type), {
  clientX: x, clientY: y, button: 0, pointerType, preventDefault() {},
});

/** Resolve after the long press has had its chance to fire. */
const settle = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * `withWindow` restores the global in a `finally`, which runs the instant an
 * async body returns its promise — so a test that awaits needs its own.
 */
async function withWindowAsync(body) {
  const previous = globalThis.window;
  const stub = stubWindow();
  globalThis.window = stub;
  try {
    return await body(stub);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
}

test('the published hold and slop are the ones the gesture actually uses', () => {
  assert.equal(LONG_PRESS_HOLD_MS, 500);
  assert.equal(LONG_PRESS_SLOP_PX, 8);
});

test('a finger held still fires once; one that wanders is a drag instead', async () => {
  await withWindowAsync(async (win) => {
    const el = stubPanel();
    let fired = 0;
    const buzzes = [];
    const dispose = bindLongPress(el, () => { fired += 1; }, {
      holdMs: 12,
      slopPx: LONG_PRESS_SLOP_PX,
      nav: { vibrate: (ms) => buzzes.push(ms) },
    });

    el.dispatchEvent(touch('pointerdown', 100, 100));
    await settle(30);
    assert.equal(fired, 1);
    assert.deepEqual(buzzes, [10], 'nothing is visible until the panel jumps');
    assert.equal(win.listening(), 0, 'a fired press leaves nothing listening');

    // 8 px is inside the slop; 9 px is a drag.
    el.dispatchEvent(touch('pointerdown', 100, 100));
    win.dispatchEvent(touch('pointermove', 105, 106));
    await settle(30);
    assert.equal(fired, 2, 'a finger rolling inside the slop is still a hold');

    el.dispatchEvent(touch('pointerdown', 100, 100));
    win.dispatchEvent(touch('pointermove', 109, 100));
    await settle(30);
    assert.equal(fired, 2, 'past the slop it is a drag, and drags do not reset');

    // Lifting before the hold completes is a tap, not a verb.
    el.dispatchEvent(touch('pointerdown', 100, 100));
    win.dispatchEvent(touch('pointerup', 100, 100));
    await settle(30);
    assert.equal(fired, 2);

    dispose();
    el.dispatchEvent(touch('pointerdown', 100, 100));
    await settle(30);
    assert.equal(fired, 2, 'the disposer really disposes');
    assert.equal(win.listening(), 0);
  });
});

test('a mouse keeps the right to hold still over a drag handle', async () => {
  await withWindowAsync(async () => {
    const el = stubPanel();
    let fired = 0;
    bindLongPress(el, () => { fired += 1; }, { holdMs: 8, nav: {} });
    el.dispatchEvent(touch('pointerdown', 10, 10, 'mouse'));
    await settle(25);
    assert.equal(fired, 0, 'deciding where to drag to must not reset the panel');
    // A stylus has no double-click either, so it is treated as a finger.
    el.dispatchEvent(touch('pointerdown', 10, 10, 'pen'));
    await settle(25);
    assert.equal(fired, 1);
  });
});

test('a reset held on the grip does not write the reset rect straight back', async () => {
  // THE RACE THIS COVERS. The finger that holds the grip has already started a
  // drag. Without ending that drag unpersisted, the release measures the panel
  // AFTER the reset and writes those coordinates into storage — the panel goes
  // home and the key stays set, so the next session restores the default
  // position as if a reader had dragged it there.
  await withWindowAsync(async (win) => {
    const panel = stubPanel();
    const storage = fakeStorage();
    let resets = 0;
    const dispose = attachPanelDrag(panel, {
      panelId: 'p',
      storage,
      onLongPress: () => { resets += 1; clearPanelPosition('p', storage); },
    });

    // Seed a dragged position the way a real session would.
    panel.dispatchEvent(touch('pointerdown', 200, 200));
    win.dispatchEvent(touch('pointermove', 260, 260));
    win.dispatchEvent(touch('pointerup', 260, 260));
    assert.ok(readPanelPosition('p', storage), 'the drag was remembered');

    panel.dispatchEvent(touch('pointerdown', 200, 200));
    await settle(LONG_PRESS_HOLD_MS + 40);
    assert.equal(resets, 1);
    win.dispatchEvent(touch('pointerup', 200, 200));
    assert.equal(readPanelPosition('p', storage), null, 'the release must not re-save');
    assert.equal(panel.classList.contains('panel-dragging'), false);

    dispose();
    assert.equal(win.listening(), 0);
  });
});

test('every grab surface refuses the browser’s claim on the gesture', () => {
  // Without `touch-action: none` the compositor takes the gesture after ~10 px,
  // fires `pointercancel`, and the panel snaps back mid-drag.
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  const block = css.match(/\.panel-drag-handle,[\s\S]{0,240}?\{\s*touch-action:\s*none;\s*\}/);
  assert.ok(block, 'the shared touch-action rule is gone');
  for (const selector of ['[data-fiche-grip]', '[data-cmp-grip]', '[data-pulse-grip]', '.velo-pulse-hud.panel-draggable']) {
    assert.ok(block[0].includes(selector), `${selector} lost its touch-action`);
  }
});
