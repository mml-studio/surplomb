// What a broken `datasets/*.json` says at boot, in English.
//
// It never reaches the panel — the catalog test fails the build first — but it
// is addressed to whoever wrote the file, so it names the file and the faults
// rather than apologizing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCatalog } from './datasetsCatalog.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const good = {
  id: 'a-dataset',
  label: 'A dataset',
  source: { kind: 'geojson', url: 'https://example.test/a.geojson' },
  attribution: { publisher: 'P', licence: 'L' },
};

const warnings = (locale, raw) => {
  const said = [];
  withLocale(locale, () => normalizeCatalog(raw, (message) => said.push(message)));
  return said;
};

test('a manifest that does not validate is named with its faults', () => {
  const english = warnings('en', { '../../datasets/broken.json': { id: 'x' } });
  assert.equal(english.length, 1);
  assert.match(english[0], /^\[datasets\] \.\.\/\.\.\/datasets\/broken\.json skipped: /);
  assert.match(english[0], /`label` missing/);
  assertNoFrench(english);
  assert.match(warnings('fr', { '../../datasets/broken.json': { id: 'x' } })[0], /ignoré : /);
});

test('a duplicate id names the id it collided with', () => {
  const raw = { '../../datasets/a.json': good, '../../datasets/copy.json': { ...good } };
  assert.deepEqual(warnings('en', raw),
    ['[datasets] ../../datasets/copy.json skipped: id “a-dataset” already taken']);
  assert.deepEqual(warnings('fr', raw),
    ['[datasets] ../../datasets/copy.json ignoré : id « a-dataset » déjà pris']);
});
