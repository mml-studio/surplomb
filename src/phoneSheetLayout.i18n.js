/**
 * Strings of src/phoneSheetLayout.js — see docs/i18n/CONVENTIONS.md.
 *
 * Only the chip labels. Everything else in that module is arithmetic.
 *
 * A chip is read at a glance while a thumb scrolls past it, so both languages
 * get one or two words rather than the layer's full row title: the glossary's
 * *Public transit* is a row, *Transit* is a chip.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  chips: {
    flights: { fr: 'Vols', en: 'Flights', note: 'Layer `flights` — Live flights.' },
    traffic: { fr: 'Trafic', en: 'Traffic', note: 'Layer `traffic` — Road traffic.' },
    transit: { fr: 'Transports', en: 'Transit', note: 'Layer `transit-fr` — Public transit.' },
    bikes: { fr: 'Vélos', en: 'Bikes', note: 'Layer `bikeshare` — Bikes and shared vehicles.' },
    charging: { fr: 'Recharge', en: 'Charging', note: 'Layer `irve-fr` — EV charging stations.' },
    weather: { fr: 'Météo', en: 'Weather', note: 'Layer `meteofrance-vigilance` — weather warnings.' },
    schools: { fr: 'Écoles', en: 'Schools', note: 'Layer `schools-fr`.' },
    prices: {
      fr: 'Prix immo',
      en: 'Prices',
      note: 'Layer `dvf-sales` — property prices (DVF). The full row title is '
        + 'longer in both languages; a chip gets the short form.',
    },
  },
});
