/**
 * Display strings of `src/data/gbfsFeeds.js` — see docs/i18n/CONVENTIONS.md.
 *
 * Only the vehicle kinds are here. They are read by the browser
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

export default defineMessages({
  /** What a vehicle kind is called when nothing else names it. */
  fallbackVehicle: { fr: 'Véhicule', en: 'Vehicle' },
});
