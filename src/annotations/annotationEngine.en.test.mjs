// The label a drawn route carries, in English.
//
// The French version of this test (`annotationEngine.test.mjs`, “a route label
// reads in French”) pins the decimal comma and the mode after the time. This
// one pins the same claims in English — and, above all, that a straight line
// is never labelled with a travel time nobody computed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeRouteLabel } from './annotationEngine.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

useTestLocale('en');

test('a routed itinerary carries its distance, its time and how it is travelled', () => {
  assert.equal(composeRouteLabel('Office', 4300, 3120, 'walk', false), 'Office — 4.3 km · 52 min on foot');
  assert.equal(composeRouteLabel('', 4300, 3120, 'bike', false), '4.3 km · 52 min by bike');
  assert.equal(composeRouteLabel('', 4300, 3120, 'car', false), '4.3 km · 52 min by car');
  assert.equal(composeRouteLabel('', 540, 600, 'walk', false), '540 m · 10 min on foot');
  assert.equal(composeRouteLabel('', 24800, 1500, 'car', false), '25 km · 25 min by car', 'no decimal past 10 km');
  assertNoFrench(composeRouteLabel('Office', 4300, 3120, 'walk', false));
});

test('a straight line says so, and claims no travel time', () => {
  const label = composeRouteLabel('Office', 4300, 3120, 'walk', true);
  assert.equal(label, 'Office — 4.3 km · as the crow flies, no route');
  assert.doesNotMatch(label, /min/, 'routing was unavailable: there is no time to report');
  assertNoFrench(label);
});

test('the decimal separator follows the language, and the digits do not move', () => {
  assert.equal(withLocale('fr', () => composeRouteLabel('', 4300, 3120, 'walk', false)),
    '4,3 km · 52 min à pied');
  assert.equal(withLocale('fr', () => composeRouteLabel('', 4300, 3120, 'walk', true)),
    '4,3 km · à vol d’oiseau, sans itinéraire');
  // A route long enough to be grouped keeps the bytes the module printed:
  // neither language inserts a separator in a kilometre count.
  assert.equal(withLocale('fr', () => composeRouteLabel('', 1_240_000, null, 'car', false)), '1240 km');
  assert.equal(composeRouteLabel('', 1_240_000, null, 'car', false), '1240 km');
});

test('a distance that is not a number leaves the caller’s label alone', () => {
  assert.equal(composeRouteLabel('Office', null, 600, 'walk', false), 'Office');
  assert.equal(composeRouteLabel('', Number.NaN, 600, 'walk', false), '');
});
