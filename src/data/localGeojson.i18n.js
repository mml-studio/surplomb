/**
 * Strings of src/data/localGeojson.js — what a SHIPPED feature is called when
 * it has no name of its own.
 *
 * One leaf per local pack, plus the fallback. These are not layer names: the
 * panel's row is the taxonomy's business (`layerTaxonomy.i18n.js`). This is the
 * word on the card and on the map label of a dam, a port or an airfield that
 * OpenStreetMap left untagged — roughly one French aerodrome in twelve.
 *
 * `Airfield` matches `airportsPack.i18n.js`, which already names the same thing
 * in the airports card; two English words for one French one is how a reader
 * concludes they are two things.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** Keyed by local layer id; `fallback` is a feature from a pack with no title. */
  namelessTitle: {
    'local-datacenters': { fr: 'Datacenter', en: 'Datacenter' },
    'local-dams': { fr: 'Barrage', en: 'Dam' },
    'local-ports': { fr: 'Port', en: 'Port' },
    'local-airports': { fr: 'Aérodrome', en: 'Airfield' },
    fallback: {
      fr: 'Feature',
      en: 'Feature',
      note: 'Inherited, and English on the French globe since upstream — the last '
        + 'resort for a pack that is neither of the four above, and there is none.',
    },
  },
});
