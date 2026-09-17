import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CESIUM_CREDITS_CLASS, LEGAL_LINKS, installLegalLinks, legalLinksMarkup } from './legalLinks.js';
import { legalPageForUrl } from './legalNotice.js';

test('every link on the credit line lands on a page the server fills', () => {
  for (const { href } of LEGAL_LINKS) {
    assert.ok(legalPageForUrl(href), `${href} is not a legal page`);
  }
  assert.equal(LEGAL_LINKS.length, 2);
});

test('the links open beside the globe, never over it', () => {
  const markup = legalLinksMarkup();
  assert.equal(markup.match(/target="_blank" rel="noopener"/g)?.length, LEGAL_LINKS.length);
  assert.match(markup, /Mentions légales/);
  assert.match(markup, /Confidentialité/);
});

/** A container that finds by class among everything appended under it. */
function fakeContainer({ withWidgetBox }) {
  const appended = [];
  const box = { className: CESIUM_CREDITS_CLASS, children: [], appendChild(child) { this.children.push(child); appended.push(child); } };
  const container = {
    children: [],
    ownerDocument: { createElement: () => ({ className: '', innerHTML: '' }) },
    querySelector: (selector) => [...(withWidgetBox ? [box] : []), ...appended]
      .find((c) => `.${c.className}` === selector) || null,
    appendChild(child) { this.children.push(child); appended.push(child); },
  };
  return { container, box };
}

test('the links go inside the box Cesium lays out, once', () => {
  const { container, box } = fakeContainer({ withWidgetBox: true });
  const first = installLegalLinks(container);
  assert.equal(installLegalLinks(container), first);
  // A sibling of the absolutely positioned box starts over the Cesium logo.
  assert.deepEqual(box.children, [first]);
  assert.equal(container.children.length, 0);
  assert.equal(installLegalLinks(null), null);
});

test('without the widget box the container itself takes them', () => {
  const { container } = fakeContainer({ withWidgetBox: false });
  const span = installLegalLinks(container);
  assert.deepEqual(container.children, [span]);
});

test('the globe installs them once the credit container exists', () => {
  const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  const credits = main.indexOf("el.id = 'cesium-credits'");
  const install = main.indexOf("installLegalLinks(document.getElementById('cesium-credits'))");
  assert.ok(credits > 0 && install > credits, 'installed after the Viewer builds #cesium-credits');
});

test('the waitlist form links to what happens to the address', () => {
  // GDPR art. 13: the information is due at collection, on the form itself.
  const card = readFileSync(new URL('./waitlistCard.js', import.meta.url), 'utf8');
  const consent = card.slice(card.indexOf('class="waitlist-consent"'), card.indexOf('</form>'));
  const href = /href="([^"#]+)#vos-donnees"/.exec(consent)?.[1];
  assert.ok(href && legalPageForUrl(href), 'the consent line links to the privacy page');
  const page = readFileSync(new URL('../confidentialite.html', import.meta.url), 'utf8');
  assert.match(page, /id="vos-donnees"/);
});
