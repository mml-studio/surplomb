/**
 * What src/boot.js says itself: the tab's title on an English page, and the
 * one sentence left when the cockpit never arrives.
 *
 * The failure is written on the loading veil, which at that moment is the only
 * surface left on the page. Kept in its own catalog rather than in
 * main.i18n.js because `src/boot.js` is the entry chunk: it must not pull the
 * cockpit's module graph in to print one line.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  documentTitle: {
    fr: 'Surplomb — La France au rayon X.',
    en: 'Surplomb — France, X-rayed.',
    note: 'The tab’s title. The French is index.html’s <title>, which crawlers and link previews read; boot.js writes this one only on an English page.',
  },
  failure: {
    fr: 'Le globe n’a pas pu se charger. Rechargez la page.',
    en: 'The globe could not load. Reload the page.',
    note: 'The cockpit chunk failed to fetch or to evaluate; a reload is the only cure the reader has.',
  },
});
