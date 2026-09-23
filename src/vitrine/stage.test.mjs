// The scene of « Choisissez une vue. » (src/vitrine/stage.js): six views, a
// bar of tabs, and a clock that moves on by whole recordings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStage,
  STAGE_MIN_DWELL_S,
  STAGE_ON_SCREEN_RATIO,
  STAGE_STILL_DWELL_MS,
  stageDwellMs,
  TAB_HOVER_MS,
  tabIndexForKey,
} from './stage.js';

test('a view stays for whole passes of its recording, at least the minimum, never cut', () => {
  assert.equal(STAGE_MIN_DWELL_S, 10);
  assert.equal(stageDwellMs(6), 12000, 'a six-second loop plays twice');
  assert.equal(stageDwellMs(14.67), 14670, 'the power-grid film plays once');
  assert.equal(stageDwellMs(28.97), 28970, 'the Roissy film plays once, whole');
  assert.equal(stageDwellMs(10), 10000, 'exactly the minimum is one pass, not two');
  assert.equal(stageDwellMs(3), 12000);
  for (const none of [null, undefined, 0, -1, Number.NaN]) assert.equal(stageDwellMs(none), STAGE_STILL_DWELL_MS);
});

test('the bar answers the arrows, Home and End, and wraps around', () => {
  assert.equal(tabIndexForKey('ArrowRight', 5, 6), 0);
  assert.equal(tabIndexForKey('ArrowLeft', 0, 6), 5);
  assert.equal(tabIndexForKey('ArrowDown', 2, 6), 3);
  assert.equal(tabIndexForKey('Home', 4, 6), 0);
  assert.equal(tabIndexForKey('End', 1, 6), 5);
  assert.equal(tabIndexForKey('Enter', 1, 6), null);
  assert.equal(tabIndexForKey('a', 1, 6), null);
});

// ── A small fake of the DOM the module touches ─────────────────────────────

function fakeElement(name, extra = {}) {
  const listeners = {};
  const attrs = {};
  const el = {
    name,
    attrs,
    dataset: {},
    style: { vars: {}, setProperty(key, value) { this.vars[key] = value; } },
    id: '',
    inert: false,
    tabIndex: 0,
    hidden: false,
    textContent: '',
    focused: false,
    hasAttribute: (key) => key in attrs,
    getAttribute: (key) => attrs[key] ?? null,
    setAttribute(key, value) { attrs[key] = String(value); },
    removeAttribute(key) { delete attrs[key]; },
    toggleAttribute(key, force) {
      const on = force === undefined ? !(key in attrs) : Boolean(force);
      if (on) attrs[key] = '';
      else delete attrs[key];
      return on;
    },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    emit(type, event = {}) { for (const fn of [...(listeners[type] || [])]) fn({ preventDefault() {}, ...event }); },
    listenerCount: () => Object.values(listeners).reduce((sum, list) => sum + list.length, 0),
    focus() { el.focused = true; },
    matches: () => true,
    contains: () => false,
    ...extra,
  };
  return el;
}

function fakeScene({ reducedMotion = false, observer = true, keys = ['01', '02', '03'] } = {}) {
  const views = keys.map((key) => {
    const view = fakeElement(`view-${key}`);
    view.dataset.view = key;
    return view;
  });
  views[0].attrs['data-active'] = '';
  const tabs = keys.map((key) => fakeElement(`tab-${key}`));
  const tablist = fakeElement('tablist', {
    querySelector: (selector) => tabs[keys.indexOf(/data-tab="(\d+)"/.exec(selector)?.[1])] ?? null,
  });
  const label = fakeElement('label');
  const pause = fakeElement('pause', { querySelector: () => label });
  pause.hidden = true;
  const stage = fakeElement('stage', {
    querySelectorAll: () => views,
    querySelector: (selector) => (selector === '.stage-tabs' ? tablist : selector === '[data-stage-pause]' ? pause : null),
  });
  const section = { querySelector: () => stage };

  let clock = 0;
  const timers = new Map();
  let nextId = 1;
  const observers = [];
  class FakeObserver {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  }
  const media = fakeElement('media', { matches: reducedMotion });
  const win = {
    performance: { now: () => clock },
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    matchMedia: () => media,
    IntersectionObserver: observer ? FakeObserver : undefined,
  };
  const doc = fakeElement('document', { defaultView: win });
  doc.hidden = false;
  /** Move the clock on, firing every timer that falls due, in order. */
  const advance = (ms) => {
    const until = clock + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      clock = due[1].at;
      due[1].fn();
    }
    clock = until;
  };
  const show = (ratio = 1) => observers[0]?.callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);
  const active = () => views.findIndex((view) => view.hasAttribute('data-active'));
  return { section, stage, views, tabs, tablist, pause, label, doc, win, media, advance, show, active, observers };
}

test('the markup becomes a tab bar: roles, links between tab and view, one tab in the tab order', () => {
  const scene = fakeScene();
  createStage(scene.section, { documentRef: scene.doc });
  assert.equal(scene.tablist.attrs.role, 'tablist');
  scene.views.forEach((view, i) => {
    const tab = scene.tabs[i];
    assert.equal(tab.attrs.role, 'tab');
    assert.equal(view.attrs.role, 'tabpanel');
    assert.equal(tab.attrs['aria-controls'], view.id);
    assert.equal(view.attrs['aria-labelledby'], tab.id);
    assert.equal(tab.attrs['aria-selected'], String(i === 0));
    assert.equal(tab.tabIndex, i === 0 ? 0 : -1);
    assert.equal(view.inert, i !== 0, 'only the view on stage is reachable');
  });
  assert.equal(scene.pause.hidden, false, 'the pause is offered once something can move');
  assert.equal(scene.stage.dataset.enhanced, 'true');
});

test('the clock waits for the scene to be on screen, then moves on by the view\'s own dwell', () => {
  const scene = fakeScene();
  const durations = { '01': 6, '02': 28.97, '03': null };
  const stage = createStage(scene.section, { documentRef: scene.doc, durationOf: (view) => durations[view.dataset.view] });
  scene.advance(60000);
  assert.equal(scene.active(), 0, 'nothing moves while the reader is elsewhere on the page');
  scene.show(STAGE_ON_SCREEN_RATIO - 0.1);
  scene.advance(60000);
  assert.equal(scene.active(), 0, 'a sliver of the scene is not the scene');
  scene.show(1);
  assert.equal(scene.stage.style.vars['--stage-dwell'], '12000ms', 'the underline fills in the view\'s time');
  scene.advance(11999);
  assert.equal(scene.active(), 0);
  scene.advance(1);
  assert.equal(scene.active(), 1, 'two passes of a six-second loop');
  assert.equal(scene.stage.style.vars['--stage-dwell'], '28970ms');
  scene.advance(28970);
  assert.equal(scene.active(), 2, 'the Roissy film, whole');
  scene.advance(STAGE_STILL_DWELL_MS);
  assert.equal(scene.active(), 0, 'a still, then round again');
  assert.equal(stage.getDiagnostics().lastBy, 'auto');
  assert.equal(stage.getDiagnostics().switches, 3);
});

test('the pointer resting on the scene holds the clock where it is; leaving resumes the rest', () => {
  const scene = fakeScene();
  createStage(scene.section, { documentRef: scene.doc });
  scene.show(1);
  scene.advance(3000);
  scene.stage.emit('pointerenter', { pointerType: 'mouse' });
  assert.equal(scene.stage.hasAttribute('data-running'), false, 'the underline stops with it');
  scene.advance(60000);
  assert.equal(scene.active(), 0);
  scene.stage.emit('pointerleave');
  assert.equal(scene.stage.hasAttribute('data-running'), true);
  scene.advance(STAGE_STILL_DWELL_MS - 3000 - 1);
  assert.equal(scene.active(), 0);
  scene.advance(1);
  assert.equal(scene.active(), 1);
});

test('a touch does not hold the clock, and keyboard focus does', () => {
  const scene = fakeScene();
  createStage(scene.section, { documentRef: scene.doc });
  scene.show(1);
  scene.stage.emit('pointerenter', { pointerType: 'touch' });
  scene.advance(STAGE_STILL_DWELL_MS);
  assert.equal(scene.active(), 1);
  scene.stage.emit('focusin', { target: { matches: () => true } });
  scene.advance(60000);
  assert.equal(scene.active(), 1, 'the keyboard is inside');
  scene.stage.emit('focusout', { relatedTarget: null });
  scene.advance(STAGE_STILL_DWELL_MS);
  assert.equal(scene.active(), 2);
});

test('a mouse click leaves focus on a tab without stopping the clock for good', () => {
  const scene = fakeScene();
  createStage(scene.section, { documentRef: scene.doc });
  scene.show(1);
  scene.stage.emit('focusin', { target: { matches: () => false } });
  scene.advance(STAGE_STILL_DWELL_MS);
  assert.equal(scene.active(), 1);
});

test('resting on a tab shows its view; crossing the bar does not', () => {
  const scene = fakeScene();
  const stage = createStage(scene.section, { documentRef: scene.doc });
  const seen = [];
  stage.subscribe((event) => seen.push(event));
  scene.tabs[1].emit('pointerenter', { pointerType: 'mouse' });
  scene.advance(TAB_HOVER_MS - 1);
  scene.tabs[1].emit('pointerleave');
  scene.advance(1000);
  assert.equal(scene.active(), 0, 'passed over on the way elsewhere');
  scene.tabs[2].emit('pointerenter', { pointerType: 'mouse' });
  scene.advance(TAB_HOVER_MS);
  assert.equal(scene.active(), 2);
  assert.equal(scene.tabs[2].attrs['aria-selected'], 'true');
  assert.equal(scene.views[2].inert, false);
  assert.equal(scene.views[0].inert, true);
  assert.deepEqual(seen.map((e) => [e.type, e.index, e.by]), [['select', 2, 'hover']]);
});

test('a click or a tap shows the view; a touch "enter" is not a hover', () => {
  const scene = fakeScene();
  createStage(scene.section, { documentRef: scene.doc });
  scene.tabs[2].emit('pointerenter', { pointerType: 'touch' });
  scene.advance(1000);
  assert.equal(scene.active(), 0);
  scene.tabs[2].emit('click');
  assert.equal(scene.active(), 2);
});

test('a view picked by the reader gets its full time, from the start', () => {
  const scene = fakeScene();
  createStage(scene.section, { documentRef: scene.doc, durationOf: () => 6 });
  scene.show(1);
  scene.advance(10000);
  scene.tabs[2].emit('click');
  scene.advance(11999);
  assert.equal(scene.active(), 2);
  scene.advance(1);
  assert.equal(scene.active(), 0);
});

test('the arrows move along the bar, show the view at once, and carry the focus', () => {
  const scene = fakeScene();
  createStage(scene.section, { documentRef: scene.doc });
  scene.tablist.emit('keydown', { key: 'ArrowLeft' });
  assert.equal(scene.active(), 2);
  assert.equal(scene.tabs[2].focused, true);
  assert.equal(scene.tabs[2].tabIndex, 0);
  scene.tablist.emit('keydown', { key: 'Home' });
  assert.equal(scene.active(), 0);
  scene.tablist.emit('keydown', { key: 'Tab' });
  assert.equal(scene.active(), 0);
});

test('« Mettre en pause » stops the clock and says so; « Reprendre » starts it again', () => {
  const scene = fakeScene();
  const stage = createStage(scene.section, { documentRef: scene.doc });
  const seen = [];
  stage.subscribe((event) => seen.push(event.type));
  scene.show(1);
  assert.equal(scene.label.textContent, 'Mettre en pause');
  assert.equal(scene.stage.hasAttribute('data-rotating'), true);
  scene.pause.emit('click');
  assert.equal(stage.isPaused(), true);
  assert.equal(scene.label.textContent, 'Reprendre');
  assert.equal(scene.pause.attrs['aria-pressed'], 'true');
  assert.equal(scene.stage.hasAttribute('data-rotating'), false, 'the underline shows full, not a clock');
  scene.advance(60000);
  assert.equal(scene.active(), 0);
  scene.pause.emit('click');
  scene.advance(STAGE_STILL_DWELL_MS);
  assert.equal(scene.active(), 1);
  assert.deepEqual(seen, ['screen', 'pause', 'pause', 'select'], 'the loops hear about the screen and the pause');
});

test('reduced motion starts paused, and follows the setting when it changes', () => {
  const scene = fakeScene({ reducedMotion: true });
  const stage = createStage(scene.section, { documentRef: scene.doc });
  scene.show(1);
  scene.advance(60000);
  assert.equal(scene.active(), 0);
  assert.equal(scene.label.textContent, 'Reprendre');
  scene.media.matches = false;
  scene.media.emit('change');
  assert.equal(stage.isPaused(), false);
  scene.advance(STAGE_STILL_DWELL_MS);
  assert.equal(scene.active(), 1);
});

test('a hidden tab holds the clock', () => {
  const scene = fakeScene();
  createStage(scene.section, { documentRef: scene.doc });
  scene.show(1);
  scene.doc.hidden = true;
  scene.doc.emit('visibilitychange');
  scene.advance(60000);
  assert.equal(scene.active(), 0);
  scene.doc.hidden = false;
  scene.doc.emit('visibilitychange');
  scene.advance(STAGE_STILL_DWELL_MS);
  assert.equal(scene.active(), 1);
});

test('a length learned late times the view whose clock has not started', () => {
  const scene = fakeScene();
  const stage = createStage(scene.section, { documentRef: scene.doc });
  assert.equal(scene.stage.style.vars['--stage-dwell'], `${STAGE_STILL_DWELL_MS}ms`);
  stage.setDurationSource(() => 6);
  assert.equal(scene.stage.style.vars['--stage-dwell'], '12000ms', 'not started yet: it takes the new length');
  scene.show(1);
  scene.advance(12000);
  assert.equal(scene.active(), 1);
});

test('a length learned after the clock started gives the view the rest of its recording', () => {
  // A jump straight to the scene: it is on screen before the loops' list arrives.
  const scene = fakeScene();
  const stage = createStage(scene.section, { documentRef: scene.doc });
  scene.show(1);
  scene.advance(1500);
  stage.setDurationSource(() => 28.97);
  assert.equal(scene.stage.style.vars['--stage-dwell'], '28970ms');
  scene.advance(28970 - 1500 - 1);
  assert.equal(scene.active(), 0, 'not cut at the still\'s eight seconds');
  scene.advance(1);
  assert.equal(scene.active(), 1);
  stage.setDurationSource(() => 28.97);
  assert.equal(stage.getDiagnostics().switches, 1, 'the same length again changes nothing');
});

test('roleOf: the view on stage, the next one in line (wrapping), the others, and strangers', () => {
  const scene = fakeScene();
  const stage = createStage(scene.section, { documentRef: scene.doc });
  assert.deepEqual(scene.views.map((view) => stage.roleOf(view)), ['active', 'next', 'idle']);
  stage.select(2);
  assert.deepEqual(scene.views.map((view) => stage.roleOf(view)), ['next', 'idle', 'active']);
  assert.equal(stage.roleOf({}), null);
});

test('without IntersectionObserver the scene counts as on screen', () => {
  const scene = fakeScene({ observer: false });
  createStage(scene.section, { documentRef: scene.doc });
  scene.advance(STAGE_STILL_DWELL_MS);
  assert.equal(scene.active(), 1);
});

test('fewer than two views, or a view without its tab: nothing is wired', () => {
  const one = fakeScene({ keys: ['01'] });
  assert.equal(createStage(one.section, { documentRef: one.doc }), null);
  const orphan = fakeScene();
  orphan.tablist.querySelector = () => null;
  assert.equal(createStage(orphan.section, { documentRef: orphan.doc }), null);
  assert.equal(createStage(null), null);
});

test('disposed: no timer fires and no listener is left', () => {
  const scene = fakeScene();
  const stage = createStage(scene.section, { documentRef: scene.doc });
  scene.show(1);
  stage.dispose();
  scene.advance(60000);
  assert.equal(scene.active(), 0);
  for (const el of [scene.stage, scene.tablist, scene.pause, scene.doc, scene.media, ...scene.tabs]) {
    assert.equal(el.listenerCount(), 0, el.name);
  }
  assert.equal(scene.observers[0].disconnected, true);
});

// ── The markup it enhances (index.html) ───────────────────────────────────

test('the six tabs match the six views, in order, and the icons are Lucide\'s own paths', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const views = [...html.matchAll(/<article class="view" data-view="(\d\d)"/g)].map((m) => m[1]);
  const tabs = [...html.matchAll(/<button class="stage-tab" type="button" data-tab="(\d\d)"/g)].map((m) => m[1]);
  assert.deepEqual(views, ['01', '02', '03', '04', '05', '06']);
  assert.deepEqual(tabs, views);
  assert.equal((html.match(/data-active/g) || []).length, 2, 'one view and its tab are on stage before the script runs');
  // Vendored verbatim (licenses/lucide/NOTICE): a redraw would fail here.
  for (const [name, d] of Object.entries({
    plane: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
    house: 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    car: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
    zap: 'M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z',
    'bus-front': '<rect width="16" height="16" x="4" y="3" rx="2"/>',
    'radio-tower': '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/>',
    play: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z',
    'arrow-up-right': '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  })) {
    assert.ok(html.includes(d), name);
  }
});

test('reaching for the bar — pointer, touch or keyboard — says the reader is browsing, once', () => {
  for (const type of ['pointerenter', 'pointerdown', 'focusin']) {
    const scene = fakeScene();
    const stage = createStage(scene.section, { documentRef: scene.doc });
    const seen = [];
    stage.subscribe((event) => seen.push(event.type));
    assert.equal(stage.isBrowsing(), false);
    scene.tablist.emit(type, { pointerType: 'mouse' });
    scene.tablist.emit(type, { pointerType: 'mouse' });
    assert.equal(stage.isBrowsing(), true, type);
    assert.deepEqual(seen, ['browse'], type);
  }
});
