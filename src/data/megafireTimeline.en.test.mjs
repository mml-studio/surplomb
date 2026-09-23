// The megafire replay bar in English. The French stays pinned by
// megafireTimeline.test.mjs, untouched. The stage labels, the heading and the
// detail come from the layer already in the page's language, so what is
// checked here is the bar's OWN words: the buttons, the end tag, the
// accessible names and what the live region says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMegafireTimeline, megafireTimelineAnnouncement, megafireTimelineView } from './megafireTimeline.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

useTestLocale('en');

const SEGMENTS = [
  { id: 'd1', label: 'Jul 22-23', color: '#ff3e30' },
  { id: 'd2', label: 'Jul 24-25', color: '#ff9634' },
  { id: 'd3', label: 'Jul 26 → Aug 1', color: '#fff0d6' },
];

const state = (position, extra = {}) => ({
  position,
  playing: false,
  atStart: position === 0,
  atEnd: position === 3,
  heading: 'July 24, 2026',
  ...extra,
});

test('the main button speaks English in its four states', () => {
  const label = (s) => megafireTimelineView(s, SEGMENTS).mainLabel;
  assert.equal(label(state(0)), 'Play');
  assert.equal(label(state(1.4, { playing: true })), 'Pause');
  assert.equal(label(state(1.4)), 'Resume');
  assert.equal(label(state(3)), 'Replay');
});

test('the live region speaks English', () => {
  const view = (position, extra) => megafireTimelineView(state(position, extra), SEGMENTS);
  assert.equal(megafireTimelineAnnouncement(view(1.4, { playing: true }), view(1.4)), 'Paused, July 24, 2026');
  assert.equal(megafireTimelineAnnouncement(view(2.9, { playing: true }), view(3, { heading: 'August 1, 2026' })),
    'End of detections, August 1, 2026');
  assert.equal(megafireTimelineAnnouncement(view(0.9, { playing: true }), view(1.01, { playing: true, detail: '1,200 detections' })),
    'July 24, 2026, 1,200 detections');
});

/** Every string the bar writes or names, read off a stub DOM. */
function barStrings(timeline) {
  const out = [];
  const visit = (node) => {
    if (node.text) out.push(node.text);
    if (node.title) out.push(node.title);
    for (const [name, value] of node.attributes) if (name.startsWith('aria-label')) out.push(value);
    node.children.forEach(visit);
  };
  visit(timeline.element);
  return out;
}

function makeDocument() {
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = new Map();
      this.dataset = {};
      this.style = { setProperty() {} };
      this.text = '';
      this.title = '';
    }

    get textContent() { return this.text; }

    set textContent(value) { this.text = String(value); }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }

    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }

    removeAttribute(name) { this.attributes.delete(name); }

    appendChild(child) { this.children.push(child); child.parentNode = this; return child; }

    addEventListener() {}

    removeEventListener() {}
  }
  return { createElement: (tag) => new Element(tag), body: new Element('body'), documentElement: null };
}

test('the whole bar is English, and one built bar answers in the language it was built in', () => {
  const timeline = createMegafireTimeline({ segments: SEGMENTS, doc: makeDocument() });
  timeline.update(state(3, { heading: 'August 1, 2026', detail: 'Jul 26 → Aug 1 · 9,524 detections' }));
  const strings = barStrings(timeline);
  assertNoFrench(strings);
  for (const expected of [
    'Replay the spread of the Gironde megafire',
    'Fire spread',
    'Replay',
    'Previous stage',
    'Next stage',
    'Stages of the fire',
    'Jul 24-25 — go to the end of this stage',
    'End of detections',
    'The data stops at the last detection by a satellite: nothing is known beyond it.',
  ]) assert.ok(strings.includes(expected), `missing « ${expected} »`);

  // The same module, built on a French page, is French.
  const french = withLocale('fr', () => barStrings(createMegafireTimeline({ segments: SEGMENTS, doc: makeDocument() })));
  assert.ok(french.includes('Fin des détections'));
  assert.ok(french.includes('Étape précédente'));
});
