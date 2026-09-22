/**
 * Strings of src/data/medecinsFrance.js — Health & emergency services.
 *
 * TWO CARDS, NOT ONE WITH A VARIANT. A practice card answers “who consults
 * here, at what price”; a hospital card cannot, because FINESS publishes no
 * practitioner, no tariff and no timetable. What it publishes is WHAT THE
 * PLACE IS. The English keeps that split, and keeps the one careful line that
 * crosses the two registers: the count beside a hospital is liberal practice
 * addresses within 50 m, never the hospital's staff, and the card says so.
 *
 * THE CAVEAT IS LAST AND CONDITIONAL. A dot at the center of a municipality is
 * not a dot at a door, so the card says which it is — but only when it is not
 * the exact door, because a card that always disclaims teaches its reader to
 * stop reading.
 *
 * APL is the DREES's *accessibilité potentielle localisée*, in consultations
 * per inhabitant per year. The acronym stays and is glossed once; the ladder's
 * five rungs name the two policy thresholds (2.5 and 4) that mean something
 * outside this file.
 *
 * The family, precision, tariff and standing words are shared with the feed
 * and live in `medecinsFrFeed.i18n.js`.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';
import { ordinal, plural } from '../i18n/format.js';

export default defineMessages({
  /** The five rungs of the APL ramp, in consultations per inhabitant per year. */
  aplBins: {
    fr: ['sous 2,0 — très sous-doté', '2,0 à 2,5 — sous-doté', '2,5 à 3,3 — sous la moyenne',
      '3,3 à 4,0 — au-dessus', 'au-delà de 4,0 — bien doté'],
    en: ['under 2.0 — severely under-served', '2.0 to 2.5 — under-served',
      '2.5 to 3.3 — below the national mean', '3.3 to 4.0 — above it',
      'over 4.0 — well served'],
    note: '2.5 and 4 are the ARS’s policy cuts; 3.26 is the national mean, so a '
      + 'department either clears the country or it does not.',
  },
  /** The ramp with the other paint on: a rung is a rank, not a value. */
  level: {
    fr: (index) => `niveau ${index}`,
    en: (index) => `level ${index}`,
    sample: [3],
  },

  /** What a place costs, from its practitioners. */
  tariff: {
    allFixed: {
      fr: 'tarif fixé pour tous (secteur 1)',
      en: 'set fee for everyone (sector 1)',
    },
    fixed: {
      fr: (count) => `${count} au tarif fixé`,
      en: (count) => `${count} at the set fee`,
      sample: [8],
    },
    capped: {
      fr: (count) => `${count} plafonné (OPTAM)`,
      en: (count) => `${count} capped (OPTAM)`,
      keep: ['OPTAM'],
      sample: [2],
    },
    free: {
      fr: (count) => `${count} en honoraires libres`,
      en: (count) => `${count} setting their own fees`,
      sample: [1],
    },
    other: {
      fr: (count) => `${count} sans secteur publié`,
      en: (count) => `${count} with no published sector`,
      sample: [1],
    },
  },

  /** The card of one hospital. */
  hospital: {
    fallbackTitle: { fr: 'Établissement hospitalier', en: 'Hospital establishment' },
    moreKinds: {
      fr: (count) => `· et ${count} autres catégories`,
      en: (count) => `· and ${count} more categories`,
      sample: [2],
    },
    entities: {
      fr: (count, names, more) => `${count} entités sur ce site : ${names}${more}`,
      en: (count, names, more) => `${count} entities on this site: ${names}${more}`,
      note: 'A campus folded onto one coordinate: the plate stands for more than one '
        + 'registered establishment, and says so.',
      sample: ['5', 'North wing, South wing', '…'],
    },
    liberals: {
      fr: (count, n) => `${count} ${plural(n, 'praticien', 'praticiens')} ${plural(n, 'libéral', 'libéraux')} à cette adresse`,
      en: (count, n) => `${count} ${plural(n, 'practitioner', 'practitioners')} in private practice at this address`,
      note: 'Never “the hospital’s doctors”: a salaried hospital doctor is not in the '
        + 'CNAM’s liberal register at all. `n` is the raw count, for the agreement.',
      sample: ['12', 12],
    },
    liberalsCaveat: {
      fr: '· le registre conventionné ne compte pas les salariés de l’hôpital',
      en: '· the health-insurance register does not count the hospital’s salaried staff',
    },
    finess: {
      fr: (ids, more) => `FINESS ${ids}${more}`,
      en: (ids, more) => `FINESS ${ids}${more}`,
      sample: ['010000024, 010000032', ', +3'],
    },
    communeCentre: {
      fr: '⚠ position au centre de la commune, pas à l’établissement',
      en: '⚠ position at the center of the municipality, not at the establishment',
    },
    position: {
      fr: (band) => `position : ${band}`,
      en: (band) => `position: ${band}`,
      note: '`band` is one of BAN’s categories, from `medecinsFrFeed.i18n.js`.',
      sample: ['street, without the number'],
    },
    updated: {
      fr: (date) => `Géolocalisation FINESS mise à jour le ${date}`,
      en: (date) => `FINESS geolocation updated on ${date}`,
      note: 'The date is the register’s own string, printed as published.',
      sample: ['2026-07-01'],
    },
  },

  /** The card of one practice. */
  practice: {
    fallbackTitle: { fr: 'Cabinet', en: 'Practice' },
    healthCentre: { fr: 'Centre de santé', en: 'Health center' },
    doctors: {
      fr: (count, n) => `${count} ${plural(n, 'médecin', 'médecins')}`,
      en: (count, n) => `${count} ${plural(n, 'doctor', 'doctors')}`,
      sample: ['15', 15],
    },
    unnamed: {
      fr: 'Praticiens non nommés par le registre',
      en: 'Practitioners not named by the register',
      note: 'A health center publishes specialties but no names. Say what is known.',
    },
    specialty: {
      fr: (label, count) => `· ${label}${count}`,
      en: (label, count) => `· ${label}${count}`,
      sample: ['Ophtalmologie', ' (3)'],
    },
    moreSpecialties: {
      fr: (count) => `· et ${count} autres spécialités`,
      en: (count) => `· and ${count} more specialties`,
      sample: [4],
    },
    practitioner: {
      fr: (civility, name, specialty, cost) => `${civility} ${name} — ${specialty}, ${cost}`,
      en: (civility, name, specialty, cost) => `${civility} ${name} — ${specialty}, ${cost}`,
      sample: ['Dr', 'MARTIN', 'General practice', 'set fee (sector 1)'],
    },
    /** The two civilities the register publishes, in the reader's own form. */
    civilityF: {
      fr: 'Dre',
      en: 'Dr',
      note: 'French feminizes the title; English does not.',
    },
    civilityM: { fr: 'Dr', en: 'Dr' },
    morePractitioners: {
      fr: (count) => `et ${count} autres praticiens`,
      en: (count) => `and ${count} more practitioners`,
      sample: [7],
    },
    namesUnavailable: {
      fr: 'Noms des praticiens indisponibles sur ce serveur',
      en: 'Practitioners’ names are not available on this server',
      note: 'The names are built by each deployment, not shipped in the repository; a '
        + 'server that never built them draws the layer without them.',
    },
    namesStale: {
      fr: 'Annuaire mis à jour à l’instant : rouvrez la fiche pour voir les noms',
      en: 'The directory was just updated: reopen the card to see the names',
      note: 'The server rebuilt its copy since the map was drawn; the map redraws on its own.',
    },
    decile: {
      fr: (n) => `${n}ᵉ dixième de France`,
      en: (n) => `${ordinal(n, { locale: 'en' })} tenth of France`,
      note: 'French prints a bare `ᵉ` here, including on the first decile — `1ᵉ`, not '
        + '`1ᵉʳ` — which is what the layer has always printed, so the suffix stays '
        + 'written out rather than going through the ordinal formatter. The English '
        + 'pins its own locale: an `en` leaf is never rendered in French.',
      sample: [3],
    },
    access: {
      fr: (standing, tenth) => `Accès local : ${standing}${tenth}`,
      en: (standing, tenth) => `Local access: ${standing}${tenth}`,
      note: '`tenth` is empty, or ` · ` and the decile.',
      sample: ['under-served area', ' · 3rd tenth of France'],
    },
    retirements: {
      fr: (share) => `Si les médecins de 62 ans et plus partaient : ${share}`,
      en: (share) => `If the doctors aged 62 and over left: ${share}`,
      note: 'The closest thing anyone publishes to “and in five years”. Negative, and '
        + 'printed as a percentage change.',
      sample: ['-22%'],
    },
    communeCentre: {
      fr: '⚠ position au centre de la commune, pas au cabinet',
      en: '⚠ position at the center of the municipality, not at the practice',
    },
    streetOnly: {
      fr: (precision) => `⚠ position à la ${precision}, pas au numéro`,
      en: (precision) => `⚠ position on the ${precision}, not at the number`,
      note: '`precision` is BAN’s own category key (`voie`, `lieu-dit`).',
      sample: ['voie'],
    },
    published: {
      fr: (address) => `Adresse publiée par le registre : ${address}`,
      en: (address) => `Address as published by the register: ${address}`,
      sample: ['12 RUE DE LA PAIX 75002 PARIS'],
    },
  },

  /** The card of one department, in the national regime. */
  departement: {
    apl: {
      fr: (value) => `APL ${value} consultations/habitant/an`,
      en: (value) => `APL ${value} consultations per inhabitant per year`,
      note: 'APL — local potential accessibility (DREES). Glossed on the row’s chip.',
      sample: ['3.26'],
    },
    retirements: {
      fr: (share) => `Départs des 62 ans et plus : ${share}`,
      en: (share) => `Retirements of the 62-and-over: ${share}`,
      sample: ['-22%'],
    },
    population: {
      fr: (count) => `${count} habitants`,
      en: (count) => `${count} inhabitants`,
      sample: ['1,412,000'],
    },
    counts: {
      fr: (doctors, addresses) => `${doctors} médecins · ${addresses} adresses`,
      en: (doctors, addresses) => `${doctors} doctors · ${addresses} addresses`,
      sample: ['4,182', '2,910'],
    },
  },

  /** The choropleth's own name, on the Cesium data source. */
  choroplethName: {
    fr: 'Médecins (FR) — accessibilité par département',
    en: 'Doctors (FR) — accessibility by department',
  },

  /** The two paints, and what each one puts on the map. */
  chips: {
    access: { fr: 'Accès', en: 'Access' },
    accessTitle: {
      fr: 'Peindre l’accessibilité (APL DREES) — combien de consultations un habitant peut atteindre',
      en: 'Paint accessibility (APL, DREES) — how many consultations one inhabitant can reach',
    },
    density: { fr: 'Densité', en: 'Density' },
    densityTitle: {
      fr: 'Peindre le nombre de médecins pour 100 000 habitants',
      en: 'Paint the number of doctors per 100,000 inhabitants',
    },
  },
});
