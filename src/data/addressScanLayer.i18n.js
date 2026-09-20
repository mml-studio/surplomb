/**
 * Strings of `src/data/addressScanLayer.js` — the helper seven layers share
 * to scan a point, draw its marks and open the card a click selects.
 *
 * Almost everything on that card comes from the LAYER that built it; the one
 * word this file owns is what a card with no title of its own is called.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  untitled: {
    fr: 'Sans titre',
    en: 'Untitled',
    note: 'Heading of a selected card whose layer published none.',
  },
});
