/**
 * Strings of `src/data/ipsFeed.js` — the DEPP's *indice de position sociale*.
 *
 * WHAT THE SERVER READS AND WHAT THE BROWSER READS. `vite.config.js` imports
 * this module for `indexIps`, `summariseIpsCoverage` and the four dataset
 * specs; none of those touch a word below. Everything here is card copy and
 * one legend clause, called only from `schoolsFrance.js` in a browser — so a
 * cached payload carries numbers and keys, and the sentences around them are
 * chosen when the card is drawn (docs/i18n/CONVENTIONS.md, "Server-side
 * modules").
 *
 * FOUR ABSENCES, FOUR SENTENCES, AND THEY MAY NEVER CONVERGE. An index that
 * was never published, a file that did not load, a school the DEPP examined
 * and withheld, and a value published as something other than a number are
 * four different facts. The English keeps them four different sentences: a
 * reader who cannot tell "not published" from "unavailable" is being told the
 * third of drawn schools without an index is a gap in the data rather than in
 * the download.
 *
 * Every number arrives formatted (`formatDecimal`): a message places words
 * around a value, it never formats one.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The lycée voies, keyed as `record.voies` keys them.
   *
   * *Voie* is the track a pupil is enrolled on, and the three are far apart:
   * the median |GT − pro| gap is 18.1 IPS points. `stream` is the word the
   * English uses throughout.
   */
  voies: {
    gt: {
      fr: 'voie générale et technologique',
      en: 'general and technological stream',
      note: 'LEGT and the GT half of an LPO.',
    },
    pro: { fr: 'voie professionnelle', en: 'vocational stream' },
    postBac: {
      fr: 'post-bac',
      en: 'post-secondary',
      note: 'BTS and CPGE classes inside a lycée, folded into `ips_etab` only.',
    },
  },

  /** The card's IPS lines. Zero to three of them, in this order. */
  card: {
    notPublished: {
      fr: 'IPS non publié pour cet UAI',
      en: 'IPS not published for this UAI',
      note: 'The index was consulted and holds no row. One drawn school in three.',
    },
    unavailable: {
      fr: 'Indice de position sociale indisponible — fichier DEPP injoignable',
      en: 'Social position index unavailable — the DEPP file could not be reached',
      note: 'NOT the same claim as “not published”: the download failed, the index may exist.',
    },
    notSignificant: {
      fr: 'IPS non significatif (« NS ») — effectif trop faible pour que la DEPP publie l’indice',
      en: 'IPS not significant (“NS”) — too few pupils for the DEPP to publish the index',
      note: 'The DEPP examined this school and withheld the index: 2 504 rows of the écoles file.',
    },
    sentinel: {
      fr: (value) => `IPS publié comme « ${value} », pas comme un nombre`,
      en: (value) => `IPS published as “${value}”, not as a number`,
      note: 'Any sentinel other than NS, including a number outside the plausibility window.',
      sample: ['ND'],
    },
    spread: {
      fr: (value) => ` (écart-type ${value})`,
      en: (value) => ` (standard deviation ${value})`,
      note: 'Appended to the headline. The within-school dispersion, 7.9 to 46.2.',
      sample: ['12.0'],
    },
    /** A lycée names the unit BEFORE the number: `ips_etab` blends the voies. */
    lycee: {
      fr: (value, spread, type, rentree) => `IPS ${value}${spread} — établissement entier${type}, `
        + `rentrée ${rentree}`,
      en: (value, spread, type, rentree) => `IPS ${value}${spread} — whole school${type}, `
        + `${rentree} school year`,
      note: '`type` is ` (LPO)` or empty; `rentree` is a `YYYY-YYYY` school year.',
      sample: ['126.3', ' (standard deviation 12.0)', ' (LPO)', '2025-2026'],
    },
    value: {
      fr: (value, spread, rentree) => `IPS ${value}${spread} — rentrée ${rentree}`,
      en: (value, spread, rentree) => `IPS ${value}${spread} — ${rentree} school year`,
      sample: ['96.3', ' (standard deviation 34.3)', '2025-2026'],
    },
    voie: {
      fr: (label, value) => `${label} ${value}`,
      en: (label, value) => `${label} ${value}`,
      sample: ['vocational stream', '92.4'],
    },
    voiesBlended: {
      fr: (parts) => `${parts} — l’indice d’établissement mêle ces populations`,
      en: (parts) => `${parts} — the school-wide index blends these populations`,
      note: '`parts` is two or three voie readings already joined with ` · `.',
      sample: ['general and technological stream 140.1 · vocational stream 92.4'],
    },
    voieOnly: {
      fr: (part) => `${part} — seule voie publiée pour ce lycée`,
      en: (part) => `${part} — the only stream published for this high school`,
      sample: ['vocational stream 92.4'],
    },
    /** `Réf.` alone, or with the lycée type whose baseline was picked. */
    scope: { fr: 'Réf.', en: 'Ref.' },
    scopeTyped: {
      fr: (type) => `Réf. ${type}`,
      en: (type) => `Ref. ${type}`,
      note: '`type` is the published `type_de_lycee`: LEGT, LPO or LP.',
      sample: ['LPO'],
    },
    departemental: {
      fr: (value) => `département ${value}`,
      en: (value) => `department ${value}`,
      sample: ['104.4'],
    },
    national: {
      fr: (value) => `France ${value}`,
      en: (value) => `France ${value}`,
      sample: ['89.9'],
    },
    anchors: {
      fr: (scope, anchors) => `${scope} : ${anchors}`,
      en: (scope, anchors) => `${scope}: ${anchors}`,
      sample: ['Ref. LPO', 'department 104.4 · France 89.9'],
    },
    anchorsWithGap: {
      fr: (scope, anchors, delta, against) => `${scope} : ${anchors} — écart ${delta} ${against}`,
      en: (scope, anchors, delta, against) => `${scope}: ${anchors} — gap ${delta} ${against}`,
      sample: ['Ref.', 'department 104.4 · France 89.9', '+12.8', 'against the department'],
    },
  },

  /**
   * Which published reference the gap is measured against.
   *
   * The département when it is published and is not this school itself; the
   * national figure otherwise.
   */
  baseline: {
    departemental: { fr: 'au département', en: 'against the department' },
    national: { fr: 'à la France', en: 'against France' },
  },

  /** The one clause a coverage readout gets, on a row or a status line. */
  coverage: {
    unavailable: { fr: 'IPS indisponible', en: 'IPS unavailable' },
    clause: {
      fr: (valued, eligible) => `IPS publié pour ${valued} des ${eligible} établissements concernés`,
      en: (valued, eligible) => `IPS published for ${valued} of the ${eligible} schools it covers`,
      note: 'Never a bare percentage: the denominator is the argument.',
      sample: ['40,529', '62,857'],
    },
    partial: {
      fr: (clause) => `${clause} — index partiel`,
      en: (clause) => `${clause} — partial index`,
      note: 'At least one of the four DEPP files did not load.',
      sample: ['IPS published for 40 of the 100 schools it covers'],
    },
  },
});
