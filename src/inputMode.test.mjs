// The input marker's contract. Three things make this worth pinning:
//
//   1. THE MATRIX. "Coarse" is three clauses, not one, and dropping any of
//      them quietly widens or narrows the treatment for a whole class of
//      device — a touchscreen laptop, an iPad with a trackpad, a Chrome
//      emulation that reports exactly one touch point.
//   2. ONE THRESHOLD, TWO PLACES. The predicate is duplicated on purpose: the
//      inline script in `index.html` has to run before the stylesheet, and
//      `src/inputMode.js` has to answer the same question to JavaScript. A
//      copy that drifts is a phone that gets the small render profile under
//      the desktop chrome, which is the exact state this module exists to
//      prevent. So the test RUNS the inline script over the same matrix and
//      demands the same answers, rather than grepping it for a number.
//   3. THE ORDER IN THE HEAD. The marker is only useful before the first
//      paint; after `<link rel="stylesheet">` it is a flash nobody can remove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHONE_MAX_MIN_DIMENSION_PX,
  applyInputMode,
  detectInputMode,
  getInputModeDiagnostics,
  initInputMode,
  isCoarseInput,
  isPhoneShell,
  isPhoneSignals,
  readInputSignals,
  resetInputModeForTests,
} from './inputMode.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_HTML = readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

/** Signals for a device, named by what it IS rather than by five booleans. */
const DEVICES = Object.freeze({
  phonePortrait: { coarsePointer: true, noHover: true, touchPoints: 5, innerWidth: 390, innerHeight: 844 },
  phoneLandscape: { coarsePointer: true, noHover: true, touchPoints: 5, innerWidth: 844, innerHeight: 390 },
  emulatedPhone: { coarsePointer: true, noHover: true, touchPoints: 1, innerWidth: 390, innerHeight: 844 },
  tabletPortrait: { coarsePointer: true, noHover: true, touchPoints: 5, innerWidth: 744, innerHeight: 1133 },
  touchLaptop: { coarsePointer: false, noHover: false, touchPoints: 10, innerWidth: 1366, innerHeight: 768 },
  iPadWithTrackpad: { coarsePointer: true, noHover: false, touchPoints: 5, innerWidth: 1024, innerHeight: 1366 },
  narrowDesktop: { coarsePointer: false, noHover: false, touchPoints: 0, innerWidth: 420, innerHeight: 900 },
  desktop: { coarsePointer: false, noHover: false, touchPoints: 0, innerWidth: 1440, innerHeight: 900 },
});

/** Read the signals a device would produce, through the real reader. */
function signalsFor(device, search = '') {
  return readInputSignals({
    nav: { maxTouchPoints: device.touchPoints },
    matchMediaRef: (query) => ({
      matches: query === '(pointer: coarse)' ? device.coarsePointer : device.noHover,
    }),
    view: { innerWidth: device.innerWidth, innerHeight: device.innerHeight },
    search,
  });
}

test('the matrix: what is coarse, and which of those is a phone', () => {
  const answer = (name, search = '') => {
    const { input, shell } = detectInputMode(signalsFor(DEVICES[name], search));
    return `${input}${shell ? `/${shell}` : ''}`;
  };
  assert.equal(answer('phonePortrait'), 'coarse/phone');
  // Rotation must not rebuild the interface: the threshold reads the SMALLER
  // side, which a rotation does not change.
  assert.equal(answer('phoneLandscape'), 'coarse/phone');
  // Chrome's device emulation reports exactly 1 touch point. `> 1` here would
  // have made every phone harness in scripts/ silently test the desktop app.
  assert.equal(answer('emulatedPhone'), 'coarse/phone');
  // Room, but no cursor: the touch treatment without the small-screen shell.
  assert.equal(answer('tabletPortrait'), 'coarse');
  // A cursor is present on both of these, whatever the touchscreen says.
  assert.equal(answer('touchLaptop'), 'fine');
  assert.equal(answer('iPadWithTrackpad'), 'fine');
  // A desktop window dragged narrow is not a phone, and must not become one.
  assert.equal(answer('narrowDesktop'), 'fine');
  assert.equal(answer('desktop'), 'fine');
});

test('?input= forces the session, and `coarse` is deliberately not `phone`', () => {
  const answer = (name, value) => {
    const { input, shell, source } = detectInputMode(signalsFor(DEVICES[name], `?input=${value}`));
    return `${input}${shell ? `/${shell}` : ''}:${source}`;
  };
  assert.equal(answer('desktop', 'phone'), 'coarse/phone:url');
  // How a laptop run asks for the touch treatment without the phone shell —
  // the tablet case, and the only way to exercise it without a tablet.
  assert.equal(answer('desktop', 'coarse'), 'coarse:url');
  assert.equal(answer('phonePortrait', 'fine'), 'fine:url');
  // An unrecognised value must not quietly change the interface.
  assert.equal(answer('phonePortrait', 'tablet'), 'coarse/phone:signals');
});

test('the threshold is the smaller side, and it is exclusive', () => {
  const at = (px) => isPhoneSignals(signalsFor({
    coarsePointer: true, noHover: true, touchPoints: 5, innerWidth: px, innerHeight: 2000,
  }));
  assert.equal(at(PHONE_MAX_MIN_DIMENSION_PX - 1), true);
  assert.equal(at(PHONE_MAX_MIN_DIMENSION_PX), false);
});

test('missing globals read as a plain desktop rather than throwing', () => {
  // Node has no matchMedia and no window; so does a server-side render, and so
  // does any test that imports a module which imports this one.
  const read = readInputSignals({ nav: {}, matchMediaRef: undefined, view: {}, search: '' });
  assert.deepEqual(read, {
    coarsePointer: false, noHover: false, touchPoints: 0, viewportMinPx: null, forcedInput: null,
  });
  assert.deepEqual(detectInputMode(read), { input: 'fine', shell: null, source: 'signals' });
});

test('the two attributes land on <html>, and `phone` is removed rather than emptied', () => {
  const attrs = new Map();
  const root = {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  };
  applyInputMode({ input: 'coarse', shell: 'phone' }, root);
  assert.deepEqual([...attrs], [['data-input', 'coarse'], ['data-shell', 'phone']]);
  // A CSS selector matches `[data-shell]` whatever its value, so "not a phone"
  // has to be the attribute's ABSENCE.
  applyInputMode({ input: 'fine', shell: null }, root);
  assert.deepEqual([...attrs], [['data-input', 'fine']]);
});

test('initInputMode resolves once and publishes what it resolved', () => {
  resetInputModeForTests();
  const attrs = new Map();
  const root = { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) };
  const device = DEVICES.phonePortrait;
  const options = {
    nav: { maxTouchPoints: device.touchPoints },
    matchMediaRef: () => ({ matches: true }),
    view: { innerWidth: device.innerWidth, innerHeight: device.innerHeight },
    search: '',
    root,
  };
  assert.deepEqual(initInputMode(options), { input: 'coarse', shell: 'phone', source: 'signals' });
  assert.equal(isCoarseInput(), true);
  assert.equal(isPhoneShell(), true);
  assert.equal(attrs.get('data-shell'), 'phone');
  assert.equal(getInputModeDiagnostics().signals.viewportMinPx, 390);
  // Idempotent: a second call with contradictory options changes nothing. Two
  // different answers in one page load is the bug this module prevents.
  assert.deepEqual(
    initInputMode({ ...options, matchMediaRef: () => ({ matches: false }) }),
    { input: 'coarse', shell: 'phone', source: 'signals' },
  );
  resetInputModeForTests();
});

/** The inline head script, extracted from `index.html` as it ships. */
function inlineMarkerScript() {
  const match = INDEX_HTML.match(/<script>\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/);
  assert.ok(match, 'the inline input-mode script is gone from index.html');
  return match[1];
}

test('the inline head script answers exactly what the module answers', () => {
  // Not a grep for `600`: the script is RUN, over the same matrix, and its two
  // attributes are compared to the module's two fields. A copy that drifts on
  // any clause — the hover test, the touch-point floor, the threshold, the
  // override — fails here rather than on somebody's handset.
  const run = new Function(
    'location', 'matchMedia', 'navigator', 'innerWidth', 'innerHeight', 'document',
    inlineMarkerScript(),
  );
  for (const [name, device] of Object.entries(DEVICES)) {
    for (const search of ['', '?input=phone', '?input=coarse', '?input=fine', '?input=tablet']) {
      const attrs = new Map();
      run(
        { search },
        (query) => ({ matches: query === '(pointer: coarse)' ? device.coarsePointer : device.noHover }),
        { maxTouchPoints: device.touchPoints },
        device.innerWidth,
        device.innerHeight,
        { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) } },
      );
      const expected = detectInputMode(signalsFor(device, search));
      assert.equal(
        attrs.get('data-input'), expected.input,
        `inline script disagrees on data-input for ${name} ${search || '(no override)'}`,
      );
      assert.equal(
        attrs.get('data-shell') ?? null, expected.shell,
        `inline script disagrees on data-shell for ${name} ${search || '(no override)'}`,
      );
    }
  }
});

test('the marker runs before the stylesheet that reads it', () => {
  const marker = INDEX_HTML.indexOf("root.setAttribute('data-input'");
  const stylesheet = INDEX_HTML.indexOf('<link rel="stylesheet" href="/style.css"');
  assert.ok(marker > 0 && stylesheet > 0);
  assert.ok(
    marker < stylesheet,
    'the input marker must be set before /style.css loads, or the phone sees a frame of desktop chrome',
  );
});
