// The four facts under a shortlist candidate, in English.
//
// The count is the fact that separates one town's nineteen points from a
// national base of 186,118, so its grouping must follow the page: a French
// reader gets 186 118 and an English one 186,118, and neither gets the raw
// digits. Freshness stays as coarse in English as in French, on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';

import { blockerLabel, candidateFacts, formatObjectCount, freshnessLabel } from './datasetSearch.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const NOW = Date.parse('2026-09-09T12:00:00Z');

test('a count is grouped the way the page groups numbers', () => {
  assert.equal(withLocale('en', () => formatObjectCount(186118)), '186,118');
  assert.equal(formatObjectCount(186118), '186 118');
  assert.equal(withLocale('en', () => formatObjectCount(0)), '0');
});

test('freshness is coarse in English too, and says when a register stopped', () => {
  const english = (at) => withLocale('en', () => freshnessLabel(at, NOW));
  assert.equal(english('2026-09-09T09:00:00Z'), 'updated today');
  assert.equal(english('2026-09-08T09:00:00Z'), 'updated yesterday');
  assert.equal(english('2026-09-05T12:00:00Z'), 'updated 4 days ago');
  assert.equal(english('2026-08-19T12:00:00Z'), 'updated 3 weeks ago');
  assert.equal(english('2026-06-09T12:00:00Z'), 'updated 3 months ago');
  assert.equal(english('2019-09-20T12:00:00Z'), 'frozen for 7 years');
  assertNoFrench([english('2026-09-05T12:00:00Z'), english('2019-09-20T12:00:00Z')]);
});

test('the fact line reads as one row in English', () => {
  const facts = withLocale('en', () => candidateFacts({
    total: 186118,
    publisher: 'Atlasanté',
    lastUpdate: '2026-09-01T00:00:00Z',
    licence: 'Licence Ouverte 2.0',
  }, NOW));
  assert.deepEqual(facts, ['186,118 features', 'Atlasanté', 'updated 1 week ago', 'Licence Ouverte 2.0']);
  assertNoFrench(facts, { allow: ['Atlasanté'] });
});

test('a fault becomes one English phrase whichever language raised it', () => {
  // The fault arrives already translated, so the classifier has to recognise
  // both spellings: an English page that fell through would print the raw
  // sentence this function exists to replace.
  const english = (fault) => withLocale('en', () => blockerLabel(fault));
  assert.equal(english('HTTP 404 not found'), 'files not found');
  assert.equal(english('`geometry`: a tabular source must say how a row becomes a point'),
    'no position column');
  assert.equal(english('`geometry` : une source tabulaire doit dire comment une ligne devient un point'),
    'no position column');
  assert.equal(english('relay: host not allowed: dl.dropboxusercontent.com'), 'host not allowed');
  assert.equal(english('this dataset publishes no readable resource'), 'no readable file');
  assert.equal(english('file too large (64 MB, cap 25 MB)'), 'file too heavy');
  assert.equal(english(''), 'unreadable');
  assertNoFrench([english('HTTP 404 not found'), english('relay: host not allowed: x')]);
});
