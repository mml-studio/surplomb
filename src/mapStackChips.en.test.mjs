// The basemap tray in English.
//
// Six of the eight chips are brand names and do not move; the three that
// describe their CONTENT do — and the glossary's *IGN map (Plan IGN)* is why
// the French « Plan IGN » becomes « IGN map » on a chip 60 px wide.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mapStackChipModel, mapStackChipModels, mapStackLockNote } from './mapStackChips.js';
import { MAP_STACKS } from './mapStackController.js';
import { withLocale } from './i18n/testing.js';

const stacks = () => MAP_STACKS.map((stack) => ({
  id: stack.id,
  label: stack.label,
  coverageNote: stack.coverageNote,
  available: true,
  requiresIon: stack.requiresIon,
}));

test('the tray names its sources in English, and leaves the brands alone', () => {
  const labels = withLocale('en', () => mapStackChipModels(stacks(), 'photoreal').map((chip) => chip.label));
  assert.deepEqual(labels, [
    'Google 3D', 'Google map', 'Google terrain', 'Bing Aerial', 'Bing Labels', 'OSM', 'Satellite', 'IGN map',
  ]);
  const french = mapStackChipModels(stacks(), 'photoreal').map((chip) => chip.label);
  assert.deepEqual(french, [
    'Google 3D', 'Plan Google', 'Relief Google', 'Bing Aerial', 'Bing Labels', 'OSM', 'Satellite', 'Plan IGN',
  ]);
});

test('the phone tray keeps its short forms in both', () => {
  const short = (id) => MAP_STACKS.find((stack) => stack.id === id).shortLabel;
  assert.equal(withLocale('en', () => short('google-roadmap')), 'Map G');
  assert.equal(short('google-roadmap'), 'Plan G');
  assert.equal(withLocale('en', () => short('ign-plan')), 'Map');
  assert.equal(short('ign-plan'), 'Plan');
  assert.equal(withLocale('en', () => short('osm')), 'OSM');
});

test('a chip that cannot be picked says why, the same way in both languages', () => {
  const unavailable = { id: 'bing-aerial', label: 'Bing Aerial', available: false, requiresIon: true };
  const model = withLocale('en', () => mapStackChipModel(unavailable, 'osm'));
  assert.equal(model.unavailableHint, 'Cesium ion token required');
  assert.equal(model.requirement, 'ION');
  assert.equal(mapStackChipModel(unavailable, 'osm').unavailableHint, 'Cesium ion token required');
  const partial = withLocale('en', () => mapStackChipModel(
    { id: 'ign-plan', label: 'IGN map', available: true, coverageNote: 'metropolitan France only' },
    'osm',
  ));
  assert.equal(partial.title, 'IGN map — metropolitan France only');
});

test('a layer holding the globe says so in English, naming itself', () => {
  const lock = { stackId: 'ign-ortho', rowId: 'local-datacenters', rowLabel: 'Digital infrastructure' };
  assert.equal(
    withLocale('en', () => mapStackLockNote(lock, stacks())),
    'Satellite is set by Digital infrastructure: the other map sources are not available with this layer.',
  );
});
