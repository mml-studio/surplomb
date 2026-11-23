/**
 * Strings of src/data/fuelPricesFrance.js — the Fuel prices (FR) layer: the
 * key's readings and bands, the station card and its label.
 *
 * *Gazole* is diesel and *E10* keeps its French pump name (SP95-E10), as the
 * glossary records. The bands speak of "the drop announced" because 12 to 18
 * cents is the government's own figure, not this project's.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  bands: {
    forte: {
      label: { fr: 'Baisse ≥ 18 c', en: 'Drop ≥ 18 c' },
      blurb: {
        fr: 'Plus que la baisse annoncée par l’État.',
        en: 'More than the drop the State announced.',
      },
    },
    annoncee: {
      label: { fr: 'Baisse de 12 à 18 c', en: 'Drop of 12 to 18 c' },
      blurb: {
        fr: 'Dans la fourchette annoncée.',
        en: 'Within the announced range.',
      },
    },
    partielle: {
      label: { fr: 'Baisse de 1 à 12 c', en: 'Drop of 1 to 12 c' },
      blurb: {
        fr: 'Moins que la baisse annoncée.',
        en: 'Less than the announced drop.',
      },
    },
    aucune: {
      label: { fr: 'Pas encore de baisse', en: 'No drop yet' },
      blurb: {
        fr: 'Moins de 1 c, ou en hausse.',
        en: 'Under 1 c, or up.',
      },
    },
    inconnue: {
      label: { fr: 'Non mesurable', en: 'Not measurable' },
      blurb: {
        fr: 'Pas de prix avant ou pas de prix récent.',
        en: 'No price before, or no recent price.',
      },
    },
    rupture: {
      label: { fr: 'En rupture', en: 'Out of stock' },
      blurb: {
        fr: 'Rupture déclarée par la station.',
        en: 'Shortage declared by the station.',
      },
    },
  },
  /** The price readings' bands: the national quintiles of the fuel read. */
  priceBands: {
    first: {
      fr: (cut) => `Moins de ${cut} €`,
      en: (cut) => `Under €${cut}`,
      sample: ['2.04'],
    },
    middle: {
      fr: (low, high) => `${low} à ${high} €`,
      en: (low, high) => `€${low} to €${high}`,
      sample: ['2.04', '2.09'],
    },
    last: {
      fr: (cut) => `${cut} € et plus`,
      en: (cut) => `€${cut} and over`,
      sample: ['2.21'],
    },
    cheapest: { fr: 'Les moins chères de France.', en: 'The cheapest in France.' },
    dearest: { fr: 'Les plus chères de France.', en: 'The dearest in France.' },
    noPrice: {
      label: { fr: 'Pas de prix', en: 'No price' },
      blurb: {
        fr: 'Ne vend pas ce carburant, ou prix de plus de 30 jours.',
        en: 'Does not sell it, or price over 30 days old.',
      },
    },
  },
  /** The key's chips: one per reading. */
  views: {
    baisse: {
      label: { fr: 'Baisse', en: 'Drop' },
      title: {
        fr: 'Couleur : baisse du gazole depuis la semaine du 24 au 30 octobre',
        en: 'Colour: diesel drop since the week of 24 to 30 October',
      },
    },
    price: {
      fr: (fuel) => `Couleur : prix du ${fuel}, des moins chères aux plus chères de France`,
      en: (fuel) => `Colour: ${fuel} price, from the cheapest to the dearest in France`,
      sample: ['SP95'],
    },
    heading: {
      fr: (fuel) => `Prix du ${fuel}`,
      en: (fuel) => `${fuel} price`,
      sample: ['SP95'],
    },
    dropHeading: { fr: 'Baisse du gazole', en: 'Diesel drop' },
    showAll: { fr: 'Tout afficher', en: 'Show all' },
    showAllTitle: {
      fr: (count) => `Réafficher ${count === 1 ? 'la ligne masquée' : `les ${count} lignes masquées`}`,
      en: (count) => `Show the ${count === 1 ? 'hidden line' : `${count} hidden lines`} again`,
      sample: [2],
    },
  },
  /** The fuels as the key and the card name them. */
  fuels: {
    gazole: { fr: 'gazole', en: 'diesel' },
    sp95: { fr: 'SP95', en: 'SP95' },
    sp98: { fr: 'SP98', en: 'SP98' },
    e10: { fr: 'E10', en: 'E10' },
    e85: { fr: 'E85', en: 'E85' },
    gplc: { fr: 'GPL', en: 'LPG' },
  },
  chips: {
    gazole: { fr: 'Gazole', en: 'Diesel' },
    sp95: { fr: 'SP95', en: 'SP95' },
    sp98: { fr: 'SP98', en: 'SP98' },
    e10: { fr: 'E10', en: 'E10' },
    e85: { fr: 'E85', en: 'E85' },
    gplc: { fr: 'GPL', en: 'LPG' },
  },
  legend: {
    off: { fr: 'Masqué. Cliquer pour réafficher.', en: 'Hidden. Click to show.' },
  },
  card: {
    station: { fr: 'Station', en: 'Station' },
    independent: { fr: 'Indépendant ou non renseigné', en: 'Independent or not recorded' },
    motorway: { fr: 'Autoroute', en: 'Motorway' },
    price: {
      fr: (price) => `${price} €/L`,
      en: (price) => `€${price}/L`,
      sample: ['1,689'],
    },
    drop: {
      fr: (cents) => `${cents} c`,
      en: (cents) => `${cents} c`,
      sample: ['−23'],
    },
    dropCaption: {
      fr: 'Gazole, depuis la semaine du 24 au 30 octobre',
      en: 'Diesel, since the week of 24 to 30 October',
    },
    gazoleNow: {
      fr: (price, when) => `Gazole : ${price} (${when})`,
      en: (price, when) => `Diesel: ${price} (${when})`,
      sample: ['€1.689/L', '23/11 09:10'],
    },
    gazoleBefore: {
      fr: (price) => `Avant : ${price} (moyenne du 24 au 30/10)`,
      en: (price) => `Before: ${price} (mean of 24–30 Oct)`,
      sample: ['€1.923/L'],
    },
    e10: {
      fr: (price, drop) => `E10 : ${price}${drop ? ` · ${drop}` : ''}`,
      en: (price, drop) => `E10: ${price}${drop ? ` · ${drop}` : ''}`,
      sample: ['€1.799/L', '−4 c'],
    },
    noGazole: { fr: 'Pas de prix du gazole récent.', en: 'No recent diesel price.' },
    fuelNow: {
      fr: (fuel, price, when) => `${fuel} : ${price}${when ? ` (${when})` : ''}`,
      en: (fuel, price, when) => `${fuel}: ${price}${when ? ` (${when})` : ''}`,
      sample: ['SP95', '€1.989/L', '23/11 09:10'],
    },
    priceCaption: {
      fr: (fuel) => `Prix du ${fuel}`,
      en: (fuel) => `${fuel} price`,
      sample: ['SP95'],
    },
    noFuel: {
      fr: (fuel) => `Pas de prix du ${fuel} récent.`,
      en: (fuel) => `No recent ${fuel} price.`,
      sample: ['SP95'],
    },
    shortage: {
      fr: (fuels) => `En rupture : ${fuels}`,
      en: (fuels) => `Out of stock: ${fuels}`,
      sample: ['SP95, E10'],
    },
    noBefore: {
      fr: 'Pas assez de prix déclarés du 24 au 30 octobre.',
      en: 'Too few prices declared between 24 and 30 October.',
    },
    market: {
      fr: 'L’écart inclut aussi l’évolution du marché.',
      en: 'The gap also includes what the market did.',
    },
    source: {
      fr: 'prix-carburants.gouv.fr · enseigne © contributeurs OpenStreetMap',
      en: 'prix-carburants.gouv.fr · brand © OpenStreetMap contributors',
    },
  },
  stale: {
    fr: 'Flux officiel injoignable : dernière copie affichée.',
    en: 'Official feed unreachable: showing the last copy.',
  },
});
