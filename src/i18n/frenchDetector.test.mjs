import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFrench, looksFrench } from './frenchDetector.js';
import { PROPER_NOUN_LIST } from './glossary.js';

const FRENCH = [
  'Rejouer les 10 jours en 24 s',
  'périmètre final EFFIS',
  'Lignes photo-interprétées sur l’image',
  'Points où un interprète a vu des flammes',
  'front de feu actif',
  'point chaud',
  'Zoomez pour voir',
  'Aucun résultat',
  'jour 4 sur 10',
  'ÉNERGIE',
  'RISQUES & ENVIRONNEMENT',
  'Chargement',
  'd’EFFIS',
  'Mardi',
];

const ENGLISH = [
  'Replay the 10 days in 24 s',
  'final EFFIS perimeter',
  'Lines photo-interpreted on the image',
  'Zoom in to see',
  'No results',
  'day 4 of 10',
  'ENERGY',
  'RISKS & ENVIRONMENT',
  'LOADING LIVE DATA',
  'POWER UP · 8 KEYS WAITING',
  'Sep 19, 2026 · Mon',
  'a café, a résumé, déjà vu',
  'Risks (Géorisques)',
  'Météo-France weather warning',
  'Île-de-France Mobilités network and frequency',
  'Gironde megafire (Jul. 2026)',
  'font: 600 13px Inter, sans-serif',
  'don’t, it’s, I’m, O’Brien',
  'EST, UN, LA, DE, AU (acronyms)',
  'place, date, station, type, source, image, point, premier, pays',
  '€3,200/m² · 91.3% · 12,400 sales · 5.6 s · 14:05 · 2nd',
];

test('French reads as French', () => {
  for (const text of FRENCH) assert.equal(looksFrench(text), true, text);
});

test('English reads as English — shared words, loanwords, acronyms and glossary nouns included', () => {
  for (const text of ENGLISH) assert.deepEqual(findFrench(text), [], text);
});

test('every glossary proper noun is accepted inside English', () => {
  for (const noun of PROPER_NOUN_LIST) {
    assert.deepEqual(findFrench(`Data from ${noun}, shown as it is.`), [], noun);
  }
});

test('place names and sensors are accepted when the caller hands them over', () => {
  assert.equal(looksFrench('Fire at Saint-Médard-en-Jalles'), true);
  assert.equal(looksFrench('Fire at Saint-Médard-en-Jalles', { allow: ['Saint-Médard-en-Jalles'] }), false);
  assert.equal(looksFrench('A Pléiades Neo image', { allow: ['Pléiades Neo'] }), false);
});

test('French typography is evidence in rendered text, and can be switched off for source code', () => {
  const kinds = (text) => findFrench(text).map((f) => f.match.split(':')[0]);
  assert.deepEqual(kinds('5,6 s'), ['decimal comma']);
  assert.deepEqual(kinds('91,3 %'), ['decimal comma', 'space before %']);
  assert.deepEqual(kinds('3\u202f200 €/m²'), ['narrow no-break space', 'euro after the amount', 'thousands space']);
  assert.deepEqual(kinds('le 1ᵉʳ août'), ['French ordinal', 'le', 'août']);
  assert.equal(looksFrench('5,6 s', { formatting: false }), false);
  // English thousands are never a decimal comma.
  assert.deepEqual(findFrench('12,400 and 1,234,567'), []);
});

test('each piece of evidence says what it is', () => {
  assert.deepEqual(findFrench('l’image des communes'), [
    { kind: 'elision', match: 'l’image' },
    { kind: 'word', match: 'des' },
    { kind: 'word', match: 'communes' },
  ]);
  assert.deepEqual(findFrench(''), []);
  assert.deepEqual(findFrench(null), []);
});
