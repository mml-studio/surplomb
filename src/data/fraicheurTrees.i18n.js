/**
 * Strings of `src/data/fraicheurTrees.js` — Paris's 219,432 street trees.
 *
 * ── TWO TABLES ARE THE REGISTER'S VOCABULARY, NOT OURS ──────────────────────
 *
 * `stadedeveloppement` and `domanialite` are published VALUES, and the module
 * keys its lookups on them: the code stays exactly as the register spells it
 * (`CIMETIERE` with no accent, `Jeune (arbre)Adulte` run together), and only
 * the display label is translated. A code nobody has worded is printed as
 * published, which is information; a blank is not.
 *
 * `Jeune (arbre)Adulte` is the one that matters. It is two states concatenated
 * by whatever wrote the export, on 41,526 trees — 18.9% of the register.
 * Mapping it to *young* or to *adult* would invent a fact on a fifth of the
 * data, and printing it raw would show a bug without saying it is one. Both
 * languages name it as what it is.
 *
 * ── AND GREY MEANS ONE THING ACROSS THE WHOLE LAYER ─────────────────────────
 *
 * “The register did not measure this.” A zero height on 19,407 trees is not a
 * short tree, and the band that says so keeps saying so in English.
 */
import { plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

/**
 * The five published `stadedeveloppement` values, keyed as the export spells
 * them. `labelFor` reads this; an unmapped value is printed as published.
 */
export const TREE_STAGES = defineMessages({
  'Jeune (arbre)': { fr: 'Jeune', en: 'Young' },
  Adulte: { fr: 'Adulte', en: 'Adult' },
  Mature: { fr: 'Mature', en: 'Mature' },
  'Jeune (arbre)Adulte': {
    fr: 'Stade illisible (deux valeurs concaténées dans le registre)',
    en: 'Stage unreadable (two values run together in the register)',
    note: 'On 41,526 trees, 18.9% of the register. Named as the defect it is '
      + 'rather than mapped to one of the two states it ran together.',
  },
});

/**
 * The `domanialite` codes, which are Ville de Paris directorate abbreviations
 * and mean nothing on a card.
 *
 * Measured over the whole register: Alignement 110,157, Jardin 56,427,
 * CIMETIERE 31,982, DASCO 8,554, PERIPHERIQUE 5,687, DJS 4,888, DFPE 1,589,
 * DAC 119, DASES 28, null 1. Five of the ten are internal acronyms, and
 * “DFPE” on a card is a worse answer than none — so each is glossed, and the
 * acronym is kept in parentheses because it is what the register publishes.
 */
export const TREE_DOMAINS = defineMessages({
  Alignement: { fr: 'Arbre d’alignement (voirie)', en: 'Street tree (roadway)' },
  Jardin: { fr: 'Jardin ou square', en: 'Garden or square' },
  CIMETIERE: { fr: 'Cimetière', en: 'Cemetery' },
  DASCO: { fr: 'École (DASCO)', en: 'School (DASCO)' },
  PERIPHERIQUE: { fr: 'Abords du périphérique', en: 'Beside the ring road' },
  DJS: { fr: 'Équipement sportif (DJS)', en: 'Sports facility (DJS)' },
  DFPE: { fr: 'Crèche (DFPE)', en: 'Daycare (DFPE)' },
  DAC: { fr: 'Équipement culturel (DAC)', en: 'Cultural venue (DAC)' },
  DASES: { fr: 'Établissement social (DASES)', en: 'Social services site (DASES)' },
});

export default defineMessages({
  /** The three bands of the tree key. */
  bands: {
    remarquable: {
      label: { fr: 'Arbre remarquable', en: 'Heritage tree' },
      blurb: {
        fr: '183 arbres sur 219 432 portent remarquable = « OUI ». '
          + 'Le champ a trois états : « NON » 205 726, null 13 523 — le null n’est pas un non.',
        en: '183 trees of 219,432 carry remarquable = “OUI”. '
          + 'The field has three states: “NON” 205,726, null 13,523 — the null is not a no.',
        keep: ['remarquable', 'OUI', 'NON'],
        note: 'The field name and its two published values are quoted, not '
          + 'translated: they are what a reader would grep the export for.',
      },
    },
    mesure: {
      label: { fr: 'Hauteur publiée', en: 'Height published' },
      blurb: {
        fr: 'Taille du point = hauteur publiée, plafonnée à 25 m '
          + '(99ᵉ centile des 200 025 hauteurs relevées ; médiane 9 m, maximum 65 m).',
        en: 'Dot size = published height, capped at 25 m '
          + '(99th percentile of the 200,025 heights on record; median 9 m, maximum 65 m).',
      },
    },
    'sans-mesure': {
      label: { fr: 'Hauteur non mesurée', en: 'Height not measured' },
      blurb: {
        fr: 'hauteurenm = 0 sur 19 407 arbres — un zéro qui veut dire « non relevé ». '
          + 'Tracés à la taille minimale, jamais mis à l’échelle.',
        en: 'hauteurenm = 0 on 19,407 trees — a zero that means “not surveyed”. '
          + 'Drawn at the minimum size, never scaled.',
        keep: ['hauteurenm'],
      },
    },
  },

  /** The card for one tree. */
  card: {
    unnamed: {
      fr: 'Arbre (essence non publiée)',
      en: 'Tree (species not published)',
    },
    noHeight: {
      fr: 'Hauteur non mesurée (le registre publie 0)',
      en: 'Height not measured (the register publishes 0)',
    },
    height: {
      fr: (metres) => `${metres} m de haut`,
      en: (metres) => `${metres} m tall`,
      sample: ['9'],
    },
    girth: {
      fr: (centimetres) => `${centimetres} cm de circonférence`,
      en: (centimetres) => `${centimetres} cm girth`,
      sample: ['120'],
    },
    noGirth: {
      fr: 'Circonférence non mesurée (le registre publie 0)',
      en: 'Girth not measured (the register publishes 0)',
    },
    inconsistent: {
      fr: '⚠ Hauteur et circonférence publiées ne s’accordent pas',
      en: '⚠ Published height and girth do not agree',
      note: 'A two-metre girth on a six-metre trunk, on 136 trees. Naming it '
        + 'beats drawing it as if it were consistent.',
    },
    remarkable: {
      fr: '⭐ Arbre remarquable (Ville de Paris)',
      en: '⭐ Heritage tree (Ville de Paris)',
    },
    remarkableUnknown: {
      fr: 'Caractère remarquable non renseigné',
      en: 'Heritage status not recorded',
      note: 'The register’s null, which is not a no.',
    },
    idbase: {
      fr: (id) => `idbase ${id}`,
      en: (id) => `idbase ${id}`,
      sample: [2002197],
      keep: ['idbase'],
      note: 'The register’s own primary key, named as the register names it.',
    },
  },

  /** The status line for the tree half of the row. */
  status: {
    off: {
      fr: 'Arbres masqués — bouton ARBRES pour les charger',
      en: 'Trees hidden — press TREES to load them',
      note: 'The DEFAULT state, not a failure: the line names the button '
        + 'rather than sounding like something went wrong. The chip itself is '
        + 'worded by the layer registry.',
    },
    tooHigh: {
      fr: (metres) => `Zoome sous ${metres} m pour charger les arbres`,
      en: (metres) => `Zoom in below ${metres} m to load the trees`,
      sample: ['3,000'],
    },
    tooDense: {
      fr: 'Vue trop large pour les arbres — zoome',
      en: 'View too wide for the trees — zoom in',
    },
    tooDenseCounted: {
      fr: (count, budget) => `${count} arbres dans cette vue — `
        + `au-delà des ${budget} que cette couche trace. Zoome.`,
      en: (count, budget) => `${count} trees in this view — `
        + `beyond the ${budget} this layer draws. Zoom in.`,
      sample: ['18,402', '6,000'],
      note: 'Only ever printed ABOVE the budget, so the count is in the '
        + 'thousands and no plural rule is needed in either language.',
    },
    loading: { fr: 'comptage des arbres…', en: 'counting the trees…' },
    empty: {
      fr: 'Aucun arbre référencé dans cette vue',
      en: 'No tree on record in this view',
    },
    drawn: {
      fr: (count, plainCount) => `${count} arbres tracés`,
      en: (count, plainCount) => `${count} ${plural(plainCount, 'tree', 'trees')} drawn`,
      sample: ['4,812', 4812],
      note: 'Both languages take the raw count as a second argument: the '
        + 'first one arrives already grouped and cannot be counted with. '
        + 'French prints “1 arbres tracés”, which is what it always printed.',
    },
  },
});
