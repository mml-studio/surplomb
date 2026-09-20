// The register's reading in English: the five bands, the geocoding ladder and
// the one line that names an establishment.
//
// These three are read by the browser only. The PROJECTION next to them runs
// on the server too, and this file pins the thing that makes that safe: the
// payload carries the register's own keys, never a word, so a cached answer
// can be drawn in either language (docs/i18n/CONVENTIONS.md, "Server-side
// modules").
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHOOL_LEVELS,
  SCHOOL_PRECISION_STEPS,
  projectSchoolSites,
  schoolDisplayName,
  schoolLevelLabel,
  schoolPrecisionLabel,
} from './schoolsFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('every band of the ladder has an English name, and none is a French word', () => {
  const labels = withLocale('en', () => SCHOOL_LEVELS.map(schoolLevelLabel));
  assertNoFrench(labels);
  assert.deepEqual(labels, [
    'School', 'Middle school', 'High school', 'Adapted & special-needs',
    'Administration & guidance',
  ]);
});

test('every step of the geocoding ladder has an English name', () => {
  const labels = withLocale('en', () => SCHOOL_PRECISION_STEPS.map(schoolPrecisionLabel));
  assertNoFrench(labels);
  assert.deepEqual(labels,
    ['Exact address', 'Street', 'Center of the municipality', 'Accuracy not published']);
  // A step this build has never met still reads as the honest one.
  assert.equal(withLocale('en', () => schoolPrecisionLabel('nope')), 'Accuracy not published');
});

test('the one line that names an establishment prefixes only what needs it', () => {
  const name = (site) => withLocale('en', () => schoolDisplayName(site));
  // 97.4% of published names already carry their own type word: they are left
  // alone, French and all, because the name is what the ministry published.
  assert.equal(name({ name: 'Collège Jean Moulin', level: 'college' }), 'Collège Jean Moulin');
  assert.equal(name({ name: 'LYCEE DU PARC', level: 'lycee' }), 'LYCEE DU PARC');
  // The 2 467 that do not get the English band in front.
  assert.equal(name({ name: 'Institution Saint-Pierre', level: 'lycee' }),
    'High school · Institution Saint-Pierre');
  // `autre` never takes a prefix: its band names a legend row, not a building.
  assert.equal(name({ name: "Rectorat de l'académie de Lyon", level: 'autre' }),
    "Rectorat de l'académie de Lyon");
  // And with no name at all, the band, or the honest generic word.
  assert.equal(name({ level: 'college' }), 'Middle school');
  assert.equal(name({}), 'Establishment');
  assert.equal(name(null), 'Establishment');
});

test('the projection publishes KEYS, so a cached payload is language-free', () => {
  const rows = [{
    identifiant_de_l_etablissement: '0450922H',
    nom_etablissement: 'Ecole primaire des Prés Verts',
    type_etablissement: 'Ecole',
    statut_public_prive: 'Privé',
    precision_localisation: 'Ville',
    nom_commune: 'Orléans',
    latitude: 47.9,
    longitude: 1.9,
  }];
  const french = projectSchoolSites({ records: rows });
  const english = withLocale('en', () => projectSchoolSites({ records: rows }));
  // Byte for byte the same document in both languages: the words are chosen
  // when a card is drawn, never when the server answers.
  assert.deepEqual(english, french);
  assert.equal(french.sites[0].level, 'ecole');
  assert.equal(french.sites[0].sector, 'prive');
  assert.equal(french.sites[0].precision, 'commune');
});
