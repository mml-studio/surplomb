/**
 * The first-visit card's own waiting line — see src/firstRunExperience.js.
 *
 * Everything else the card says comes from `index.html` (its markup) or from
 * `src/firstRunVariants.i18n.js` (what each variant answers). This is the
 * default text of the status line while something is in flight and the caller
 * gave no sentence of its own.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  busy: { fr: 'Un instant…', en: 'One moment…' },
});
