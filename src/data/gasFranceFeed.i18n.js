/**
 * Strings of src/data/gasFranceFeed.js — what an injection point reaching the
 * transmission network means, against one reaching the distribution network
 * this layer does not draw.
 *
 * Both blurbs were written in English upstream of this catalog and print
 * English to a French reader today; their `fr` is those bytes, unchanged,
 * because a translation batch may not move French output. They are reported
 * with the rest of this layer's inherited English.
 *
 * Operator names (NaTran, Teréga), the register's column names and the
 * fallback names a nameless row is given in the payload stay as they are:
 * this module runs on the server, where there is no reader.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  tiers: {
    transport: {
      label: { fr: 'Transport', en: 'Transmission' },
      blurb: {
        fr: 'Injects into the transmission network drawn here.',
        en: 'Injects into the transmission network drawn here.',
      },
    },
    distribution: {
      label: { fr: 'Distribution', en: 'Distribution' },
      blurb: {
        fr: 'Injects into the local distribution network, which this layer does not draw.',
        en: 'Injects into the local distribution network, which this layer does not draw.',
      },
    },
  },
});
