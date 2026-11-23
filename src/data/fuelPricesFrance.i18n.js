/**
 * Strings of src/data/fuelPricesFrance.js — the Fuel prices (FR) layer: the
 * key's five bands, the station card and its label.
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
  },
  legend: {
    hidden: {
      fr: (blurb, count) => `${blurb} ${count} masquée${count > 1 ? 's' : ''}.`,
      en: (blurb, count) => `${blurb} ${count} hidden.`,
      sample: ['—', 3],
    },
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
