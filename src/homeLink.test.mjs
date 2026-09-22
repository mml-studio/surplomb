// The mark in the corner of the globe: it leads to the landing page, and only
// after « Confirmer ».
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { HOME_CONFIRM_VALUE, initHomeLink, isPlainClick } from './homeLink.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fakeTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
    fire: (type, event) => listeners.get(type)?.(event),
  };
}

function fakeLink(href = '/') {
  return { ...fakeTarget(), dataset: {}, getAttribute: (name) => (name === 'href' ? href : null) };
}

/** A <dialog> as far as the module uses one. */
function fakeDialog({ native = true } = {}) {
  const dialog = {
    ...fakeTarget(),
    open: false,
    returnValue: '',
    shown: 0,
    close(value) {
      if (value !== undefined) this.returnValue = value;
      this.open = false;
      this.fire('close', {});
    },
    querySelector: (selector) => (selector === '#home-confirm-body' ? { textContent: 'Vous allez être redirigé.' } : null),
  };
  if (native) {
    dialog.showModal = function showModal() {
      this.open = true;
      this.shown += 1;
    };
  }
  return dialog;
}

function fakeDocument(link, dialog, { confirmAnswer = false } = {}) {
  const asked = [];
  return {
    asked,
    querySelector: (selector) => (selector === '[data-home-link]' ? link : null),
    getElementById: (id) => (id === 'home-confirm' ? dialog : null),
    defaultView: { confirm: (question) => { asked.push(question); return confirmAnswer; } },
  };
}

function click(overrides = {}) {
  const event = { button: 0, defaultPrevented: false, ...overrides };
  event.preventDefault = () => { event.defaultPrevented = true; };
  return event;
}

function wire({ native = true, confirmAnswer = false } = {}) {
  const link = fakeLink();
  const dialog = fakeDialog({ native });
  const documentRef = fakeDocument(link, dialog, { confirmAnswer });
  const trail = [];
  const shareLink = { flushHash: () => trail.push('flush') };
  const wired = initHomeLink({ documentRef, shareLink, navigate: (href) => trail.push(`go ${href}`) });
  return { link, dialog, documentRef, trail, wired };
}

test('the markup: the mark links to / and the dialog answers « confirm »', () => {
  assert.match(html, /<a class="title-home" href="\/" data-home-link[^>]*data-i18n-aria-label="home\.link"/);
  assert.match(html, /<dialog id="home-confirm"[^>]*>\s*<form method="dialog">/);
  assert.match(html, new RegExp(`<button type="submit" value="${HOME_CONFIRM_VALUE}"[^>]*>Confirmer</button>`));
  // Cancel holds the focus, so Enter on arrival never leaves.
  assert.match(html, /<button type="submit" value="cancel" data-i18n="home\.cancel" autofocus>Annuler<\/button>/);
});

test('a plain press asks and does not leave', () => {
  const { link, dialog, trail } = wire();
  const event = click();
  link.fire('click', event);
  assert.equal(event.defaultPrevented, true, 'the link does not navigate by itself');
  assert.equal(dialog.open, true);
  assert.deepEqual(trail, []);
});

test('« Confirmer » flushes the share hash, then goes to the landing page', () => {
  const { link, dialog, trail } = wire();
  link.fire('click', click());
  dialog.close(HOME_CONFIRM_VALUE);
  assert.deepEqual(trail, ['flush', 'go /'], 'the address Back returns to holds this view');
});

test('« Annuler », Escape and the backdrop all stay', () => {
  const { link, dialog, trail } = wire();
  link.fire('click', click());
  dialog.close('cancel');
  link.fire('click', click());
  dialog.close(); // Escape closes with the empty value it was opened with
  link.fire('click', click());
  dialog.fire('click', { target: dialog });
  assert.equal(dialog.open, false, 'a press on the backdrop closes');
  link.fire('click', click());
  dialog.fire('click', { target: {} });
  assert.equal(dialog.open, true, 'a press inside the card does not');
  assert.deepEqual(trail, []);
});

test('a new-tab gesture is left to the link: nothing asked, nothing lost', () => {
  const { link, dialog } = wire();
  for (const gesture of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const event = click(gesture);
    link.fire('click', event);
    assert.equal(event.defaultPrevented, false, JSON.stringify(gesture));
  }
  assert.equal(dialog.shown, 0);
  assert.equal(isPlainClick({ button: 0 }), true);
  assert.equal(isPlainClick({}), true, 'a synthetic click has no button');
});

test('a browser without <dialog> asks the same question in its own box', () => {
  const refused = wire({ native: false, confirmAnswer: false });
  refused.link.fire('click', click());
  assert.deepEqual(refused.documentRef.asked, ['Vous allez être redirigé.']);
  assert.deepEqual(refused.trail, []);
  const accepted = wire({ native: false, confirmAnswer: true });
  accepted.link.fire('click', click());
  assert.deepEqual(accepted.trail, ['flush', 'go /']);
});

test('safe twice, safe without the markup, and undone by destroy', () => {
  const { link, dialog, documentRef, wired } = wire();
  assert.equal(initHomeLink({ documentRef }), null, 'wiring twice does not double the press');
  assert.equal(initHomeLink({ documentRef: fakeDocument(null, dialog) }), null);
  assert.equal(initHomeLink({ documentRef: null }), null);
  wired.destroy();
  link.fire('click', click());
  assert.equal(dialog.shown, 0);
});
