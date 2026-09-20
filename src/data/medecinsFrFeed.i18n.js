/**
 * The vocabulary of `medecins-fr`, in both languages.
 *
 * Four tables, each keyed on a value the pack carries, so the key never moves
 * and only the display does.
 *
 * THE TARIFF WORDS ARE NOT THE REGISTER'S. “Secteur 2” tells a reader nothing
 * and “OPTAM” tells them less; what matters at the point of care is whether
 * the price is fixed, capped or free, so that is what the card says — in both
 * languages, with the French scheme names kept in parentheses because they are
 * what a patient will see on the door and on the bill.
 *
 * THE PRECISION WORDS ARE BAN'S OWN CATEGORIES, said as a reader experiences
 * them: “rue, sans le numéro” / “street, without the number”. A dot at the
 * centre of a municipality is not a dot at a door, and the card has to be able
 * to say which it is.
 *
 * APL — accessibilité potentielle localisée — is the DREES's indicator, in
 * consultations per inhabitant per year. The acronym stays; the standing is
 * translated.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

/** The seven families the layer draws, keyed on the mesh's own family id. */
export const MEDECIN_FAMILY_LABELS = defineMessages({
  generaliste: { fr: 'Médecine générale', en: 'General practice' },
  'femme-enfant': { fr: 'Femme et enfant', en: 'Women and children' },
  'sante-mentale': { fr: 'Santé mentale', en: 'Mental health' },
  specialiste: { fr: 'Spécialité médicale', en: 'Medical specialty' },
  chirurgie: { fr: 'Chirurgie', en: 'Surgery' },
  imagerie: { fr: 'Imagerie et biologie', en: 'Imaging and laboratory' },
  hopital: { fr: 'Hôpital', en: 'Hospital' },
});

/** BAN's own word for what it matched, in the pack's index order. */
export const MEDECIN_PRECISION_LABELS = defineMessages({
  numero: { fr: 'adresse exacte', en: 'exact address' },
  voie: { fr: 'rue, sans le numéro', en: 'street, without the number' },
  'lieu-dit': { fr: 'lieu-dit', en: 'locality' },
  commune: { fr: 'centre de la commune', en: 'center of the municipality' },
});

/**
 * What one practitioner costs you, keyed on `secteur_conventionnel_code`.
 *
 * Measured on the shipped pack: 94% of GP entries are sector 1, against 18% of
 * ophthalmologist entries, 63% of whom set their own fees.
 */
export const MEDECIN_TARIFF_LABELS = defineMessages({
  1: {
    fr: 'tarif fixé (secteur 1)',
    en: 'set fee (sector 1)',
    note: 'Sector 1: the practitioner bills the health-insurance tariff and nothing more.',
  },
  3: {
    fr: 'honoraires libres (secteur 2)',
    en: 'own fees (sector 2)',
  },
  2: { fr: 'dépassement permanent', en: 'permanent extra billing' },
  0: { fr: 'non conventionné', en: 'outside the health-insurance agreement' },
});

/** Where the ARS's two policy thresholds put a municipality. */
export const APL_STANDING_LABELS = defineMessages({
  'sous-dotee': { fr: 'zone sous-dotée', en: 'under-served area' },
  'moyennement-dotee': { fr: 'moyennement dotée', en: 'moderately served' },
  'bien-dotee': { fr: 'bien dotée', en: 'well served' },
});

export default defineMessages({
  /** Sector 2 with the capped-fee option — a fifth answer the codes do not have. */
  tariffCapped: {
    fr: 'dépassements plafonnés (OPTAM)',
    en: 'capped extra billing (OPTAM)',
    note: 'OPTAM is the fee-moderation agreement; the acronym is what a patient sees.',
    keep: ['OPTAM'],
  },
  /** The register published a practitioner with no sector at all. */
  tariffUnpublished: { fr: 'secteur non publié', en: 'sector not published' },

  /** Attribution carried on the join payload, beside the drawn sites. */
  source: {
    fr: 'Annuaire santé Ameli — CNAM (data.gouv.fr), géocodé BAN',
    en: 'Annuaire santé Ameli — CNAM (data.gouv.fr), geocoded against the BAN',
    note: 'The directory’s name is the CNAM’s own and is not translated.',
    keep: ['Annuaire santé Ameli'],
  },
  aplSource: {
    fr: 'Accessibilité potentielle localisée (APL) — DREES',
    en: 'Local potential accessibility (APL) — DREES',
  },
});
