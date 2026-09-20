/**
 * Strings of `src/data/supFeed.js` — the MESR enrolment register, folded onto
 * seven bands, three LMD cycles and two ways of getting a coordinate.
 *
 * THE MODULE RUNS ON THE SERVER TOO (`vite.config.js` imports its projection
 * for `/api/sup-fr`), so the three French tables it exports are built from
 * this catalog's definition rather than retyped, as `rnbPivot.js` does. The
 * payload never carries any of these words — it carries the KEY, and the
 * browser labels it — but the exported tables stay French so that nothing
 * running under Node has to ask what language it is in.
 *
 * The keys are DATA: a band, a cycle and a placement all ride the payload and
 * a share link, and none of them is ever translated.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The seven bands, in ladder order.
 *
 * `autre` keeps the register's own catch-all name rather than a flattering
 * one, because nothing here knows what is in it: 1,981 establishments, mostly
 * CFA and private training bodies.
 */
export const SUP_KIND_WORDS = defineMessages({
  universite: { fr: 'Université', en: 'University' },
  lycee: {
    fr: 'Lycée — BTS & CPGE',
    en: 'High school — BTS & CPGE',
    note: 'BTS and CPGE are the post-secondary tracks a French lycée hosts; '
      + 'both acronyms stay as published.',
  },
  ingenieur: { fr: 'École d’ingénieurs', en: 'Engineering school' },
  commerce: { fr: 'Commerce & gestion', en: 'Business & management' },
  sante: { fr: 'Santé & social', en: 'Health & social care' },
  art: { fr: 'Art, archi & culture', en: 'Art, architecture & culture' },
  autre: { fr: 'Autres écoles spécialisées', en: 'Other specialized schools' },
});

/**
 * The three LMD cycles the seven published `degre_etudes` values fold onto.
 *
 * The register counts by year (`BAC + 1` … `BAC + 6 et plus`), which is too
 * fine to read on a card and too coarse to be a diploma.
 */
export const SUP_CYCLE_WORDS = defineMessages({
  licence: { fr: 'Licence & bac+1 à +3', en: 'Bachelor’s & years 1 to 3' },
  master: { fr: 'Master — bac+4 et +5', en: 'Master’s — years 4 and 5' },
  doctorat: { fr: 'Doctorat — bac+6 et plus', en: 'Doctorate — year 6 and beyond' },
});

/**
 * The same three cycles in one word, for a card's mix line.
 *
 * Their own leaves rather than the first word of the labels above: `Bachelor’s
 * & years 1 to 3`.split(' ')[0] is `Bachelor’s` by luck, and luck is not a
 * translation rule.
 */
export const SUP_CYCLE_SHORT = defineMessages({
  licence: { fr: 'Licence', en: 'Bachelor’s' },
  master: { fr: 'Master', en: 'Master’s' },
  doctorat: { fr: 'Doctorat', en: 'Doctorate' },
});

/** How a site's coordinate was obtained. Printed on the card. */
export const SUP_PLACEMENT_WORDS = defineMessages({
  register: { fr: 'Position publiée par le registre', en: 'Position published by the register' },
  offer: {
    fr: 'Position reprise de la cartographie Parcoursup',
    en: 'Position taken from the Parcoursup map',
    note: 'A borrowed coordinate is something the map did, not something the '
      + 'register said; the card is the only place that can say so.',
  },
});

/** The module's own catalog: the four tables, grouped. */
export default defineMessages({
  kinds: SUP_KIND_WORDS.definition,
  cycles: SUP_CYCLE_WORDS.definition,
  cyclesShort: SUP_CYCLE_SHORT.definition,
  placements: SUP_PLACEMENT_WORDS.definition,
});
