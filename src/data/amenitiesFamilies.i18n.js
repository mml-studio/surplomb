/**
 * The fourteen families of `amenities-fr`, in both languages.
 *
 * TWO TABLES BECAUSE A CARD ASKS TWO QUESTIONS. `AMENITY_FAMILY_LABELS` names
 * the family as a heading — “Supermarket, convenience store” — and
 * `AMENITY_FAMILY_PLURALS` is the head-word a count leans on — “3 food stores
 * at this address”. They are not the same words in either language, and the
 * plural is not the singular with an s: *courses* is *Supermarché, supérette*
 * as a heading and *commerces alimentaires* as a count.
 *
 * THE KEYS ARE THE DATA. `restaurant`, `boulangerie`, `courses`… are the
 * family ids `AMENITY_FAMILIES` fixes, and the amenities pack stores a family
 * by its INDEX in that frozen list. Nothing here may be renamed or reordered;
 * only the words move.
 *
 * WHAT STAYS FRENCH IN ENGLISH. *La Poste* is the company, not a post office,
 * so it is kept as written; *Gendarmerie* is the force, and the BPE counts its
 * public counters beside the national police's, which is why the label names
 * both.
 *
 * Read by `amenitiesFrance.js` for the globe's cards and by
 * `adresseRadiographie.js` for the Address X-ray, which used to carry its own
 * copy of this table with a drift test. It does not any more: there is one
 * definition, here.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

/** The family as a heading. Also the default export, as a catalog file owes one. */
export const AMENITY_FAMILY_LABELS = defineMessages({
  restaurant: { fr: 'Restaurant', en: 'Restaurant' },
  boulangerie: { fr: 'Boulangerie', en: 'Bakery' },
  commerce: { fr: 'Commerce de bouche', en: 'Food shop' },
  banque: { fr: 'Banque', en: 'Bank' },
  sport: { fr: 'Salle de sport', en: 'Gym' },
  culture: { fr: 'Lieu culturel', en: 'Cultural venue' },
  carburant: { fr: 'Station-service', en: 'Filling station' },
  medecin: { fr: 'Médecin généraliste', en: 'General practitioner' },
  courses: { fr: 'Supermarché, supérette', en: 'Supermarket, convenience store' },
  pharmacie: { fr: 'Pharmacie', en: 'Pharmacy' },
  poste: { fr: 'La Poste', en: 'La Poste', keep: ['La Poste'] },
  piscine: { fr: 'Bassin de natation', en: 'Swimming pool' },
  gendarmerie: { fr: 'Gendarmerie, police', en: 'Gendarmerie, police' },
  hopital: { fr: 'Hôpital', en: 'Hospital' },
});

/** The head-word a count leans on, keyed the same way. */
export const AMENITY_FAMILY_PLURALS = defineMessages({
  restaurant: { fr: 'restaurants', en: 'restaurants' },
  boulangerie: { fr: 'boulangeries', en: 'bakeries' },
  commerce: { fr: 'commerces de bouche', en: 'food shops' },
  banque: { fr: 'agences bancaires', en: 'bank branches' },
  sport: { fr: 'salles de sport', en: 'gyms' },
  culture: { fr: 'lieux culturels', en: 'cultural venues' },
  carburant: { fr: 'stations-service', en: 'filling stations' },
  medecin: { fr: 'médecins généralistes', en: 'general practitioners' },
  courses: { fr: 'commerces alimentaires', en: 'food stores' },
  pharmacie: { fr: 'pharmacies', en: 'pharmacies' },
  poste: { fr: 'points de contact La Poste', en: 'La Poste contact points', keep: ['La Poste'] },
  piscine: { fr: 'bassins de natation', en: 'swimming pools' },
  gendarmerie: {
    fr: 'unités de gendarmerie et de police',
    en: 'gendarmerie and police units',
  },
  hopital: { fr: 'hôpitaux', en: 'hospitals' },
});

export default AMENITY_FAMILY_LABELS;
