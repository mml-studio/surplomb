import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FIRST_RUN_HINT_LEAVE_MS,
  FIRST_RUN_HINT_TIMEOUT_MS,
  initFirstRunHint,
} from './firstRunHint.js';

const source = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

/** An event target that records its listeners, enough for this module. */
function makeTarget() {
  const listeners = [];
  return {
    listeners,
    addEventListener(type, handler, options) { listeners.push({ type, handler, options }); },
    removeEventListener(type, handler) {
      const index = listeners.findIndex((entry) => entry.type === type && entry.handler === handler);
      if (index >= 0) listeners.splice(index, 1);
    },
    dispatch(type, event = {}) {
      for (const entry of [...listeners]) if (entry.type === type) entry.handler(event);
    },
  };
}

function makeClassList() {
  const set = new Set();
  return {
    add: (name) => set.add(name),
    remove: (...names) => names.forEach((name) => set.delete(name)),
    contains: (name) => set.has(name),
  };
}

/** A bubble host, its template and its one open button. */
function makeWorld({ anchorRect = { left: 100, top: 700, width: 80, height: 24 }, width = 300 } = {}) {
  const openButton = { ...makeTarget(), dataset: { firstRunHintOpen: '' } };
  const chipText = { textContent: '59 couches · 56 sans clé' };
  const host = {
    ...makeTarget(),
    hidden: true,
    removed: false,
    dataset: {},
    classList: makeClassList(),
    children: [],
    props: new Map(),
    style: { setProperty(name, value) { host.props.set(name, value); } },
    replaceChildren(...nodes) { host.children = nodes; },
    querySelector: (selector) => (selector === '[data-first-run-hint-open]' ? openButton : null),
    contains: (node) => node === host || node === openButton || node === chipText,
    getBoundingClientRect: () => ({ width }),
    remove() { host.removed = true; },
  };
  const template = { content: { cloneNode: () => ({ fragment: true }) } };
  const anchor = { getBoundingClientRect: () => anchorRect };
  const documentRef = { ...makeTarget(), body: {} };
  const windowRef = { ...makeTarget(), innerWidth: 1440, innerHeight: 900 };
  const timers = new Map();
  let nextTimer = 1;
  const events = [];
  const calls = { closed: 0, opened: 0 };
  const options = {
    host,
    template,
    anchor,
    documentRef,
    windowRef,
    emit: (event) => events.push(event),
    onClose: () => { calls.closed += 1; },
    openSearch: () => {
      // Opening must come AFTER the close: the bubble is already on its way out.
      assert.equal(host.classList.contains('first-run-hint-leaving'), true);
      calls.opened += 1;
    },
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  };
  const fire = (ms) => {
    for (const [id, entry] of [...timers]) {
      if (entry.ms !== ms) continue;
      timers.delete(id);
      entry.fn();
    }
  };
  return { host, openButton, chipText, documentRef, windowRef, timers, events, calls, options, fire };
}

test('a surface already on screen means no bubble, and nothing written', () => {
  const world = makeWorld();
  const hint = initFirstRunHint({ ...world.options, isBlocked: () => true });
  assert.equal(hint, null);
  assert.equal(world.host.hidden, true);
  assert.equal(world.calls.closed, 0);
  assert.deepEqual(world.events, []);
  assert.equal(world.timers.size, 0);
  assert.equal(world.documentRef.listeners.length, 0);
});

test('no host or no template is not a crash', () => {
  const world = makeWorld();
  assert.equal(initFirstRunHint({ ...world.options, host: null }), null);
  assert.equal(initFirstRunHint({ ...world.options, template: null }), null);
  assert.equal(initFirstRunHint(), null);
});

test('it opens at once, says so, and points at its anchor', () => {
  const world = makeWorld();
  const hint = initFirstRunHint(world.options);
  assert.ok(hint);
  assert.equal(hint.isOpen(), true);
  assert.equal(world.host.hidden, false);
  assert.equal(world.host.dataset.firstRunVariant, 'C');
  assert.equal(world.host.classList.contains('visible'), true);
  assert.deepEqual(world.host.children, [{ fragment: true }]);
  assert.deepEqual(world.events, [{ type: 'impression', shell: 'desktop' }]);
  // Anchor centre 140 px, bubble half-width 150: clamped to 162, the caret
  // carries the 22 px it could not follow.
  assert.equal(world.host.props.get('--first-run-hint-x'), '162px');
  assert.equal(world.host.props.get('--first-run-hint-caret'), '-22px');
  assert.equal(world.host.props.get('--first-run-hint-bottom'), '210px');
  // One timer, at the published timeout.
  assert.deepEqual([...world.timers.values()].map((entry) => entry.ms), [FIRST_RUN_HINT_TIMEOUT_MS]);
  // A capture-phase pointer watch, and NO key handler.
  const pointer = world.documentRef.listeners.find((entry) => entry.type === 'pointerdown');
  assert.equal(pointer.options, true);
  assert.equal(world.documentRef.listeners.some((entry) => entry.type === 'keydown'), false);
});

test('a phone takes its height from the sheet and says it is a phone', () => {
  const world = makeWorld({ anchorRect: { left: 20, top: 760, width: 90, height: 40 }, width: 280 });
  initFirstRunHint({ ...world.options, phoneShell: true });
  assert.equal(world.host.props.has('--first-run-hint-bottom'), false);
  assert.equal(world.host.props.get('--first-run-hint-x'), '152px');
  assert.deepEqual(world.events, [{ type: 'impression', shell: 'phone' }]);
});

test('a click anywhere else closes it once, writing the keys once', () => {
  const world = makeWorld();
  const hint = initFirstRunHint(world.options);
  world.documentRef.dispatch('pointerdown', { target: world.chipText });
  assert.equal(hint.isOpen(), true, 'a click inside is not a click away');
  world.documentRef.dispatch('pointerdown', { target: { outside: true } });
  assert.equal(hint.isOpen(), false);
  assert.equal(world.calls.closed, 1);
  assert.deepEqual(world.events.slice(1), [{ type: 'dismiss', via: 'click-away' }]);
  // Fully torn down: no listener left, the timeout cleared.
  assert.equal(world.documentRef.listeners.length, 0);
  assert.equal(world.windowRef.listeners.length, 0);
  assert.equal(world.openButton.listeners.length, 0);
  assert.equal(world.timers.has(1), false);
  // Leaves, then goes.
  assert.equal(world.host.classList.contains('visible'), false);
  assert.equal(world.host.classList.contains('first-run-hint-leaving'), true);
  assert.equal(world.host.removed, false);
  world.fire(FIRST_RUN_HINT_LEAVE_MS);
  assert.equal(world.host.removed, true);
  // A second close is inert.
  hint.close('timeout');
  assert.equal(world.calls.closed, 1);
  assert.equal(world.events.length, 2);
});

test('a click inside reports the click, closes, THEN opens the search', () => {
  const world = makeWorld();
  const hint = initFirstRunHint(world.options);
  world.openButton.dispatch('click');
  assert.equal(world.calls.opened, 1);
  assert.equal(world.calls.closed, 1);
  assert.equal(hint.isOpen(), false);
  assert.deepEqual(world.events.slice(1), [
    { type: 'action', kind: 'hint-click', outcome: 'found' },
    { type: 'dismiss', via: 'choice' },
  ]);
  world.openButton.dispatch('click');
  assert.equal(world.calls.opened, 1, 'the removed listener cannot open it twice');
});

test('twelve seconds of nothing close it', () => {
  const world = makeWorld();
  const hint = initFirstRunHint(world.options);
  world.fire(FIRST_RUN_HINT_TIMEOUT_MS);
  assert.equal(hint.isOpen(), false);
  assert.equal(world.calls.closed, 1);
  assert.deepEqual(world.events.at(-1), { type: 'dismiss', via: 'timeout' });
  assert.equal(FIRST_RUN_HINT_TIMEOUT_MS, 12000);
});

test('a surface that takes the screen closes it; another class change does not', () => {
  const saved = globalThis.MutationObserver;
  const observers = [];
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  };
  try {
    const world = makeWorld();
    let blocked = false;
    const hint = initFirstRunHint({ ...world.options, isBlocked: () => blocked });
    assert.equal(observers.length, 1);
    assert.deepEqual(observers[0].options, { attributes: true, attributeFilter: ['class'] });
    observers[0].callback();
    assert.equal(hint.isOpen(), true);
    blocked = true;
    observers[0].callback();
    assert.equal(hint.isOpen(), false);
    assert.deepEqual(world.events.at(-1), { type: 'dismiss', via: 'yield' });
    assert.equal(observers[0].disconnected, true);
  } finally {
    globalThis.MutationObserver = saved;
  }
});

test('the LOCATION tray opening where the bubble sits closes it', () => {
  const saved = globalThis.MutationObserver;
  const observers = [];
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  };
  try {
    const collapsed = new Set(['collapsed']);
    const tray = { classList: { contains: (name) => collapsed.has(name) } };
    const world = makeWorld();
    const hint = initFirstRunHint({ ...world.options, tray });
    const watcher = observers.find((observer) => observer.target === tray);
    assert.ok(watcher, 'the tray is watched');
    assert.deepEqual(watcher.options, { attributes: true, attributeFilter: ['class'] });
    watcher.callback();
    assert.equal(hint.isOpen(), true, 'a class change that leaves it collapsed is not an opening');
    collapsed.delete('collapsed');
    watcher.callback();
    assert.equal(hint.isOpen(), false);
    assert.deepEqual(world.events.at(-1), { type: 'dismiss', via: 'yield' });
    assert.equal(watcher.disconnected, true);

    // Already open: the bubble would sit on it, so it never opens.
    const second = makeWorld();
    assert.equal(initFirstRunHint({ ...second.options, tray }), null);
    assert.equal(second.calls.closed, 0);
  } finally {
    globalThis.MutationObserver = saved;
  }
});

test('a resize follows the anchor', () => {
  const rect = { left: 600, top: 700, width: 80, height: 24 };
  const world = makeWorld({ anchorRect: rect });
  initFirstRunHint(world.options);
  assert.equal(world.host.props.get('--first-run-hint-x'), '640px');
  rect.left = 900;
  world.windowRef.dispatch('resize');
  assert.equal(world.host.props.get('--first-run-hint-x'), '940px');
  assert.equal(world.host.props.get('--first-run-hint-caret'), '0px');
});

test('the bubble never claims the keyboard, and never hides the sheet it points at', () => {
  const module = source('./firstRunHint.js');
  const code = module.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /keydown|keyup|aria-modal|role/);
  assert.doesNotMatch(code, /requestAnimationFrame/, 'the entry is a CSS animation, not a frame wait');

  // phone.css hides the sheet while the CARD is up. The bubble must never join
  // those lists: it points at the sheet.
  const phone = source('../phone.css');
  const hiders = [...phone.matchAll(/^html\[data-shell="phone"\] body:has\([^{]*\{/gm)].map((match) => match[0]);
  assert.ok(hiders.length >= 2, 'the sheet-hiding rules moved');
  for (const rule of hiders) assert.doesNotMatch(rule, /first-run-hint/);
  assert.match(phone, /html\[data-shell="phone"\] #first-run-hint \{\s*bottom: calc\(var\(--phone-sheet-height/);

  // Its own hide group in style.css, on the same four classes as the card.
  const css = source('../style.css');
  for (const name of ['ui-clean-view', 'recording-mode', 'cockpit-mode', 'scene-playback-mode']) {
    assert.match(css, new RegExp(`body\\.${name} #first-run-hint`));
  }
  assert.match(css, /#first-run-hint\[hidden\] \{\s*display: none;\s*\}/);
});
