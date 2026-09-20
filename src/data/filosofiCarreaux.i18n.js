/**
 * Strings of `src/data/filosofiCarreaux.js` — the INSEE 200 m grid drawn as
 * discs, and the card one cell opens.
 *
 * THE LINE THAT MUST NEVER BE DROPPED, in either language, is the imputation
 * one. INSEE models a cell's figures when statistical confidentiality forbids
 * publishing them, and a modelled figure that looks measured is the single way
 * this layer could mislead. There are THREE sentences for it and not two: with
 * the flag absent the card says the flag is absent, because "observed" is a
 * claim and a missing column does not support it.
 *
 * The eight indicators' own names live in `filosofiFeed.i18n.js`, next to the
 * module that owns the table.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  notPublished: { fr: 'non publié', en: 'not published' },

  /** One cell's card. Every line is a value or an explicit absence of one. */
  card: {
    people: {
      fr: (people, households) => `${people} habitants · ${households} ménages`,
      en: (people, households) => `${people} residents · ${households} households`,
      sample: ['1,240', '580'],
    },
    standardOfLiving: {
      fr: (amount) => `Niveau de vie moyen ${amount} €/an`,
      en: (amount) => `Mean standard of living €${amount}/year`,
      note: 'The euro sits after the amount in French and before it in English '
        + '(glossary); the sentence is one leaf so the sign can move.',
      sample: ['27,100'],
    },
    noStandardOfLiving: {
      fr: 'Niveau de vie non publié pour ce carreau',
      en: 'Standard of living not published for this cell',
    },
    poor: {
      fr: (share) => `${share} % de ménages pauvres`,
      en: (share) => `${share}% of households below the poverty line`,
      sample: ['12.4'],
    },
    social: {
      fr: (share) => `${share} % en logement social`,
      en: (share) => `${share}% in social housing`,
      sample: ['18.0'],
    },
    ages: {
      fr: (young, old) => `${young} % de moins de 18 ans · ${old} % de 65 ans et plus`,
      en: (young, old) => `${young}% under 18 · ${old}% aged 65 and over`,
      sample: ['21.3', '17.8'],
    },
    owners: {
      fr: (share) => `${share} % de propriétaires`,
      en: (share) => `${share}% owner-occupiers`,
      sample: ['44.0'],
    },
    alone: {
      fr: (share) => `${share} % de personnes seules`,
      en: (share) => `${share}% living alone`,
      sample: ['38.2'],
    },
    surface: {
      fr: (surface) => `${surface} m² par logement en moyenne`,
      en: (surface) => `${surface} m² per dwelling on average`,
      sample: ['68'],
    },
    imputed: {
      fr: 'Carreau IMPUTÉ : valeurs approchées, pas observées (secret statistique)',
      en: 'IMPUTED cell: values approximated, not observed (statistical confidentiality)',
    },
    observed: { fr: 'Carreau observé, non imputé', en: 'Observed cell, not imputed' },
    imputationUnknown: {
      fr: 'Imputation non renseignée par l’INSEE pour ce carreau',
      en: 'INSEE did not report whether this cell was imputed',
    },
    vintage: {
      fr: (side, year) => `Carreau ${side} · revenus ${year} · INSEE Filosofi`,
      en: (side, year) => `${side} cell · ${year} incomes · INSEE Filosofi`,
      note: 'The year is read off the ANSWER, never asserted: the relay serves '
        + '2019 and a local pack 2021.',
      sample: ['200 m', 2019],
    },
    channels: {
      fr: (weight, metric) => `Aire du disque = ${weight}, couleur = ${metric}`,
      en: (weight, metric) => `Disc area = ${weight}, color = ${metric}`,
      note: 'The one thing a viewer cannot read off the picture — and it says '
        + 'what the space around a disc means: nobody there, not no data there.',
      sample: ['residents', 'standard of living'],
    },
    households: { fr: 'ménages', en: 'households' },
    residents: { fr: 'habitants', en: 'residents' },
    communeCode: {
      fr: (code) => `Commune ${code}`,
      en: (code) => `Municipality ${code}`,
      note: 'The fallback title when the commune name has not been joined yet.',
      sample: ['69123'],
    },
    cellTitle: {
      fr: (side) => `Carreau ${side}`,
      en: (side) => `${side} cell`,
      sample: ['200 m'],
    },
  },

  /** The colour ramp, then the two shape channels that qualify it. */
  legend: {
    below: {
      fr: (high, suffix) => `< ${high}${suffix}`,
      en: (high, suffix) => `< ${high}${suffix}`,
      sample: ['18,000', '%'],
    },
    above: {
      fr: (low, suffix) => `≥ ${low}${suffix}`,
      en: (low, suffix) => `≥ ${low}${suffix}`,
      sample: ['34,000', ''],
    },
    between: {
      fr: (low, high, suffix) => `${low} – ${high}${suffix}`,
      en: (low, high, suffix) => `${low} – ${high}${suffix}`,
      sample: ['18,000', '22,000', ''],
    },
    percentSuffix: {
      fr: ' %',
      en: '%',
      note: 'French puts a space before the sign, English does not (glossary).',
    },
    lowDecile: {
      fr: (unit) => `Décile national bas — ${unit}`,
      en: (unit) => `Bottom national decile — ${unit}`,
      sample: ['€/year per person'],
    },
    highDecile: {
      fr: (unit) => `Décile national haut — ${unit}`,
      en: (unit) => `Top national decile — ${unit}`,
      sample: ['€/year per person'],
    },
    unpublished: { fr: 'Non publié', en: 'Not published' },
    unpublishedBlurb: {
      fr: 'Le carreau existe mais l’indicateur n’y est pas diffusé.',
      en: 'The cell exists, but the indicator is not released for it.',
    },
    areaHouseholds: { fr: 'Aire = ménages', en: 'Area = households' },
    areaResidents: { fr: 'Aire = habitants', en: 'Area = residents' },
    sizes: {
      fr: (grid, breaks, unit) => `Six tailles, sur les quantiles nationaux du carroyage ${grid} :`
        + ` ${breaks} ${unit}.`
        + ' Six paliers et pas une échelle continue, pour la raison qui donne six'
        + ' paliers à la couleur : l’œil ne relit pas une grandeur continue en'
        + ' nombre, et la fiche porte le chiffre exact. Le disque ne remplit jamais'
        + ' son carreau : le vide autour de lui est le fond de carte, pas une'
        + ' absence de données.',
      en: (grid, breaks, unit) => `Six sizes, on the national quantiles of the ${grid} grid:`
        + ` ${breaks} ${unit}.`
        + ' Six steps and not a continuous scale, for the reason the color has six'
        + ' steps: the eye does not read a continuous magnitude back as a number,'
        + ' and the card carries the exact figure. A disc never fills its cell:'
        + ' the emptiness around it is the basemap, not an absence of data.',
      sample: ['200 m', '40 · 90 · 160 · 280 · 520', 'residents'],
    },
    hollow: { fr: 'Évidé = imputé', en: 'Hollow = imputed' },
    hollowBlurb: {
      fr: 'Valeurs modélisées par l’INSEE au titre du secret statistique, pas'
        + ' observées. L’anneau garde l’aire que son trou lui enlève : l’évidement dit'
        + ' d’où vient le chiffre, pas combien il vaut.',
      en: 'Values modeled by INSEE under statistical confidentiality, not'
        + ' observed. The ring keeps the area its hole takes away: the hollow says'
        + ' where the figure came from, not how big it is.',
    },
  },

  /** The chip strip, and the line under the layer's toggle. */
  row: {
    chipTitle: {
      fr: (label, blurb, unit) => `${label} — ${blurb} (${unit})`,
      en: (label, blurb, unit) => `${label} — ${blurb} (${unit})`,
      sample: ['Population', 'People counted in the cell.', 'residents'],
    },
    partial: {
      fr: 'Vue nationale incomplète : une des trois sources INSEE n’a pas répondu',
      en: 'National view incomplete: one of the three INSEE sources did not answer',
    },
    loadingTerritories: {
      fr: (level) => `Agrégats ${level}…`,
      en: (level) => `${level} aggregates…`,
      sample: ['department'],
    },
    territories: {
      fr: (level, year) => `${level} · Filosofi ${year} — zoome pour le carroyage 200 m`,
      en: (level, year) => `${level} · Filosofi ${year} — zoom in for the 200 m grid`,
      sample: ['Departments', 2023],
    },
    truncated: {
      fr: (matched, drawn) => `${matched} carreaux dans la vue,`
        + ` ${drawn} dessinés — zoome pour les avoir tous`,
      en: (matched, drawn) => `${matched} cells in the view,`
        + ` ${drawn} drawn — zoom in to get them all`,
      sample: ['8,400', '4,000'],
    },
    offCoverage: {
      fr: 'Hors couverture INSEE (métropole, Martinique, La Réunion)',
      en: 'Outside INSEE coverage (mainland France, Martinique, La Réunion)',
      keep: ['Martinique', 'La Réunion'],
    },
    loadingCells: { fr: 'Carreaux INSEE…', en: 'INSEE cells…' },
    feedSource: {
      fr: 'INSEE Filosofi, recensement et base Tous salariés — API Melodi',
      en: 'INSEE Filosofi, the census and the Tous salariés base — Melodi API',
      note: 'Three publishers stand behind the national regime; the dataset names '
        + 'are kept as INSEE publishes them.',
      keep: ['Tous salariés'],
    },
  },

  /** What a malformed answer says. Never shown with a payload in hand. */
  error: {
    territories: { fr: 'Réponse territoires illisible', en: 'Unreadable territories answer' },
    cells: { fr: 'Réponse carroyage illisible', en: 'Unreadable grid answer' },
  },
});
