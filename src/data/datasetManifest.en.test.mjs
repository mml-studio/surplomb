// What a manifest's faults say in English.
//
// A fault is the sentence that reaches whoever can fix it: the first one is
// printed under the plug field, all of them by `npm run dataset:manifest`, and
// the catalog test names them when a shipped file is wrong. So each one must
// still name the exact key and the exact requirement in English — “invalid”
// would be shorter and useless.
import test from 'node:test';
import assert from 'node:assert/strict';

import { datasetCredit, datasetManifestFaults, normalizeDatasetManifest } from './datasetManifest.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const faults = (locale, candidate) => withLocale(locale, () => datasetManifestFaults(candidate));

test('an empty candidate lists every missing key, in English', () => {
  const english = faults('en', {});
  assert.deepEqual(english, [
    '`id`: lowercase, digits and hyphens, 2 to 63 characters',
    '`label` missing',
    '`source` missing',
    '`attribution` missing — a dataset with no publisher and no license is not shown',
  ]);
  assertNoFrench(english);
  assert.ok(faults('fr', {}).includes('`label` manquant'));
});

test('a tabular source with no geometry says what the block may hold', () => {
  const english = faults('en', {
    id: 'x-y',
    label: 'X',
    source: { kind: 'csv', url: 'https://example.test/a.csv' },
    attribution: { publisher: 'P', licence: 'L' },
  });
  assert.deepEqual(english, [
    '`geometry`: a tabular source must say how a row becomes a point '
      + '({lon,lat} | {point} | {wkt} | {x,y,crs} | {geojson})',
  ]);
});

test('an enumeration prints its own values and needs no translation', () => {
  assert.ok(faults('en', { cadence: 'hourly' }).includes('`cadence`: live | periodic | static'));
  assert.ok(faults('fr', { cadence: 'hourly' }).includes('`cadence` : live | periodic | static'));
});

test('an indexed fault carries its index and the offending value', () => {
  const candidate = {
    id: 'x-y',
    label: 'X',
    source: { kind: 'geojson', url: 'https://example.test/a.geojson' },
    attribution: { publisher: 'P', licence: 'L' },
    feature: {
      group: { field: 'f', styles: { a: { color: '#ffffff' } } },
      filters: [{ id: 'all' }, { id: 'all', label: 'A', groups: ['zzz'] }],
    },
  };
  const english = faults('en', candidate);
  assert.ok(english.includes('`feature.filters[0].label` missing'));
  assert.ok(english.includes('`feature.filters[1].id`: “all” is a duplicate'));
  assert.ok(english.includes('`feature.filters[1].groups`: unknown group “zzz”'));
  assertNoFrench(english);
});

test('an unnamed “other” group and the credit line follow the page', () => {
  const manifest = normalizeDatasetManifest({
    id: 'x-y',
    label: 'X',
    source: { kind: 'geojson', url: 'https://example.test/a.geojson' },
    attribution: { publisher: 'P', licence: 'L' },
    feature: { group: { field: 'f', styles: { a: { color: '#ffffff' } }, other: { color: '#000000' } } },
  });
  // The label is resolved when the manifest is normalized, so the page that
  // normalizes is the page that names it.
  assert.equal(manifest.feature.group.other.label, 'Autre');
  const english = withLocale('en', () => normalizeDatasetManifest({
    id: 'x-y',
    label: 'X',
    source: { kind: 'geojson', url: 'https://example.test/a.geojson' },
    attribution: { publisher: 'P', licence: 'L' },
    feature: { group: { field: 'f', styles: { a: { color: '#ffffff' } }, other: { color: '#000000' } } },
  }));
  assert.equal(english.feature.group.other.label, 'Other');
  assert.match(withLocale('en', () => datasetCredit(manifest).html), /X: P \(L\)/);
  assert.match(datasetCredit(manifest).html, /X : P \(L\)/);
});
