// What a plugged dataset says when it cannot be read, in English.
//
// Every one of these reaches the reader: the message of a `DatasetSourceError`
// is what `datasetLayer.js` puts on the row and what the dataset box prints
// under the URL the reader pasted. A code would have been cheaper and useless.
import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchDatasetText, featuresFromGeoJson, loadDatasetFeatures } from './datasetSources.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const message = async (locale, run) => {
  try {
    await withLocale(locale, run);
    return null;
  } catch (error) {
    return error.message;
  }
};

test('a source that answers nothing says so in English', async () => {
  const dead = () => fetchDatasetText('https://example.invalid/data.json', {
    fetchImpl: async () => { throw new Error('network'); },
    relay: null,
  });
  assert.equal(await message('en', dead), 'source unreachable');
  assert.equal(await message('fr', dead), 'source inaccessible');
});

test('a response that is not GeoJSON says what was expected', () => {
  const notGeoJson = () => featuresFromGeoJson({ type: 'Topology' });
  assert.throws(() => withLocale('en', notGeoJson),
    { message: 'not GeoJSON (a FeatureCollection was expected)' });
  assert.throws(notGeoJson, /FeatureCollection attendue/);
});

test('an oversized answer names the cap, in English units', async () => {
  const huge = () => fetchDatasetText('https://example.test/big.json', {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => (name === 'content-length' ? String(64 * 1048576) : null) },
      text: async () => '',
    }),
    relay: null,
    maxBytes: 25 * 1048576,
  });
  const english = await message('en', huge);
  assert.equal(english, 'file too large (64 MB, cap 25 MB)');
  assertNoFrench(english);
  assert.equal(await message('fr', huge), 'fichier trop volumineux (64 Mo, plafond 25 Mo)');
});

test('a manifest naming a source kind nobody loads says which one', async () => {
  const unknown = () => loadDatasetFeatures({ source: { kind: 'wms' } }, {});
  assert.equal(await message('en', unknown), 'unknown source: wms');
  assert.equal(await message('fr', unknown), 'source inconnue : wms');
});
