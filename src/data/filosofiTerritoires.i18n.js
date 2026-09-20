/**
 * Strings of `src/data/filosofiTerritoires.js` — one disc per department or
 * region, at national altitude.
 *
 * EVERY LINE OF THIS CARD CARRIES ITS YEAR, and that is not decoration. Three
 * publishers stand behind it — Filosofi for the income, the census for the
 * population, the wage base for the salary — and they are on 2023, 2023 and
 * 2024. A card that printed them as one set of facts about "now" would invite
 * arithmetic between numbers that do not belong to the same year. The English
 * keeps every one of those years, and the two capitalized words (MEDIAN,
 * PEOPLE) that stop the grid and the territory being read as one dataset.
 *
 * The six indicators' own names live in `filosofiTerritoiresFeed.i18n.js`.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** One territory's card. */
  card: {
    population: {
      fr: (people, year) => `${people} habitants (recensement ${year})`,
      en: (people, year) => `${people} residents (${year} census)`,
      sample: ['1,420,000', 2023],
    },
    standardOfLiving: {
      fr: (amount, year) => `Niveau de vie MÉDIAN ${amount} €/an par personne (Filosofi ${year})`,
      en: (amount, year) => `MEDIAN standard of living €${amount}/year per person (Filosofi ${year})`,
      note: 'MEDIAN in capitals: the grid regime shows a MEAN, and the two are '
        + 'not the same statistic.',
      sample: ['24,600', 2023],
    },
    noStandardOfLiving: {
      fr: 'Niveau de vie non publié pour ce territoire',
      en: 'Standard of living not published for this territory',
    },
    poverty: {
      fr: (share) => `${share} % des PERSONNES sous le seuil de pauvreté`,
      en: (share) => `${share}% of PEOPLE below the poverty line`,
      note: 'PEOPLE in capitals: the grid counts the same idea in households.',
      sample: ['14.2'],
    },
    deciles: {
      fr: (d1, d9, ratio) => `D1 ${d1} € · D9 ${d9} €${ratio}`,
      en: (d1, d9, ratio) => `D1: €${d1} · D9: €${d9}${ratio}`,
      note: 'The colon is what keeps `D1 €12,400` from reading as an amount '
        + 'with a French-placed euro sign.',
      sample: ['12,400', '39,800', ' · ratio 3.2'],
    },
    interdecile: {
      fr: (ratio) => ` · rapport ${ratio}`,
      en: (ratio) => ` · ratio ${ratio}`,
      sample: ['3.2'],
    },
    gini: {
      fr: (value) => `Indice de Gini ${value}`,
      en: (value) => `Gini index ${value}`,
      sample: ['0.294'],
    },
    wage: {
      fr: (amount, year) => `Salaire net privé ${amount} €/mois en EQTP (${year})`
        + ' — avant impôts et prestations, hors fonction publique',
      en: (amount, year) => `Private-sector net wage €${amount}/month, FTE (${year})`
        + ' — before taxes and benefits, public sector excluded',
      note: 'EQTP is équivalent temps plein; FTE is the English acronym for it.',
      sample: ['2,310', 2024],
    },
    aggregate: {
      fr: (level, year) => `Agrégat ${level} — au carreau, le calque montre une MOYENNE`
        + ` par carreau de 200 m, millésime ${year}`,
      en: (level, year) => `${level} aggregate — on the grid, the layer shows a MEAN`
        + ` per 200 m cell, ${year} vintage`,
      note: 'The only line that explains why zooming in changes the number. '
        + 'The year is the one the proxy says it would serve, never a constant.',
      sample: ['department', 2019],
    },
    anchorGuessed: {
      fr: 'Repère posé au centre de la zone de couverture : ce territoire n’a pas de contour embarqué',
      en: 'Marker placed at the center of the coverage box: this territory has no bundled outline',
    },
    channels: {
      fr: (metric) => `Aire du disque = habitants, couleur = ${metric}`,
      en: (metric) => `Disc area = residents, color = ${metric}`,
      sample: ['poverty rate'],
    },
    title: {
      fr: (name, code) => `${name} (${code})`,
      en: (name, code) => `${name} (${code})`,
      keep: ['Gironde'],
      sample: ['Gironde', '33'],
    },
    region: { fr: 'Région', en: 'Region' },
    departement: { fr: 'Département', en: 'Department' },
  },

  /** The colour ramp, then the size channel that qualifies it. */
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
    classBlurb: {
      fr: (unit, label, year, sample) => `${unit} — ${label}, millésime ${year}.`
        + ` Paliers mesurés sur les ${sample} départements.`,
      en: (unit, label, year, sample) => `${unit} — ${label}, ${year} vintage.`
        + ` Class breaks measured over the ${sample} departments.`,
      sample: ['% of people', 'Poverty rate', 2023, 97],
    },
    unpublished: { fr: 'Non publié', en: 'Not published' },
    unpublishedBlurb: {
      fr: (scope) => `Le territoire existe mais l’indicateur n’y est pas diffusé (${scope}).`,
      en: (scope) => `The territory exists, but the indicator is not released for it (${scope}).`,
      keep: ['La Réunion'],
      sample: ['Mainland France and La Réunion'],
    },
    area: { fr: 'Aire = habitants', en: 'Area = residents' },
    sizes: {
      fr: (level, breaks) => `Six tailles, sur les quantiles nationaux de population par ${level} : `
        + `${breaks}`
        + ' habitants. Le disque garde sa taille à l’écran quel que soit le zoom :'
        + ' un territoire est un agrégat posé sur un point, pas une étendue.',
      en: (level, breaks) => `Six sizes, on the national population quantiles per ${level}: `
        + `${breaks}`
        + ' residents. A disc keeps its size on screen at any zoom:'
        + ' a territory is an aggregate placed on a point, not an extent.',
      sample: ['department', '300,000 · 600,000 · 900,000 · 1,300,000 · 2,000,000'],
    },
    levelRegion: { fr: 'région', en: 'region' },
    levelDepartement: { fr: 'département', en: 'department' },
  },

  /** The chip strip for the national regime. */
  chipTitle: {
    fr: (label, blurb, unit, year) => `${label} — ${blurb} (${unit}, ${year})`,
    en: (label, blurb, unit, year) => `${label} — ${blurb} (${unit}, ${year})`,
    sample: ['Poverty rate', 'Share of people below 60% of the median.', '% of people', 2023],
  },
});
