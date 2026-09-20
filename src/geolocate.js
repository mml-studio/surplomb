/**
 * "Where I am" — the one question a map on a phone is always asked, and the
 * only one this app had no answer to.
 *
 * `navigator.geolocation` appeared exactly zero times in this repository. A
 * visit with no share state lands on the Eiffel Tower (`src/camera.js`), which
 * is a fine opening shot and a poor answer to "what is around me": the reader
 * has to know the name of their own street, type it into a search field, and
 * hope the geocoder agrees. On a phone that is the difference between a map and
 * a demo.
 *
 * ── WHY `enableHighAccuracy: false` ─────────────────────────────────────────
 *
 * High accuracy powers the GPS radio and can take ten to thirty seconds
 * outdoors and never resolve indoors. The camera lands at 1.2 km of range: at
 * that scale the difference between a cell-tower fix (±500 m) and a satellite
 * fix (±5 m) is under half a screen, and the wait is the whole experience. The
 * cheap fix, now, beats the exact fix, later.
 *
 * ── WHY THE RANGE FOLLOWS THE ACCURACY ──────────────────────────────────────
 *
 * A desktop browser geolocating by IP can be five kilometres off and say so.
 * Framing that fix at 1.2 km puts the reader confidently in the wrong
 * neighbourhood, with no sign anything is wrong. Widening the frame to twice
 * the reported accuracy makes the true position visible inside the view, which
 * is the honest picture of a fix that vague.
 *
 * ── WHY NO `watchPosition` ──────────────────────────────────────────────────
 *
 * This is a verb, not a mode. A continuous watch keeps the radio awake for a
 * camera that has already arrived, and a globe that chases the reader down the
 * street is a globe they cannot pan away from.
 *
 * @module geolocate
 */

import messages from './geolocate.i18n.js';
import { DEFAULT_CITY_VIEW } from './defaultView.js';
import { prefersTopDownView } from './topDownView.js';

/**
 * The fix request, frozen so it reads the same everywhere.
 *
 * `maximumAge: 60000` accepts a fix the browser took in the last minute: a
 * reader who taps the button twice should not wait for a second fix that will
 * land on the same block.
 */
export const GEOLOCATE_OPTIONS = Object.freeze({
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 60000,
});

/**
 * Camera range for a fix of unremarkable accuracy, in metres.
 *
 * 1 200 m = the 600 m above-ground settle altitude of `src/camera.js` divided
 * by sin(30°), the pitch the flight uses — so "Autour de moi" arrives at the
 * same apparent height as the opening shot, and the two framings match.
 */
export const GEOLOCATE_RANGE_M = 1200;

/**
 * The same rule, straight down: range IS height, so the opening shot's height
 * is the range. On a 390 px portrait screen that is about 320 m of street
 * across, which is where a map app lands its own "my location" (zoom 17 at
 * Paris's latitude, 0.79 m per CSS pixel). 1 200 m straight down would be
 * twice as high as the phone's own opening shot.
 */
export const GEOLOCATE_TOP_DOWN_RANGE_M = DEFAULT_CITY_VIEW.settleAltitudeM;

/**
 * Widen the frame until the reported accuracy fits inside it.
 * @param {number} accuracyM - `coords.accuracy`, in metres.
 * @param {{topDown?: boolean}} [options] - Whether the flight looks straight
 *   down; the session's answer by default (see `src/topDownView.js`).
 * @returns {number} Camera range in metres.
 */
export function geolocateRangeM(accuracyM, { topDown = prefersTopDownView() } = {}) {
  const base = topDown ? GEOLOCATE_TOP_DOWN_RANGE_M : GEOLOCATE_RANGE_M;
  const accuracy = Number(accuracyM);
  if (!Number.isFinite(accuracy) || accuracy <= 0) return base;
  return Math.max(base, accuracy * 2);
}

/**
 * What to tell the reader when there is no fix.
 *
 * Every message names the next move (src/geolocate.i18n.js): "Position
 * refusée" alone leaves a reader tapping a button that will never work again,
 * because Safari does not re-ask once permission has been denied for an
 * origin.
 *
 * @param {{code?: number}|null} error - A `GeolocationPositionError`, or null.
 * @param {boolean} [secure] - Whether the page is a secure context.
 * @returns {string}
 */
export function geolocateErrorMessage(error, secure = true) {
  const m = messages();
  if (!secure) return m.insecure;
  switch (Number(error?.code)) {
    case 1: return m.denied;
    case 2: return m.unavailable;
    case 3: return m.timeout;
    default: return m.unavailable;
  }
}

/**
 * Ask once for a fix.
 *
 * Rejects with the browser's own error object so {@link geolocateErrorMessage}
 * can read its `code`; a missing API rejects with `code: 2`, which is the same
 * thing from the reader's side.
 *
 * @param {object} [options]
 * @param {object} [options.geolocation] - `navigator.geolocation`, injected.
 * @param {object} [options.positionOptions]
 * @returns {Promise<{lat: number, lon: number, accuracyM: number}>}
 */
export function requestCurrentPosition({
  geolocation = globalThis.navigator?.geolocation,
  positionOptions = GEOLOCATE_OPTIONS,
} = {}) {
  return new Promise((resolve, reject) => {
    if (typeof geolocation?.getCurrentPosition !== 'function') {
      // A diagnostic for a console, never read by a reader: the words come
      // from `code`, through geolocateErrorMessage.
      // i18n-ignore-next-line
      reject({ code: 2, message: 'geolocation unavailable' });
      return;
    }
    geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position?.coords?.latitude);
        const lon = Number(position?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          // A diagnostic, as above.
          // i18n-ignore-next-line
          reject({ code: 2, message: 'fix carried no coordinates' });
          return;
        }
        resolve({ lat, lon, accuracyM: Number(position?.coords?.accuracy) || 0 });
      },
      (error) => reject(error || { code: 2 }),
      positionOptions,
    );
  });
}

/**
 * Whether this session can even ask.
 *
 * A button that is present and always fails is worse than no button: over
 * plain HTTP every browser refuses the API outright.
 *
 * @param {object} [options]
 * @param {object} [options.nav]
 * @param {boolean} [options.secure]
 * @returns {boolean}
 */
export function canGeolocate({
  nav = globalThis.navigator,
  secure = globalThis.isSecureContext !== false,
} = {}) {
  return !!secure && typeof nav?.geolocation?.getCurrentPosition === 'function';
}
