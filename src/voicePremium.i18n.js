/**
 * Strings of src/voicePremium.js — see docs/i18n/CONVENTIONS.md.
 *
 * One line, in the mic's help tray, under a crown. It says what the trial
 * holds and never more: there is no paid tier to buy yet, only a waitlist
 * (src/waitlistCard.js), so “premium” names a feature and promises a date,
 * not a price.
 */
import { defineMessages } from './i18n/messages.js';
import { countNoun } from './i18n/format.js';

export default defineMessages({
  trial: {
    // French keeps its own condition: the module printed `commande` at 1 and
    // `commandes` above, which is also what French CLDR says.
    fr: (turns) => `Fonction premium · ${countNoun(turns, 'commande vocale offerte', 'commandes vocales offertes')}`,
    en: (turns) => `Premium feature · ${countNoun(turns, 'free spoken request', 'free spoken requests')}`,
    note: 'The voice trial can still open. `turns` is a count of spoken requests (3 by default).',
    sample: [3],
  },
  spent: {
    fr: 'Fonction premium · commandes offertes utilisées',
    en: 'Premium feature · free requests used up',
  },
  closed: {
    fr: 'Fonction premium · disponible à l’ouverture',
    en: 'Premium feature · available at launch',
    note: 'This instance keeps voice out of the trial (GEV_TRIAL_VOICE=0).',
  },
});
