// The card a clicked stretch of TomTom ribbon opens, the time the key prints,
// and the search that finds a stretch under a click without any pick id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLOW_CLICKABLE_RUNGS,
  buildFlowCard,
  flowClockTime,
  flowSegmentKey,
  flowSegmentMidpoint,
  nearestFlowStretch,
} from './trafficFlowCard.js';
import { CONGESTION_RUNGS } from './congestionLadder.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const NOON = Date.UTC(2026, 8, 21, 10, 16, 0); // 12:16 in Paris
const UTC = 'UTC';

// A stretch of the Quai de Bercy, two vertices ~220 m apart.
const quai = {
  coords: [[2.3780, 48.8380], [2.3805, 48.8365]],
  trafficLevel: 0.62,
  roadType: 'Major road',
  closure: false,
  fetchedAt: NOON - 95_000,
};

test('the card names the road class, the rung, the ratio that earned it, and when', () => {
  const card = withLocale('fr', () => buildFlowCard(quai, { now: NOON, timeZone: UTC }));
  assert.equal(card.title, 'Grand axe');
  assert.deepEqual(card.details, [
    '● Ralenti',
    'roule à 62 % de sa vitesse sans trafic',
    'reçu de TomTom à 10:14',
    'les véhicules qui y roulent sont simulés',
  ]);
  assert.equal(card.accent, CONGESTION_RUNGS.slow.color);
  assert.equal(card.rung, 'slow');
});

test('no km/h is ever printed: TomTom sends a ratio, not a speed', () => {
  const card = withLocale('fr', () => buildFlowCard({ ...quai, trafficLevel: 0.3 }, { now: NOON, timeZone: UTC }));
  assert.ok(!card.details.some((line) => /km\/h/.test(line)));
  assert.equal(card.details[0], '● Bloqué');
});

test('a closed stretch says so instead of a ratio of zero', () => {
  const card = withLocale('fr', () => buildFlowCard({ ...quai, closure: true, trafficLevel: 0 }, { now: NOON, timeZone: UTC }));
  assert.equal(card.details[0], '● Route fermée');
  assert.equal(card.details[1], 'TomTom signale ce tronçon fermé');
  assert.ok(!card.details.some((line) => /0 %/.test(line)));
  assert.equal(card.rung, 'closure');
});

test('an unknown or hostile road class falls back to a plain word', () => {
  const unknown = withLocale('fr', () => buildFlowCard({ ...quai, roadType: 'Hovercraft lane' }, { now: NOON }));
  const hostile = withLocale('fr', () => buildFlowCard({ ...quai, roadType: 'constructor' }, { now: NOON }));
  assert.equal(unknown.title, 'Tronçon');
  assert.equal(hostile.title, 'Tronçon');
});

test('the card in English', () => {
  const card = withLocale('en', () => buildFlowCard(quai, { now: NOON, timeZone: UTC }));
  assertNoFrench(card.details);
  assert.equal(card.title, 'Major road');
  assert.equal(card.details[1], 'moving at 62% of its free-flow speed');
  // English keeps its own clock (10:14 AM); only the words are pinned here.
  assert.match(card.details[2], /^received from TomTom at 10:14/);
});

test('the clock time carries a day as soon as it is not today', () => {
  assert.deepEqual(
    withLocale('fr', () => flowClockTime(NOON - 60_000, { now: NOON, timeZone: UTC })),
    { time: '10:15', day: null },
  );
  const yesterday = withLocale('fr', () => flowClockTime(NOON - 20 * 3_600_000, { now: NOON, timeZone: UTC }));
  assert.equal(yesterday.time, '14:16');
  assert.match(yesterday.day, /^20 sept\.?$/);
  // A budget-stale tile from yesterday says so on the card.
  const card = withLocale('fr', () => buildFlowCard(
    { ...quai, fetchedAt: NOON - 20 * 3_600_000 },
    { now: NOON, timeZone: UTC },
  ));
  assert.match(card.details[2], /^reçu de TomTom le 20 sept\.? à 14:16$/);
  assert.equal(flowClockTime(Number.NaN, { now: NOON }), null);
});

test('a stretch keeps its identity across a re-decode, and only then', () => {
  const again = { ...quai, coords: quai.coords.map((point) => [...point]), trafficLevel: 0.9 };
  assert.equal(flowSegmentKey(again), flowSegmentKey(quai));
  assert.notEqual(flowSegmentKey({ ...quai, roadType: 'Motorway' }), flowSegmentKey(quai));
  assert.equal(flowSegmentKey({ coords: [[2, 48]] }), null);
});

test('the card stands halfway ALONG the stretch, not at its vertex mean', () => {
  // An L: 100 units east then 10 north. The vertex mean sits off the road;
  // halfway along is on the first leg.
  const mid = flowSegmentMidpoint([[0, 0], [0.001, 0], [0.001, 0.0001]]);
  assert.ok(Math.abs(mid.lat) < 1e-12, `on the first leg, got lat ${mid.lat}`);
  assert.ok(mid.lon > 0.0005 && mid.lon < 0.00056, `lon ${mid.lon}`);
});

test('a click finds the coloured stretch under it, within its drawn width', () => {
  const record = { segment: quai, style: { bucket: 'slow', width: 5 } };
  const other = { segment: { ...quai, coords: [[2.3700, 48.8400], [2.3710, 48.8410]] }, style: { bucket: 'jam', width: 6 } };
  const mid = flowSegmentMidpoint(quai.coords);
  // 1 m per pixel: reach is 2.5 + 6 px = 8.5 m either side.
  assert.equal(nearestFlowStretch(mid, [other, record], 1), record);
  const aside = { lon: mid.lon, lat: mid.lat + 7 / 110_574 };
  assert.equal(nearestFlowStretch(aside, [record], 1), record, '7 m off the centreline still hits');
  const far = { lon: mid.lon, lat: mid.lat + 20 / 110_574 };
  assert.equal(nearestFlowStretch(far, [record], 1), null, '20 m off does not');
  // Zoomed out, a pixel is 5 m, so the same 20 m is inside the reach.
  assert.equal(nearestFlowStretch(far, [record], 5), record);
});

test('free flow does not answer a click: the thread under most streets is the map', () => {
  assert.deepEqual([...FLOW_CLICKABLE_RUNGS], ['slow', 'jam', 'closure']);
  const free = { segment: { ...quai, trafficLevel: 1 }, style: { bucket: 'free', width: 2 } };
  assert.equal(nearestFlowStretch(flowSegmentMidpoint(quai.coords), [free], 1), null);
});
