// The cursor the Gironde reconstruction is read along.
//
// This file exists because the awkward half of a timeline is all edges — the
// two ends, the rewind, the chip that lands exactly on a frame, the tab that
// was backgrounded for a minute — and none of them is reachable from a test
// that has to build a Cesium viewer first. Everything here is arithmetic.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MEGAFIRE_PLAY_SECONDS,
  advanceMegafireClock,
  createMegafireClock,
  megafireClockState,
  megafireCursorLabel,
  megafireCursorReadout,
  megafireInstantAt,
  megafirePositionOf,
  megafireWindowDays,
  seekMegafireClock,
  seekMegafireSegment,
  setMegafirePlaying,
} from './megafireClock.js';
import { MEGAFIRE_STEPS, MEGAFIRE_WINDOW_END, MEGAFIRE_WINDOW_START } from './megafirePack.js';

const START = Date.parse(MEGAFIRE_WINDOW_START);
const END = Date.parse(MEGAFIRE_WINDOW_END);
const HOUR = 3600_000;
const fresh = () => createMegafireClock({ startMs: START, endMs: END });

test('a clock opens on the closing frame, paused', () => {
  const clock = fresh();
  assert.equal(clock.cursorMs, END, 'the state still true today is the one a reader lands on');
  assert.equal(clock.playing, false);
  assert.equal(megafireClockState(clock).progress, 1);
  assert.equal(megafireClockState(clock).atEnd, true);
  assert.equal(megafireClockState(clock).stepIndex, MEGAFIRE_STEPS.length - 1);
});

test('a window that is not a window is refused rather than drawn empty', () => {
  assert.throws(() => createMegafireClock({ startMs: END, endMs: START }), RangeError);
  assert.throws(() => createMegafireClock({ startMs: START, endMs: START }), RangeError);
  assert.throws(() => createMegafireClock({ startMs: NaN, endMs: END }), RangeError);
});

test('a paused clock does not move, however hard it is ticked', () => {
  const clock = fresh();
  seekMegafireClock(clock, START);
  assert.equal(advanceMegafireClock(clock, 10), false);
  assert.equal(clock.cursorMs, START);
});

test('one playthrough crosses the window in the advertised time', () => {
  const clock = fresh();
  setMegafirePlaying(clock, true);
  assert.equal(clock.cursorMs, START, 'pressing play at the end rewinds');
  // Ticked in 0.1 s steps, which is inside the 0.25 s clamp.
  let ticks = 0;
  while (clock.playing && ticks < 10000) {
    advanceMegafireClock(clock, 0.1);
    ticks += 1;
  }
  assert.equal(clock.playing, false, 'playback stops at the end, it does not loop');
  assert.equal(clock.cursorMs, END);
  const seconds = ticks * 0.1;
  assert.ok(Math.abs(seconds - MEGAFIRE_PLAY_SECONDS) < 0.5,
    `crossed in ${seconds.toFixed(1)} s, advertised ${MEGAFIRE_PLAY_SECONDS} s`);
});

test('a backgrounded tab cannot jump the fire in one frame', () => {
  const clock = fresh();
  seekMegafireClock(clock, START);
  setMegafirePlaying(clock, true);
  advanceMegafireClock(clock, 600);
  const span = END - START;
  // 0.25 s of the playthrough, and not the 600 s that were asked for.
  assert.ok(clock.cursorMs - START < span * 0.02,
    'a 10-minute delta was not clamped — the whole event would pass in one frame');
  assert.equal(clock.playing, true);
});

test('a negative or absent delta is a no-op, not a rewind', () => {
  const clock = fresh();
  seekMegafireClock(clock, START + HOUR);
  setMegafirePlaying(clock, true);
  const before = clock.cursorMs;
  assert.equal(advanceMegafireClock(clock, -5), false);
  assert.equal(advanceMegafireClock(clock, NaN), false);
  assert.equal(advanceMegafireClock(clock, undefined), false);
  assert.equal(clock.cursorMs, before);
});

test('seeking always pauses, and clamps to the window', () => {
  const clock = fresh();
  setMegafirePlaying(clock, true);
  seekMegafireClock(clock, Date.parse(MEGAFIRE_STEPS[1].acq));
  assert.equal(clock.playing, false, 'a chip the cursor drifts off is a chip that does not work');
  assert.equal(megafireClockState(clock).stepIndex, 1);
  assert.equal(seekMegafireClock(clock, START - 10 * HOUR), START);
  assert.equal(seekMegafireClock(clock, END + 10 * HOUR), END);
  assert.equal(seekMegafireClock(clock, NaN), END, 'nonsense leaves the cursor alone');
});

test('play toggles, and rewinds only from the end', () => {
  const clock = fresh();
  assert.equal(setMegafirePlaying(clock), true);
  assert.equal(clock.cursorMs, START, 'play at the end rewinds');
  const mid = START + (END - START) / 2;
  seekMegafireClock(clock, mid);
  assert.equal(setMegafirePlaying(clock), true);
  assert.equal(clock.cursorMs, mid, 'play from the middle resumes where it was');
  assert.equal(setMegafirePlaying(clock), false);
  assert.equal(clock.cursorMs, mid, 'pause does not move the cursor');
});

test('a step becomes true at its acquisition instant and stays true until the next', () => {
  const clock = fresh();
  const first = Date.parse(MEGAFIRE_STEPS[0].acq);
  const second = Date.parse(MEGAFIRE_STEPS[1].acq);
  seekMegafireClock(clock, first - 1);
  assert.equal(megafireClockState(clock).stepIndex, null);
  seekMegafireClock(clock, first);
  assert.equal(megafireClockState(clock).stepIndex, 0);
  seekMegafireClock(clock, second - 1);
  assert.equal(megafireClockState(clock).stepIndex, 0, 'the gap is held, never tweened');
  seekMegafireClock(clock, second);
  assert.equal(megafireClockState(clock).stepIndex, 1);
});

test('the cursor label is UTC, French, and matches the pack', () => {
  assert.equal(megafireCursorLabel(Date.parse('2026-07-24T09:05:00Z')), '24 juil. 09:05 UTC');
  assert.equal(megafireCursorLabel(Date.parse('2026-08-01T11:38:00Z')), '1ᵉʳ août 11:38 UTC');
  assert.equal(megafireCursorLabel(Date.parse('2026-07-22T11:55:00Z')), '22 juil. 11:55 UTC');
  assert.equal(megafireCursorLabel(NaN), '—');
  // The five chip labels in the pack are this function's own output, minus the
  // zone — if one drifts, a chip and the card disagree about the same instant.
  for (const step of MEGAFIRE_STEPS) {
    assert.equal(megafireCursorLabel(Date.parse(step.acq)), `${step.label} UTC`);
  }
});

test('the window is ten days, not eleven', () => {
  // 22 July 11:55 to 1 August 12:44 is ten days and forty-nine minutes. Ceiling
  // it would print "jour 4 sur 11" under a layer that calls this a ten-day
  // event everywhere else.
  const clock = createMegafireClock({
    startMs: Date.parse('2026-07-22T11:55:00Z'),
    endMs: Date.parse('2026-08-01T12:44:00Z'),
  });
  assert.equal(megafireWindowDays(clock), 10);
  // The remainder is absorbed by the last day rather than opening an eleventh.
  assert.equal(megafireClockState(clock).day, 10);
  assert.equal(megafireClockState(clock).days, 10);
});

test('the day number counts from the first hour of the window', () => {
  const clock = createMegafireClock({
    startMs: Date.parse('2026-07-22T11:55:00Z'),
    endMs: Date.parse('2026-08-01T12:44:00Z'),
  });
  const dayAt = (iso) => {
    seekMegafireClock(clock, Date.parse(iso));
    return megafireClockState(clock).day;
  };
  assert.equal(dayAt('2026-07-22T11:55:00Z'), 1);
  assert.equal(dayAt('2026-07-23T11:54:00Z'), 1, 'still the first day, one minute short');
  assert.equal(dayAt('2026-07-23T11:56:00Z'), 2);
  assert.equal(dayAt('2026-07-24T09:05:00Z'), 2, 'the first Copernicus frame');
  assert.equal(dayAt('2026-08-01T11:38:00Z'), 10);
});

test('three stopped states are told apart, because the same button serves all three', () => {
  const clock = createMegafireClock({
    startMs: Date.parse('2026-07-22T11:55:00Z'),
    endMs: Date.parse('2026-08-01T12:44:00Z'),
  });
  // The layer opens parked on the closing frame.
  let state = megafireClockState(clock);
  assert.equal(state.atEnd, true);
  assert.equal(state.atStart, false);
  assert.equal(state.playing, false);

  seekMegafireClock(clock, Date.parse('2026-07-26T04:12:00Z'));
  state = megafireClockState(clock);
  assert.equal(state.atEnd, false);
  assert.equal(state.atStart, false);

  seekMegafireClock(clock, Date.parse('2026-07-22T11:55:00Z'));
  state = megafireClockState(clock);
  assert.equal(state.atStart, true);
  assert.equal(state.atEnd, false);
});

test('the readout says the instant, the day, and whether anything is moving', () => {
  const clock = createMegafireClock({
    startMs: Date.parse('2026-07-22T11:55:00Z'),
    endMs: Date.parse('2026-08-01T12:44:00Z'),
  });
  const readout = () => megafireCursorReadout(clock, megafireClockState(clock));

  // Parked on the closing frame — the state the layer opens in. This must NOT
  // read like a paused run, and it must not claim more than the source does:
  // 12:44 is EFFIS's FINALDATE, the last instant an algorithm saw this ground
  // burn, and no publisher in this pack dates the fire's extinction.
  assert.equal(readout(), '■ 1ᵉʳ août 12:44 UTC · dernière détection');

  seekMegafireClock(clock, Date.parse('2026-07-26T04:12:00Z'));
  assert.equal(readout(), '❚❚ 26 juil. 04:12 UTC · jour 4 sur 10');

  clock.playing = true;
  assert.equal(readout(), '▶ 26 juil. 04:12 UTC · jour 4 sur 10');

  seekMegafireClock(clock, clock.startMs);
  // Same rule at the other end: 11:55 is EFFIS's FIREDATE, and the fire was
  // only reported to the COGIC six hours later.
  assert.equal(readout(), '▶ 22 juil. 11:55 UTC · première détection');

  // Every reading carries the instant, so the row and the tooltip can never
  // disagree about where the cursor is.
  for (const iso of ['2026-07-24T09:05:00Z', '2026-07-29T14:07:00Z']) {
    seekMegafireClock(clock, Date.parse(iso));
    assert.ok(readout().includes(megafireCursorLabel(Date.parse(iso))));
  }
});

// --- The replay in stages ---------------------------------------------------

const BAND_ENDS = [
  Date.parse('2026-07-23T22:00:00Z'),
  Date.parse('2026-07-25T22:00:00Z'),
  END,
];
const staged = () => createMegafireClock({ startMs: START, endMs: END, segments: BAND_ENDS });

test('a staged clock opens on the finished fire, every stage completed', () => {
  const state = megafireClockState(staged());
  assert.equal(state.position, 3);
  assert.equal(state.completed, 3);
  assert.equal(state.segmentIndex, 2);
  assert.equal(state.atEnd, true);
});

test('stages that end outside the window, or out of order, are refused', () => {
  assert.throws(() => createMegafireClock({ startMs: START, endMs: END, segments: [BAND_ENDS[1], BAND_ENDS[0], END] }), RangeError);
  assert.throws(() => createMegafireClock({ startMs: START, endMs: END, segments: [BAND_ENDS[0]] }), RangeError);
  assert.throws(() => createMegafireClock({ startMs: START, endMs: END, segments: [START, END] }), RangeError);
});

test('every stage gets the same share of the playthrough, time running linearly inside it', () => {
  const clock = staged();
  assert.equal(megafireInstantAt(clock, 0), START);
  assert.equal(megafireInstantAt(clock, 1), BAND_ENDS[0]);
  assert.equal(megafireInstantAt(clock, 1.5), (BAND_ENDS[0] + BAND_ENDS[1]) / 2);
  assert.equal(megafireInstantAt(clock, 3), END);
  for (const t of [START, BAND_ENDS[0] - HOUR, BAND_ENDS[1] + 5 * HOUR, END]) {
    assert.ok(Math.abs(megafireInstantAt(clock, megafirePositionOf(clock, t)) - t) < 1, 'position ↔ instant round-trips');
  }
  // The same wall-clock time crosses each stage, however long it is in days:
  // 34 h for the first, 159 h for the last.
  setMegafirePlaying(clock, true);
  const stageSeconds = [];
  let seconds = 0;
  let stage = 0;
  while (clock.playing && seconds < 60) {
    advanceMegafireClock(clock, 0.05);
    seconds += 0.05;
    const done = megafireClockState(clock).completed;
    if (done > stage) {
      stageSeconds.push(seconds);
      stage = done;
    }
  }
  assert.equal(stageSeconds.length, 3);
  const lengths = stageSeconds.map((at, i) => at - (stageSeconds[i - 1] ?? 0));
  for (const length of lengths) {
    assert.ok(Math.abs(length - MEGAFIRE_PLAY_SECONDS / 3) < 0.2, `a stage took ${length.toFixed(2)} s`);
  }
});

test('a stop parks the cursor at the END of its stage, paused, with that ring completed', () => {
  const clock = staged();
  setMegafirePlaying(clock, true);
  assert.equal(seekMegafireSegment(clock, 0), 0);
  assert.equal(clock.playing, false);
  assert.equal(clock.cursorMs, BAND_ENDS[0]);
  assert.equal(megafireClockState(clock).completed, 1);
  assert.equal(seekMegafireSegment(clock, 9), 2, 'clamped to the last stage');
  assert.equal(megafireClockState(clock).atEnd, true);
  assert.equal(seekMegafireSegment(clock, -3), 0);
});

test('a seek to an instant keeps the position and the instant together', () => {
  const clock = staged();
  seekMegafireClock(clock, BAND_ENDS[1] + 3 * HOUR);
  const state = megafireClockState(clock);
  assert.ok(state.position > 2 && state.position < 2.1);
  assert.equal(state.completed, 2);
  assert.equal(state.segmentIndex, 2);
});
