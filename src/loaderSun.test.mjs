import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ARC_CENTRE,
  ARC_RADIUS,
  GLIDE_MS,
  MARK_OFFSET,
  arcAlpha,
  arcPosition,
  initLoaderSun,
  phaseNear,
  shadowLength,
  shadowOpacity,
  skyTarget,
  stopLoaderSun,
} from './loaderSun.js';

const SUN_RADIUS = 40;
const TERRACE_TOP = 102;
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} ≠ ${expected}`);

test('the arc rises on the left, peaks over the terrace, and sets on the right', () => {
  const rise = arcPosition(0);
  const zenith = arcPosition(0.5);
  const set = arcPosition(1);
  close(rise.x, -ARC_RADIUS, 'rise x');
  close(rise.y, 0, 'rise y');
  close(zenith.x, 0, 'zenith x');
  close(zenith.y, -ARC_RADIUS, 'zenith y');
  close(set.x, ARC_RADIUS, 'set x');
});

test('the arc loops without a seam: the sun is invisible at both horizons', () => {
  assert.equal(arcAlpha(0), 0);
  assert.equal(arcAlpha(1), 0);
  assert.equal(arcAlpha(0.5), 1);
  assert.ok(arcAlpha(0.999) < 0.01 && arcAlpha(0.001) < 0.01);
});

test('the pointer never takes the sun below the terrace or past the arc', () => {
  for (const [dx, dy] of [[0, 500], [-400, 30], [900, -900], [12, -20], [0, 0], [-88, 0]]) {
    const { x, y } = skyTarget(dx, dy);
    assert.ok(y <= 0, `(${dx}, ${dy}) went below the horizon`);
    assert.ok(Math.hypot(x, y) <= ARC_RADIUS + 1e-9, `(${dx}, ${dy}) left the arc`);
    // The sun's lower edge stays on or above the terrace's top.
    assert.ok(ARC_CENTRE.y + y + SUN_RADIUS <= TERRACE_TOP + 1e-9);
  }
  assert.deepEqual(skyTarget(12, -20), { x: 12, y: -20 });
  assert.deepEqual(skyTarget(Number.NaN, 4), { ...MARK_OFFSET });
});

test('no shadow with the sun overhead — on the arc, and in its place in the mark', () => {
  assert.equal(shadowLength(0, -ARC_RADIUS), 0);
  assert.equal(shadowLength(MARK_OFFSET.x, MARK_OFFSET.y), 0);
  assert.equal(shadowOpacity(MARK_OFFSET.x, MARK_OFFSET.y, 1), 0);
  assert.equal(shadowLength(-ARC_RADIUS, 0), 1);
  const low = arcPosition(0.2);
  const high = arcPosition(0.4);
  assert.ok(shadowLength(low.x, low.y) > shadowLength(high.x, high.y), 'a lower sun casts a longer shadow');
});

test('the arc picks a released sun up while it is still visible', () => {
  assert.equal(phaseNear(-ARC_RADIUS, 0), 0.15);
  assert.equal(phaseNear(ARC_RADIUS, 0), 0.85);
  close(phaseNear(0, -40), 0.5, 'overhead');
});

// ── The markup and style the module drives ────────────────────────────────

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const veilMarkup = html.slice(html.indexOf('<div id="loading-screen">'), html.indexOf('<p class="loader-status">'));

test('the veil carries the scene the module drives, with the sun in its place in the mark', () => {
  assert.match(veilMarkup, /<svg[^>]*\bdata-loader-sun\b/);
  assert.match(veilMarkup, /<circle class="loader-sun" cx="188" cy="48" r="40"/);
  // The <use> inherits its fill only if the terrace sets none of its own.
  assert.match(veilMarkup, /<path id="loader-terrace" d="/);
  assert.doesNotMatch(veilMarkup, /<path id="loader-terrace"[^>]*\bfill=/);
  // Clip on a wrapper: on the <use>, it would move with the shadow.
  assert.match(veilMarkup, /<g clip-path="url\(#loader-ground-clip\)"><use class="loader-shadow" href="#loader-terrace"/);
});

test('the viewBox has room for the sun at the top of its arc', () => {
  const [, minY, , height] = veilMarkup.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  assert.ok(minY <= ARC_CENTRE.y - ARC_RADIUS - SUN_RADIUS, `the sun's top is cut at ${minY}`);
  assert.ok(minY + height >= 312, 'the ground is cut');
});

test('no CSS animation fights the script for the sun', () => {
  const rules = css.slice(css.indexOf('/* ── Loading Screen'), css.indexOf('/* ── Post-Processing'));
  assert.doesNotMatch(rules, /animation\s*:/);
});

// ── The life cycle, on a fake page ────────────────────────────────────────

function fakeElement() {
  const attributes = new Map();
  return {
    attributes,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => attributes.get(name) ?? null,
  };
}

function fakePage({ lifted = false } = {}) {
  const frames = new Map();
  let nextFrame = 1;
  let classObserver = null;
  const listeners = new Set();
  const sun = fakeElement();
  const shadow = fakeElement();
  const svg = { querySelector: (selector) => ({ '.loader-sun': sun, '.loader-shadow': shadow })[selector] ?? null };
  const classes = new Set(lifted ? ['hidden'] : []);
  const veil = {
    classList: { contains: (name) => classes.has(name) },
    querySelector: (selector) => (selector === '[data-loader-sun]' ? svg : null),
  };
  const globals = {
    requestAnimationFrame: (callback) => {
      frames.set(nextFrame, callback);
      return nextFrame++;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { classObserver = this; }
      disconnect() { if (classObserver === this) classObserver = null; }
    },
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { this.callback([{ target, isIntersecting: true }]); }
      disconnect() {}
    },
    window: {
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      addEventListener: (type) => listeners.add(`window:${type}`),
      removeEventListener: (type) => listeners.delete(`window:${type}`),
    },
    document: {
      hidden: false,
      addEventListener: (type) => listeners.add(`document:${type}`),
      removeEventListener: (type) => listeners.delete(`document:${type}`),
    },
  };
  const saved = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  let clock = 1000;
  return {
    veil,
    sun,
    shadow,
    listeners,
    pendingFrames: () => frames.size,
    /** Run the next frame, `ms` after the previous one. */
    tick(ms = 16) {
      clock += ms;
      const [id, callback] = frames.entries().next().value ?? [];
      if (!callback) return false;
      frames.delete(id);
      callback(clock);
      return true;
    },
    lift() {
      classes.add('hidden');
      classObserver?.callback([]);
    },
    restore() {
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('a veil that is already lifted is left alone', (t) => {
  const page = fakePage({ lifted: true });
  t.after(() => page.restore());
  initLoaderSun(page.veil);
  assert.equal(page.pendingFrames(), 0);
  assert.equal(page.sun.getAttribute('transform'), null);
  assert.equal(page.listeners.size, 0);
});

test('the sun leaves the mark, runs, and lands back in it when the veil lifts — then lets go of everything', (t) => {
  const page = fakePage();
  t.after(() => page.restore());
  initLoaderSun(page.veil);
  assert.ok(page.listeners.has('window:pointermove'));

  for (let i = 0; i < 90; i++) page.tick(16);
  const lifted = page.sun.getAttribute('transform');
  assert.ok(lifted && lifted !== 'translate(0.00 0.00)', 'the sun never left the mark');

  page.lift();
  for (let elapsed = 0; elapsed <= GLIDE_MS + 32 && page.tick(16); elapsed += 16);

  assert.equal(page.pendingFrames(), 0, 'frames still run after the landing');
  assert.equal(page.sun.getAttribute('transform'), null, 'the sun is not back in the mark');
  assert.equal(page.shadow.getAttribute('opacity'), '0', 'the shadow outlived the landing');
  assert.equal(page.listeners.size, 0, `listeners left behind: ${[...page.listeners].join(', ')}`);
});

test('an error puts the sun back in the mark and stops it', (t) => {
  const page = fakePage();
  t.after(() => page.restore());
  initLoaderSun(page.veil);
  for (let i = 0; i < 30; i++) page.tick(16);
  stopLoaderSun();
  assert.equal(page.pendingFrames(), 0);
  assert.equal(page.sun.getAttribute('transform'), null);
  assert.equal(page.listeners.size, 0);
});
