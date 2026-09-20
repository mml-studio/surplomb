// What the box says when a registration cannot go through, in English.
//
// Only the first of these reaches a reader — `plug()` lets it out and the
// panel prints it — but a restore that fails silently is worse than a console
// line nobody reads, so all three are pinned.
import test from 'node:test';
import assert from 'node:assert/strict';

import { initDatasetBox } from './datasetBox.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const manifest = {
  id: 'defibrillateurs-geodae',
  label: 'Defibrillators',
  source: { kind: 'geojson', url: 'https://example.test/a.geojson' },
  attribution: { publisher: 'P', licence: 'L' },
};

function managerDouble() {
  const layers = new Map();
  return {
    layers,
    registerDataset: (layer) => { layers.set(layer.id, layer); },
    unregisterDataset: async () => true,
    setEnabled: async () => true,
    isEnabled: () => false,
    subscribe: () => () => {},
    getAll: () => [...layers.values()],
  };
}

const plugTwice = async () => {
  const box = initDatasetBox({ dataManager: managerDouble(), viewer: null, mountPanel: false, storage: null });
  await box.plug(manifest, { enable: false });
  try {
    await box.plug(manifest, { enable: false });
    return null;
  } catch (error) {
    return error.message;
  }
};

test('two manifests cannot share a layer id, and it says so in English', async () => {
  const english = await withLocale('en', plugTwice);
  assert.equal(english, 'A dataset “defibrillateurs-geodae” is already plugged in');
  assertNoFrench(english);
  assert.equal(await plugTwice(), 'Un jeu « defibrillateurs-geodae » est déjà branché');
});
