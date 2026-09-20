/**
 * The one string of src/data/amenitiesDepartements.js: a rung of the
 * choropleth ramp.
 *
 * A share, so a percent sign and the page's own decimal mark — `21,6 – 31 %`
 * in French, `21.6 – 31%` in English. A legend row reading “31 communes”
 * would be the wrong noun entirely, which is why the unit is in the message
 * and not left to the caller.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  band: {
    fr: (low, high) => `${low} – ${high} %`,
    en: (low, high) => `${low} – ${high}%`,
    sample: ['21.6', '31'],
  },
  top: {
    fr: (low) => `> ${low} %`,
    en: (low) => `> ${low}%`,
    note: 'The last rung is open-ended: everything above the highest break.',
    sample: ['74.3'],
  },
});
