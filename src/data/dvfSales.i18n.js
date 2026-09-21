/**
 * Strings of `src/data/dvfSales.js` — the property sales (DVF) layer.
 *
 * Every number arrives already formatted (`formatEuros`, `formatEurosPerM2`,
 * `formatNumber`): a message places words around a value, it never formats
 * one. The layer's prose is ARGUED — a ratio whose denominator is not written
 * down is not a measurement — so the English makes the same claim, caveat for
 * caveat.
 *
 * THE REGISTER'S OWN VOCABULARY IS DATA. `type_local` (`Appartement`,
 * `Maison`, `Dépendance`, `Local industriel, commercial ou assimilé`) and
 * `nature_mutation` (`Vente`, `Echange`…) stay as `dvfFeed.js` parsed them, in
 * code, in caches and in share links; {@link TYPE_LOCAL} and {@link NATURE}
 * are what a card displays instead, through `labelFor()`.
 */
import { countNoun, formatInteger } from '../i18n/format.js';
import { plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

/**
 * A leaf that counts its own noun says which language it is in.
 *
 * `countNoun` formats the number in the PAGE's locale by default, and a leaf
 * is not a page: the parity test renders every English message while the
 * ambient locale is French, and a `1 324` would have shipped inside an
 * English sentence.
 */
const FR = Object.freeze({ locale: 'fr' });
const EN = Object.freeze({ locale: 'en' });

/**
 * DVF `type_local`, as the register publishes it. Keys are the raw values.
 *
 * The four the register uses. An unknown one is printed as it came, which is
 * what `labelFor()` does: a new category must never render as an empty cell.
 */
export const TYPE_LOCAL = defineMessages({
  Appartement: { fr: 'Appartement', en: 'Apartment' },
  Maison: { fr: 'Maison', en: 'House' },
  Dépendance: { fr: 'Dépendance', en: 'Outbuilding' },
  'Local industriel, commercial ou assimilé': {
    fr: 'Local industriel, commercial ou assimilé',
    en: 'Commercial or industrial premises',
  },
});

/**
 * DVF `nature_mutation`. Keyed by the register's own wording, including its
 * unaccented `Echange`.
 */
export const NATURE = defineMessages({
  Vente: { fr: 'Vente', en: 'Sale' },
  "Vente en l'état futur d'achèvement": {
    fr: "Vente en l'état futur d'achèvement",
    en: 'Off-plan sale (VEFA)',
    note: 'A sale of a dwelling that is not built yet — the French VEFA.',
  },
  "Vente terrain à bâtir": { fr: 'Vente terrain à bâtir', en: 'Building-land sale' },
  Echange: { fr: 'Echange', en: 'Swap' },
  Adjudication: { fr: 'Adjudication', en: 'Court-ordered auction' },
  'Expropriation': { fr: 'Expropriation', en: 'Expropriation' },
});

/**
 * How many items a pre-joined list holds — `2023, 2024` is two.
 *
 * The caller formats the list before the message sees it, so the message has
 * to count the separators to choose singular or plural. A number is returned
 * as itself, so a caller that already counted keeps working.
 */
function countItems(list) {
  if (typeof list === 'number') return list;
  const text = String(list ?? '').trim();
  return text ? text.split(/\s*(?:,|·|;| and | et )\s*/).filter(Boolean).length : 0;
}

export default defineMessages({
  /** The three type chips, which filter the map (`drawOnlyParams`). */
  filters: {
    tous: {
      label: { fr: 'Toutes', en: 'All' },
      title: {
        fr: 'Toutes les mutations du rayon — logements, locaux, dépendances et terrains',
        en: 'Every sale in the radius — dwellings, commercial premises, outbuildings and land',
      },
    },
    appartement: {
      label: { fr: 'Appart.', en: 'Apartments' },
      title: {
        fr: 'Seulement les mutations qui portent un appartement, cave ou parking compris',
        en: 'Only the sales that carry an apartment — its cellar or parking space included',
      },
    },
    maison: {
      label: { fr: 'Maisons', en: 'Houses' },
      title: {
        fr: 'Seulement les mutations qui portent une maison — leur prix porte le terrain, '
          + 'qui n’est pas neutralisé',
        en: 'Only the sales that carry a house — their price carries the land, which is not '
          + 'factored out',
      },
    },
  },

  /** The five frozen classes of the ramp, in ratio to the commune median. */
  classes: {
    veryHigh: {
      label: { fr: '+25 % et plus', en: '+25% and over' },
      blurb: {
        fr: 'Au moins un quart au-dessus du médian de la commune.',
        en: 'At least a quarter above the municipality’s median.',
      },
    },
    high: {
      label: { fr: '+5 à +25 %', en: '+5% to +25%' },
      blurb: {
        fr: 'Au-dessus du médian de la commune, hors de la bande d’équivalence.',
        en: 'Above the municipality’s median, outside the band of equivalence.',
      },
    },
    atMedian: {
      label: { fr: '−5 à +5 % — au médian', en: '−5% to +5% — at the median' },
      blurb: {
        fr: 'Dans les 5 % du médian de la commune : le prix courant du territoire.',
        en: 'Within 5% of the municipality’s median: the going price of this territory.',
      },
    },
    low: {
      label: { fr: '−25 à −5 %', en: '−25% to −5%' },
      blurb: {
        fr: 'Sous le médian de la commune, hors de la bande d’équivalence.',
        en: 'Below the municipality’s median, outside the band of equivalence.',
      },
    },
    veryLow: {
      label: { fr: 'moins de −25 %', en: 'less than −25%' },
      blurb: {
        fr: 'Au moins un quart sous le médian de la commune.',
        en: 'At least a quarter below the municipality’s median.',
      },
    },
  },

  /** The two rows that are not price classes, and say which admission they are. */
  noRatio: {
    label: { fr: 'sans prix au m²', en: 'no price per m²' },
    blurb: {
      fr: 'Mutation qui a acheté autre chose qu’un seul logement — un immeuble de 179 lots, '
        + 'un appartement avec un commerce — ou un échange. Le registre ne dit pas comment le '
        + 'prix se répartit, donc rien n’est peint : la vente est dessinée, pas évaluée.',
      en: 'A sale that bought something other than one dwelling — a building of 179 lots, '
        + 'an apartment with a shop — or a swap. The register does not say how the price '
        + 'splits, so nothing is painted: the sale is drawn, not valued.',
    },
  },
  noBasis: {
    label: { fr: 'sans médian de référence', en: 'no reference median' },
    blurb: {
      fr: 'Un prix au m² sans commune à le rapporter. Cet état ne devrait pas exister — '
        + 'les ventes servies sont un sous-ensemble des mutations dont le médian est calculé — '
        + 'et il est peint plutôt que masqué pour qu’il ne passe jamais pour une classe de prix.',
      en: 'A price per m² with no municipality to compare it against. This state should not '
        + 'exist — the sales served are a subset of the transactions the median is computed '
        + 'from — and it is painted rather than hidden so it can never pass for a price class.',
    },
  },
  /** A class's tooltip: its DEFINITION first, then what it means today. */
  classTooltip: {
    fr: (label, blurb) => `${label} — ${blurb}`,
    en: (label, blurb) => `${label} — ${blurb}`,
    sample: ['+25% and over', 'At least a quarter above the municipality’s median.'],
  },

  /** The editions the reference was computed over. */
  years: {
    one: { fr: (year) => `édition ${year}`, en: (year) => `edition ${year}`, sample: [2024] },
    span: {
      fr: (first, last) => `éditions ${first} à ${last}`,
      en: (first, last) => `editions ${first} to ${last}`,
      sample: [2021, 2025],
    },
    list: {
      fr: (years) => `éditions ${years}`,
      en: (years) => `editions ${years}`,
      note: '`years` is an already-joined list (`2021, 2023`).',
      sample: ['2021, 2023'],
    },
  },

  /** The denominator, named — the sentence that travels with every colour. */
  reference: {
    thisCommune: { fr: 'cette commune', en: 'this municipality' },
    theCommune: { fr: 'la commune', en: 'the municipality' },
    byCode: {
      fr: (code) => `commune ${code}`,
      en: (code) => `municipality ${code}`,
      note: 'The commune has a code and no published name.',
      sample: ['75113'],
    },
    none: {
      fr: (territory) => `Aucun médian pour ${territory} : rien à rapporter`,
      en: (territory) => `No median for ${territory}: nothing to compare against`,
      sample: ['this municipality'],
    },
    absent: {
      fr: 'Dénominateur indisponible : rien à rapporter',
      en: 'Denominator unavailable: nothing to compare against',
      note: 'An older cached answer, with no reference block at all.',
    },
    median: {
      fr: (territory, price) => `Médian de ${territory} ${price}`,
      en: (territory, price) => `${territory} median ${price}`,
      sample: ['Paris 13e Arrondissement', '€8,956/m²'],
      keep: ['Paris 13e Arrondissement'],
    },
  },

  /** The class breaks restated in €/m² at the current reference (D2). */
  bounds: {
    under: {
      fr: (high) => `moins de ${high}`,
      en: (high) => `less than ${high}`,
      sample: ['€6,717/m²'],
    },
    over: {
      fr: (low) => `${low} et plus`,
      en: (low) => `${low} and over`,
      sample: ['€11,195/m²'],
    },
    between: {
      fr: (low, high) => `${low} à ${high}`,
      en: (low, high) => `€${low} to ${high}`,
      note: '`low` is a bare number, `high` carries the unit — the French unit is a suffix '
        + 'and the English symbol a prefix, so only the message can place it.',
      sample: ['8,508', '€9,404/m²'],
    },
  },

  /** The block's own line, above the classes it divides. */
  note: {
    frozenClasses: {
      fr: 'classes gelées à ±5 % et ±25 % de ce médian',
      en: 'classes frozen at ±5% and ±25% of this median',
    },
    tintedGround: {
      fr: 'sol teinté = la parcelle vendue',
      en: 'tinted ground = the plot that was sold',
    },
  },

  /** The A5 line: what this answer had to leave out. */
  disclosure: {
    noParcels: {
      fr: 'parcelles indisponibles pour cette commune : les ventes sont dessinées, le sol '
        + 'qu’elles ont acheté ne l’est pas',
      en: 'parcels unavailable for this municipality: the sales are drawn, the ground they '
        + 'bought is not',
    },
    filtered: {
      fr: (label, hidden) => `filtre « ${label} » : ${hidden} autre(s) mutation(s) non `
        + 'dessinée(s), que le médian de référence compte quand même',
      en: (label, hidden) => `“${label}” filter: ${hidden} other ${plural(hidden, 'sale', 'sales', { locale: 'en' })} not drawn, which the `
        + 'reference median counts all the same',
      sample: ['Houses', 12],
    },
    radius: {
      fr: (metres) => `rayon ${metres} m`,
      en: (metres) => `${metres} m radius`,
      sample: [300],
    },
    truncated: {
      fr: (drawn, total) => `écrêté à ${drawn} sur ${total}, les plus proches`,
      en: (drawn, total) => `capped at ${drawn} of ${total}, the nearest ones`,
      sample: [400, 412],
    },
    unplaced: {
      fr: (count) => `${count} mutation(s) sans coordonnée publiée, comptée(s) dans `
        + 'le médian et impossibles à dessiner',
      en: (count) => `${count} ${plural(count, 'sale', 'sales', { locale: 'en' })} with no published coordinate, counted in the median `
        + 'and impossible to draw',
      sample: [1],
    },
  },

  /** The plots washed under the markers. */
  parcel: {
    fallbackName: { fr: 'Parcelle', en: 'Parcel' },
    id: {
      fr: (identifier) => `parcelle ${identifier}`,
      en: (identifier) => `parcel ${identifier}`,
      sample: ['64102000AB0001'],
    },
    lastSale: {
      fr: 'dernière mutation connue de cette parcelle dans le rayon scruté',
      en: 'the most recent sale known for this parcel inside the scanned radius',
    },
  },

  /** One mutation's card. */
  card: {
    fallbackName: { fr: 'Mutation', en: 'Sale' },
    typeUnpublished: { fr: 'type non publié', en: 'type not published' },
    typeWithSurface: {
      fr: (types, surface, total) => `${types} — ${surface} m²${total ? ' au total' : ''}`,
      en: (types, surface, total) => `${types} — ${surface} m²${total ? ' in total' : ''}`,
      note: 'The built floor area DVF publishes (`surface_reelle_bati`), summed over the '
        + 'dwellings of the sale; `total` is true when there were several.',
      sample: ['Apartment + Outbuilding', '78', false],
    },
    noComparable: { fr: 'pas de €/m² comparable', en: 'no comparable €/m²' },
    dwellings: {
      fr: (count) => `${count} logements — pas de €/m² comparable`,
      en: (count) => `${count} dwellings — no comparable €/m²`,
      note: 'Why this sale has no price per m²: it bought several dwellings at once.',
      sample: [179],
    },
    ratio: {
      fr: (ratio, territory, price) => `${ratio} × le médian de ${territory} (${price})`,
      en: (ratio, territory, price) => `${ratio} × the median of ${territory} (${price})`,
      sample: ['1.39', 'Paris 13e Arrondissement', '€8,956/m²'],
      keep: ['Paris 13e Arrondissement'],
    },
  },

  /** The selected sale, printed in the map key under the classes. */
  panel: {
    source: {
      fr: 'Source : DVF géolocalisées, data.gouv.fr',
      en: 'Source: geolocated property sales (DVF), data.gouv.fr',
    },
    parcel: {
      fr: (identifier) => `Parcelle cadastrale ${identifier}`,
      en: (identifier) => `Cadastral parcel ${identifier}`,
      sample: ['69382000AB0123'],
    },
  },

  /** What the theme says on the Bâti 3D row when it paints the volumes. */
  theme: {
    label: { fr: 'Ventes DVF (€/m²)', en: 'Property sales, DVF (€/m²)' },
    unknown: {
      fr: (metres) => `hors du rayon de ${metres} m ou sans mutation`,
      en: (metres) => `outside the ${metres} m radius, or no sale`,
      note: 'NOT "no sale recorded": most unpainted volumes were never asked about.',
      sample: [300],
    },
  },

  /** What a voice answer is ABOUT, before any figure. */
  voice: {
    subject: {
      fr: 'ventes immobilières publiées au registre DVF',
      en: 'property sales published in the DVF register',
    },
  },

  /**
   * Above 600 m the layer paints the cadastre — plots, then sections — and
   * says so in its own words.
   */
  area: {
    reference: {
      fr: (communes) => `Chaque vente est rapportée au médian de SA commune (${communes})`,
      en: (communes) => `Every sale is compared with ITS OWN municipality’s median (${communes})`,
      sample: [2],
    },
    noReference: {
      fr: 'Aucun médian communal : rien à rapporter',
      en: 'No municipal median: nothing to compare against',
    },
    references: {
      fr: (list) => `Rapporté au médian de chaque commune : ${list}`,
      en: (list) => `Compared with each municipality’s median: ${list}`,
      note: '`list` is already joined, busiest commune first, capped at four.',
      sample: ['Lyon 6e €5,500/m² · Lyon 3e €4,660/m²'],
      keep: ['Lyon 6e', 'Lyon 3e'],
    },
    box: { fr: 'la boîte', en: 'the box' },
    communes: {
      fr: (communes, probes) => `${countNoun(communes, 'commune', 'communes', FR)} `
        + `identifiée${communes > 1 ? 's' : ''} par ${probes} sondages : une commune `
        + 'qu\'aucun sondage n\'a touchée ne contribue pas',
      en: (communes, probes) => `${countNoun(communes, 'municipality', 'municipalities', EN)} `
        + `identified by ${probes} probes: a municipality no probe landed in does not `
        + 'contribute',
      note: 'A4 — the commune list comes from probing the box, not from intersecting it.',
      sample: [2, 9],
    },
    unplotted: {
      fr: (count) => `${countNoun(count, 'vente', 'ventes', FR)} sans parcelle publiée, `
        + 'impossible à dessiner',
      en: (count) => `${countNoun(count, 'sale', 'sales', EN)} with no published parcel, `
        + 'impossible to draw',
      sample: [4],
    },
    unshaped: {
      fr: (count) => `${count} forme(s) nommée(s) par le registre et absente(s) du cadastre `
        + 'Etalab, non dessinée(s)',
      en: (count) => `${count} ${plural(count, 'shape', 'shapes', { locale: 'en' })} the register `
        + 'names and the Etalab cadastre does not draw',
      sample: [3],
    },
    missingYears: {
      fr: (years) => `millésime(s) non téléchargé(s) : ${years}`,
      en: (years) => `${plural(countItems(years), 'vintage', 'vintages', { locale: 'en' })} not downloaded: ${years}`,
      sample: ['2025'],
    },
    vintages: {
      fr: (years) => `millésimes ${years}`,
      en: (years) => `vintages ${years}`,
      sample: ['2023, 2024'],
    },
    /** 600 m to 1 800 m: every plot a sale in the box names. */
    plots: {
      unit: {
        fr: 'sol teinté = la parcelle, peinte par sa dernière vente',
        en: 'tinted ground = the parcel, painted by its latest sale',
      },
      drawn: {
        fr: (span, sales, plots) => `vue sur ${span} de côté : `
          + `${countNoun(sales, 'vente', 'ventes', FR)}, `
          + `${countNoun(plots, 'parcelle dessinée', 'parcelles dessinées', FR)}`,
        en: (span, sales, plots) => `view over ${span} a side: `
          + `${countNoun(sales, 'sale', 'sales', EN)}, `
          + `${countNoun(plots, 'parcel drawn', 'parcels drawn', EN)}`,
        sample: ['2.2 km', 3964, 1207],
      },
      descend: {
        fr: (metres) => `descendre sous ${metres} m pour retrouver chaque vente`,
        en: (metres) => `drop below ${metres} m to get each sale back`,
        sample: [600],
      },
      which: {
        fr: (count, years) => (count > 1
          ? `la dernière des ${count} ventes de cette parcelle${years ? ` (${years})` : ''}`
          : `la seule vente de cette parcelle${years ? ` (${years})` : ''}`),
        en: (count, years) => (count > 1
          ? `the latest of this parcel’s ${count} sales${years ? ` (${years})` : ''}`
          : `this parcel’s only sale${years ? ` (${years})` : ''}`),
        note: '`years` is the editions label, e.g. "editions 2023 to 2025", or null.',
        sample: [5, 'editions 2023 to 2025'],
      },
    },
    /** Above 1 800 m: every cadastral section a sale in the box falls in. */
    sections: {
      unit: {
        fr: 'section cadastrale peinte par le médian de ses ventes',
        en: 'cadastral section painted by the median of its sales',
      },
      drawn: {
        fr: (span, sections, sales) => `vue sur ${span} de côté : `
          + `${countNoun(sections, 'section cadastrale', 'sections cadastrales', FR)}, `
          + `${countNoun(sales, 'vente', 'ventes', FR)}`,
        en: (span, sections, sales) => `view over ${span} a side: `
          + `${countNoun(sections, 'cadastral section', 'cadastral sections', EN)}, `
          + `${countNoun(sales, 'sale', 'sales', EN)}`,
        sample: ['8.8 km', 566, 54108],
      },
      descend: {
        fr: (metres) => `descendre sous ${formatInteger(metres, FR)} m pour voir chaque parcelle vendue`,
        en: (metres) => `drop below ${formatInteger(metres, EN)} m to see each parcel sold`,
        sample: [1800],
      },
      title: {
        fr: (code, commune) => `Section ${code} · ${commune}`,
        en: (code, commune) => `Section ${code} · ${commune}`,
        note: '`code` is the cadastre\'s own section code (AB, 0C…).',
        sample: ['AH', 'Paris 7e Arrondissement'],
        keep: ['Paris 7e Arrondissement'],
      },
      sales: {
        fr: (count, priced) => `${countNoun(count, 'vente', 'ventes', FR)}, `
          + `dont ${priced} avec un €/m² exploitable`,
        en: (count, priced) => `${countNoun(count, 'sale', 'sales', EN)}, `
          + `${priced} with a usable €/m²`,
        sample: [27, 15],
      },
      median: {
        fr: (price) => `médian ${price}`,
        en: (price) => `median ${price}`,
        sample: ['€20,898/m²'],
      },
      against: {
        fr: (price, commune) => `contre ${price} pour ${commune}`,
        en: (price, commune) => `against ${price} for ${commune}`,
        sample: ['€13,958/m²', 'Paris 7e Arrondissement'],
        keep: ['Paris 7e Arrondissement'],
      },
      neutral: {
        fr: (min) => `moins de ${min} ventes chiffrées`,
        en: (min) => `fewer than ${min} priced sales`,
        sample: [3],
      },
      neutralBlurb: {
        fr: (min) => `Section dont moins de ${min} ventes portent un €/m² comparable : son médian `
          + 'serait le prix d’une ou deux ventes étendu à tout un quartier, donc rien n’est '
          + 'peint. Les ventes existent, leur nombre est sur la fiche de la section.',
        en: (min) => `A section where fewer than ${min} sales carry a comparable €/m²: its median `
          + 'would be the price of one or two sales stretched over a whole neighbourhood, so '
          + 'nothing is painted. The sales exist, and the section’s card counts them.',
        sample: [3],
      },
    },
  },
});
