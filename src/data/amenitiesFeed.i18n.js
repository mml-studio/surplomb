/**
 * Strings of src/data/amenitiesFeed.js that a reader actually meets.
 *
 * Two tables, and they are the only two: the blurb behind each legend swatch,
 * and the four precision bands a card prints under a dot.
 *
 * WHAT IS NOT HERE, AND WHY. `BPE_CODE_LABELS` is INSEE's own wording, copied
 * verbatim from `TYPEQU_2025.csv`; `FINESS_HOPITAL_AGGREGATES` is the health
 * register's own; `FINESS_CRS` names coordinate systems. Those are register
 * values and are never rewritten — the rule of the i18n conventions' § 4. The
 * refusal notes (`BPE_REFUSED_CODES`, `BPE_ABSENT_TYPES`,
 * `BPE_REFUSED_DOMAINS`) are measurements kept in code and read only by the
 * test that stops the selection and its stated reasons from drifting apart;
 * nothing draws them.
 *
 * A BLURB IS AN ARGUMENT, NOT A DESCRIPTION. Each one says which BPE or FINESS
 * codes the family is made of, how many rows each contributes, and — where it
 * matters — what was deliberately left out and which other layer draws it.
 * Every figure is measured on the 2025 edition, so the English carries the
 * same figures, grouped the English way.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

/** One line behind each swatch — what the family actually contains, measured. */
export const AMENITY_FAMILY_BLURBS = defineMessages({
  restaurant: {
    fr: 'BPE A504 « restaurant-restauration rapide ». 231 989 lignes — à elle seule, davantage que les sept familles d’origine réunies.',
    en: 'BPE A504 “restaurant and fast food”. 231,989 rows — on its own, more than the original seven families put together.',
  },
  boulangerie: {
    fr: 'BPE B207 boulangerie-pâtisserie, 50 122 lignes. Le repère de proximité français, et son propre code.',
    en: 'BPE B207 bakery and pastry shop, 50,122 rows. The French landmark of the neighborhood, with a code of its own.',
  },
  commerce: {
    fr: 'BPE B202 épicerie (30 104), B204 boucherie-charcuterie (17 378), B206 poissonnerie (2 346), B205 produits surgelés (1 726). Le commerce de bouche, séparé du « faire ses courses ».',
    en: 'BPE B202 grocery (30,104), B204 butcher and delicatessen (17,378), B206 fishmonger (2,346), B205 frozen food (1,726). The food shop, kept apart from doing the weekly shopping.',
  },
  banque: {
    fr: 'BPE A203 banque et caisse d’épargne, 23 986 lignes. Ce sont des agences recevant du public, pas des distributeurs.',
    en: 'BPE A203 bank and savings bank, 23,986 rows. These are branches open to the public, not cash machines.',
  },
  sport: {
    fr: 'BPE F120 salles de remise en forme (8 549) et F121 salles multisports et gymnases (16 113). Le bassin de natation garde sa propre famille.',
    en: 'BPE F120 fitness rooms (8,549) and F121 multi-sport halls and gymnasiums (16,113). The swimming pool keeps a family of its own.',
  },
  culture: {
    fr: 'BPE F307 bibliothèque (15 676), F312 exposition et médiation culturelle (2 145), F303 cinéma (1 969), F315 arts du spectacle (1 389). La BPE 2025 ne porte aucun code « musée ».',
    en: 'BPE F307 library (15,676), F312 exhibition and cultural outreach (2,145), F303 cinema (1,969), F315 performing arts (1,389). The 2025 BPE carries no “museum” code at all.',
  },
  carburant: {
    fr: 'BPE B316 station-service, 10 497 lignes. Les bornes de recharge sont refusées : irve-fr lit le même fait en direct.',
    en: 'BPE B316 filling station, 10,497 rows. Charge points are refused: irve-fr reads the same fact live.',
  },
  medecin: {
    fr: 'BPE D265. 61 263 dans le fichier, 60 270 dessinés : 946 sont placés au hasard dans leur commune et 47 n’ont pas de coordonnée.',
    en: 'BPE D265. 61,263 in the file, 60,270 drawn: 946 are placed at random inside their municipality and 47 have no coordinates at all.',
  },
  courses: {
    fr: 'BPE B104 hypermarché et grand magasin (2 256), B105 supermarché (12 929), B201 supérette (5 617). Ni épicerie ni boulangerie : ce sont 80 226 lignes de plus.',
    en: 'BPE B104 hypermarket and department store (2,256), B105 supermarket (12,929), B201 convenience store (5,617). Neither grocery nor bakery: those are another 80,226 rows.',
  },
  pharmacie: {
    fr: 'FINESS, catégorie 620 « Pharmacie d’Officine » — 20 003 officines, contre 20 334 pour la BPE. Un seul registre par famille, et c’est celui qui a une clé stable.',
    en: 'FINESS, category 620 “Pharmacie d’Officine” — 20,003 pharmacies, against 20,334 in the BPE. One register per family, and it is the one with a stable key.',
    note: 'The category name is the health register’s own value and is not rewritten.',
    keep: ['Pharmacie d’Officine'],
  },
  poste: {
    fr: 'BPE A206 bureau de poste (6 584), A208 agence postale communale (7 122), A207 relais poste commerçant (3 164). Trois formes de guichet, pas trois postes.',
    en: 'BPE A206 post office (6,584), A208 municipal postal agency (7,122), A207 postal counter in a shop (3,164). Three shapes of counter, not three post offices.',
  },
  piscine: {
    fr: 'BPE F101. Le recensement des équipements sportifs : 3 626 des 3 633 lignes ne publient AUCUN indice de précision de position.',
    en: 'BPE F101. The census of sports facilities: 3,626 of its 3,633 rows publish NO position precision indicator at all.',
  },
  gendarmerie: {
    fr: 'BPE A104 gendarmerie recevant du public (3 394) et A140 police (661). Ce sont les points d’accueil, pas le maillage opérationnel.',
    en: 'BPE A104 gendarmerie open to the public (3,394) and A140 police (661). These are the public counters, not the operational network.',
    keep: ['gendarmerie'],
  },
  hopital: {
    fr: 'FINESS : CHR (388), centres hospitaliers (1 371), hôpitaux locaux (195), soins de courte durée (631). Les urgences de la BPE ne sont pas ajoutées — 78,8 % d’entre elles sont à moins de 200 m d’un de ces points.',
    en: 'FINESS: regional hospitals (388), general hospitals (1,371), local hospitals (195), short-stay care (631). The BPE’s emergency departments are not added — 78.8% of them are within 200 m of one of these points.',
  },
});

/**
 * The four precision bands, shared by both registers so one legend covers
 * both. There is no band for “invented”: a row whose register admits it drew
 * the position is refused, not banded.
 */
export const AMENITY_PRECISION_LABELS = defineMessages({
  numero: {
    fr: 'Numéro trouvé dans une voie sûre',
    en: 'Street number found on a certain street',
  },
  voie: { fr: 'Position dans la voie', en: 'Placed along the street' },
  approchee: { fr: 'Voie probable', en: 'Probable street' },
  indeterminee: { fr: 'Précision non publiée', en: 'Precision not published' },
});

export default AMENITY_FAMILY_BLURBS;
