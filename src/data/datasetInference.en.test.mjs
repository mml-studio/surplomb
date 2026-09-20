// The notes a draft owes its reader, in English.
//
// A draft looks finished; the notes are the half of it that is not a promise.
// They must survive translation intact: which licence was read and from where,
// which geometry was guessed and on what evidence, which resource was picked
// out of how many. The licence written INTO the manifest does not move — it is
// persisted and exported — and this file pins that too.
import test from 'node:test';
import assert from 'node:assert/strict';

import { inferDatasetManifest, licenceLabel } from './datasetInference.js';
import { LICENCE_DISPLAY } from './datasetInference.i18n.js';
import { DatasetSourceError } from './datasetSources.js';
import { labelFor } from '../i18n/messages.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const response = (body, { status = 200 } = {}) => ({
  ok: status < 300,
  status,
  headers: { get: () => null },
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

const routed = (routes) => async (url) => {
  for (const [match, answer] of routes) {
    if (url.startsWith(match)) return typeof answer === 'function' ? answer(url) : answer;
  }
  return response({ error: 'no route' }, { status: 404 });
};

test('a guessed geometry says what it read and asks to be checked', async () => {
  const fetchImpl = routed([
    ['https://www.data.gouv.fr/api/2/datasets/resources/', response({
      resource: { id: 'edb6a9e1-2f16-4bbf-99e7-c3eb6b90794c', title: 'Points', format: 'csv', url: 'https://x.test/a.csv' },
    })],
    ['https://tabular-api.data.gouv.fr/api/resources/', (url) => (url.includes('/profile')
      ? response({ profile: { header: ['c_long_coor1', 'c_lat_coor1', 'c_nom'], total_lines: 186118 } })
      : response({ data: [{ c_long_coor1: '4.85', c_lat_coor1: '45.75', c_nom: 'A' }] }))],
  ]);
  const draft = await withLocale('en', () => inferDatasetManifest(
    'edb6a9e1-2f16-4bbf-99e7-c3eb6b90794c', { fetchImpl, relay: null },
  ));
  assert.deepEqual(draft.notes, [
    'License read from the platform — confirm it on the dataset’s own page before reusing anything.',
    'Geometry inferred: columns c_long_coor1 / c_lat_coor1 (by name resemblance, values in degrees). '
      + 'Check it before plugging in.',
  ]);
  assertNoFrench(draft.notes);
});

test('a bare file says which two facts are missing, in English', async () => {
  const fetchImpl = routed([['https://x.test/a.geojson', response('{}')]]);
  const draft = await withLocale('en', () => inferDatasetManifest('https://x.test/a.geojson', { fetchImpl, relay: null }));
  assert.deepEqual(draft.notes, ['Publisher and license unknown for a bare file: fill them in.']);
  // The value stored in the manifest is data: it does not move with the page.
  assert.equal(draft.manifest.attribution.licence, 'à confirmer');
  assert.equal(withLocale('en', () => labelFor(LICENCE_DISPLAY, 'à confirmer')), 'to be confirmed');
  assert.equal(labelFor(LICENCE_DISPLAY, 'à confirmer'), 'à confirmer');
});

test('an address nobody can read is refused in the reader’s language', async () => {
  const refused = async (locale) => {
    try {
      await withLocale(locale, () => inferDatasetManifest('not a url at all !', { fetchImpl: async () => response('{}'), relay: null }));
      return null;
    } catch (error) {
      assert.ok(error instanceof DatasetSourceError);
      return error.message;
    }
  };
  assert.equal(await refused('en'),
    'address not recognized: a data.gouv.fr page, an Opendatasoft portal, WFS, GeoJSON or CSV');
  assert.equal(await refused('fr'),
    'adresse non reconnue : page data.gouv.fr, portail Opendatasoft, WFS, GeoJSON ou CSV');
});

test('the licence a platform publishes is stored once, whatever the page', () => {
  assert.equal(withLocale('en', () => licenceLabel('notspecified')), 'non précisée');
  assert.equal(withLocale('en', () => licenceLabel('lov2')), 'Licence Ouverte 2.0');
  assert.equal(withLocale('en', () => labelFor(LICENCE_DISPLAY, 'non précisée')), 'not specified');
  assert.equal(withLocale('en', () => labelFor(LICENCE_DISPLAY, 'Licence Ouverte 2.0')), 'Licence Ouverte 2.0');
});
