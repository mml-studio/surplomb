/*
 * MEGAFIRE CLOCK — the cursor the Gironde reconstruction is read along.
 *
 * Pure: no Cesium, no DOM, no timers. The layer owns the tick and hands this
 * module a delta in seconds; this module owns what the cursor MEANS. That split
 * exists so the awkward half — what happens at the ends, what a step chip does
 * to playback, what "before the first frame" looks like — is unit-testable
 * without a viewer.
 *
 * ── WHY A CURSOR AND NOT FIVE BUTTONS ───────────────────────────────────────
 *
 * The representation audit (#78, track 3) states the repo's own indictment: "le
 * temps n'est jamais sur la carte", with `idfm-network` as the single
 * exception and its hour chips as the mechanism to reuse. Chips alone would
 * have worked here — there are only five satellite frames — and they would have
 * been a worse answer, because the interesting quantity is not WHICH frame but
 * HOW FAST the gap between two of them was crossed. Between the frames of
 * 24 July 09:05 and 26 July 10:12 the fire took 19 082 hectares; a reader
 * pressing two buttons sees two numbers, a reader watching a cursor sees a
 * rate. The 9 524 FIRMS detections are what fills that gap, and they only mean
 * anything against a moving instant.
 *
 * So both are here: five chips that JUMP to a measured frame, and a cursor that
 * runs between them.
 *
 * ── THE ONE RULE THE DATA IMPOSES ───────────────────────────────────────────
 *
 * A perimeter is what a satellite SAW at an hour. It becomes true at its
 * acquisition instant and stays true until the next frame replaces it — it is
 * never interpolated. Tweening between two perimeters would invent hectares
 * nobody photographed, and the two-day gap in the middle of this event is
 * exactly where the invention would be largest and most convincing. The
 * hotspots interpolate nothing either: a detection exists at its acquisition
 * minute and not before.
 *
 * That is why {@link megafireClockState} returns `stepIndex` as a plain lookup
 * and never a fraction.
 *
 * ── A REPLAY IN STAGES, NOT A LINEAR TAPE (2026-09-23) ──────────────────────
 *
 * The cinematic replay draws the fire as three rings, one per group of days
 * (`bands.json`, see `megafireBandsMath.js`). On a linear tape those groups
 * get 14 %, 20 % and 66 % of the screen time: the two days that burnt most of
 * the forest go past in eight seconds, and then sixteen seconds of a fire that
 * no longer gains ground. So a clock may be built with SEGMENTS — the instants
 * the groups end — and then every segment gets the same share of the
 * playthrough, time running linearly INSIDE each one. The cursor still holds a
 * real instant at every moment, so everything drawn at it stays causal; only
 * the pace changes, and the bar under the map shows stages, not a time axis.
 * `position` is that paced coordinate: 0 at the window's start, `k` at the end
 * of segment k.
 */

import { MEGAFIRE_STEPS, megafireStepAt, megafireStepLabel } from './megafirePack.js';
import messages from './megafireClock.i18n.js';

/**
 * @constant {number} How long one playthrough of the window takes, in seconds.
 *
 * Three stages of six seconds: long enough to watch a ring close around the
 * detections that lit it, short enough that nobody waits for the last one.
 * The linear tape this replaced ran 24 s and spent sixteen of them after the
 * fire had stopped gaining ground.
 */
export const MEGAFIRE_PLAY_SECONDS = 18;

const HOUR_MS = 3600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Create a cursor over the event window.
 *
 * @param {object} options
 * @param {number} options.startMs - Window open, epoch ms.
 * @param {number} options.endMs - Window close, epoch ms.
 * @param {number} [options.playSeconds] - Seconds for one full playthrough.
 * @param {ReadonlyArray<number>} [options.segments] - The instants the stages
 *   END, ascending; the last one must be `endMs`. Omitted: one stage, which
 *   is a linear tape.
 * @returns {{startMs: number, endMs: number, playSeconds: number,
 *   segments: number[], position: number, cursorMs: number, playing: boolean}}
 */
export function createMegafireClock({
  startMs, endMs, playSeconds = MEGAFIRE_PLAY_SECONDS, segments = null,
}) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new RangeError('megafire clock needs a positive window');
  }
  const ends = segments ? [...segments] : [endMs];
  let previous = startMs;
  for (const end of ends) {
    if (!Number.isFinite(end) || end <= previous) {
      throw new RangeError('megafire clock segments must rise inside the window');
    }
    previous = end;
  }
  if (ends[ends.length - 1] !== endMs) {
    throw new RangeError('megafire clock segments must end with the window');
  }
  return {
    startMs,
    endMs,
    playSeconds,
    segments: ends,
    // Opens on the LAST frame, not the first. A reader who switches the layer
    // on and never touches a chip must see the finished fire — the state that
    // is still true today — rather than an empty forest waiting to be played.
    position: ends.length,
    cursorMs: endMs,
    playing: false,
  };
}

/**
 * The instant at a paced position.
 * @param {ReturnType<createMegafireClock>} clock
 * @param {number} position - 0 … `segments.length`.
 * @returns {number} Epoch ms, inside the window.
 */
export function megafireInstantAt(clock, position) {
  const count = clock.segments.length;
  const p = Math.min(count, Math.max(0, Number(position) || 0));
  const index = Math.min(count - 1, Math.floor(p));
  const from = index === 0 ? clock.startMs : clock.segments[index - 1];
  const to = clock.segments[index];
  return from + (p - index) * (to - from);
}

/**
 * The paced position of an instant — the inverse of {@link megafireInstantAt}.
 * @param {ReturnType<createMegafireClock>} clock
 * @param {number} instantMs
 * @returns {number} 0 … `segments.length`.
 */
export function megafirePositionOf(clock, instantMs) {
  const t = Math.min(clock.endMs, Math.max(clock.startMs, Number(instantMs)));
  let from = clock.startMs;
  for (let index = 0; index < clock.segments.length; index += 1) {
    const to = clock.segments[index];
    if (t <= to) return index + (t - from) / (to - from);
    from = to;
  }
  return clock.segments.length;
}

/** Write a position and the instant it stands for, together — never one alone. */
function placeCursor(clock, position) {
  clock.position = Math.min(clock.segments.length, Math.max(0, position));
  clock.cursorMs = megafireInstantAt(clock, clock.position);
}

/**
 * Advance a playing cursor by a wall-clock delta.
 *
 * Stops at the end rather than looping: a loop would restart the fire behind a
 * reader who looked away, and this event has an end. `dtSec` is clamped so a
 * backgrounded tab that returns after a minute does not jump the whole window
 * in one frame.
 *
 * @param {ReturnType<createMegafireClock>} clock - Mutated in place.
 * @param {number} dtSec - Seconds of wall clock since the last call.
 * @returns {boolean} True when the cursor moved.
 */
export function advanceMegafireClock(clock, dtSec) {
  if (!clock?.playing) return false;
  const dt = Math.min(0.25, Math.max(0, Number(dtSec) || 0));
  if (dt <= 0) return false;
  const count = clock.segments.length;
  const next = clock.position + (dt / clock.playSeconds) * count;
  if (next >= count) {
    const moved = clock.position !== count;
    placeCursor(clock, count);
    clock.playing = false;
    return moved;
  }
  placeCursor(clock, next);
  return true;
}

/**
 * Start, stop, or restart playback.
 *
 * Pressing play at the end REWINDS, because that is the only thing the gesture
 * could mean there — the alternative is a button that does nothing on the state
 * the layer opens in.
 *
 * @param {ReturnType<createMegafireClock>} clock - Mutated in place.
 * @param {boolean} [play] - Force a state; omit to toggle.
 * @returns {boolean} The resulting `playing`.
 */
export function setMegafirePlaying(clock, play) {
  if (!clock) return false;
  const next = play === undefined ? !clock.playing : Boolean(play);
  if (next && clock.cursorMs >= clock.endMs) placeCursor(clock, 0);
  clock.playing = next;
  return clock.playing;
}

/**
 * Move the cursor to an instant, clamped to the window, and stop playback.
 *
 * Seeking always pauses: a chip that moved the cursor and let it immediately
 * drift off the frame the reader asked for would make the five measured
 * instants unreachable.
 *
 * @param {ReturnType<createMegafireClock>} clock - Mutated in place.
 * @param {number} instantMs
 * @returns {number} The clamped cursor.
 */
export function seekMegafireClock(clock, instantMs) {
  if (!clock) return NaN;
  const value = Number(instantMs);
  if (!Number.isFinite(value)) return clock.cursorMs;
  placeCursor(clock, megafirePositionOf(clock, value));
  clock.playing = false;
  return clock.cursorMs;
}

/**
 * Move the cursor to the END of a stage and stop playback — what pressing a
 * stop on the bar, or the previous / next arrows, does.
 * @param {ReturnType<createMegafireClock>} clock - Mutated in place.
 * @param {number} index - Stage index, clamped.
 * @returns {number} The stage now held.
 */
export function seekMegafireSegment(clock, index) {
  if (!clock) return NaN;
  const count = clock.segments.length;
  const target = Math.min(count - 1, Math.max(0, Math.round(Number(index) || 0)));
  placeCursor(clock, target + 1);
  clock.playing = false;
  return target;
}

/**
 * Everything the renderer needs for one instant, derived and never stored.
 *
 * @param {ReturnType<createMegafireClock>} clock
 * @param {ReadonlyArray<{acq: string}>} [steps] - Defaults to {@link MEGAFIRE_STEPS}.
 * @returns {{cursorMs: number, progress: number, stepIndex: ?number,
 *   playing: boolean, atEnd: boolean, atStart: boolean, day: number,
 *   days: number}}
 */
export function megafireClockState(clock, steps = MEGAFIRE_STEPS) {
  const span = clock.endMs - clock.startMs;
  const progress = span > 0 ? (clock.cursorMs - clock.startMs) / span : 1;
  const days = megafireWindowDays(clock);
  const count = clock.segments?.length ?? 1;
  const position = Number.isFinite(clock.position) ? clock.position : count * progress;
  return {
    cursorMs: clock.cursorMs,
    progress,
    position,
    // Stages whose end the cursor has reached: their ring is drawn.
    completed: Math.min(count, Math.floor(position + 1e-9)),
    // The stage the cursor is inside — the last one once it has ended.
    segmentIndex: Math.min(count - 1, Math.floor(position)),
    stepIndex: megafireStepAt(clock.cursorMs, steps),
    playing: Boolean(clock.playing),
    atEnd: clock.cursorMs >= clock.endMs,
    // `atStart` is not `!atEnd`. Three states have to be told apart on one
    // button — never played, stopped halfway, finished — because the gesture
    // means something different in each, and a play control that reads the
    // same in all three is the defect this window was reported with.
    atStart: clock.cursorMs <= clock.startMs,
    day: Math.min(days, Math.floor((clock.cursorMs - clock.startMs) / DAY_MS) + 1),
    days,
  };
}

/**
 * Whole days spanned by the window. 10 for the shipped pack.
 *
 * ROUNDED, not ceiled: 22 July 11:55 to 1 August 12:44 is ten days and
 * forty-nine minutes, and "jour 4 sur 11" for a fire everything else in this
 * layer calls a ten-day event would be a denominator the reader has to
 * reconcile. The last day absorbs the remainder instead, which is what
 * {@link megafireClockState} clamps `day` for.
 * @param {{startMs: number, endMs: number}} clock
 * @returns {number} Days, at least 1.
 */
export function megafireWindowDays(clock) {
  const span = (clock?.endMs ?? 0) - (clock?.startMs ?? 0);
  return Math.max(1, Math.round(span / DAY_MS));
}

/**
 * The one line that says where the cursor is — the instant, the day, and
 * whether anything is moving.
 *
 * WHY THIS EXISTS. The layer shipped with the cursor readable in exactly two
 * places: a chip tooltip, and a `getStats()` field nothing rendered. Pressing
 * play therefore ran ten days of fire past a reader with no clock anywhere on
 * screen, and the reported symptom was the honest one — "I do not know where I
 * am". An instant alone would not have fixed it either: `26 juil. 04:12 UTC` is
 * only meaningful to somebody who already knows the window runs from the 22nd
 * to the 1st, which is precisely what a first-time reader does not know. So the
 * line carries the position IN the window as well.
 *
 * WHAT THE TWO ENDS ARE ALLOWED TO CLAIM. They read `première détection` and
 * `dernière détection`, not `départ de l'incendie` and `fin de l'événement`,
 * because neither bound is an event — both are EFFIS's FIREDATE and FINALDATE,
 * the first and last instants an algorithm saw this ground burn. The fire was
 * reported to the COGIC six hours AFTER 22 July 11:55, and it was declared
 * fixed days AFTER 1 August 12:44 by a préfecture communiqué that is prose in a
 * press release: no dataset, no API, and two different words — "fixé", then
 * "éteint" — that a peat fire can put weeks apart. Naming a detection after an
 * event would be the one claim in this layer no reader could go and check.
 *
 * @param {ReturnType<createMegafireClock>} clock
 * @param {ReturnType<megafireClockState>} state
 * @returns {string} e.g. `▶ 26 juil. 04:12 UTC · jour 4 sur 10`,
 *   `▶ Jul 26 04:12 UTC · day 4 of 10`.
 */
export function megafireCursorReadout(clock, state) {
  const m = messages();
  const instant = megafireCursorLabel(state.cursorMs);
  if (state.playing) return `▶ ${instant} · ${m.dayOf(state.day, state.days)}`;
  if (state.atEnd) return `■ ${instant} · ${m.lastDetection}`;
  if (state.atStart) return `▶ ${instant} · ${m.firstDetection}`;
  return `❚❚ ${instant} · ${m.dayOf(state.day, state.days)}`;
}

/**
 * A short label for the cursor, in UTC, in the page's language.
 *
 * UTC and not Europe/Paris, even though the fire is French and the reader
 * probably is too. Every instant in this pack is a satellite acquisition or a
 * VIIRS granule, and both are published in UTC; converting for display would
 * mean the hour on the card no longer matches the hour in `event.json`, in the
 * Copernicus product name, or in anything a reader could go and check. The
 * zone is therefore written out, in both languages.
 *
 * @param {number} instantMs
 * @returns {string} e.g. `24 juil. 09:05 UTC`, `Jul 24 09:05 UTC`.
 */
export function megafireCursorLabel(instantMs) {
  if (!Number.isFinite(instantMs)) return '—';
  return `${megafireStepLabel(instantMs)} UTC`;
}
