// The catchment area in English: the three mode chips, the ring key, the
// centre card, and every caveat the cycling envelope owes a reader.
//
// The layer's honesty rests on two refusals, and both have to survive the
// translation: an ENVELOPE is an upper bound and says so wherever it is drawn,
// and the equivalent circle is printed only to be refused ("but it is not a
// circle"). A number arrives already formatted, which is why the English says
// `2.16 km²` where the French says `2,16 km²`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ISOCHRONE_MODES,
  centreCardText,
  envelopeSentences,
  expansionDigest,
  expansionSentence,
  minutesLabel,
  modeVerb,
} from './isochroneRings.js';
import { formatCoordinates } from './isochroneFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

// Datasets and services keep their names inside English text.
const NAMES = ['BD TOPO', 'Géoplateforme', 'Rue de la Ré', 'Lyon'];

test('the three modes name what they are cut from, and which is an envelope', () => {
  const chips = withLocale('en', () => ISOCHRONE_MODES.map(({ id, label, blurb }) => ({ id, label, blurb })));
  assertNoFrench(chips, { allow: NAMES });
  assert.deepEqual(chips.map((chip) => chip.label), ['ON FOOT', 'BY CAR', 'BY BIKE']);
  assert.equal(chips[0].blurb, 'Walking, on BD TOPO’s pedestrian and road network. Exact polygon.');
  assert.match(chips[2].blurb, /^Cycling, on the OSM cycle network \(OSRM\): IGN publishes no cycling profile\./);
  assert.match(chips[2].blurb, /Upper-bound area\.$/);
  assert.equal(withLocale('fr', () => ISOCHRONE_MODES[2].label), 'VÉLO');
});

test('minutes and the verb that goes with a mode', () => {
  assert.equal(withLocale('en', () => minutesLabel(900)), '15 min');
  assert.deepEqual(
    withLocale('en', () => ['foot', 'bike', 'car'].map((mode) => modeVerb(mode))),
    ['on foot', 'by bike', 'by car'],
  );
  assert.equal(withLocale('fr', () => modeVerb('bike')), 'à vélo');
});

test('the expansion sentence says what the percentage is a percentage OF', () => {
  const braking = { fromSeconds: 300, toSeconds: 600, ratio: 3.36, freeSpaceRatio: 4, share: 83.9 };
  const opening = { fromSeconds: 600, toSeconds: 900, ratio: 2.3, freeSpaceRatio: 2.25, share: 102.1 };
  const en = withLocale('en', () => ({
    braking: expansionSentence(braking),
    opening: expansionSentence(opening),
    digest: expansionDigest([braking, opening]),
  }));
  assertNoFrench(en);
  assert.equal(en.braking, '5 min → 10 min: 83.9% of free expansion (×3.36 instead of ×4) — the network holds it back');
  assert.equal(en.opening, '10 min → 15 min: 102.1% of free expansion — the network opens up beyond');
  assert.equal(en.digest, '84% then 102% of free expansion — the network opens up');
  assert.match(withLocale('fr', () => expansionSentence(braking)), /le réseau freine$/);
});

test('an envelope owes four caveats, and gets all four in English', () => {
  const ring = {
    envelope: true,
    bearings: 36,
    reachKm: { min: 1.2, max: 4.1, median: 2.8 },
    clippedBearings: 3,
  };
  const lines = withLocale('en', () => envelopeSentences(ring));
  assertNoFrench(lines, { allow: NAMES });
  assert.deepEqual(lines, [
    'envelope over 36 bearings — upper-bound area, not the exact one',
    'measured reach from 1.2 to 4.1 km (median 2.8 km)',
    '3 bearings beyond the sampling — that reach is a floor',
    'OpenStreetMap cycle network through OSRM (FOSSGIS) — not BD TOPO',
  ]);
  // An exact polygon says nothing, in either language.
  assert.deepEqual(withLocale('en', () => envelopeSentences({ envelope: false })), []);
  assert.match(withLocale('fr', () => envelopeSentences(ring))[0], /^enveloppe sur 36 directions/);
});

test('the centre card: what the shape is, how big, and the circle it refuses', () => {
  const payload = {
    rings: [
      { seconds: 300, areaKm2: 0.28 },
      { seconds: 600, areaKm2: 0.94 },
      { seconds: 900, areaKm2: 2.16 },
    ],
    expansion: [
      { fromSeconds: 300, toSeconds: 600, ratio: 3.36, freeSpaceRatio: 4, share: 83.9 },
    ],
    address: { label: 'Rue de la Ré, Lyon', distanceM: 12 },
  };
  const card = withLocale('en', () => centreCardText({
    payload, mode: 'foot', point: { lon: 4.8357, lat: 45.764, pinned: true },
  }));
  assertNoFrench(card, { allow: NAMES });
  assert.equal(card.title, 'Rue de la Ré, Lyon');
  assert.equal(card.details[0], 'Catchment area on foot around this point');
  assert.equal(card.details[1], '5 min 0.28 km², 10 min 0.94 km², 15 min 2.16 km²');
  assert.match(card.details[2], /^the same area as a disc of \d+ m radius$/);
  assert.equal(card.details.at(-1), 'center pinned by this click — RELEASE to hand it back');
  // Following the camera instead, and a service that returned nothing.
  const following = withLocale('en', () => centreCardText({
    payload: { rings: [], missing: 2, envelope: true },
    mode: 'bike',
    point: { lon: 4.8357, lat: 45.764 },
  }));
  assertNoFrench(following, { allow: NAMES });
  assert.equal(following.details[1], 'no ring returned by the service');
  assert.ok(following.details.includes('2 rings not returned by the service'));
  assert.ok(following.details.some((line) => /^OSM envelope, \d+ bearings — upper-bound area$/.test(line)));
  assert.equal(following.details.at(-1), 'center follows the camera — click to pin it');
  // French, unchanged.
  assert.equal(
    withLocale('fr', () => centreCardText({ payload, mode: 'foot', point: { lon: 4.8357, lat: 45.764, pinned: true } })).details[0],
    'Zone de chalandise à pied autour de ce point',
  );
});

test('a point with no address at all falls back to its coordinate', () => {
  const en = withLocale('en', () => formatCoordinates(-1.5536, 47.2184));
  assertNoFrench(en);
  assert.equal(en, '47.2184 N · 1.5536 W');
  assert.equal(withLocale('fr', () => formatCoordinates(-1.5536, 47.2184)), '47,2184 N · 1,5536 O');
});
