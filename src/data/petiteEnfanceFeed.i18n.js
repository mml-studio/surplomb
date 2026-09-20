/**
 * Strings of `src/data/petiteEnfanceFeed.js` — the CNAF's childcare coverage.
 *
 * WHAT THE SERVER READS AND WHAT THE BROWSER READS. `vite.config.js` imports
 * this module for its projections, its scales and its contour URLs; none of
 * those touch a word below. The payload carries the CNAF's own KEYS — `dep`,
 * `epci`, `com`, `psu`, `am`, `tres-bas` — and the browser labels them when a
 * card or a legend is drawn, so a cached answer is the same document in both
 * languages (docs/i18n/CONVENTIONS.md, "Server-side modules").
 *
 * THE VOCABULARY IS THE HARD PART. France funds early childcare through five
 * distinct channels and names them by the scheme that pays for them: PSU,
 * Paje, préscolarisation. The English keeps every acronym — they are the names
 * of French schemes, and inventing an English one would make the figure
 * impossible to check against the CNAF's own file — and translates the kind of
 * care around them. *Crèche* is a collective facility, so *daycare*;
 * *assistante maternelle* is the glossary's *childminder*, a self-employed
 * carer registered by the département; *garde à domicile* is care in the
 * child's own home.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The three scales the CNAF publishes, keyed by `PE_SCALES`.
   *
   * A rate is meaningless without knowing whose it is, and three nested
   * scales sit under one cursor — which is why this is the first line of
   * every card.
   */
  scales: {
    dep: { fr: 'Département', en: 'Department' },
    epci: { fr: 'Intercommunalité', en: 'Intercommunality (EPCI)' },
    com: { fr: 'Commune', en: 'Municipality' },
  },

  /**
   * The five childcare modes that add up to the global rate, keyed by
   * `PE_MODES`. Long form, for the breakdown on a card.
   */
  modes: {
    psu: {
      fr: 'Crèche (EAJE financé PSU)',
      en: 'Daycare (EAJE funded by the PSU)',
      note: 'EAJE = établissement d’accueil du jeune enfant; PSU = prestation de service unique.',
      keep: ['EAJE', 'PSU'],
    },
    horsPsu: {
      fr: 'Crèche hors PSU (micro-crèche Paje)',
      en: 'Daycare outside the PSU (Paje micro-daycare)',
      note: 'Paje = prestation d’accueil du jeune enfant, the benefit paid to the family instead.',
      keep: ['Paje', 'PSU'],
    },
    prescol: {
      fr: 'Préscolarisation (maternelle avant 3 ans)',
      en: 'Preschool enrollment (before age 3)',
      note: 'The share of under-threes already in école maternelle — the glossary’s preschool.',
    },
    am: {
      fr: 'Assistante maternelle',
      en: 'Childminder',
      note: 'Self-employed, registered by the département’s PMI. The glossary’s word.',
    },
    gad: { fr: 'Garde à domicile', en: 'In-home childcare' },
  },

  /** The same five, short, for the status line and the legend. */
  modesShort: {
    psu: { fr: 'crèche PSU', en: 'PSU daycare', keep: ['PSU'] },
    horsPsu: { fr: 'micro-crèche', en: 'micro-daycare' },
    prescol: { fr: 'maternelle', en: 'preschool' },
    am: { fr: 'assistante maternelle', en: 'childminder' },
    gad: { fr: 'garde à domicile', en: 'in-home childcare' },
  },

  /**
   * The six bands of the diverging ramp, keyed by `PE_BANDS`.
   *
   * They are stated against the NATIONAL rate of the same edition, never as
   * quantiles of what is on screen — so "below" means below France, at every
   * zoom and on all three scales.
   */
  bands: {
    'tres-bas': { fr: 'Très inférieur à la moyenne', en: 'Far below average' },
    bas: { fr: 'Inférieur', en: 'Below' },
    'sous-moyenne': { fr: 'Un peu sous la moyenne', en: 'Slightly below average' },
    'sur-moyenne': { fr: 'Un peu au-dessus', en: 'Slightly above' },
    haut: { fr: 'Supérieur', en: 'Above' },
    'tres-haut': { fr: 'Très supérieur à la moyenne', en: 'Far above average' },
  },
});
