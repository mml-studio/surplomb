// scripts/build-bareme-fr.test.mjs
// The draw and the quantiles of the national scale.
//
// This script writes constants into a source file, and a wrong constant
// crashes nothing: it hands everyone a plausible letter. The four functions
// that decide the figure are therefore tested here, on cases where the right
// answer is known by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, roundTo, sampleQuantiles, systematicPps, weightedPick,
} from './build-bareme-fr.mjs';

test('the draw is reproducible from one run to the next', () => {
  const a = Array.from({ length: 5 }, mulberry32(42));
  const b = Array.from({ length: 5 }, mulberry32(42));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, Array.from({ length: 5 }, mulberry32(43)));
  for (const value of a) assert.ok(value >= 0 && value < 1);
});

test('the systematic draw returns exactly the number asked for', () => {
  const units = Array.from({ length: 500 }, () => ({ weight: 10 }));
  for (const seed of [1, 7, 99]) {
    assert.equal(systematicPps(units, 25, mulberry32(seed)).length, 25);
  }
});

test('the draw is proportional to population, not to the number of cells', () => {
  // One cell of 9,000 residents and nine of 1,000: half the draws must land on
  // the first one, because it carries half the residents.
  const units = [{ weight: 9_000 }, ...Array.from({ length: 9 }, () => ({ weight: 1_000 }))];
  const picks = systematicPps(units, 18, mulberry32(3));
  const onBig = picks.filter((index) => index === 0).length;
  assert.equal(onBig, 9, `attendu 9 tirages sur le gros carreau, reçu ${onBig}`);
});

test('a cell more populated than the step is drawn several times', () => {
  const units = [{ weight: 100 }, { weight: 1 }];
  const picks = systematicPps(units, 10, mulberry32(5));
  assert.ok(picks.filter((index) => index === 0).length >= 9);
});

test('the draw refuses a zero population rather than returning indices', () => {
  assert.deepEqual(systematicPps([{ weight: 0 }, { weight: 0 }], 4, mulberry32(1)), []);
  assert.deepEqual(systematicPps([{ weight: 5 }], 0, mulberry32(1)), []);
});

test('weightedPick ignores zero weights and stays within bounds', () => {
  const units = [{ weight: 0 }, { weight: 0 }, { weight: 7 }];
  for (const seed of [1, 2, 3, 4, 5]) {
    assert.equal(weightedPick(units, mulberry32(seed)), 2);
  }
  assert.equal(weightedPick([], mulberry32(1)), -1);
  assert.equal(weightedPick([{ weight: 0 }], mulberry32(1)), -1);
});

test('the quantiles follow the nearest-rank convention', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual(sampleQuantiles(values, [0.05, 0.5, 0.95]), [5, 50, 95]);
  // Non-finite values leave the sample rather than shifting it.
  assert.deepEqual(sampleQuantiles([1, null, 2, Number.NaN, 3], [0.5]), [2]);
  assert.deepEqual(sampleQuantiles([], [0.5]), [null]);
});

test('the quantiles do not depend on arrival order', () => {
  const values = [9, 1, 7, 3, 5];
  assert.deepEqual(sampleQuantiles(values, [0.2, 0.6, 1]), [1, 5, 9]);
});

test('roundTo does not leave the binary residue trailing', () => {
  assert.equal(roundTo(5.2999999, 0.1), 5.3);
  assert.equal(roundTo(22_437, 100), 22_400);
  assert.equal(roundTo(Number.NaN, 1), null);
});
