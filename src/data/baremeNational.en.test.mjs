// The national scale in both languages: what each indicator is called, why
// most of them carry no letter, and which silence a refusal is.
//
// The `directionNote` sentences are the editorial heart of this module — they
// say on whose behalf a judgment would have been made — so they are asserted
// in English rather than merely checked for the absence of French.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import {
  BAREME_GEOMETRIES,
  BAREME_INDICATORS,
  BAREME_REASONS,
  BAREME_REASON_CODES,
  baremeReasonLabel,
  resolveIndicator,
  scoreIndicator,
} from './baremeNational.js';

test('every indicator is named, united and justified in English', () => {
  const rows = withLocale('en', () => BAREME_INDICATORS
    .map(({ id, short, label, unit, directionNote }) => ({ id, short, label, unit, directionNote })));
  assertNoFrench(rows.map(({ short, label, unit, directionNote }) => (
    { short, label, unit, directionNote })));
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.equal(byId.get('acces').label, 'Ground reachable on foot');
  assert.equal(byId.get('acces').unit, 'km² in 10 min');
  assert.equal(byId.get('niveau').unit, '€/yr per person');
  assert.equal(byId.get('prixM2').short, 'price per m²');
  // Eleven indicators, eleven notes: none may ship untranslated.
  assert.equal(rows.length, 11);
  for (const row of rows) assert.ok(row.directionNote.length > 20, `${row.id}: no note`);
  // The French is the module's own, unchanged.
  assert.equal(withLocale('fr', () => resolveIndicator('acces').label),
    'Surface atteignable à pied');
});

test('the notes say on whose behalf a judgment would have been made', () => {
  const note = (id) => withLocale('en', () => resolveIndicator(id).directionNote);
  assert.equal(note('niveau'), 'The point of view of a resident buying a home, and of nobody '
    + 'else. A social landlord or a discount chain would read the scale upside down.');
  assert.equal(note('social'),
    'The result of a public policy, not a quality of the place — rank only.');
  assert.equal(note('prixM2'),
    'Good news for a seller, bad news for a buyer — one measurement, two readings.');
});

test('a refusal has a stable code and a sentence in the reader’s language', () => {
  const geometry = scoreIndicator('acces', 1.2, { geometry: BAREME_GEOMETRIES.CARREAU_200 });
  assert.equal(geometry.reasonCode, BAREME_REASON_CODES.GEOMETRY);
  assert.equal(withLocale('en', () => baremeReasonLabel(geometry.reasonCode)),
    'scale measured on a different geometry');
  // The French constants are what this module has always published.
  assert.equal(BAREME_REASONS.GEOMETRY, 'échelle mesurée sur une autre géométrie');
  assert.equal(geometry.reason, BAREME_REASONS.GEOMETRY, 'under Node the page is French');

  const noScale = withLocale('en', () => scoreIndicator('inconnu', 1.2, { geometry: null }));
  assert.equal(noScale.reasonCode, BAREME_REASON_CODES.NO_REFERENCE);
  assert.equal(noScale.reason, 'no national scale for this indicator');
  const notANumber = withLocale('en', () => scoreIndicator('acces', null,
    { geometry: BAREME_GEOMETRIES.RING_FOOT_600 }));
  assert.equal(notANumber.reason, 'no value to place');
});

test('an indicator with no defensible direction is ranked in English, never lettered', () => {
  const score = withLocale('en', () => scoreIndicator('prixM2', 4_200, {
    geometry: BAREME_GEOMETRIES.DISC_300,
  }));
  assertNoFrench({ reason: score.reason, note: score.directionNote, label: score.label });
  assert.equal(score.letter, null);
  assert.equal(score.reasonCode, BAREME_REASON_CODES.NO_DIRECTION);
  assert.equal(score.reason, 'no defensible direction — rank only, no letter');
  assert.equal(score.label, 'Median price per m²');
  assert.ok(Number.isFinite(score.percentile));
  assert.equal(withLocale('fr', () => scoreIndicator('prixM2', 4_200, {
    geometry: BAREME_GEOMETRIES.DISC_300,
  }).reason), BAREME_REASONS.NO_DIRECTION);
});
