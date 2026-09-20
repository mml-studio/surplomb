/**
 * Legend captions of `src/data/vesselLabels.js` — see docs/i18n/CONVENTIONS.md.
 *
 * The families are this app's reading of the AIS declared type, and the last
 * three entries are the ones that matter most: `unavailable` is a ship that
 * declared type 0 — the crew left the field empty, and no amount of listening
 * will fix it — while `silent` is a ship whose identity message has not been
 * heard YET, a number that falls as the server stays up. Two different facts,
 * two different captions, in both languages.
 *
 * `unknown` is worded exactly as `aircraftClass.i18n.js` words it: one phrase
 * for one idea across the air and sea layers, and a test pins the pair.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  tanker: { fr: 'Pétrolier / chimiquier', en: 'Tanker / chemical carrier' },
  cargo: { fr: 'Cargo, porte-conteneurs, vraquier', en: 'Cargo, container ship, bulk carrier' },
  passenger: { fr: 'Passagers, ferry, croisière', en: 'Passenger, ferry, cruise' },
  fishing: { fr: 'Pêche', en: 'Fishing' },
  service: { fr: 'Remorquage, pilotage, servitude', en: 'Towing, pilotage, port service' },
  pleasure: { fr: 'Plaisance et voile', en: 'Pleasure craft and sailing' },
  state: { fr: 'Secours, police, militaire', en: 'Rescue, police, military' },
  hsc: { fr: 'Navire à grande vitesse', en: 'High-speed craft' },
  other: { fr: 'Autre type déclaré', en: 'Other declared type' },
  unavailable: {
    fr: 'Type laissé vide à bord',
    en: 'Type left blank on board',
    note: 'AIS type 0: declared, and declared as nothing. Permanent until a register says otherwise.',
  },
  silent: {
    fr: 'Identité pas encore reçue',
    en: 'Identity not received yet',
    note: 'No identity message heard so far — transient, and it falls as the server stays up.',
  },
  unknown: {
    fr: 'Type non déclaré',
    en: 'Type not declared',
    note: 'Caption of last resort. Must stay word for word what aircraftClass.i18n.js says.',
  },
});
