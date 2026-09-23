// The drawn Sitadel layer in English, on the SAME Nantes pack the French
// tests pin.
//
// The property the whole layer was written around has to survive translation:
// the RATE at which the join succeeded travels with every object it produced.
// A permit drawn in Paris (91.3% of the municipality placed) and one drawn in
// Toulouse (7.6%) look identical on the globe, so the card carries both the
// municipality's rate and the year's rate — in English exactly as in French,
// with the same numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import {
  _clearSitadelSelectionForTest,
  _setSitadelStateForTest,
  _sitadelRecordForTest,
  _sitadelRecordIdsForTest,
  buildSitadelLoadingLabel,
  sitadelDetectLabel,
  sitadelJoinLines,
  sitadelPermitPanel,
} from './sitadelFrance.js';
import {
  indexCadastreParcels,
  projectSitadelCommune,
} from './sitadelFeed.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const H44 = read('sitadel-logements-44109-sample.json');
const D44 = read('sitadel-demolir-44109-sample.json');
const C44 = read('sitadel-cadastre-44109-sample.json');
const COMMUNE44 = read('sitadel-commune-44109-sample.json')[0];

const { index, parcels: cadastreParcels } = indexCadastreParcels([C44]);
const PACK = projectSitadelCommune({
  housing: H44,
  demolition: D44,
  index,
  commune: COMMUNE44,
  outline: {
    parts: [[COMMUNE44.contour.coordinates[0]]], simplified: true, sourceParts: 1, servedParts: 1,
  },
  millesime: '2026-08',
  cadastreEdition: '2026-06-01',
  cadastreCommunes: ['44109'],
  cadastreParcels,
});

test('the provenance block carries the same rates in English', (t) => {
  useTestLocale('en', t);
  const lines = sitadelJoinLines(PACK);
  assert.equal(lines[0],
    'Nantes: 9 of 14 permits placed (64.3%) — cadastral join, no coordinate published');
  assert.equal(lines[1], 'Sitadel vintage 2026-08 · Etalab cadastre 2026-06-01');
  assertNoFrench(lines, { allow: ['Nantes'] });
});

test('the year’s own rate is added in English, because the failure is age-dependent', (t) => {
  useTestLocale('en', t);
  const year = PACK.permits[0].y;
  const tally = PACK.years.find((entry) => entry.year === year);
  const lines = sitadelJoinLines(PACK, PACK.permits[0]);
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith(`Permits from ${year} here: ${tally.placed} of ${tally.permits} placed`),
    lines[1]);
  assert.ok(lines[1].endsWith('— a parcel gets divided when somebody builds on it'), lines[1]);
});

test('a municipality where nothing was placed still gets a line, and it says 0', () => {
  const empty = { commune: 'Nulle-Part', summary: { placed: 0, permits: 12 }, millesime: '2026-08' };
  const line = withLocale('en', () => sitadelJoinLines(empty))[0];
  assert.ok(line.startsWith('Nulle-Part: 0 of 12 permits placed (0%)'), line);
  // A permit whose year is not in the tally gets no year line rather than a
  // divide by zero — in either language.
  assert.equal(withLocale('en', () => sitadelJoinLines(empty, { y: '2013' })).length, 2);
});

test('a permit’s card in the key reads in English, with the same file behind it', (t) => {
  useTestLocale('en', t);
  _setSitadelStateForTest({ payload: PACK });
  const record = _sitadelRecordIdsForTest()
    .map((id) => _sitadelRecordForTest(id))
    .find((entry) => entry.permit.lgt === 27);
  const card = sitadelPermitPanel(record, PACK);
  assert.equal(card.kicker, 'Building permit');
  assert.equal(card.title, '27 dwellings authorized');
  assert.deepEqual(card.steps.items.map((step) => step.label),
    ['Permit granted', 'Start of work declared', 'End of work']);
  assert.equal(card.list.summary, 'See the permit details');
  assert.ok(card.list.items.some((item) => item.text.startsWith('Nantes: 9 of 14 permits placed')),
    card.list.items.map((item) => item.text).join(' | '));
  assert.equal(card.source, 'Source: Sitadel · SDES');
  assertNoFrench([card.kicker, card.title, card.badge.label, ...card.steps.items.map((step) => step.label)]);
  _clearSitadelSelectionForTest();
});

test('the row line and the DETECT fallback answer in English', (t) => {
  useTestLocale('en', t);
  assert.equal(buildSitadelLoadingLabel({ payload: null, status: 'no-view', loading: false }),
    'The center of the screen does not meet the ground — aim at the terrain');
  const line = buildSitadelLoadingLabel({
    payload: PACK, status: 'ready', loading: false, commune: 'Nantes',
  });
  assert.ok(line.startsWith('Nantes · 9 permits placed on'), line);
  assert.ok(line.includes('municipal outline simplified'), line);
  assertNoFrench(line, { allow: ['Nantes'] });
  assert.equal(sitadelDetectLabel(null), 'Planning permit');
  assert.equal(withLocale('fr', () => sitadelDetectLabel(null)), 'Autorisation d’urbanisme');
});
