// The one word the shared scan helper owns: the heading of a selected card
// whose layer published none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAddressScanOverlayEntry } from './addressScanLayer.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const CARD = { id: 'c1', position: { x: 1, y: 2, z: 3 }, details: ['12 m'] };

test('a card with no title of its own is called Untitled, and Sans titre in French', () => {
  const en = withLocale('en', () => createAddressScanOverlayEntry(CARD));
  assert.equal(en.title, 'Untitled');
  assertNoFrench(en.title);
  assert.equal(withLocale('fr', () => createAddressScanOverlayEntry(CARD)).title, 'Sans titre');
  // A layer that did publish one keeps it: the words on that card are its own.
  assert.equal(withLocale('en', () => createAddressScanOverlayEntry({ ...CARD, title: '12 Rue Vieille' })).title,
    '12 Rue Vieille');
});
