// src/data/baremeNational.test.mjs
// The national scale: the letter, the range, and the four refusals.
//
// The measured scales move with every campaign, so almost nothing here leans
// on them: scoring is tested on synthetic scales, and the real ones are only
// held to invariants of SHAPE — a measured block pasted in by hand is what
// those invariants exist to catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAREME_FR,
  BAREME_GEOMETRIES,
  BAREME_INDICATORS,
  BAREME_LADDER_Q,
  BAREME_LETTER_FLOORS,
  BAREME_REASONS,
  BAREME_SAMPLE,
  ladderBracket,
  letterFor,
  percentileMarginPt,
  resolveIndicator,
  scoreIndicator,
} from './baremeNational.js';

const RING = BAREME_GEOMETRIES.RING_FOOT_600;
/** A linear 0→100 scale, to read a percentile by eye. */
const LINEAR = BAREME_LADDER_Q.map((q) => Math.round(q * 100));
/** A synthetic national scale, independent of the current campaign. */
const FAKE = {
  acces: { geometry: RING, ladder: LINEAR },
  pauvrete: { geometry: RING, ladder: LINEAR },
  social: { geometry: RING, ladder: LINEAR },
};
/** Large enough for the sampling margin not to drown the assertions. */
const BIG = 100_000;

test('letterFor cuts into quintiles and clamps at both ends', () => {
  assert.equal(letterFor(100), 'A');
  assert.equal(letterFor(80), 'A');
  assert.equal(letterFor(79.9), 'B');
  assert.equal(letterFor(60), 'B');
  assert.equal(letterFor(40), 'C');
  assert.equal(letterFor(20), 'D');
  assert.equal(letterFor(0), 'E');
  assert.equal(letterFor(-5), 'E');
  assert.equal(letterFor(140), 'A');
  assert.equal(letterFor(null), null);
  assert.equal(letterFor(Number.NaN), null);
});

test('the five letters cover 0..100 with no gap and no overlap', () => {
  const floors = BAREME_LETTER_FLOORS.map((band) => band.floor);
  assert.deepEqual(floors, [...floors].sort((a, b) => b - a));
  assert.equal(new Set(BAREME_LETTER_FLOORS.map((b) => b.letter)).size, 5);
  assert.equal(floors.at(-1), 0);
});

test('ladderBracket interpolates between two points and returns a point', () => {
  const bracket = ladderBracket(45, LINEAR);
  assert.equal(bracket.beyond, null);
  assert.equal(bracket.low, bracket.high);
  assert.ok(Math.abs(bracket.low - 0.45) < 1e-9);
});

test('ladderBracket returns a PLATEAU when the value equals several points', () => {
  // The social-housing case: 0% across the whole bottom of the distribution.
  // The honest answer is an interval, never a percentile.
  const ladder = [0, 0, 0, 0, 2, 7, 14, 25, 40, 62, 78];
  const bracket = ladderBracket(0, ladder);
  assert.equal(bracket.low, 0);
  assert.equal(bracket.high, 0.4);
  assert.ok(bracket.high - bracket.low > 0.3, 'le palier doit rester large');
});

test('ladderBracket names the side the value falls off', () => {
  assert.deepEqual(ladderBracket(-10, LINEAR), { low: 0, high: 0.05, beyond: 'below' });
  assert.deepEqual(ladderBracket(1e6, LINEAR), { low: 0.95, high: 1, beyond: 'above' });
});

test('ladderBracket refuses a scale of the wrong length or a missing value', () => {
  assert.equal(ladderBracket(10, [1, 2, 3]), null);
  assert.equal(ladderBracket(Number.NaN, LINEAR), null);
  assert.equal(ladderBracket(10, null), null);
});

test('the sampling margin is largest in the middle, and known', () => {
  const middle = percentileMarginPt(0.5, 300);
  const tail = percentileMarginPt(0.05, 300);
  assert.ok(middle > tail);
  assert.ok(Math.abs(middle - 5.77) < 0.05, `attendu ~5,77 pt, reçu ${middle}`);
  assert.equal(percentileMarginPt(0.5, 0), 0);
});

test('a geometry that does not match gives no letter', () => {
  const score = scoreIndicator('acces', 1.2, {
    geometry: BAREME_GEOMETRIES.CARREAU_200, bareme: FAKE, sampleSize: BIG,
  });
  assert.equal(score.reason, BAREME_REASONS.GEOMETRY);
  assert.equal(score.letter, null);
  assert.equal(score.percentile, null);
});

test('a caller that does not say what it measured on gets no rank', () => {
  const score = scoreIndicator('acces', 1.2, { bareme: FAKE, sampleSize: BIG });
  assert.equal(score.reason, BAREME_REASONS.GEOMETRY);
});

test('no scale, no value or no indicator: a named refusal, never an exception', () => {
  assert.equal(
    scoreIndicator('acces', 1.2, { geometry: RING, bareme: {}, sampleSize: BIG }).reason,
    BAREME_REASONS.NO_REFERENCE,
  );
  assert.equal(
    scoreIndicator('inconnu', 1.2, { geometry: RING, bareme: FAKE, sampleSize: BIG }).reason,
    BAREME_REASONS.NO_REFERENCE,
  );
  assert.equal(
    scoreIndicator('acces', null, { geometry: RING, bareme: FAKE, sampleSize: BIG }).reason,
    BAREME_REASONS.NOT_A_NUMBER,
  );
});

test('an upward indicator keeps its percentile as its score', () => {
  const score = scoreIndicator('acces', 85, { geometry: RING, bareme: FAKE, sampleSize: BIG });
  assert.equal(score.percentile, 85);
  assert.equal(score.note, 85);
  assert.equal(score.letter, 'A');
  assert.equal(score.ferme, true);
});

test('a downward indicator flips the SCORE, never the percentile', () => {
  // 85% poor households: the percentile stays 85 — 85% of French people have
  // less — and the score becomes 15, so E.
  const score = scoreIndicator('pauvrete', 85, { geometry: RING, bareme: FAKE, sampleSize: BIG });
  assert.equal(score.percentile, 85);
  assert.equal(score.note, 15);
  assert.equal(score.letter, 'E');
});

test('no defensible direction: a rank, no letter', () => {
  const score = scoreIndicator('social', 70, { geometry: RING, bareme: FAKE, sampleSize: BIG });
  assert.equal(score.percentile, 70);
  assert.equal(score.note, null);
  assert.equal(score.letter, null);
  assert.equal(score.letterLow, null);
  assert.equal(score.reason, BAREME_REASONS.NO_DIRECTION);
  assert.equal(resolveIndicator('social').direction, null);
});

test('a value sitting on a letter boundary gets no bare letter', () => {
  // 80 is exactly the A/B boundary; on 300 draws the margin is ±5.7 pt, so the
  // range straddles the boundary and the card must say “A or B”.
  const score = scoreIndicator('acces', 80, { geometry: RING, bareme: FAKE, sampleSize: 300 });
  assert.equal(score.letter, null);
  assert.equal(score.ferme, false);
  assert.deepEqual([score.letterHigh, score.letterLow], ['A', 'B']);
});

test('a value off the scale stays scorable and says which side it falls off', () => {
  const score = scoreIndicator('acces', 5_000, { geometry: RING, bareme: FAKE, sampleSize: BIG });
  assert.equal(score.beyond, 'above');
  assert.equal(score.letter, 'A');
  assert.equal(score.reason, null, 'sortir de l’échelle n’est pas un refus');
});

test('the table of choices is consistent', () => {
  const ids = BAREME_INDICATORS.map((indicator) => indicator.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants dupliqués');
  const geometries = new Set(Object.values(BAREME_GEOMETRIES));
  for (const indicator of BAREME_INDICATORS) {
    assert.ok(geometries.has(indicator.geometry), `${indicator.id}: géométrie inconnue`);
    assert.ok([null, 'up', 'down'].includes(indicator.direction), `${indicator.id}: sens invalide`);
    assert.ok(indicator.round > 0, `${indicator.id}: pas d’arrondi`);
    // The direction is a judgment; a judgment without a written justification
    // is exactly what this module holds against Cityscan.
    assert.ok(indicator.directionNote?.length > 20, `${indicator.id}: sens non justifié`);
    assert.ok(indicator.label && indicator.unit, `${indicator.id}: sans étiquette`);
  }
});

test('the measured block has the shape the module expects', () => {
  for (const [id, scale] of Object.entries(BAREME_FR)) {
    const indicator = resolveIndicator(id);
    assert.ok(indicator, `${id}: échelle sans indicateur déclaré`);
    assert.equal(scale.geometry, indicator.geometry, `${id}: géométrie collée de travers`);
    assert.equal(scale.ladder.length, BAREME_LADDER_Q.length, `${id}: échelle de mauvaise longueur`);
    // A descending scale is a botched paste, not a distribution.
    for (let i = 1; i < scale.ladder.length; i += 1) {
      assert.ok(scale.ladder[i] >= scale.ladder[i - 1], `${id}: échelle non croissante en ${i}`);
    }
    assert.ok(scale.measured > 0, `${id}: échelle sans observations`);
  }
});

test('the sample declares its size, and the module uses it', () => {
  assert.ok(Number.isFinite(BAREME_SAMPLE.rings));
  assert.ok(BAREME_SAMPLE.rings >= 0);
});
