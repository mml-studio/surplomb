// The hand-off's arithmetic: the loop's camera law and the hash it becomes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HERO_STATE_PARAMS, heroOrbit, heroShareHash, orbitHeadingDeg } from './handoff.js';
import { HERO_LOOP } from './heroLoop.js';

const ORBIT = {
  centerLat: 48.8345,
  centerLon: 2.2633,
  centerHeight: 70,
  rangeM: 620,
  pitchDeg: -60,
  headingStartDeg: 350,
  amplitudeDeg: 8,
  periodS: 18,
  law: 'cosine',
};

test('the orbit is read only when it is complete', () => {
  assert.equal(heroOrbit('desktop', { videos: { desktop: { orbit: ORBIT } } }), ORBIT);
  assert.equal(heroOrbit('desktop', { videos: {} }), null);
  assert.equal(heroOrbit('desktop', { videos: { desktop: { orbit: { ...ORBIT, law: 'linear' } } } }), null);
  assert.equal(heroOrbit('desktop', { videos: { desktop: { orbit: { ...ORBIT, rangeM: undefined } } } }), null);
  assert.equal(heroOrbit('desktop', { videos: { desktop: { orbit: { ...ORBIT, periodS: 0 } } } }), null);
});

test('the heading goes out and comes back over one period', () => {
  assert.equal(orbitHeadingDeg(ORBIT, 0), 350);
  assert.ok(Math.abs(orbitHeadingDeg(ORBIT, 9) - 358) < 1e-9, 'half-way is the far end');
  assert.ok(Math.abs(orbitHeadingDeg(ORBIT, 18) - 350) < 1e-9, 'a full period is the start again');
  assert.ok(Math.abs(orbitHeadingDeg(ORBIT, 18 + 9) - 358) < 1e-9, 'the clock wraps');
  // A clock that is not a number yet (metadata not loaded) is the first frame.
  assert.equal(orbitHeadingDeg(ORBIT, Number.NaN), 350);
});

test('the hash carries the hero state and the full-precision pose', () => {
  const hash = heroShareHash({ lat: 48.83001234, lon: 2.26504321, alt: 612.25, heading: 351.5, pitch: -59.9, roll: 0 });
  const params = new URLSearchParams(hash.slice(1));
  assert.equal(params.get('lat'), '48.83001234');
  assert.equal(params.get('lon'), '2.26504321');
  assert.equal(params.get('alt'), '612.25');
  for (const [key, value] of Object.entries(HERO_STATE_PARAMS)) assert.equal(params.get(key), value, key);
  // Tokens that exist: t = traffic, 8 = road events (src/data/layerState.js).
  assert.equal(params.get('l'), 't.8');
});

test('the shipped loop record has the shape the hand-off reads', () => {
  const record = HERO_LOOP;
  assert.equal(typeof record.videos, 'object');
  for (const kind of Object.keys(record.videos)) {
    assert.ok(heroOrbit(kind, record), `${kind} orbit is incomplete`);
  }
});
