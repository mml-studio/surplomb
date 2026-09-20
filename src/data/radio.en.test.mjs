// The Radio chip strip, in both languages.
//
// The layer came from upstream English-only, so what it needed was FRENCH.
// The chip ids are station TAGS and never move: `stationMatchesRadioCategory`
// matches on them and a share link carries them, so only the words change.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRadioCategories } from './radio.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const stations = [
  { name: 'A', tags: ['news'] },
  { name: 'B', tags: ['jazz'] },
  { name: 'C', tags: ['classical'] },
];

test('the eight own categories are French on a French page', () => {
  const chips = buildRadioCategories(stations);
  const byId = new Map(chips.map((chip) => [chip.id, chip.label]));
  assert.equal(byId.get('all'), 'Toutes');
  assert.equal(byId.get('news'), 'Infos');
  assert.equal(byId.get('weather'), 'Météo / Urgences');
  assert.equal(byId.get('other'), 'Autre');
});

test('the same strip reads English, with the ids untouched', () => {
  const chips = withLocale('en', () => buildRadioCategories(stations));
  const byId = new Map(chips.map((chip) => [chip.id, chip.label]));
  assert.equal(byId.get('all'), 'All');
  assert.equal(byId.get('news'), 'News');
  assert.equal(byId.get('weather'), 'Weather / Emergency');
  assert.equal(byId.get('other'), 'Other');
  // The genre chips are built from the tags the stations actually carry.
  assert.equal(byId.get('genre:jazz'), 'Jazz');
  assert.equal(byId.get('genre:classical'), 'Classical');
  assert.equal(byId.has('genre:reggae'), false, 'no station carries it, no chip');
  assertNoFrench(chips.map((chip) => chip.label));
});

test('a genre whose French differs is named in French', () => {
  const chips = buildRadioCategories(stations);
  const byId = new Map(chips.map((chip) => [chip.id, chip.label]));
  assert.equal(byId.get('genre:classical'), 'Classique');
  assert.equal(byId.get('genre:jazz'), 'Jazz');
});
