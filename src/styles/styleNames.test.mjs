import test from 'node:test';
import assert from 'node:assert/strict';
import { withLocale } from '../i18n/testing.js';
import { styleDisplayName, styleSpelledName } from './styleNames.js';

test('the night atlas is named in the reader’s language, never by its id', () => {
  // NOIR was the id printed as a name: a French word on an English page.
  assert.equal(withLocale('fr', () => styleDisplayName('noir')), 'NUIT');
  assert.equal(withLocale('en', () => styleDisplayName('noir')), 'NIGHT');
  assert.equal(withLocale('fr', () => styleSpelledName('noir')), 'Nuit');
  assert.equal(withLocale('en', () => styleSpelledName('noir')), 'Night');
});

test('dusk, the lighter night, is named in the reader’s language too', () => {
  assert.equal(withLocale('fr', () => styleDisplayName('dusk')), 'CRÉPUSCULE');
  assert.equal(withLocale('en', () => styleDisplayName('dusk')), 'DUSK');
  assert.equal(withLocale('fr', () => styleSpelledName('dusk')), 'Crépuscule');
  assert.equal(withLocale('en', () => styleSpelledName('dusk')), 'Dusk');
});

test('the other presets keep the word both languages share', () => {
  for (const locale of ['fr', 'en']) {
    withLocale(locale, () => {
      assert.equal(styleDisplayName('normal'), 'NORMAL');
      assert.equal(styleDisplayName('retro'), 'CRT');
      assert.equal(styleDisplayName('surveillance'), 'NVG');
      assert.equal(styleDisplayName('thermal'), 'FLIR');
      assert.equal(styleDisplayName('anime'), 'ANIME');
      assert.equal(styleSpelledName('thermal'), 'FLIR');
    });
  }
  // An unknown id still prints something rather than nothing.
  assert.equal(styleDisplayName('sepia'), 'SEPIA');
  assert.equal(styleDisplayName(null), 'NORMAL');
});
