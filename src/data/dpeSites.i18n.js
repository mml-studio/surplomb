/**
 * Strings of `src/data/dpeSites.js` — how a diagnostic knows where it is.
 *
 * Only the placement line is a sentence; the rest of that module is grouping
 * and geometry. `vite.config.js` imports the grouping for `/api/dpe` and never
 * this line, which is drawn by `dpeFrance.js` in a browser.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * Four claims, and they are NOT interchangeable: a record, a resolution, a
 * guess with its distance, and a point on a street.
 */
export default defineMessages({
  placement: {
    namedNoShape: {
      fr: 'bâtiment nommé par le registre, emprise non publiée',
      en: 'building named by the register, footprint not published',
    },
    address: {
      fr: 'position BAN — géocodage à l’adresse, pas au bâtiment',
      en: 'BAN position — geocoded to the address, not to the building',
    },
    byId: {
      fr: 'bâtiment nommé par le diagnostic (id RNB)',
      en: 'building named by the rating itself (RNB id)',
      note: 'The diagnostic (DPE) carries the national building register id.',
    },
    inside: {
      fr: 'bâtiment retrouvé sous le point BAN',
      en: 'building found under the BAN point',
    },
    closestWithDistance: {
      fr: (metres) => `bâtiment le plus proche du point BAN — ${metres} m, déduction`,
      en: (metres) => `nearest building to the BAN point — ${metres} m, an inference`,
      sample: [12],
    },
    closest: {
      fr: 'bâtiment le plus proche du point BAN — déduction',
      en: 'nearest building to the BAN point — an inference',
    },
  },
});
