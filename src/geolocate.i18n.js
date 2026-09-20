/**
 * Strings of src/geolocate.js — see docs/i18n/CONVENTIONS.md.
 *
 * Every message names the NEXT MOVE. “Position refused” alone leaves a reader
 * tapping a button that will never work again, because Safari does not re-ask
 * once permission has been denied for an origin.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  insecure: {
    fr: 'La localisation nécessite une connexion sécurisée (https)',
    en: 'Locating needs a secure connection (https)',
    note: 'Plain HTTP: every browser refuses the API outright, so the button is hidden — this is the belt.',
  },
  denied: {
    fr: 'Position refusée — autorisez la localisation dans les réglages du navigateur',
    en: 'Location denied — allow it in your browser settings',
    note: 'GeolocationPositionError code 1.',
  },
  unavailable: {
    fr: 'Position indisponible pour le moment',
    en: 'Location unavailable right now',
    note: 'Code 2, and the fallback for anything unrecognized.',
  },
  timeout: {
    fr: 'La position met trop de temps à arriver',
    en: 'The fix is taking too long to arrive',
    note: 'Code 3, after the 8 s in GEOLOCATE_OPTIONS.',
  },
});
