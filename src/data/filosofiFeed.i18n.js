/**
 * Strings of `src/data/filosofiFeed.js` — the eight indicators the INSEE
 * 200 m grid can be coloured by.
 *
 * WHAT THE KEY MUST NEVER LOSE: every indicator states its UNIT in words.
 * `27,100` means nothing without `€ per person per year`, and a legend that
 * omits the unit invites the wrong reading — which is the whole reason the
 * table has a `unit` column at all.
 *
 * The module runs in the `/api/filosofi/carreaux` proxy too, but the proxy
 * never touches this table: it projects cells. So `FILOSOFI_METRICS` keeps
 * FRENCH — the array the layer's own tests measure — and `resolveMetric()`
 * answers in the page's language. The ids, fields and weights are DATA: a
 * metric id rides a share link.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  niveau: {
    label: { fr: 'Niveau de vie', en: 'Standard of living' },
    short: { fr: 'NIVEAU DE VIE', en: 'STANDARD OF LIVING' },
    unit: { fr: '€/an par personne', en: '€/year per person' },
    blurb: {
      fr: 'Moyenne winsorisée du niveau de vie des habitants du carreau.',
      en: 'Winsorized mean standard of living of the cell’s residents.',
    },
  },
  pauvrete: {
    label: { fr: 'Ménages pauvres', en: 'Households below the poverty line' },
    short: { fr: 'PAUVRETÉ', en: 'POVERTY' },
    unit: { fr: '% des ménages', en: '% of households' },
    blurb: {
      fr: 'Part des ménages sous le seuil de pauvreté (60 % du niveau de vie médian).',
      en: 'Share of households below the poverty line (60% of the median standard of living).',
    },
  },
  population: {
    label: { fr: 'Population', en: 'Population' },
    short: { fr: 'POPULATION', en: 'POPULATION' },
    unit: { fr: 'habitants', en: 'residents' },
    blurb: {
      fr: 'Individus recensés dans le carreau — la seule grandeur qui s’additionne.',
      en: 'People counted in the cell — the only quantity that adds up.',
    },
  },
  social: {
    label: { fr: 'Logement social', en: 'Social housing' },
    short: { fr: 'LOG. SOCIAL', en: 'SOCIAL HOUSING' },
    unit: { fr: '% des ménages', en: '% of households' },
    blurb: {
      fr: 'Part des ménages en logement social.',
      en: 'Share of households in social housing (HLM).',
    },
  },
  jeunes: {
    label: { fr: 'Moins de 18 ans', en: 'Under 18' },
    short: { fr: '– 18 ANS', en: 'UNDER 18' },
    unit: { fr: '% des habitants', en: '% of residents' },
    blurb: {
      fr: 'Part des habitants de moins de 18 ans.',
      en: 'Share of residents under 18.',
    },
  },
  aines: {
    label: { fr: '65 ans et plus', en: '65 and over' },
    short: { fr: '65 ANS +', en: '65 AND OVER' },
    unit: { fr: '% des habitants', en: '% of residents' },
    blurb: {
      fr: 'Part des habitants de 65 ans et plus.',
      en: 'Share of residents aged 65 and over.',
    },
  },
  proprietaires: {
    label: { fr: 'Propriétaires', en: 'Owner-occupiers' },
    short: { fr: 'PROPRIÉTAIRES', en: 'OWNER-OCCUPIERS' },
    unit: { fr: '% des ménages', en: '% of households' },
    blurb: {
      fr: 'Part des ménages propriétaires de leur logement.',
      en: 'Share of households that own the home they live in.',
    },
  },
  solo: {
    label: { fr: 'Personnes seules', en: 'People living alone' },
    short: { fr: 'PERS. SEULES', en: 'LIVING ALONE' },
    unit: { fr: '% des ménages', en: '% of households' },
    blurb: {
      fr: 'Part des ménages d’une seule personne.',
      en: 'Share of one-person households.',
    },
  },
});
