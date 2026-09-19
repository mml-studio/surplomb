// megafireClock in English. The French strings stay pinned by
// megafireClock.test.mjs, untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMegafireClock,
  megafireClockState,
  megafireCursorLabel,
  megafireCursorReadout,
  seekMegafireClock,
  setMegafirePlaying,
} from './megafireClock.js';
import { MEGAFIRE_WINDOW_END, MEGAFIRE_WINDOW_START } from './megafirePack.js';
import { assertNoFrench, useTestLocale } from '../i18n/testing.js';

useTestLocale('en');

const clock = () => createMegafireClock({
  startMs: Date.parse(MEGAFIRE_WINDOW_START),
  endMs: Date.parse(MEGAFIRE_WINDOW_END),
});

test('the cursor label is UTC, month first, and says so', () => {
  assert.equal(megafireCursorLabel(Date.parse('2026-07-24T09:05:00Z')), 'Jul 24 09:05 UTC');
  assert.equal(megafireCursorLabel(Date.parse('2026-08-01T12:44:00Z')), 'Aug 1 12:44 UTC');
  assert.equal(megafireCursorLabel(NaN), '—');
});

test('the readout names the four states in English', () => {
  const c = clock();
  const readout = () => megafireCursorReadout(c, megafireClockState(c));
  assert.equal(readout(), '■ Aug 1 12:44 UTC · last detection');
  seekMegafireClock(c, Date.parse('2026-07-26T04:12:00Z'));
  assert.equal(readout(), '❚❚ Jul 26 04:12 UTC · day 4 of 10');
  setMegafirePlaying(c, true);
  assert.equal(readout(), '▶ Jul 26 04:12 UTC · day 4 of 10');
  setMegafirePlaying(c, false);
  seekMegafireClock(c, Date.parse(MEGAFIRE_WINDOW_START));
  assert.equal(readout(), '▶ Jul 22 11:55 UTC · first detection');
  assertNoFrench(readout());
});
