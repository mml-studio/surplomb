/**
 * Strings of src/data/powerGridNational.js — what each voltage band IS in the
 * key the pre-built national pack shows.
 *
 * These four are the FRENCH half of the pair: the viewport key
 * (`powerGridFeed.i18n.js`) has to describe a band anywhere in the world, so
 * it names thresholds; this one is France only and names France's own nominal
 * voltages, which is what a reader looking at the country wants.
 *
 * The module is imported by `scripts/build-power-grid-national.mjs`, which
 * resolves no locale; nothing here is read there.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  tiers: {
    ehv: {
      fr: 'La colonne vertébrale : le 400 kV sur lequel RTE fait tourner le pays',
      en: 'The backbone: the 400 kV grid RTE runs the country on',
    },
    'hv-high': {
      fr: 'Le transport régional : le 225 kV',
      en: 'Regional transmission: 225 kV',
    },
    'hv-mid': {
      fr: 'Le 150 kV, un étage presque absent en France',
      en: '150 kV, a tier almost absent from France',
    },
    'hv-low': {
      fr: 'Le dernier étage avant la distribution : le 63 et le 90 kV',
      en: 'The last step before distribution: 63 and 90 kV',
    },
  },
});
