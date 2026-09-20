/**
 * Legend captions of `src/data/aircraftClass.js` — see docs/i18n/CONVENTIONS.md.
 *
 * One silhouette, one caption, shared by the civil and the military layer so
 * the same drawing is never captioned two ways.
 *
 * Two words are load-bearing. `fastjet` names PERFORMANCE and not mission —
 * the class is reached from OpenSky category 7 ("high performance, >5g,
 * >400 kt") as much as from a type list, so "fighter" would assert a mission
 * from a speed reading. And `unknown` is worded exactly as `vesselLabels.js`
 * words it, in both languages: one phrase for one idea across air and sea.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  light: { fr: 'Avion léger', en: 'Light aircraft' },
  glider: { fr: 'Planeur', en: 'Glider' },
  turboprop: { fr: 'Turbopropulseur', en: 'Turboprop' },
  airliner: {
    fr: 'Jet monocouloir',
    en: 'Narrow-body jet',
    note: 'The French uses the industry\'s own word (monocouloir), not a calque of the fuselage wording.',
  },
  widebody: { fr: 'Gros-porteur', en: 'Wide-body jet' },
  quadjet: { fr: 'Quadriréacteur lourd', en: 'Heavy four-engine jet' },
  helicopter: { fr: 'Hélicoptère', en: 'Helicopter' },
  fastjet: {
    fr: 'Jet rapide',
    en: 'High-performance jet',
    note: 'Performance, never mission: the class can come from a speed category alone.',
  },
  bizjet: { fr: "Jet d'affaires", en: 'Business jet' },
  uav: { fr: 'Grand drone', en: 'Large drone' },
  unknown: {
    fr: 'Type non déclaré',
    en: 'Type not declared',
    note: 'Must stay word for word what vesselLabels.i18n.js says: one phrase across air and sea.',
  },
});
