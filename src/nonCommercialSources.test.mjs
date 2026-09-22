import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NONCOMMERCIAL_SOURCES,
  NONCOMMERCIAL_SOURCES_VAR,
  SWITCHABLE_LAYER_IDS,
  creditKeysOf,
  isSourceOn,
  layerIdsOf,
  nonCommercialSourcesAllowed,
  offSourcesFromProbe,
  sourcesOff,
} from './nonCommercialSources.js';
import { DATA_CREDITS } from './data/dataCredits.js';
import { LAYER_MANIFEST } from './data/layerManifest.js';

const ALL_IDS = NONCOMMERCIAL_SOURCES.map((source) => source.id);

const env = (value) => ({ [NONCOMMERCIAL_SOURCES_VAR]: value });

test('a clone keeps the sources: unset, empty and `on` all allow them', () => {
  for (const value of [undefined, '', '  ', 'on', 'ON', ' On ']) {
    assert.equal(nonCommercialSourcesAllowed(env(value)), true, JSON.stringify(value));
    assert.deepEqual(sourcesOff(env(value)), []);
    assert.equal(isSourceOn('open-meteo', env(value)), true);
    assert.equal(isSourceOn('opensky', env(value)), true);
  }
  assert.equal(nonCommercialSourcesAllowed({}), true);
});

test('`off` turns every listed source off, and a typo errs on the licence side', () => {
  for (const value of ['off', 'OFF', ' off ', 'of', 'false', '0']) {
    assert.equal(nonCommercialSourcesAllowed(env(value)), false, JSON.stringify(value));
    assert.deepEqual(sourcesOff(env(value)), ALL_IDS);
    for (const id of ALL_IDS) assert.equal(isSourceOn(id, env(value)), false, id);
  }
});

test('a source that is not on the list is never this switch\'s business', () => {
  assert.equal(isSourceOn('gdelt', env('off')), true);
  assert.equal(isSourceOn('nominatim', env('off')), true);
});

test('the list holds the sources the hosted site does not use, each one well-formed line', () => {
  for (const id of ['open-meteo', 'esri-world-imagery', 'opensky', 'google-news', 'google-street-view', 'telegeography']) {
    assert.ok(ALL_IDS.includes(id), `${id} is on the list`);
  }
  const ids = new Set();
  for (const source of NONCOMMERCIAL_SOURCES) {
    assert.match(source.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(source.id), `${source.id} is listed twice`);
    ids.add(source.id);
    assert.ok(source.name.trim());
    assert.match(source.terms, /^https:\/\//);
    assert.ok(['non-commercial', 'display-terms'].includes(source.reason), `${source.id} reason ${source.reason}`);
    assert.ok(Object.isFrozen(source) && Object.isFrozen(source.credits) && Object.isFrozen(source.layers));
  }
  assert.ok(Object.isFrozen(NONCOMMERCIAL_SOURCES));
});

test('every credit a source names exists in the attribution list, so withdrawing it is not a no-op', () => {
  const keys = new Set(DATA_CREDITS.map((credit) => credit.key));
  for (const source of NONCOMMERCIAL_SOURCES) {
    assert.ok(source.credits.length > 0, `${source.id} names no credit`);
    for (const key of source.credits) assert.ok(keys.has(key), `${source.id} names unknown credit ${key}`);
  }
  assert.deepEqual(creditKeysOf(['open-meteo']), ['open-meteo']);
  assert.deepEqual(creditKeysOf(['opensky', 'open-meteo']), ['open-meteo', 'opensky']);
  assert.deepEqual(creditKeysOf(['google-news']), ['google-news-rss']);
  assert.deepEqual(creditKeysOf(['google-street-view']), ['google-street-view']);
  assert.deepEqual(creditKeysOf(['telegeography']), ['telegeography']);
  assert.deepEqual(creditKeysOf([]), []);
  assert.deepEqual(creditKeysOf(['unknown']), []);
});

test('a source that is not non-commercial says why it is on the list', () => {
  const byId = new Map(NONCOMMERCIAL_SOURCES.map((source) => [source.id, source]));
  assert.equal(byId.get('google-street-view').reason, 'display-terms');
  for (const id of ['open-meteo', 'google-news', 'telegeography']) assert.equal(byId.get(id).reason, 'non-commercial', id);
});

test('the layers a source feeds are real rows, and only the cable map withholds one', () => {
  const layerIds = new Set(LAYER_MANIFEST.map((layer) => layer.id));
  for (const id of SWITCHABLE_LAYER_IDS) assert.ok(layerIds.has(id), `${id} is a registered layer`);
  assert.deepEqual(layerIdsOf(['telegeography']), ['telegeography-submarine-cables']);
  assert.deepEqual(layerIdsOf(['open-meteo', 'google-news', 'google-street-view']), []);
  assert.deepEqual(layerIdsOf(ALL_IDS), ['telegeography-submarine-cables']);
  assert.deepEqual(layerIdsOf([]), []);
});

test('the page withholds the layers of the sources the probe says are off, and holds early requests for the answer', () => {
  const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  assert.match(main, /dataManager\.withholdLayers\(layerIdsOf\(offSourcesFromProbe\(probe\)\)\)/);
  // A share link restored before the probe answers must wait for it, bounded.
  assert.match(main, /SWITCHABLE_LAYER_IDS\.includes\(change\.layerId\)/);
  assert.match(main, /await Promise\.race\(\[withholding, new Promise\(\(resolve\) => \{ setTimeout\(resolve, 5_000\); \}\)\]\)/);
  // Credits for every off source, and the two cockpit surfaces.
  assert.match(main, /withdrawDataCredits\(viewer, creditKeysOf\(off\)\)/);
  assert.match(main, /off\.has\('google-news'\)/);
});

test('the page reads the probe defensively: a failed or foreign answer is a clone', () => {
  assert.deepEqual([...offSourcesFromProbe({ sourcesOff: ['open-meteo'] })], ['open-meteo']);
  for (const probe of [null, undefined, 'off', [], {}, { sourcesOff: 'open-meteo' }, { sourcesOff: null }]) {
    assert.equal(offSourcesFromProbe(probe).size, 0, JSON.stringify(probe));
  }
  // An id a newer server knows and this page does not is ignored, not trusted.
  assert.deepEqual([...offSourcesFromProbe({ sourcesOff: ['open-meteo', 'future-source', 42] })], ['open-meteo']);
});
