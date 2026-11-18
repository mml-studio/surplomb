import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_BANNER_CLASS, showConsentBanner } from './consentBanner.js';

/** Just enough DOM for the banner: elements, text, classes, data-*, clicks. */
function fakeDocument() {
  const make = (tag) => {
    const el = {
      tagName: tag.toUpperCase(), children: [], parent: null, attributes: {}, dataset: {}, listeners: {},
      className: '', id: '', textContent: '', type: '', href: '',
      append(...nodes) { for (const n of nodes) this.appendChild(typeof n === 'string' ? { text: n } : n); },
      appendChild(node) { node.parent = this; this.children.push(node); return node; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      closest(selector) {
        const key = /^\[data-([a-z]+)\]$/.exec(selector)?.[1];
        for (let n = this; n; n = n.parent) if (key && n.dataset?.[key] !== undefined) return n;
        return null;
      },
      get text() { return [this.textContent, ...this.children.map((c) => c.text ?? '')].join(''); },
    };
    return el;
  };
  const head = make('head');
  const body = make('body');
  const all = () => {
    const out = [];
    const walk = (n) => { out.push(n); (n.children || []).forEach(walk); };
    walk(head); walk(body);
    return out;
  };
  return {
    head, body,
    createElement: make,
    getElementById: (id) => all().find((n) => n.id === id) || null,
    querySelector: (selector) => all().find((n) => selector.startsWith('.') && String(n.className).split(' ').includes(selector.slice(1))) || null,
  };
}

const click = (banner, choice) => {
  const button = banner.children[0].children[1].children.find((b) => b.dataset.consent === choice);
  for (const fn of banner.listeners.click) fn({ target: button });
};

test('one question, a link to the privacy page, refuse and accept side by side', () => {
  const doc = fakeDocument();
  const banner = showConsentBanner({ doc, onAccept() {}, onRefuse() {} });
  assert.ok(banner);
  assert.ok(banner.className.includes(CONSENT_BANNER_CLASS));
  assert.ok(banner.className.includes('ph-no-capture'), 'the answer is not itself a recorded click');
  assert.equal(banner.attributes.role, 'dialog');
  const [text, row] = banner.children[0].children;
  assert.match(text.text, /^Surplomb utilise des cookies\.Détails$/);
  assert.equal(text.children.find((c) => c.tagName === 'A').href, '/confidentialite');
  assert.deepEqual(row.children.map((b) => b.dataset.consent), ['refuse', 'accept']);
  assert.deepEqual(row.children.map((b) => b.textContent), ['Refuser', 'Accepter']);
  assert.ok(doc.getElementById('gev-consent-style'), 'styles come with it');
});

test('each button answers once and closes the banner', () => {
  for (const choice of ['accept', 'refuse']) {
    const doc = fakeDocument();
    const seen = [];
    const banner = showConsentBanner({ doc, onAccept: () => seen.push('accept'), onRefuse: () => seen.push('refuse') });
    click(banner, choice);
    assert.deepEqual(seen, [choice]);
    assert.equal(doc.body.children.includes(banner), false);
  }
});

test('a throwing handler still closes it; a second call shows nothing more', () => {
  const doc = fakeDocument();
  const banner = showConsentBanner({ doc, onAccept() { throw new Error('boom'); }, onRefuse() {} });
  assert.equal(showConsentBanner({ doc, onAccept() {}, onRefuse() {} }), null, 'one banner per page');
  assert.doesNotThrow(() => click(banner, 'accept'));
  assert.equal(doc.body.children.includes(banner), false);
});

test('no document, no banner', () => {
  assert.equal(showConsentBanner({ doc: null, onAccept() {}, onRefuse() {} }), null);
});
