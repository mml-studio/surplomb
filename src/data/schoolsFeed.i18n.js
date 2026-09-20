/**
 * Strings of `src/data/schoolsFeed.js` — the Annuaire de l'éducation's reading.
 *
 * TWO READERS, ONE OF THEM WITHOUT A LANGUAGE. `projectSchoolSites` runs on the
 * server (`vite.config.js` imports it for `/api/schools-fr/sites`), and a
 * server has no locale by design (docs/i18n/CONVENTIONS.md, "Server-side
 * modules"). Nothing this file holds is ever written into a payload: the
 * projection publishes the register's own KEYS — `ecole`, `commune`, `prive` —
 * and the browser labels them at draw time. That is why the level of a school
 * survives a cached payload unchanged while the words around it switch.
 *
 * The band names are this repo's five-way fold of the register's eight
 * `type_etablissement` values, not the register's own words, so they are
 * translated rather than quoted. The values they fold FROM (`Ecole`,
 * `Médico-social`, `Privé`, `Numéro de rue`…) stay in the module, under
 * `i18n-ignore`: they are a join key and a query, never a label.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The five colour bands, keyed by the ladder of `SCHOOL_LEVELS`.
   *
   * `adapte` and `autre` are the two that are not a school age. `adapte`
   * covers EREA and médico-social together — adapted schooling — and `autre`
   * names the 2 756 rows of the register that are administration rather than
   * teaching, so a legend can say what those dots are instead of letting them
   * pass as schools.
   */
  levels: {
    ecole: { fr: 'École', en: 'School' },
    college: { fr: 'Collège', en: 'Middle school' },
    lycee: { fr: 'Lycée', en: 'High school' },
    adapte: {
      fr: 'Adapté & médico-social',
      en: 'Adapted & special-needs',
      note: 'EREA plus médico-social: schooling adapted to a disability or an illness.',
    },
    autre: {
      fr: 'Administratif & orientation',
      en: 'Administration & guidance',
      note: 'Rectorats, DSDEN and CIO — on the register, and not schools.',
    },
  },

  /**
   * The four-step geocoding-quality ladder, keyed by `SCHOOL_PRECISION_STEPS`.
   *
   * `commune` is the one a card prints: it means the dot is the town's centre
   * point and not the school, which is true of 2 159 rows.
   */
  precision: {
    adresse: { fr: 'Adresse exacte', en: 'Exact address' },
    rue: { fr: 'Rue', en: 'Street' },
    commune: { fr: 'Centre de la commune', en: 'Center of the municipality' },
    inconnue: { fr: 'Précision non publiée', en: 'Accuracy not published' },
  },

  /** What a site is called when the register published no name for it. */
  unnamed: {
    fr: 'Établissement',
    en: 'Establishment',
    note: 'Deliberately not “School”: the register also holds rectorats and CIO.',
  },
});
