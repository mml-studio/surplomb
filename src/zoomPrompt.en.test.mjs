// The zoom card in English — the frame around a layer's own sentence.
//
// The card's rows print `stats.loadingLabel`, which belongs to each layer's
// catalog; what this file covers is what the card itself says: its heading in
// the singular and the plural, its close button, its flight button, and the
// count of the layers it had no room for.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ZOOM_PROMPT_FALLBACK_MESSAGE,
  renderZoomPrompt,
  zoomPromptMessage,
  zoomPromptModel,
  zoomPromptTitle,
} from './zoomPrompt.js';
import { assertNoFrench, withLocale } from './i18n/testing.js';

/** The smallest host `renderZoomPrompt` can paint into. */
function stubNode() {
  const node = {
    className: '',
    textContent: '',
    type: '',
    disabled: false,
    hidden: false,
    dataset: {},
    attributes: {},
    children: [],
    listeners: new Map(),
    classList: { add() {}, remove() {} },
    appendChild(child) { node.children.push(child); return child; },
    replaceChildren(...nodes) { node.children = nodes; },
    addEventListener(type, handler) { node.listeners.set(type, handler); },
    setAttribute(name, value) { node.attributes[name] = String(value); },
    querySelector() { return null; },
  };
  return node;
}

function paint(model) {
  const host = stubNode();
  host.ownerDocument = { createElement: stubNode };
  host.querySelector = () => stubNode();
  renderZoomPrompt(host, model);
  const flat = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      flat.push({
        className: node.className,
        text: node.textContent,
        title: node.title ?? node.attributes.title ?? null,
        aria: node.attributes['aria-label'] ?? null,
      });
      walk(node.children);
    }
  };
  walk(host.children);
  return flat;
}

const WAITING = [
  { id: 'cadastre-fr', enabled: true, label: 'Cadastral parcels', stats: { status: 'zoom-in', loadingLabel: 'zoom in below 1,500 m' } },
  { id: 'dvf-sales', enabled: true, label: 'Property prices', stats: { status: 'zoom-in' } },
];

test('the heading counts the layers, in English', () => {
  assert.equal(withLocale('en', () => zoomPromptTitle(1)), 'Zoom in to see this layer');
  assert.equal(withLocale('en', () => zoomPromptTitle(3)), '3 layers are waiting for a closer view');
  // French is what it always was.
  assert.equal(zoomPromptTitle(1), 'Zoome pour voir cette couche');
  assert.equal(zoomPromptTitle(3), '3 couches attendent un zoom');
});

test('a layer that published no sentence is given an English one', () => {
  assert.equal(withLocale('en', () => zoomPromptMessage({})), 'Zoom in to load this layer');
  assert.equal(zoomPromptMessage({}), ZOOM_PROMPT_FALLBACK_MESSAGE);
  assert.equal(ZOOM_PROMPT_FALLBACK_MESSAGE, 'Zoome pour charger cette couche');
  // The layer's own words are printed as it wrote them, capitalized.
  assert.equal(withLocale('en', () => zoomPromptMessage({ loadingLabel: 'zoom in below 1,500 m' })),
    'Zoom in below 1,500 m');
});

test('the card paints an English frame around the rows', () => {
  const model = withLocale('en', () => zoomPromptModel(WAITING, { canFly: (id) => id === 'cadastre-fr' }));
  const painted = withLocale('en', () => paint(model));
  const close = painted.find((node) => node.className === 'zoom-prompt-close');
  assert.equal(close.title, 'Close');
  assert.equal(close.aria, 'Close');
  assert.equal(painted.find((node) => node.className === 'zoom-prompt-fly').text, 'Zoom here');
  assert.equal(painted.find((node) => node.className === 'zoom-prompt-title').text,
    '2 layers are waiting for a closer view');
  assertNoFrench(painted.map((node) => node.text).filter(Boolean));
});

test('the layers that did not fit are counted in English', () => {
  const many = [...WAITING, ...WAITING.map((row, index) => ({ ...row, id: `${row.id}-${index}` }))];
  const model = withLocale('en', () => zoomPromptModel(many));
  assert.equal(model.hiddenCount, 1);
  assert.equal(withLocale('en', () => paint(model)).find((node) => node.className === 'zoom-prompt-more').text,
    '+1 more layer');
  const five = [...many, { ...WAITING[0], id: 'georisques' }, { ...WAITING[0], id: 'bruit-fr' }];
  const wider = withLocale('en', () => zoomPromptModel(five));
  assert.equal(withLocale('en', () => paint(wider)).find((node) => node.className === 'zoom-prompt-more').text,
    '+3 more layers');
  assert.equal(paint(wider).find((node) => node.className === 'zoom-prompt-more').text,
    '+3 autres couches');
});
