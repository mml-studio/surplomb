/**
 * On a phone, the camera looks straight down.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 *
 * Every framing in this app was tuned for a desktop cockpit: -25° to -35°
 * below the horizon, heading wherever the landmark looks best. On a phone that
 * angle is the wrong picture twice over.
 *
 *   - A portrait screen is tall. At -30° its upper half is the horizon: street
 *     names foreshortened to a sliver, labels stacked on top of each other, and
 *     the place the reader asked for pushed into the bottom third, under the
 *     sheet. Owner field test 2026-09-17: "une vue à moitié allongée".
 *   - The reader cannot fix it. `touchCamera.js` unbinds tilt on glass, on
 *     purpose, so whatever pitch the app lands on is the pitch they keep.
 *
 * The reference every phone user carries is a map app: north up, straight
 * down, the requested place under the centre of the screen. This module is
 * that rule, in one place, so the four framings that aim at the ground (boot,
 * "Autour de moi" and every landmark flight, a clicked fire or vessel) cannot
 * drift apart.
 *
 * ── WHAT IS DELIBERATELY LEFT ALONE ─────────────────────────────────────────
 *
 *   - A share link restores the pitch it was written with. It is an authored
 *     view, and its position is the author's EYE, not the point they looked
 *     at: forcing -90° on it would look at the ground under the author's
 *     camera, which at -30° is a kilometre from what they shared.
 *   - Viewport flights (`flyTo` with a rectangle) are already straight down.
 *   - The route dolly and the orbit are cinematic verbs the reader asked for
 *     by name; a dolly at -90° has no forward axis at all.
 *   - A tablet keeps the desktop angles: it has the desktop layout and the
 *     room for a horizon (see `isPhoneShell`).
 *
 * @module topDownView
 */

import { isPhoneShell } from './inputMode.js';

/** Straight down, north up — the only pose a phone framing uses. */
export const TOP_DOWN_VIEW = Object.freeze({ pitchDeg: -90, headingDeg: 0 });

/**
 * Whether this session frames the ground straight down.
 * @returns {boolean}
 */
export function prefersTopDownView() {
  return isPhoneShell();
}

/**
 * The angles a framing is actually flown at.
 *
 * @param {{pitchDeg: number, headingDeg: number}} angles - The framing as
 *   tuned for a desktop.
 * @param {{topDown?: boolean}} [options] - Override the session's answer.
 * @returns {{pitchDeg: number, headingDeg: number}}
 */
export function framingAngles({ pitchDeg, headingDeg }, { topDown = prefersTopDownView() } = {}) {
  return topDown ? { ...TOP_DOWN_VIEW } : { pitchDeg, headingDeg };
}
