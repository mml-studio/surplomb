/**
 * Strings of `src/data/georisques.js` — Risks (Géorisques) on the globe.
 *
 * THE VOCABULARY IS ALREADY DECIDED NEXT DOOR. The Address X-ray reads the
 * same `/api/georisques` scan and already words the register's own values:
 * hazard families, the five verdicts, the four grades, the three radon
 * classes. They are re-exported from here rather than re-decided, because a
 * flood verdict that reads “Affected” on the card and something else in the
 * key would read as two different scans.
 *
 * WHAT THIS LAYER ADDS is a SHORTER vocabulary: the key prints one word per
 * hazard (`affected` / `not known` / `outside the zone`) rather than the
 * register's sentence, because a reader scanning eleven lines is looking for
 * which ones reach them. Those three words are this module's own, and the
 * register's full sentence still appears — in the blurb, whenever the two
 * verdicts disagree.
 *
 * A note on “commune”: the glossary says *municipality*, and that is what the
 * key and the card say. The entity ids keep `georisques:commune:` because ids
 * are not words.
 */
import { plural } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';
import {
  RADON_LABELS,
  RISK_GRADES,
  RISK_LABELS,
  RISK_VERDICTS,
} from './adresseRadiographie.i18n.js';

export { RADON_LABELS, RISK_GRADES, RISK_LABELS, RISK_VERDICTS };

/**
 * The regimes the ICPE register publishes, as it publishes them.
 *
 * `Non ICPE` is the one that matters on screen: it is the site the state
 * surveyed and then took out of the regime, and the layer greys it apart from
 * the two that are still classified. A regime the register invents next month
 * is shown as it came.
 */
export const ICPE_REGIMES = defineMessages({
  Autorisation: { fr: 'Autorisation', en: 'Authorization' },
  Enregistrement: { fr: 'Enregistrement', en: 'Registration' },
  Déclaration: { fr: 'Déclaration', en: 'Declaration' },
  'Non ICPE': { fr: 'Non ICPE', en: 'Not classified (ICPE)' },
  Inconnu: { fr: 'Inconnu', en: 'Unknown' },
});

/** The Seveso standings the register publishes, verbatim on the left. */
export const SEVESO_STATUSES = defineMessages({
  'Non Seveso': { fr: 'Non Seveso', en: 'Not Seveso' },
  'Seveso seuil bas': { fr: 'Seveso seuil bas', en: 'Seveso lower tier' },
  'Seveso seuil haut': { fr: 'Seveso seuil haut', en: 'Seveso upper tier' },
});

export default defineMessages({
  /** The three words the key prints for a hazard's standing. */
  standing: {
    concerned: {
      fr: 'concerné',
      en: 'affected',
      note: 'The register’s own “Concerne” means the hazard REACHES here, not '
        + '“concerned” in the English sense. Same choice as RISK_VERDICTS.',
    },
    unknown: {
      fr: 'non connu',
      en: 'not known',
      note: 'Checked and unresolved. Never “no”: that is the one misreading '
        + 'this layer exists to prevent.',
    },
    clear: { fr: 'hors zone', en: 'outside the zone' },
  },

  hazard: {
    /** `concerné · faible` — the grade rides in the label, not in the sentence. */
    graded: {
      fr: (standing, grade) => `${standing} · ${grade}`,
      en: (standing, grade) => `${standing} · ${grade}`,
      sample: ['affected', 'low'],
    },
    /**
     * The register's own verdict with its grade, in the blurb.
     *
     * Word for word `adresseRadiographie.i18n.js`'s `verdictGraded`: the same
     * field, read from the same scan, on two surfaces of one product.
     */
    verdictGraded: {
      fr: (verdict, grade) => `${verdict} - ${grade}`,
      en: (verdict, grade) => `${verdict} — ${grade}`,
      note: 'French keeps the register’s own hyphen; English uses an em dash.',
      sample: ['Risk present', 'low'],
    },
    /** One hazard's line: its family, then its standing. */
    line: {
      fr: (family, verdict) => `${family} — ${verdict}`,
      en: (family, verdict) => `${family} — ${verdict}`,
      sample: ['Flooding', 'affected'],
    },
    /** Appended when the commune and the address do not agree. */
    varies: {
      fr: ' · diffère de la commune',
      en: ' · differs from the municipality',
    },
    /** The two verdicts, in full, under a line that says they disagree. */
    bothVerdicts: {
      fr: (commune, address) => `commune : ${commune} · à cette adresse : ${address}`,
      en: (commune, address) => `municipality: ${commune} · at this address: ${address}`,
      sample: ['Affected', 'Not affected'],
    },
  },

  /** The card the commune outline and its ground label both carry. */
  commune: {
    title: {
      fr: (name, code) => `Commune de ${name} (${code})`,
      en: (name, code) => `Municipality of ${name} (${code})`,
      sample: ['Lyon 3e Arrondissement', '69383'],
    },
    concerned: {
      fr: (count, list) => `${count} risque${count > 1 ? 's' : ''} recensé${count > 1 ? 's' : ''} `
        + `sur la commune : ${list}`,
      en: (count, list) => `${count} ${plural(count, 'hazard', 'hazards')} on record `
        + `for the municipality: ${list}`,
      sample: [3, 'Flooding, Clay shrink-swell, Earthquake'],
      note: 'The count arrives as a number, not a formatted one: these are '
        + 'hazard families, never more than about twenty.',
    },
    none: {
      fr: 'aucun risque recensé sur la commune',
      en: 'no hazard on record for the municipality',
    },
    varying: {
      fr: (count) => `${count} verdict${count > 1 ? 's' : ''} diffère${count > 1 ? 'nt' : ''} `
        + 'entre la commune et l’adresse scannée',
      en: (count) => `${count} ${plural(count, 'verdict', 'verdicts')} `
        + `${plural(count, 'differs', 'differ')} between the municipality and the scanned address`,
      sample: [2],
    },
    simplified: {
      fr: 'contour simplifié pour l’affichage — ce n’est pas la limite cadastrale',
      en: 'outline simplified for display — this is not the cadastral boundary',
    },
    noExtent: {
      fr: 'Aucun de ces risques n’a d’emprise publiée : la surbrillance porte la commune, '
        + 'pas la zone exposée',
      en: 'None of these hazards publishes an extent: the highlight covers the municipality, '
        + 'not the exposed area',
    },
  },

  /** The three installation classes the key can print, in severity order. */
  icpe: {
    seveso: {
      label: { fr: 'Site Seveso', en: 'Seveso site' },
      blurb: {
        fr: 'Seuil haut ou bas — l’établissement relève de la directive Seveso.',
        en: 'Upper or lower tier — the establishment falls under the Seveso directive.',
      },
    },
    classified: {
      label: { fr: 'Installation classée', en: 'Classified facility (ICPE)' },
      blurb: {
        fr: 'Autorisation, enregistrement ou déclaration au titre des ICPE.',
        en: 'Authorization, registration or declaration under the ICPE regime.',
      },
    },
    declassified: {
      label: { fr: 'Site déclassé', en: 'Declassified site' },
      blurb: {
        fr: 'Recensé puis sorti du régime ICPE — le registre le garde, la carte aussi.',
        en: 'Surveyed and then taken out of the ICPE regime — the register keeps it, '
          + 'and so does the map.',
      },
    },
    /** The two fields of an establishment's card, beside its address. */
    regime: {
      fr: (regime) => `Régime : ${regime}`,
      en: (regime) => `Regime: ${regime}`,
      sample: ['Authorization'],
    },
    sevesoStatus: {
      fr: (status) => `Seveso : ${status}`,
      en: (status) => `Seveso: ${status}`,
      sample: ['Not Seveso'],
    },
  },

  legend: {
    commune: {
      fr: (name) => `Commune de ${name}`,
      en: (name) => `Municipality of ${name}`,
      sample: ['Bassussarry'],
    },
    communeBlurb: {
      fr: 'La surbrillance couvre la commune sur laquelle portent les '
        + 'verdicts ci-dessous — c’est un périmètre administratif, pas '
        + 'l’étendue d’un risque, qu’aucun de ces aléas ne publie.',
      en: 'The highlight covers the municipality the verdicts below are about — '
        + 'an administrative boundary, not the extent of a hazard, '
        + 'which none of these hazards publishes.',
    },
    settled: {
      fr: (count) => `${count} autres aléas vérifiés — hors zone`,
      en: (count) => `${count} other ${plural(count, 'hazard', 'hazards')} checked — outside the zone`,
      sample: [6],
      note: 'The French says “autres aléas” even for one, which is what it has '
        + 'always printed; the English agrees with its count.',
    },
    settledBlurb: {
      fr: 'Contrôlés par le registre et sans objet à cette adresse — '
        + 'ce qui n’est pas la même chose que non vérifiés.',
      en: 'Checked by the register and not applicable at this address — '
        + 'which is not the same as not checked.',
    },
    reportDown: { fr: 'Aléas indisponibles', en: 'Hazards unavailable' },
    reportDownBlurb: {
      fr: 'Le registre des risques n’a pas répondu — inondation, argiles, '
        + 'sismicité et radon ne sont pas connus ici, ce qui n’est pas la même '
        + 'chose qu’absents. Les établissements ci-dessus, eux, sont à jour.',
      en: 'The risk register did not answer — flooding, clay, seismicity and radon '
        + 'are not known here, which is not the same as absent. The establishments '
        + 'above are up to date.',
    },
    note: {
      fr: 'Les aléas n’ont pas de géométrie chez Géorisques : ils sont dits, pas dessinés.',
      en: 'Géorisques publishes no geometry for these hazards: they are stated, not drawn.',
    },
    /** The credit line, with the commune the scan resolved. */
    credit: {
      fr: (commune) => `Géorisques — BRGM / MTE · ${commune}`,
      en: (commune) => `Géorisques — BRGM / MTE · ${commune}`,
      sample: ['Bassussarry'],
    },
    creditRadon: {
      fr: (commune, klass) => `Géorisques — BRGM / MTE · ${commune} · radon classe ${klass}`,
      en: (commune, klass) => `Géorisques — BRGM / MTE · ${commune} · radon class ${klass}`,
      sample: ['Bassussarry', 2],
    },
  },
});
