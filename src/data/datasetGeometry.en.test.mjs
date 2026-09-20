// Why the box thinks it knows where a row is, in English.
//
// The reason is printed in the draft before anything is drawn, which is the
// whole of doctrine A1 in this module: a guessed position never gets the sign
// of a published one. So the English must keep the hedge the French carries —
// a resemblance says it is a resemblance.
import test from 'node:test';
import assert from 'node:assert/strict';

import { detectGeometry } from './datasetGeometry.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const reason = (locale, header, sample) => withLocale(locale, () => detectGeometry(header, sample)?.reason);

test('a named pair is reported as the columns it read', () => {
  const header = ['Longitude', 'Latitude', 'nom'];
  const sample = [{ Longitude: '2.35', Latitude: '48.85' }];
  assert.equal(reason('en', header, sample), 'columns Longitude / Latitude');
  assert.equal(reason('fr', header, sample), 'colonnes Longitude / Latitude');
});

test('bare x/y in metres names Lambert-93 and says the values were checked', () => {
  const header = ['x', 'y'];
  const sample = [{ x: '652000', y: '6862000' }];
  const english = reason('en', header, sample);
  assert.equal(english, 'columns x / y in Lambert-93 meters (values inside the mainland box)');
  assertNoFrench(english, { allow: ['Lambert-93'] });
});

test('the weakest guess still says it is a resemblance', () => {
  const header = ['c_long_coor1', 'c_lat_coor1', 'c_nom'];
  const sample = [{ c_long_coor1: '4.85', c_lat_coor1: '45.75' }];
  const english = reason('en', header, sample);
  assert.equal(english, 'columns c_long_coor1 / c_lat_coor1 (by name resemblance, values in degrees)');
  assert.match(reason('fr', header, sample), /ressemblance/);
});

test('a header that names nothing stays silent in both languages', () => {
  assert.equal(reason('en', ['a', 'b'], [{ a: '1', b: '2' }]), undefined);
  assert.equal(reason('fr', ['a', 'b'], [{ a: '1', b: '2' }]), undefined);
});
