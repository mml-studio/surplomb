/**
 * Strings of `src/data/buildingTheme.js` — the building volumes as a thematic
 * surface.
 *
 * ONE STRING, and it matters: what a volume no theme could measure is called
 * in the legend and in the count. A registering layer passes its own
 * (`sans diagnostic`, `sans mutation depuis 2019`); this is the default, for
 * the layer that passes none.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  unknown: {
    fr: 'sans donnée',
    en: 'no data',
    note: 'Legend row and row count for a building the active theme could not join.',
  },
});
