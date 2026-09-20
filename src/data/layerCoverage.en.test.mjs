// A layer's territory in English: the long form under a dimmed control, the
// three notices, and the one briefing card the table carries.
//
// The SHORT form is not translated and this file says so: `PARIS`, `IDF`, `FR`
// and `PARIS · LYON` are place names and country codes, and a chip that
// changed with the language would be a second thing to learn.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYER_COVERAGE,
  coverageNoticeFor,
  layerCoverageFor,
  layerDarkAreaAt,
} from './layerCoverage.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

/** Paris, where the two interesting rows disagree. */
const PARIS = { south: 48.80, west: 2.25, north: 48.90, east: 2.42 };
/** Osaka: none of these layers has anything there. */
const OSAKA = { south: 34.6, west: 135.4, north: 34.8, east: 135.6 };

test('every territory has an English long form, and the chips stay as they are', () => {
  const rows = withLocale('en', () => LAYER_COVERAGE.map((entry) => ({ id: entry.id, chip: entry.chip, where: entry.where })));
  assertNoFrench(rows.map((row) => row.where), { allow: ['Île-de-France'] });
  assert.deepEqual(rows.map((row) => row.chip), ['PARIS', 'PARIS', 'IDF', 'PARIS · LYON', 'FR']);
  assert.equal(withLocale('en', () => layerCoverageFor('comptages-fr').where), 'Paris proper');
  assert.equal(withLocale('en', () => layerCoverageFor('road-status-fr').where),
    'State-run national road network');
  assert.equal(layerCoverageFor('comptages-fr').where, 'Paris intra-muros');
});

test('a control outside its territory says so in English, and offers the flight', () => {
  const clickable = withLocale('en', () => coverageNoticeFor('comptages-fr', 'out', null, { clickable: true }));
  assert.equal(clickable, 'No data in this view — covers Paris proper. Click to go there.');
  assert.equal(withLocale('en', () => coverageNoticeFor('comptages-fr', 'out', null)),
    'No data in this view — covers Paris proper.');
  // A national layer is not somewhere to leave: no flight, no invitation.
  assert.equal(withLocale('en', () => coverageNoticeFor('road-status-fr', 'out', null, { clickable: true })),
    'No data in this view — covers State-run national road network.');
  assert.equal(withLocale('en', () => coverageNoticeFor('comptages-fr', 'in')), '');
});

test('a hole in the coverage names its operator, in English', () => {
  const dark = withLocale('en', () => coverageNoticeFor('road-status-fr', 'dark', layerDarkAreaAt('road-status-fr', PARIS)));
  assert.equal(dark, 'Île-de-France: DIRIF publishes nothing here — the rest of the network is still drawn.');
  assert.equal(withLocale('en', () => coverageNoticeFor('road-status-fr', 'dark', null)),
    'Unpublished area — the rest of the network is still drawn.');
  // French, unchanged.
  assert.equal(
    coverageNoticeFor('road-status-fr', 'dark', layerDarkAreaAt('road-status-fr', PARIS)),
    'Île-de-France : DIRIF ne publie rien ici — le reste du réseau reste dessiné.',
  );
});

test('the briefing card teaches the same three things in English', () => {
  const brief = withLocale('en', () => layerCoverageFor('comptages-fr').brief);
  assert.equal(brief.title, 'Traffic counts');
  assert.equal(brief.lines.length, 3);
  assertNoFrench(brief.lines);
  assert.ok(brief.lines.some((line) => /not congestion/i.test(line)), 'the count/congestion distinction');
  assert.ok(brief.lines.some((line) => /archived week/i.test(line)), 'archived, not live');
  assert.ok(brief.lines.some((line) => /Paris proper only/i.test(line)), 'and Paris only');
  assert.ok(!brief.lines.some((line) => /\blive\b/i.test(line.replace(/not live/i, ''))));
  // Only that one layer has a card, in either language.
  assert.deepEqual(
    withLocale('en', () => LAYER_COVERAGE.filter((entry) => entry.brief).map((entry) => entry.id)),
    ['comptages-fr'],
  );
});

test('the state a camera is in does not depend on the language', () => {
  for (const view of [PARIS, OSAKA]) {
    for (const entry of LAYER_COVERAGE) {
      assert.equal(
        withLocale('en', () => coverageNoticeFor(entry.id, 'in', null)),
        coverageNoticeFor(entry.id, 'in', null),
        `${entry.id} inside its own territory says nothing, in both`,
      );
    }
    void view;
  }
});
