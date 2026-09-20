/**
 * Strings of `src/data/filosofiTerritoiresFeed.js` — the six departmental and
 * regional indicators, and the two levels they are published at.
 *
 * EVERY BLURB HERE EXISTS TO STOP AN ARITHMETIC. The territory regime and the
 * grid regime look like one dataset and are not: the territory publishes a
 * MEDIAN standard of living and the grid a MEAN, the territory counts poverty
 * in PEOPLE and the grid in HOUSEHOLDS, and two of these six have no grid
 * counterpart at all. The English says so as plainly as the French does.
 *
 * The module runs in the `/api/filosofi/territoires` proxy, but the proxy
 * never reads this table — it folds Melodi observations. `TERRITORY_METRICS`
 * therefore keeps FRENCH, and `resolveTerritoryMetric()` answers in the page's
 * language. The ids and fields are DATA: a metric id rides a share link.
 */
import { defineMessages } from '../i18n/messages.js';

/** What `DS_FILOSOFI_CC` covers — narrower than the grid. */
export const TERRITORY_SCOPE_WORDS = defineMessages({
  scope: {
    fr: 'France métropolitaine et La Réunion',
    en: 'Mainland France and La Réunion',
    keep: ['La Réunion'],
  },
});

/** The two levels the layer draws, widest first. */
export const TERRITORY_LEVEL_WORDS = defineMessages({
  DEP: {
    label: { fr: 'Départements', en: 'Departments' },
    short: { fr: 'DÉP.', en: 'DEPT.' },
  },
  REG: {
    label: { fr: 'Régions', en: 'Regions' },
    short: { fr: 'RÉG.', en: 'REG.' },
  },
});

export default defineMessages({
  niveau: {
    label: { fr: 'Niveau de vie médian', en: 'Median standard of living' },
    short: { fr: 'NIVEAU DE VIE', en: 'STANDARD OF LIVING' },
    unit: { fr: '€/an par personne', en: '€/year per person' },
    blurb: {
      fr: 'Médiane du niveau de vie des habitants du territoire — la moitié vit'
        + ' au-dessus, la moitié en dessous. Le carroyage, lui, montre une MOYENNE par'
        + ' carreau : ce ne sont pas la même statistique.',
      en: 'Median standard of living of the territory’s residents — half live'
        + ' above it, half below. The grid shows a MEAN per cell instead:'
        + ' the two are not the same statistic.',
    },
  },
  pauvrete: {
    label: { fr: 'Taux de pauvreté', en: 'Poverty rate' },
    short: { fr: 'PAUVRETÉ', en: 'POVERTY' },
    unit: { fr: '% des personnes', en: '% of people' },
    blurb: {
      fr: 'Part des personnes vivant sous 60 % du niveau de vie médian national.'
        + ' Au carreau, la même idée est comptée en MÉNAGES, pas en personnes.',
      en: 'Share of people living below 60% of the national median standard of living.'
        + ' On the grid, the same idea is counted in HOUSEHOLDS, not in people.',
    },
  },
  population: {
    label: { fr: 'Population', en: 'Population' },
    short: { fr: 'POPULATION', en: 'POPULATION' },
    unit: { fr: 'habitants', en: 'residents' },
    blurb: {
      fr: 'Population municipale (recensement) — la seule grandeur qui s’additionne,'
        + ' et celle qui donne sa taille à chaque disque.',
      en: 'Municipal population (census) — the only quantity that adds up,'
        + ' and the one that sizes every disc.',
    },
  },
  interdecile: {
    label: { fr: 'Écart D9/D1', en: 'D9/D1 ratio' },
    short: { fr: 'ÉCART D9/D1', en: 'D9/D1 RATIO' },
    unit: { fr: 'rapport', en: 'ratio' },
    blurb: {
      fr: 'Combien de fois le niveau de vie des 10 % les plus aisés dépasse celui des'
        + ' 10 % les plus modestes. N’existe pas au carreau : il faut une distribution'
        + ' entière pour le calculer.',
      en: 'How many times the standard of living of the richest 10% exceeds that of'
        + ' the poorest 10%. Does not exist on the grid: computing it needs a whole'
        + ' distribution.',
    },
  },
  gini: {
    label: { fr: 'Indice de Gini', en: 'Gini index' },
    short: { fr: 'GINI', en: 'GINI' },
    unit: { fr: '0 = égalité parfaite', en: '0 = perfect equality' },
    blurb: {
      fr: 'Concentration des niveaux de vie : 0 si tout le monde a le même, 1 si une'
        + ' seule personne a tout. N’existe pas au carreau.',
      en: 'Concentration of standards of living: 0 if everybody has the same, 1 if one'
        + ' person has everything. Does not exist on the grid.',
    },
  },
  salaire: {
    label: { fr: 'Salaire net mensuel', en: 'Monthly net wage' },
    short: { fr: 'SALAIRE', en: 'WAGE' },
    unit: { fr: '€/mois en équivalent temps plein', en: '€/month, full-time equivalent' },
    blurb: {
      fr: 'Salaire net moyen du secteur PRIVÉ, en équivalent temps plein. Ce n’est pas'
        + ' un niveau de vie : c’est avant impôts et prestations, par emploi et non par'
        + ' ménage, et la fonction publique en est absente.',
      en: 'Mean net wage in the PRIVATE sector, full-time equivalent. It is not a'
        + ' standard of living: it is before taxes and benefits, per job rather than per'
        + ' household, and the public sector is absent from it.',
    },
  },
});
