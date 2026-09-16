import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PHONE_SELECTION_EMPTY_TEXT,
  phoneSelectionSignature,
  renderPhoneSelection,
} from './phoneSelection.js';

// The same element double `src/zoomPrompt.test.mjs` uses, for the same reason:
// this renderer's whole contract is which nodes it puts where, and jsdom is
// three orders of magnitude of dependency for a `createElement` that returns an
// object with children.
function makeElement(tag) {
  const element = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    type: '',
    children: [],
    dataset: {},
    attributes: {},
    properties: {},
    listeners: {},
    style: { setProperty(name, value) { element.properties[name] = value; } },
    setAttribute(name, value) { element.attributes[name] = value; },
    addEventListener(type, handler) { (element.listeners[type] ||= []).push(handler); },
    appendChild(child) { element.children.push(child); return child; },
    replaceChildren() { element.children = []; },
    click() { for (const handler of element.listeners.click || []) handler(); },
  };
  return element;
}

function makeHost() {
  const host = makeElement('div');
  host.ownerDocument = {
    createElement: (tag) => {
      const el = makeElement(tag);
      el.ownerDocument = host.ownerDocument;
      return el;
    },
  };
  return host;
}

const flight = (overrides = {}) => ({
  key: 'flights:AFR123',
  id: 'AFR123',
  title: 'AFR123',
  details: ['Airbus A320 · 11 300 m', 'Paris → Nice'],
  accent: '#6be8ff',
  activate: () => {},
  ...overrides,
});

test('an empty selection says what to do instead of showing nothing', () => {
  const host = makeHost();
  assert.equal(renderPhoneSelection(host, []), 0);
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0].className, 'phone-selection-empty');
  assert.equal(host.children[0].textContent, PHONE_SELECTION_EMPTY_TEXT);
});

test('a card carries the title, every detail line, and the layer accent', () => {
  const host = makeHost();
  assert.equal(renderPhoneSelection(host, [flight()]), 1);
  const [card, dismiss] = host.children;
  assert.equal(card.tagName, 'BUTTON');
  assert.equal(card.properties['--phone-card-accent'], '#6be8ff');
  assert.deepEqual(
    card.children.map((child) => child.textContent),
    ['AFR123', 'Airbus A320 · 11 300 m', 'Paris → Nice'],
  );
  assert.equal(card.children[0].className, 'phone-selection-title');
  assert.equal(card.children[1].className, 'phone-selection-detail');
  assert.equal(dismiss.className, 'phone-selection-dismiss');
});

test('the card runs the layer’s own activate, and nothing else', () => {
  const host = makeHost();
  let flown = 0;
  renderPhoneSelection(host, [flight({ activate: () => { flown += 1; } })]);
  host.children[0].click();
  assert.equal(flown, 1);
});

test('an entry with no activate is not a button, so it cannot promise a press', () => {
  const host = makeHost();
  renderPhoneSelection(host, [flight({ activate: null })]);
  assert.equal(host.children[0].tagName, 'DIV');
});

test('the dismiss button reports, and never deselects', () => {
  const host = makeHost();
  let dismissed = 0;
  renderPhoneSelection(host, [flight()], { onDismiss: () => { dismissed += 1; } });
  const dismiss = host.children.at(-1);
  dismiss.click();
  assert.equal(dismissed, 1);
  // The cards are still there: lowering the sheet is not letting go of the
  // object, and the layer that owns the selection still owns it.
  assert.equal(host.children[0].className, 'phone-selection-card');
});

test('an unchanged selection is not rebuilt under the reader’s finger', () => {
  const host = makeHost();
  renderPhoneSelection(host, [flight()]);
  const painted = host.children;
  assert.equal(renderPhoneSelection(host, [flight()]), -1);
  assert.equal(host.children, painted, 'same signature, same nodes');
});

test('a tracked contact that moves DOES rebuild, because its words changed', () => {
  const host = makeHost();
  renderPhoneSelection(host, [flight()]);
  const rendered = renderPhoneSelection(host, [flight({ details: ['Airbus A320 · 11 900 m', 'Paris → Nice'] })]);
  assert.equal(rendered, 1);
  assert.equal(host.children[0].children[1].textContent, 'Airbus A320 · 11 900 m');
});

test('the signature separates two entries that would otherwise concatenate', () => {
  assert.notEqual(
    phoneSelectionSignature([{ key: 'a', title: 'bc', details: [] }]),
    phoneSelectionSignature([{ key: 'ab', title: 'c', details: [] }]),
  );
});

test('a missing host is a no-op rather than a crash', () => {
  assert.equal(renderPhoneSelection(null, [flight()]), -1);
  assert.equal(renderPhoneSelection({}, [flight()]), -1);
});
