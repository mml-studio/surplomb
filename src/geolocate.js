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
 * Widen the frame until the reported accuracy fits inside it.
 * @param {number} accuracyM - `coords.accuracy`, in metres.
 * @returns {number} Camera range in metres.
 */
export function geolocateRangeM(accuracyM) {
  const accuracy = Number(accuracyM);
  if (!Number.isFinite(accuracy) || accuracy <= 0) return GEOLOCATE_RANGE_M;
  return Math.max(GEOLOCATE_RANGE_M, accuracy * 2);
}

/**
 * What to tell the reader when there is no fix.
 *
 * Every message names the next move. "Position refusée" alone leaves a reader
 * tapping a button that will never work again, because Safari does not re-ask
 * once permission has been denied for an origin.
 *
 * @param {{code?: number}|null} error - A `GeolocationPositionError`, or null.
 * @param {boolean} [secure] - Whether the page is a secure context.
 * @returns {string}
 */
export function geolocateErrorMessage(error, secure = true) {
  if (!secure) return 'La localisation nécessite une connexion sécurisée (https)';
  switch (Number(error?.code)) {
    case 1: return 'Position refusée — autorisez la localisation dans les réglages du navigateur';
    case 2: return 'Position indisponible pour le moment';
    case 3: return 'La position met trop de temps à arriver';
    default: return 'Position indisponible pour le moment';
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
      reject({ code: 2, message: 'geolocation unavailable' });
      return;
    }
    geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position?.coords?.latitude);
        const lon = Number(position?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
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
