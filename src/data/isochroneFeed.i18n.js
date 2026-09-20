/**
 * Display strings of `src/data/isochroneFeed.js` — see docs/i18n/CONVENTIONS.md.
 *
 * Almost all of this module is arithmetic and URL building, and it runs on the
 * server as well (`vite.config.js` imports its projections). Only the browser
 * calls what is below: the coordinate a card falls back to when the point has
 * neither an address nor a commune — the honest state of affairs for a click
 * in the middle of a forest.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** Cardinal letters of a decimal coordinate. French writes West as `O`. */
  cardinals: {
    north: { fr: 'N', en: 'N' },
    south: { fr: 'S', en: 'S' },
    east: { fr: 'E', en: 'E' },
    west: { fr: 'O', en: 'W', note: 'Ouest / West: the one letter that differs.' },
  },
  coordinate: {
    fr: (value, cardinal) => `${value} ${cardinal}`,
    en: (value, cardinal) => `${value} ${cardinal}`,
    sample: ['48.8566', 'N'],
  },
});
