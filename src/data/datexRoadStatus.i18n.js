/**
 * Strings of `src/data/datexRoadStatus.js` — see docs/i18n/CONVENTIONS.md.
 *
 * Almost nothing is here on purpose. The four states a reader sees are the
 * shared congestion ladder's (`congestionLadder.i18n.js`), because the two
 * traffic layers print them on one fused row and must say one word per rung;
 * the agglomeration table is city names, which are data.
 *
 * What is left is the state the publisher sends when its own sensors are down,
 * and the unit of an hourly flow. `véh/h` is spelled exactly as
 * `comptagesParis` spells it: the taxonomy presents the two layers as one
 * subject measured twice, and one subject may not carry two units.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  unknownState: {
    fr: 'Non communiqué',
    en: 'Not reported',
    note: 'DATEX `unknown`: the publisher says its own sensors are down. Not "no data".',
  },
  vehPerHour: {
    fr: 'véh/h',
    en: 'veh/h',
    note: 'Unit of an hourly flow rate, printed after an already-formatted number.',
  },
});
