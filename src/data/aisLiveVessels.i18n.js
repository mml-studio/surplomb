/**
 * Strings of `src/data/aisLiveVessels.js` that this batch owns — see
 * docs/i18n/CONVENTIONS.md.
 *
 * The vessel card is mostly DATA (ship names, MMSI, destinations as typed on
 * the bridge) and units, and its family captions live in
 * `vesselLabels.i18n.js`. What is here is the sea-state line the buoy layer
 * lends this card, and the two accessibility strings the HUD carries.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The sea state at the nearest buoy, borrowed through `layerJoins.js`. */
  seaLine: {
    fr: (state, waveM, station, distance) => `MER ${state} · ${waveM} m · bouée ${station} à ${distance}`,
    en: (state, waveM, station, distance) => `SEA ${state} · ${waveM} m · buoy ${station} at ${distance}`,
    note: '`state` is already upper-cased and comes from the buoy layer; `station` is its id.',
    sample: ['SLIGHT', '1.2', '62069', '18 km'],
  },
  hud: {
    empty: { fr: 'AIS: --', en: 'AIS: --', note: 'The HUD slot with no vessel selected.' },
    focusVessel: {
      fr: (title, mmsi) => `Focus vessel ${title}, MMSI ${mmsi}`,
      en: (title, mmsi) => `Focus vessel ${title}, MMSI ${mmsi}`,
      note: 'Accessibility label of a card. Ships in English on the French globe too.',
      sample: ['MARIANNE', '227123456'],
    },
  },
});
