// The megafire replay bar (src/data/megafireTimeline.js).
//
// The view-model is pure and pinned directly: which label the main button
// reads, which stop is current, what is disabled, how far each stage is
// filled, and when the live region speaks. The controller runs against a DOM
// stub deep enough for what it touches, and one that COUNTS writes: the bar is
// updated up to ~15 times a second, and a repeated state must write nothing.
// The cascade and the layout (width against the map key, the phone's dock) are
// checked in a browser, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEGAFIRE_TIMELINE_ID,
  MEGAFIRE_TIMELINE_OPEN_CLASS,
  createMegafireTimeline,
  megafireTimelineAnnouncement,
  megafireTimelineView,
} from './megafireTimeline.js';

const SEGMENTS = [
  { id: 'd1', label: '22-23 juil.', color: '#ff3e30' },
  { id: 'd2', label: '24-25 juil.', color: '#ff9634' },
  { id: 'd3', label: '26 juil. → 1er août', color: '#fff0d6' },
];

const state = (position, extra = {}) => ({
  position,
  playing: false,
  atStart: position === 0,
  atEnd: position === SEGMENTS.length,
  heading: `h${position}`,
  ...extra,
});

// ── The view-model ───────────────────────────────────────────────────────────

test('the main button reads Lire at the start, Pause while playing, Reprendre halfway, Rejouer at the end', () => {
  const read = (s) => {
    const view = megafireTimelineView(s, SEGMENTS);
    return [view.mainAction, view.mainLabel, view.mainGlyph];
  };
  assert.deepEqual(read(state(0)), ['play', 'Lire', 'play']);
  assert.deepEqual(read(state(1.4, { playing: true })), ['pause', 'Pause', 'pause']);
  assert.deepEqual(read(state(1.4)), ['resume', 'Reprendre', 'play']);
  assert.deepEqual(read(state(2)), ['resume', 'Reprendre', 'play']);
  assert.deepEqual(read(state(3)), ['replay', 'Rejouer', 'replay']);
  // Playing wins over the ends: the button stops what runs.
  assert.deepEqual(read(state(0, { playing: true })), ['pause', 'Pause', 'pause']);
});

test('previous is disabled at the start and next at the end', () => {
  const buttons = (s) => {
    const view = megafireTimelineView(s, SEGMENTS);
    return [view.prevDisabled, view.nextDisabled];
  };
  assert.deepEqual(buttons(state(0)), [true, false]);
  assert.deepEqual(buttons(state(1.4)), [false, false]);
  assert.deepEqual(buttons(state(3)), [false, true]);
});

test('the current stop ends the stage the cursor is in; a stop is current only once reached', () => {
  const stops = (position) => megafireTimelineView(state(position), SEGMENTS).stops.map((stop) => stop.state);
  assert.deepEqual(stops(0), ['ahead', 'ahead', 'ahead']);
  assert.deepEqual(stops(0.5), ['target', 'ahead', 'ahead']);
  assert.deepEqual(stops(1), ['current', 'ahead', 'ahead']);
  assert.deepEqual(stops(1.4), ['reached', 'target', 'ahead']);
  assert.deepEqual(stops(2), ['reached', 'current', 'ahead']);
  assert.deepEqual(stops(3), ['reached', 'reached', 'current']);
  const view = megafireTimelineView(state(1.4), SEGMENTS);
  assert.equal(view.currentIndex, 1);
  assert.equal(view.reachedCount, 1);
  assert.equal(view.focusIndex, 1);
  assert.equal(megafireTimelineView(state(0), SEGMENTS).currentIndex, -1);
  assert.equal(megafireTimelineView(state(0), SEGMENTS).focusIndex, 0, 'the first stop holds the tab stop');
});

test('a stop the clock lands on by arithmetic is still that stop', () => {
  const view = megafireTimelineView(state(1.9999999999999998), SEGMENTS);
  assert.equal(view.atStop, true);
  assert.equal(view.currentIndex, 1);
  assert.equal(view.stops[1].state, 'current');
  assert.equal(view.stops[1].fill, 1);
  const past = megafireTimelineView(state(1.0000000000000002), SEGMENTS);
  assert.equal(past.currentIndex, 0);
  assert.equal(past.reachedCount, 1);
});

test('each stage fills from its own left end, and the knob stands on the fraction of the whole', () => {
  const view = megafireTimelineView(state(1.4), SEGMENTS);
  assert.deepEqual(view.stops.map((stop) => stop.fill), [1, 0.4, 0]);
  assert.equal(view.fraction, 0.4667);
  assert.equal(view.atStop, false);
  assert.equal(megafireTimelineView(state(3), SEGMENTS).fraction, 1);
});

test('a position out of range or missing is clamped, and the ends are derived when not given', () => {
  const low = megafireTimelineView({ position: -2, playing: false }, SEGMENTS);
  assert.equal(low.position, 0);
  assert.equal(low.atStart, true);
  assert.equal(low.mainAction, 'play');
  const high = megafireTimelineView({ position: 9, playing: false }, SEGMENTS);
  assert.equal(high.position, 3);
  assert.equal(high.atEnd, true);
  assert.equal(high.mainAction, 'replay');
  assert.equal(megafireTimelineView({ position: NaN }, SEGMENTS).position, 0);
  assert.equal(megafireTimelineView(undefined, []).count, 0);
});

test('the heading and the detail pass through as the layer wrote them', () => {
  const view = megafireTimelineView(state(1.4, { heading: '24 juillet 2026', detail: '24-25 juillet · 3 775 détections' }), SEGMENTS);
  assert.equal(view.heading, '24 juillet 2026');
  assert.equal(view.detail, '24-25 juillet · 3 775 détections');
  assert.equal(megafireTimelineView(state(1.4), SEGMENTS).detail, '');
});

// ── The live region ──────────────────────────────────────────────────────────

test('the live region speaks when a stop is reached or the replay stops, never on a plain frame', () => {
  const view = (position, extra) => megafireTimelineView(state(position, { heading: `jour ${position}`, ...extra }), SEGMENTS);
  const say = (from, to) => megafireTimelineAnnouncement(from, to);
  assert.equal(say(view(1.2, { playing: true }), view(1.3, { playing: true })), '', 'a frame');
  assert.equal(say(view(1.9, { playing: true }), view(2.01, { playing: true })), 'jour 2.01', 'a stop crossed');
  assert.equal(say(view(1.4, { playing: true, detail: '3 775 détections' }), view(2.001, { playing: true, detail: '3 775 détections' })),
    'jour 2.001, 3 775 détections');
  assert.equal(say(view(1.4, { playing: true }), view(1.4)), 'En pause, jour 1.4', 'paused');
  assert.equal(say(view(2.99, { playing: true }), view(3)), 'Fin des détections, jour 3', 'run to the end');
  assert.equal(say(view(2), view(3)), 'Fin des détections, jour 3', 'jumped to the end');
  assert.equal(say(view(2), view(1)), 'jour 1', 'stepped back');
  assert.equal(say(view(1.4), view(1.4, { playing: true })), '', 'a resume says nothing: the button says Pause');
  assert.equal(say(null, view(1)), '');
});

// ── The controller, on a DOM stub ────────────────────────────────────────────

function makeDocument() {
  const doc = { writes: 0, activeElement: null };

  class Element {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.listeners = new Map();
      this.dataset = {};
      this.className = '';
      this.id = '';
      this.type = '';
      this.title = '';
      this._text = '';
      this._hidden = false;
      this._disabled = false;
      const props = new Map();
      this.style = {
        props,
        setProperty(name, value) { doc.writes += 1; props.set(name, String(value)); },
        getPropertyValue(name) { return props.get(name) ?? ''; },
      };
    }

    get textContent() { return this._text; }

    set textContent(value) { doc.writes += 1; this._text = String(value); }

    get hidden() { return this._hidden; }

    set hidden(value) { doc.writes += 1; this._hidden = Boolean(value); }

    get disabled() { return this._disabled; }

    set disabled(value) { doc.writes += 1; this._disabled = Boolean(value); }

    setAttribute(name, value) { doc.writes += 1; this.attributes.set(name, String(value)); }

    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

    removeAttribute(name) { doc.writes += 1; this.attributes.delete(name); }

    appendChild(child) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    removeChild(child) {
      this.children = this.children.filter((node) => node !== child);
      child.parentNode = null;
      return child;
    }

    contains(node) {
      for (let current = node; current; current = current.parentNode) if (current === this) return true;
      return false;
    }

    /** Only the one selector the module asks for: `button[data-command]`. */
    closest(selector) {
      assert.equal(selector, 'button[data-command]');
      for (let current = this; current; current = current.parentNode) {
        if (current.tagName === 'BUTTON' && current.dataset.command) return current;
      }
      return null;
    }

    all(predicate, out = []) {
      for (const child of this.children) {
        if (predicate(child)) out.push(child);
        child.all(predicate, out);
      }
      return out;
    }

    byClass(name) { return this.all((node) => node.className.split(' ').includes(name)); }

    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(handler);
    }

    removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }

    dispatch(type, init = {}) {
      const event = {
        type,
        target: this,
        defaultPrevented: false,
        stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
        ...init,
      };
      for (let node = this; node && !event.stopped; node = node.parentNode) {
        for (const handler of node.listeners.get(type) || []) handler(event);
      }
      return event;
    }

    click() { if (!this.disabled) this.dispatch('click'); }

    focus() { doc.activeElement = this; }
  }

  const classes = new Set();
  doc.createElement = (tag) => new Element(tag);
  doc.body = new Element('body');
  doc.documentElement = {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  };
  return doc;
}

function build() {
  const doc = makeDocument();
  const commands = [];
  const timeline = createMegafireTimeline({ segments: SEGMENTS, onCommand: (command) => commands.push(command), doc });
  const root = timeline.element;
  const one = (name) => root.byClass(name)[0];
  return {
    doc,
    commands,
    timeline,
    root,
    one,
    main: one('megafire-timeline-main'),
    prev: root.all((node) => node.dataset.command === 'prev')[0],
    next: root.all((node) => node.dataset.command === 'next')[0],
    stops: root.byClass('megafire-timeline-stop'),
    fills: root.byClass('megafire-timeline-fill'),
    live: one('megafire-timeline-live'),
  };
}

test('the bar is a labelled group of real buttons, one stop per stage, in the order given', () => {
  const { root, main, prev, next, stops, fills, one } = build();
  assert.equal(root.id, MEGAFIRE_TIMELINE_ID);
  assert.equal(root.getAttribute('role'), 'group');
  assert.equal(root.getAttribute('aria-label'), 'Rejouer la progression du mégafeu de Gironde');
  assert.equal(root.style.props.get('--mt-count'), '3');
  for (const button of [main, prev, next, ...stops]) {
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
  }
  assert.equal(prev.getAttribute('aria-label'), 'Étape précédente');
  assert.equal(next.getAttribute('aria-label'), 'Étape suivante');
  assert.deepEqual(stops.map((stop) => stop.byClass('megafire-timeline-stop-label')[0].textContent),
    ['22-23 juil.', '24-25 juil.', '26 juil. → 1er août']);
  assert.equal(stops[1].title, '24-25 juil. — aller à la fin de cette étape');
  assert.deepEqual(fills.map((fill) => fill.style.props.get('--mt-color')), ['#ff3e30', '#ff9634', '#fff0d6']);
  assert.equal(one('megafire-timeline-eyebrow').textContent, 'Progression du feu');
  assert.equal(one('megafire-timeline-end').textContent, 'Fin des détections');
  assert.equal(one('megafire-timeline-stops').getAttribute('aria-label'), 'Étapes du feu');
  assert.equal(one('megafire-timeline-live').getAttribute('aria-live'), 'polite');
  // Every glyph is decoration: the words carry the meaning.
  for (const icon of root.byClass('shell-icon')) assert.equal(icon.getAttribute('aria-hidden'), 'true');
});

test('before its first update the bar already reads as a replay at its start', () => {
  const { main, prev, stops, one } = build();
  assert.equal(one('megafire-timeline-main-label').textContent, 'Lire');
  assert.equal(prev.disabled, true);
  assert.deepEqual(stops.map((stop) => stop.getAttribute('tabindex')), ['0', '-1', '-1']);
  assert.equal(main.disabled, false);
});

test('mount attaches the bar and marks <html>; unmount and destroy undo both', () => {
  const { doc, timeline, root } = build();
  timeline.mount();
  assert.equal(root.parentNode, doc.body);
  assert.equal(doc.documentElement.classList.contains(MEGAFIRE_TIMELINE_OPEN_CLASS), true);
  timeline.mount();
  assert.equal(doc.body.children.length, 1, 'mounting twice attaches once');
  timeline.unmount();
  assert.equal(root.parentNode, null);
  assert.equal(doc.documentElement.classList.contains(MEGAFIRE_TIMELINE_OPEN_CLASS), false);
  timeline.mount();
  timeline.destroy();
  assert.equal(root.parentNode, null);
  assert.equal(doc.documentElement.classList.contains(MEGAFIRE_TIMELINE_OPEN_CLASS), false);
  timeline.mount();
  assert.equal(root.parentNode, null, 'a destroyed bar stays down');
  timeline.update(state(2));
});

test('each button sends its command; a disabled one sends nothing', () => {
  const { timeline, commands, main, prev, next, stops } = build();
  timeline.update(state(1.4, { playing: true }));
  main.click();
  prev.click();
  next.click();
  stops[2].byClass('megafire-timeline-stop-label')[0].dispatch('click');
  assert.deepEqual(commands, [{ type: 'toggle' }, { type: 'prev' }, { type: 'next' }, { type: 'seek', index: 2 }]);
  timeline.update(state(3));
  commands.length = 0;
  next.click();
  assert.deepEqual(commands, []);
  timeline.destroy();
  main.click();
  assert.deepEqual(commands, [], 'no command after destroy');
});

test('← and → on the stops step through the stages, Home and End jump, and focus follows', () => {
  const { doc, timeline, commands, stops, one } = build();
  const list = one('megafire-timeline-stops');
  timeline.update(state(1));
  stops[0].focus();
  const right = stops[0].dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(right.defaultPrevented, true);
  assert.equal(right.stopped, true, 'the globe does not also turn');
  assert.deepEqual(commands.at(-1), { type: 'next' });
  timeline.update(state(2));
  assert.equal(doc.activeElement, stops[1], 'focus moved to the stop the replay reached');
  stops[1].dispatch('keydown', { key: 'Home' });
  assert.deepEqual(commands.at(-1), { type: 'seek', index: 0 });
  stops[1].dispatch('keydown', { key: 'End' });
  assert.deepEqual(commands.at(-1), { type: 'seek', index: 2 });
  stops[1].dispatch('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(commands.at(-1), { type: 'prev' });
  const other = stops[1].dispatch('keydown', { key: 'Enter' });
  assert.equal(other.defaultPrevented, false, 'other keys are the button’s');
  // At the start, ← has nowhere to go and sends nothing.
  timeline.update(state(0, { atStart: true }));
  const count = commands.length;
  stops[0].dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(commands.length, count);
  assert.ok(list.listeners.get('keydown')?.size, 'the list owns the keys');
});

test('update writes what changed and nothing else: a repeated state writes nothing', () => {
  const { doc, timeline, stops, fills, main, prev, next, one } = build();
  timeline.update(state(1.4, { playing: true, heading: '24 juillet 2026', detail: '3 775 détections' }));
  assert.equal(one('megafire-timeline-heading').textContent, '24 juillet 2026');
  assert.equal(one('megafire-timeline-detail').textContent, '3 775 détections');
  assert.equal(one('megafire-timeline-detail').hidden, false);
  assert.equal(one('megafire-timeline-main-label').textContent, 'Pause');
  assert.equal(one('megafire-timeline-glyph').getAttribute('data-glyph'), 'pause');
  assert.equal(prev.disabled, false);
  assert.equal(next.disabled, false);
  assert.deepEqual(fills.map((fill) => fill.style.props.get('--mt-fill')), ['1', '0.4', '0']);
  assert.deepEqual(stops.map((stop) => stop.getAttribute('data-state')), ['reached', 'target', 'ahead']);
  assert.deepEqual(stops.map((stop) => stop.getAttribute('aria-current')), [null, 'step', null]);
  assert.deepEqual(stops.map((stop) => stop.getAttribute('tabindex')), ['-1', '0', '-1']);
  assert.equal(one('megafire-timeline-knob').hidden, false);
  assert.equal(main.disabled, false);

  const before = doc.writes;
  timeline.update(state(1.4, { playing: true, heading: '24 juillet 2026', detail: '3 775 détections' }));
  assert.equal(doc.writes, before, 'the same state again: not one write');

  // One frame of playback inside a stage: that stage's fill and the knob.
  timeline.update(state(1.5, { playing: true, heading: '24 juillet 2026', detail: '3 775 détections' }));
  assert.equal(doc.writes - before, 2);
  assert.equal(fills[1].style.props.get('--mt-fill'), '0.5');

  // Landing on the stop: the knob hides, the stop lights, the fill completes.
  timeline.update(state(2, { heading: '25 juillet 2026' }));
  assert.equal(one('megafire-timeline-knob').hidden, true);
  assert.equal(stops[1].getAttribute('data-state'), 'current');
  assert.equal(stops[1].getAttribute('aria-current'), 'step');
  assert.equal(one('megafire-timeline-detail').hidden, true, 'no detail, no empty line');
  assert.equal(one('megafire-timeline-main-label').textContent, 'Reprendre');
  assert.equal(one('megafire-timeline-glyph').getAttribute('data-glyph'), 'play');

  timeline.update(state(3, { heading: '1er août 2026' }));
  assert.equal(one('megafire-timeline-main-label').textContent, 'Rejouer');
  assert.equal(next.disabled, true);
  assert.equal(timeline.element.getAttribute('data-ended'), 'true');
  assert.deepEqual(stops.map((stop) => stop.getAttribute('aria-current')), [null, null, 'step']);
});

test('the live region stays quiet on the first state and on frames, and speaks at stops', () => {
  const { timeline, live } = build();
  timeline.update(state(3, { heading: '1er août 2026' }));
  assert.equal(live.textContent, '', 'the state the bar opens on is not news');
  timeline.update(state(0, { playing: true, heading: '22 juillet 2026' }));
  assert.equal(live.textContent, '22 juillet 2026', 'the replay went back to the start');
  timeline.update(state(0.5, { playing: true, heading: '23 juillet 2026' }));
  assert.equal(live.textContent, '22 juillet 2026', 'a frame says nothing');
  timeline.update(state(1.01, { playing: true, heading: '24 juillet 2026', detail: '1 200 détections' }));
  assert.equal(live.textContent, '24 juillet 2026, 1 200 détections');
  timeline.update(state(1.2, { heading: '24 juillet 2026' }));
  assert.equal(live.textContent, 'En pause, 24 juillet 2026');
});

test('a bar with no stages builds and updates without throwing', () => {
  const doc = makeDocument();
  const timeline = createMegafireTimeline({ segments: [], doc });
  timeline.update({ position: 0.5, playing: true });
  timeline.mount();
  timeline.destroy();
});
