/**
 * Strings of `src/data/cadastreParcelDetail.js` — what is built on a cadastral
 * parcel, as the card lines a reader sees.
 *
 * Two of them name a RULE rather than a figure ("footprint centre inside this
 * polygon", "partial search"), and that is the point: the count and the
 * surface are a measurement this application makes, not a number anyone
 * publishes about this parcel.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  /** The address line, and the distance that qualifies it. */
  addressPoint: {
    fr: (label, distance) => `${label} · point adresse à ${distance}`,
    en: (label, distance) => `${label} · address point ${distance} away`,
    note: 'Printed past ten metres: the reader’s only clue that the address is the NEAREST one.',
    sample: ['19 Avenue Raymond Poincaré 75116 Paris', '54 m'],
    keep: ['Avenue Raymond Poincaré'],
  },
  /** Nothing built, or nothing found — two different facts. */
  noneFound: {
    fr: 'Aucun bâti trouvé — recherche partielle (parcelle à cheval sur plusieurs tuiles)',
    en: 'No buildings found — partial search (the parcel straddles several tiles)',
  },
  none: {
    fr: 'Aucun bâtiment BD TOPO sur cette parcelle',
    en: 'No BD TOPO building on this parcel',
  },
  /** The headline: how many, how much ground, how much of the parcel. */
  buildings: {
    fr: (count) => `${count} bâtiment${count > 1 ? 's' : ''}`,
    en: (count) => `${count} ${plural(count, 'building', 'buildings', { locale: 'en' })}`,
    note: '`count` is already formatted; the plural reads the raw number beside it.',
    sample: ['2'],
  },
  footprint: {
    fr: (area) => `${area} m² au sol`,
    en: (area) => `${area} m² of footprint`,
    sample: ['1,250'],
  },
  coverage: {
    fr: (percent) => `${percent} de la parcelle`,
    en: (percent) => `${percent} of the parcel`,
    sample: ['42%'],
  },
  /** The second line: storeys, height, dwellings, dominant use. */
  storeys: {
    fr: (storeys) => `R+${storeys}`,
    en: (storeys) => `ground + ${storeys}`,
    note: 'The French notation counts floors above the ground floor; English spells it out.',
    sample: [7],
  },
  tall: {
    fr: (height) => `${height} de haut`,
    en: (height) => `${height} tall`,
    sample: ['27 m'],
  },
  dwellings: {
    fr: (dwellings) => `${dwellings} logements`,
    en: (dwellings) => `${dwellings} dwellings`,
    sample: ['30'],
  },
  /** The rule, named, because the join is this application's and not IGN's. */
  rulePartial: {
    fr: 'Bâti IGN BD TOPO, centre d\'emprise dans la parcelle — recherche partielle',
    en: 'IGN BD TOPO buildings, footprint centre inside the parcel — partial search',
  },
  rule: {
    fr: 'Bâti IGN BD TOPO, joint par centre d\'emprise (aucun lien publié)',
    en: 'IGN BD TOPO buildings, joined by footprint centre (no published link)',
  },
  span: {
    fr: (distance) => `Plus grande dimension ${distance}`,
    en: (distance) => `Longest dimension ${distance}`,
    sample: ['48 m'],
  },
});
