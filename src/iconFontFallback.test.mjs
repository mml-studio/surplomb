// The icon font is a ligature font: blocked, it draws each icon's NAME. These
// pin the stand-in table against the committed subset, and the swap in both
// directions, without a browser. scripts/qa-webfonts.mjs checks the pixels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLYPH_MANIFEST_PATH } from '../scripts/lib/materialSymbolGlyphs.mjs';
import {
  ICON_FALLBACK,
  ICON_FONT_ATTRIBUTE,
  ICON_NAME_ATTRIBUTE,
  ICON_SELECTOR,
  drawGlyph,
  drawStandIn,
  fallbackFor,
  installIconFontFallback,
  ligatureFormed,
} from './iconFontFallback.js';

const manifest = JSON.parse(readFileSync(GLYPH_MANIFEST_PATH, 'utf8'));

test('every glyph in the subset has a stand-in, and no stand-in outlives its glyph', () => {
  const missing = manifest.glyphs.filter((glyph) => !Object.hasOwn(ICON_FALLBACK, glyph));
  assert.deepEqual(missing, [], `${missing.join(', ')} would draw a dot when the font is blocked`);
  const stale = Object.keys(ICON_FALLBACK).filter((glyph) => !manifest.glyphs.includes(glyph));
  assert.deepEqual(stale, [], `stand-ins for glyphs the subset no longer carries: ${stale.join(', ')}`);
});

test('no stand-in could be read as an icon name', () => {
  // A stand-in made of name characters would be swapped again, and would
  // put letters back on screen — the defect this module removes.
  for (const [glyph, standIn] of Object.entries(ICON_FALLBACK)) {
    assert.ok(standIn.length > 0, glyph);
    assert.doesNotMatch(standIn, /[a-z0-9_]/i, glyph);
  }
  assert.equal(fallbackFor('not_in_the_table'), '•');
  assert.equal(fallbackFor('constructor'), '•');
});

test('a ligature is about one em; the word is several', () => {
  assert.equal(ligatureFormed(40, 40), true);
  assert.equal(ligatureFormed(22, 22), true);
  // WebKit, fonts refused: `my_location` at 18 px measured 90 px.
  assert.equal(ligatureFormed(90, 18), false);
  assert.equal(ligatureFormed(0, 40), false);
});

// ── A document just big enough for the swap ──────────────────────────────────

function fakeElement({ text = '', icon = false } = {}) {
  const attributes = new Map();
  const element = {
    nodeType: 1,
    textContent: text,
    style: {},
    children: [],
    parent: null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    removeAttribute: (name) => attributes.delete(name),
    matches: (selector) => selector === ICON_SELECTOR && icon,
    appendChild(child) {
      child.parent = element;
      element.children.push(child);
    },
    remove() {
      if (!element.parent) return;
      element.parent.children = element.parent.children.filter((node) => node !== element);
      element.parent = null;
    },
    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => {
        for (const child of node.children) {
          const hit = selector === ICON_SELECTOR
            ? child.matches(selector)
            : child.getAttribute(ICON_NAME_ATTRIBUTE) !== null;
          if (hit) out.push(child);
          walk(child);
        }
      };
      walk(element);
      return out;
    },
  };
  return element;
}

function fakePage({ load }) {
  const body = fakeElement();
  const root = fakeElement();
  const listeners = new Map();
  const state = { probeWidth: 0, probe: null };
  const doc = {
    body,
    documentElement: root,
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    createElement() {
      const element = fakeElement();
      element.getBoundingClientRect = () => ({ width: state.probeWidth });
      state.probe = element;
      return element;
    },
    fonts: {
      load,
      addEventListener: (type, fn) => listeners.set(type, fn),
      removeEventListener: (type) => listeners.delete(type),
    },
  };
  const observed = [];
  const win = {
    setTimeout: () => 0,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observed.push(this); }
      observe() { this.connected = true; }
      disconnect() { this.connected = false; }
    },
  };
  return { doc, win, body, root, listeners, state, observed };
}

test('a refused font: every icon shows its stand-in, and names written later are converted', async () => {
  const page = fakePage({ load: () => Promise.reject(new Error('blocked')) });
  const locate = fakeElement({ text: 'my_location', icon: true });
  const label = fakeElement({ text: 'public' });
  page.body.appendChild(locate);
  page.body.appendChild(label);
  page.state.probeWidth = 216;

  const drawn = await installIconFontFallback({ doc: page.doc, win: page.win }).ready;

  assert.equal(drawn, true);
  assert.equal(page.root.getAttribute(ICON_FONT_ATTRIBUTE), 'missing');
  assert.equal(locate.textContent, '⌖');
  assert.equal(locate.getAttribute(ICON_NAME_ATTRIBUTE), 'my_location');
  assert.equal(label.textContent, 'public', 'plain text is not an icon');

  // The cockpit toggle writes a new name into an icon it already holds.
  const toggle = fakeElement({ text: 'right_panel_open', icon: true });
  const [observer] = page.observed;
  assert.equal(observer.connected, true);
  observer.callback([{ type: 'childList', target: page.body, addedNodes: [toggle] }]);
  assert.equal(toggle.textContent, '⇤');
  toggle.textContent = 'right_panel_close';
  observer.callback([{ type: 'childList', target: toggle, addedNodes: [] }]);
  assert.equal(toggle.textContent, '⇥');
  assert.equal(toggle.getAttribute(ICON_NAME_ATTRIBUTE), 'right_panel_close');
});

test('a font that forms ligatures leaves the page alone', async () => {
  const page = fakePage({ load: () => Promise.resolve([{}]) });
  const locate = fakeElement({ text: 'my_location', icon: true });
  page.body.appendChild(locate);
  page.state.probeWidth = 40;

  const drawn = await installIconFontFallback({ doc: page.doc, win: page.win }).ready;

  assert.equal(drawn, false);
  assert.equal(page.root.getAttribute(ICON_FONT_ATTRIBUTE), null);
  assert.equal(locate.textContent, 'my_location');
  assert.equal(page.observed.length, 0, 'no observer when nothing needs converting');
  assert.equal(page.body.children.includes(page.state.probe), false, 'the probe is removed');
});

test('a font that arrives late puts the glyphs back', async () => {
  const page = fakePage({ load: () => new Promise(() => {}) });
  const close = fakeElement({ text: 'close', icon: true });
  page.body.appendChild(close);
  page.state.probeWidth = 90;
  // The settle timer fires at once in this fake window.
  page.win.setTimeout = (fn) => { fn(); return 0; };

  assert.equal(await installIconFontFallback({ doc: page.doc, win: page.win }).ready, true);
  assert.equal(close.textContent, '✕');

  page.state.probeWidth = 40;
  page.listeners.get('loadingdone')();

  assert.equal(close.textContent, 'close');
  assert.equal(close.getAttribute(ICON_NAME_ATTRIBUTE), null);
  assert.equal(page.root.getAttribute(ICON_FONT_ATTRIBUTE), null);
  assert.equal(page.observed[0].connected, false);
  assert.equal(page.listeners.has('loadingdone'), false);
});

test('putting a glyph back never overwrites what the app wrote since', () => {
  const icon = fakeElement({ text: 'chevron_left', icon: true });
  drawStandIn(icon);
  assert.equal(icon.textContent, '‹');
  icon.textContent = '…';
  drawGlyph(icon);
  assert.equal(icon.textContent, '…');
  assert.equal(icon.getAttribute(ICON_NAME_ATTRIBUTE), null);
});
