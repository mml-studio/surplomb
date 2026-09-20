// The briefing card's one written label, in English.
//
// The card's heading, its second button and its checkbox live in `index.html`
// and are translated there. What this module writes is the primary button —
// the one that names where the flight goes — so that is what is covered here,
// through the real `ask()`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { initCoverageBriefing } from './coverageBriefing.js';
import { withLocale } from './i18n/testing.js';

/** A node stub deep enough for one card. */
function stubNode(selectors = {}) {
  const node = {
    hidden: false,
    checked: false,
    className: '',
    textContent: '',
    offsetHeight: 0,
    listeners: new Map(),
    classList: { add() {}, remove() {} },
    addEventListener(type, handler) { node.listeners.set(type, handler); },
    removeEventListener() {},
    replaceChildren() {},
    focus() {},
    querySelector(selector) { return selectors[selector] || null; },
  };
  return node;
}

function mountCard() {
  const gotoLabel = stubNode();
  const root = stubNode({
    '[data-coverage-title]': stubNode(),
    '[data-coverage-body]': stubNode(),
    '[data-coverage-scope]': stubNode(),
    '[data-coverage-choice="goto"]': stubNode(),
    '[data-coverage-choice="here"]': stubNode(),
    '[data-coverage-goto-label]': gotoLabel,
    '[data-coverage-suppress]': stubNode(),
  });
  const originalDocument = globalThis.document;
  const originalHtmlElement = globalThis.HTMLElement;
  globalThis.document = { activeElement: null, addEventListener() {}, removeEventListener() {} };
  globalThis.HTMLElement = class {};
  const card = initCoverageBriefing(root, { storage: { getItem: () => null, setItem() {}, removeItem() {} } });
  return {
    gotoLabel,
    ask: (request) => card.ask(request),
    restore() {
      card.destroy();
      if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
      globalThis.HTMLElement = originalHtmlElement;
    },
  };
}

test('the flight button names its destination in English', () => {
  const card = mountCard();
  try {
    // The card's promise stays pending until the reader answers, so the
    // callback must not RETURN it: `withLocale` would wait for it to settle
    // before restoring the locale, and every later test would speak English.
    withLocale('en', () => { card.ask({ layerId: 'comptages-fr', goto: 'paris', gotoName: 'Paris' }); });
    assert.equal(card.gotoLabel.textContent, 'Go to Paris');
    withLocale('en', () => { card.ask({ layerId: 'comptages-fr', goto: 'paris', gotoName: '' }); });
    assert.equal(card.gotoLabel.textContent, 'Go to the covered area');
  } finally {
    card.restore();
  }
});

test('and in French it says exactly what it always said', () => {
  const card = mountCard();
  try {
    card.ask({ layerId: 'comptages-fr', goto: 'paris', gotoName: 'Paris' });
    assert.equal(card.gotoLabel.textContent, 'Aller à Paris');
    card.ask({ layerId: 'comptages-fr', goto: 'paris', gotoName: null });
    assert.equal(card.gotoLabel.textContent, 'Aller à la zone couverte');
  } finally {
    card.restore();
  }
});
