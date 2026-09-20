/**
 * Display strings of `src/data/gbfsFeeds.js` — see docs/i18n/CONVENTIONS.md.
 *
 * The vehicle kinds, and the two stand-in labels the index stores when a
 * dataset names neither its licence nor itself. Both are read by the browser
 * (`sharedMobilityFrance.js`) and by nothing on the server, which imports this
 * module for its parsers and its box arithmetic alone.
 *
 * `scooter` is the GBFS kick-scooter — a trottinette — and `moped` is the
 * seated one. The two words are false friends across the Channel and the
 * silhouettes on screen differ, so the English keeps them apart: `E-scooter`
 * for the one you stand on, `Moped` for the one you sit on. `VAE` is the
 * French acronym for an e-bike and stays invariable in the plural.
 */
import { defineMessages } from '../i18n/messages.js';

/** One vehicle, keyed by the kind this app derives from GBFS. */
export const VEHICLE_KIND_NAMES = defineMessages({
  bike: { fr: 'Vélo', en: 'Bike' },
  ebike: { fr: 'VAE', en: 'E-bike', note: 'VAE = vélo à assistance électrique.' },
  scooter: { fr: 'Trottinette', en: 'E-scooter', note: 'GBFS `scooter`: the kick-scooter you stand on.' },
  moped: { fr: 'Scooter', en: 'Moped', note: 'GBFS `moped`: the seated one.' },
  car: { fr: 'Voiture', en: 'Car' },
  other: { fr: 'Véhicule', en: 'Vehicle' },
});

/** Several of them. */
export const VEHICLE_KIND_PLURAL_NAMES = defineMessages({
  bike: { fr: 'Vélos', en: 'Bikes' },
  ebike: { fr: 'VAE', en: 'E-bikes', note: 'The French acronym is invariable.' },
  scooter: { fr: 'Trottinettes', en: 'E-scooters' },
  moped: { fr: 'Scooters', en: 'Mopeds' },
  car: { fr: 'Voitures', en: 'Cars' },
  other: { fr: 'Véhicules', en: 'Vehicles' },
});

/**
 * The two stand-ins this app WRITES into the committed index, keyed by the
 * value it wrote.
 *
 * The index and the proxy both run without a locale, so the French string is
 * the DATA — it is in the file on disk, in the payload, and in the cache. Only
 * its display is translated, with `labelFor`, which hands back anything it
 * does not know: a real licence name (`Licence Ouverte 2.0`, `ODbL 1.0`) is a
 * proper noun and reads the same in both languages, and a real system name is
 * whatever the operator called itself.
 */
export const GBFS_PAYLOAD_LABELS = defineMessages({
  'Licence non précisée': { fr: 'Licence non précisée', en: 'License not specified' },
  'Autre licence ouverte': { fr: 'Autre licence ouverte', en: 'Other open license' },
  'Système sans nom': { fr: 'Système sans nom', en: 'Unnamed system' },
});

export default defineMessages({
  /** What a vehicle kind is called when nothing else names it. */
  fallbackVehicle: { fr: 'Véhicule', en: 'Vehicle' },
});
