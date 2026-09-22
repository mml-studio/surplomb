import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NONCOMMERCIAL_SOURCES,
  NONCOMMERCIAL_SOURCES_VAR,
  creditKeysOf,
  isSourceOn,
  nonCommercialSourcesAllowed,
  offSourcesFromProbe,
  sourcesOff,
} from './nonCommercialSources.js';
import { DATA_CREDITS } from './data/dataCredits.js';

const env = (value) => ({ [NONCOMMERCIAL_SOURCES_VAR]: value });

test('a clone keeps the sources: unset, empty and `on` all allow them', () => {
  for (const value of [undefined, '', '  ', 'on', 'ON', ' On ']) {
    assert.equal(nonCommercialSourcesAllowed(env(value)), true, JSON.stringify(value));
    assert.deepEqual(sourcesOff(env(value)), []);
    assert.equal(isSourceOn('open-meteo', env(value)), true);
  }
  assert.equal(nonCommercialSourcesAllowed({}), true);
});

test('`off` turns every listed source off, and a typo errs on the licence side', () => {
  for (const value of ['off', 'OFF', ' off ', 'of', 'false', '0']) {
    assert.equal(nonCommercialSourcesAllowed(env(value)), false, JSON.stringify(value));
    assert.deepEqual(sourcesOff(env(value)), ['open-meteo', 'esri-world-imagery']);
    assert.equal(isSourceOn('open-meteo', env(value)), false);
    assert.equal(isSourceOn('esri-world-imagery', env(value)), false);
  }
});

test('a source that is not on the list is never this switch\'s business', () => {
  assert.equal(isSourceOn('gdelt', env('off')), true);
  assert.equal(isSourceOn('nominatim', env('off')), true);
});

test('Open-Meteo and the anonymous Esri endpoint are the members, and each is one well-formed line', () => {
  assert.deepEqual(NONCOMMERCIAL_SOURCES.map((source) => source.id), ['open-meteo', 'esri-world-imagery']);
  const ids = new Set();
  for (const source of NONCOMMERCIAL_SOURCES) {
    assert.match(source.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(source.id), `${source.id} is listed twice`);
    ids.add(source.id);
    assert.ok(source.name.trim());
    assert.match(source.terms, /^https:\/\//);
    assert.ok(Object.isFrozen(source) && Object.isFrozen(source.credits));
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
  assert.deepEqual(creditKeysOf([]), []);
  assert.deepEqual(creditKeysOf(['unknown']), []);
});

test('the page reads the probe defensively: a failed or foreign answer is a clone', () => {
  assert.deepEqual([...offSourcesFromProbe({ sourcesOff: ['open-meteo'] })], ['open-meteo']);
  for (const probe of [null, undefined, 'off', [], {}, { sourcesOff: 'open-meteo' }, { sourcesOff: null }]) {
    assert.equal(offSourcesFromProbe(probe).size, 0, JSON.stringify(probe));
  }
  // An id a newer server knows and this page does not is ignored, not trusted.
  assert.deepEqual([...offSourcesFromProbe({ sourcesOff: ['open-meteo', 'future-source', 42] })], ['open-meteo']);
});
