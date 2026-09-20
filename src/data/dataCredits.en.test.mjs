// The attribution popover in English.
//
// Seven of the eighty-four credits were written in French; they answer in the
// reader's language now, and the rest — quotations of dataset titles,
// publishers and licence names — read the same in both, because that is what
// an attribution is.
import test from 'node:test';
import assert from 'node:assert/strict';

import { DATA_CREDITS, registerDataCredits } from './dataCredits.js';
import creditMessages from './dataCredits.i18n.js';
import { withLocale } from '../i18n/testing.js';

const credit = (key) => DATA_CREDITS.find((entry) => entry.key === key);
const TRANSLATED = Object.keys(creditMessages.definition);

test('the seven French credits have an English body, and keep their French one', () => {
  assert.equal(TRANSLATED.length, 7);
  for (const key of TRANSLATED) {
    const entry = credit(key);
    assert.ok(entry, `${key} is not in DATA_CREDITS`);
    const english = withLocale('en', () => entry.html);
    assert.equal(typeof english, 'string');
    assert.notEqual(english, '', key);
    assert.equal(entry.html, creditMessages.definition[key].fr, `${key}: the French body moved`);
  }
});

test('what each layer does with a file is translated; what it quotes is not', () => {
  const dams = withLocale('en', () => credit('dams').html);
  assert.match(dams, /^Dams &amp; levees:/);
  assert.equal(credit('dams').html.startsWith('Barrages &amp; digues:'), true);

  const anfr = withLocale('en', () => credit('anfr-fr').html);
  assert.match(anfr, /weekly edition of 27\/08\/2026, 826,418 rows over 72,700 masts/);
  // The two dataset titles stay in French inside the English sentence.
  assert.match(anfr, /Observatoire des r&eacute;seaux mobiles 2G\/3G\/4G\/5G/);
  assert.match(anfr, /Donn&eacute;es sur les installations radio&eacute;lectriques de plus de 5 watts/);

  // The Copernicus notice is prescribed by regulation: the same words in both.
  for (const html of [credit('gironde-megafire').html, withLocale('en', () => credit('gironde-megafire').html)]) {
    assert.match(html, /Contains modified Copernicus EMS Rapid Mapping data/);
  }
});

test('the popover registers the language the page is in', () => {
  const registered = [];
  const viewer = { creditDisplay: { addStaticCredit: (value) => registered.push(String(value.html ?? value)) } };
  withLocale('en', () => registerDataCredits(viewer));
  assert.equal(registered.length, DATA_CREDITS.length);
  assert.ok(registered.some((html) => html.startsWith('Dams &amp; levees:')),
    'the English body is what reached the viewer');
  assert.ok(!registered.some((html) => html.startsWith('Barrages &amp; digues:')));
});

test('the credit that shipped its own source code is repaired', () => {
  // It printed `' +\n      '` and `’` in the popover for a fortnight.
  const html = credit('sitadel-fr').html;
  assert.ok(!html.includes("' +"), 'a concatenation leaked into the attribution');
  assert.ok(!html.includes('\\u'), 'an escape leaked into the attribution');
  assert.match(html, /^French building and demolition permits: <em>Sitadel/);
  assert.match(html, /9 744 of 21 271 permits \(45\.8%\) could be positioned/);
});
