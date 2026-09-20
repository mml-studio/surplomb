/**
 * Strings of `src/data/delinquanceFeed.js` — the SSMSI's recorded-crime bases.
 *
 * ── THE CATEGORIES ARE NOT HERE, AND THAT IS THE POINT ──────────────────────
 * The eighteen indicators are joined to the CSV **on their French label**:
 * there is no code column, so `Cambriolages de logement` IS the key. That
 * table stays in the module, verbatim, inside an `i18n-ignore` block. What
 * lives here is the DISPLAY of each of them, keyed by slug, so an English card
 * can say "Home burglary" while the join still matches the register's own
 * words. Same for `unite`: `Mis en cause` is a value the file publishes, and
 * the noun a card counts in is chosen from it, never instead of it.
 *
 * ── WHAT THE SERVER READS ───────────────────────────────────────────────────
 * `vite.config.js` imports this module for the fold, the CSV reader, the
 * resource discovery and the chip ranking. None of those touch a word below;
 * every accessor here is called from a browser, at draw time. The three
 * attribution constants it DOES read are marked as data in the module
 * (docs/i18n/CONVENTIONS.md, "Server-side modules").
 *
 * ── THE PUBLISHER'S OWN SENTENCES ───────────────────────────────────────────
 * Four rules are quoted rather than summarised, because the moment a
 * suppression rule is paraphrased it stops being the rule and becomes this
 * repo's opinion of it — and the paraphrase this layer used to print
 * («entre 1 et 5 faits») was refuted by the register itself. The English
 * translates them inside the same quotation marks and keeps every number: a
 * French sentence an English reader cannot read is not a check they can
 * perform, it is decoration. The `fr` side holds the extraction from the
 * methodology PDF, character for character, and is what a French card prints.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** Where the four quotes come from, so a card can cite it. */
  documentationTitle: {
    fr: 'Documentation — bases statistiques de la '
      + 'délinquance enregistrée, SSMSI, juillet 2026',
    en: 'Documentation — bases statistiques de la '
      + 'délinquance enregistrée, SSMSI, July 2026',
    note: 'A citation: the document’s own title stays as published, so a reader can find it.',
    keep: ['bases statistiques de la délinquance enregistrée'],
  },

  /** The four rules, verbatim on the `fr` side. */
  rules: {
    suppression: {
      fr: '« Les données diffusées sont limitées aux communes '
        + 'pour lesquelles plus de 5 faits ont été enregistrés pendant 3 années successives. »',
      en: '“Published data is limited to municipalities in which more than 5 facts were '
        + 'recorded over 3 successive years.”',
      note: 'The single most misquoted sentence here: a THREE-YEAR condition on the series, '
        + 'not a ceiling on the displayed year.',
    },
    zero: {
      fr: '« La base de données diffusée fournit également '
        + 'l’information sur l’absence de faits enregistrés lorsqu’elle se reproduit sur 3 années '
        + 'successives. »',
      en: '“The published database also provides the information that no fact was recorded, '
        + 'where that holds over 3 successive years.”',
      note: 'The other half of the rule: a published 0 is a claim, not a gap.',
    },
    complement: {
      fr: '« Valeur pour 1 000 moyenne parmi les communes du '
        + 'département sous secret statistique »',
      en: '“Mean value per 1,000 across the department’s municipalities under statistical '
        + 'confidentiality”',
      note: 'What `complement_info_taux` is. It is NOT the municipality’s own value.',
    },
    plainte: {
      fr: '« La propension à déposer plainte a un impact sur le '
        + 'niveau de la délinquance enregistrée […] en moyenne sur la période 2011-2018 seules 12 % '
        + 'des victimes de violences sexuelles hors ménage portent plainte, contre 74 % pour les '
        + 'victimes de cambriolages. »',
      en: '“The propensity to file a complaint has an impact on the level of recorded crime […] '
        + 'on average over 2011-2018, only 12% of victims of sexual violence outside the '
        + 'household file a complaint, against 74% of burglary victims.”',
      note: '12% against 74% means two indicators of this same layer are not on a comparable scale.',
    },
  },

  /**
   * Per-indicator warnings, keyed by slug. The verbatim register.
   *
   * A slug with no note gets none rather than a filler line.
   */
  notes: {
    escroqueries: {
      fr: '⚠ Comptées au LIEU DE RÉSIDENCE de la victime, pas au lieu de commission '
        + '(« une part importante de ces infractions a lieu sur internet »). Cette carte montre où '
        + 'habitent les victimes déclarées.',
      en: '⚠ Counted at the victim’s PLACE OF RESIDENCE, not where the offense was committed '
        + '(“a large share of these offenses happen online”). This map shows where the reported '
        + 'victims live.',
      note: 'The first chip of the layer, so the note a reader is most likely to meet.',
    },
    cambriolages: {
      fr: 'Taux pour 1 000 LOGEMENTS et non pour 1 000 habitants — cet indicateur ne se '
        + 'compare à aucun autre de cette liste.',
      en: 'Rate per 1,000 DWELLINGS and not per 1,000 residents — this indicator compares '
        + 'with nothing else on this list.',
    },
    'usage-stupefiants': {
      fr: 'Mis en cause élucidés. « Un mis en cause donné n’est compté qu’une seule '
        + 'fois par unité spatiale » : le total départemental n’est pas la somme des communes.',
      en: 'Named suspects in solved cases. “A given suspect is counted only once per spatial '
        + 'unit”: the department total is not the sum of its municipalities.',
    },
    'usage-stupefiants-afd': {
      fr: 'Amendes forfaitaires délictuelles. La date retenue a changé en '
        + 'juillet 2026 (+1 %, soit 2 614 mis en cause) — une rupture de série, pas une hausse.',
      en: 'Fixed criminal fines (AFD). The date the register counts on changed in July 2026 '
        + '(+1%, i.e. 2,614 named suspects) — a break in the series, not a rise.',
    },
    'usage-stupefiants-hors-afd': {
      fr: 'Publié au département et à la région seulement : il n’existe pas '
        + 'de carte communale de cet indicateur.',
      en: 'Published at department and region level only: there is no municipal map of this '
        + 'indicator.',
    },
    'trafic-stupefiants': {
      fr: 'Mis en cause élucidés. « Un mis en cause donné n’est compté qu’une seule '
        + 'fois par unité spatiale » : le total départemental n’est pas la somme des communes.',
      en: 'Named suspects in solved cases. “A given suspect is counted only once per spatial '
        + 'unit”: the department total is not the sum of its municipalities.',
    },
    homicides: {
      fr: 'Publié au département et à la région seulement : il n’existe pas de carte communale '
        + 'de cet indicateur.',
      en: 'Published at department and region level only: there is no municipal map of this '
        + 'indicator.',
    },
    'tentatives-homicide': {
      fr: 'Publié au département et à la région seulement : il n’existe pas de '
        + 'carte communale de cet indicateur.',
      en: 'Published at department and region level only: there is no municipal map of this '
        + 'indicator.',
    },
  },

  /**
   * The same warnings compressed to ONE card line each.
   *
   * Every line is ≤ 60 characters in both languages, which is what the
   * selected card fits before the overlay wraps it. The CLAIM of each rule
   * survives the compression; only its wording goes.
   */
  notesShort: {
    escroqueries: {
      fr: '⚠ Comptées au domicile de la victime, pas au lieu du fait',
      en: '⚠ Counted at the victim’s home, not where it happened',
    },
    cambriolages: {
      fr: 'Rapporté aux LOGEMENTS — non comparable aux autres',
      en: 'Per DWELLINGS — not comparable with the others',
    },
    'usage-stupefiants': {
      fr: 'Mis en cause élucidés — mesure l’activité des services',
      en: 'Suspects in solved cases — also measures police activity',
    },
    'usage-stupefiants-afd': {
      fr: 'Amendes forfaitaires — rupture de série en juillet 2026',
      en: 'Fixed fines — a break in the series in July 2026',
    },
    'usage-stupefiants-hors-afd': {
      fr: 'Publié au département seulement',
      en: 'Published at department level only',
    },
    'trafic-stupefiants': {
      fr: 'Mis en cause élucidés — mesure l’activité des services',
      en: 'Suspects in solved cases — also measures police activity',
    },
    homicides: { fr: 'Publié au département seulement', en: 'Published at department level only' },
    'tentatives-homicide': {
      fr: 'Publié au département seulement',
      en: 'Published at department level only',
    },
  },

  /**
   * The four boilerplate caveats and the total's three, compressed.
   *
   * Each keeps the load-bearing token of its long form — RECORDED crime, the
   * 12%/74% pair, the three-year condition, the authorship of the total — so
   * nothing a card asserts in French stops being asserted in English.
   */
  caveats: {
    enregistree: {
      fr: '⚠ Délinquance ENREGISTRÉE — le déclaré, pas le réel',
      en: '⚠ RECORDED crime — what was reported, not what happened',
    },
    misEnCause: {
      fr: '⚠ Délinquance ENREGISTRÉE, comptée en mis en cause',
      en: '⚠ RECORDED crime, counted in named suspects',
    },
    plainte: {
      fr: 'Plainte : 12 % à 74 % selon l’atteinte',
      en: 'Complaints filed: 12% to 74% by offense',
      note: 'It rides at the end of another line, so the pair has to fit 60 characters together.',
    },
    suppression: {
      fr: 'Diffusé si > 5 faits 3 ans de suite — ni zéro, ni « peu »',
      en: 'Released if > 5 facts 3 years running — not zero, not “few”',
    },
    documentation: { fr: 'SSMSI, juillet 2026', en: 'SSMSI, July 2026' },
    /** The one line of this whole file that may never be dropped for length. */
    totalAuthorship: {
      fr: '⚠ Total CALCULÉ par Surplomb, non publié par le SSMSI',
      en: '⚠ Total COMPUTED by Surplomb, not published by the SSMSI',
      note: 'A reader who loses this line is reading Surplomb’s arithmetic as the register’s.',
    },
    totalUnits: {
      fr: 'Unités mélangées, taux recalculé sur la population',
      en: 'Mixed units, rate recomputed on the population',
    },
    totalAfd: {
      fr: 'Usage stup. (AFD) non recompté : déjà dans son parent',
      en: 'Drug use (AFD) not re-counted: already in its parent',
    },
  },

  /**
   * What the numbers actually COUNT, keyed by the register's own `unite`.
   *
   * This is the answer to the only question a rate provokes — "6.22 of what?"
   * — and the register answers it differently for each indicator. Singular
   * then plural, in each language's own words.
   */
  units: {
    Victime: { fr: ['victime', 'victimes'], en: ['victim', 'victims'] },
    'Victime entendue': {
      fr: ['victime entendue', 'victimes entendues'],
      en: ['victim interviewed', 'victims interviewed'],
      note: 'A victim the police took a statement from, which is a narrower count.',
    },
    Infraction: { fr: ['infraction', 'infractions'], en: ['offense', 'offenses'] },
    'Véhicule': { fr: ['véhicule', 'véhicules'], en: ['vehicle', 'vehicles'] },
    'Mis en cause': {
      fr: ['mis en cause', 'mis en cause'],
      en: ['named suspect', 'named suspects'],
      note: 'A person the police identified, NOT a person charged or convicted.',
    },
    /** What an indicator with no declared unit is counted in. */
    default: {
      fr: ['fait', 'faits'],
      en: ['recorded fact', 'recorded facts'],
      note: 'The register’s own word for an entry in the file.',
    },
  },

  /** The denominator of `taux_pour_mille`, which is not uniform. */
  rateUnits: {
    habitants: { fr: '1 000 habitants', en: '1,000 residents' },
    logements: {
      fr: '1 000 logements',
      en: '1,000 dwellings',
      note: 'Only `Cambriolages de logement`. Verified on 4 493 cells of the 2025 edition.',
    },
  },

  /**
   * The four states a commune cell can be in, written so no two can be read
   * as each other. `missing` is the fourth: a commune the edition never
   * mentions, which is neither a zero nor a secret.
   */
  cellStates: {
    published: { fr: 'Valeur publiée', en: 'Published value' },
    zero: { fr: 'Aucun fait enregistré', en: 'No fact recorded' },
    suppressed: {
      fr: 'Non diffusé — secret statistique',
      en: 'Not released — statistical confidentiality',
    },
    missing: { fr: 'Absent de cette édition', en: 'Absent from this edition' },
  },

  /**
   * The display name of each indicator, keyed by slug.
   *
   * The `fr` repeats the register's own label byte for byte — that string is
   * the join key, and `delinquanceFeed.test.mjs` compares the two — so the
   * card prints exactly what the file says. The English is the reading of it.
   */
  indicators: {
    homicides: { fr: 'Homicides', en: 'Homicides' },
    'tentatives-homicide': { fr: "Tentatives d'homicide", en: 'Attempted homicides' },
    'violences-intrafamiliales': {
      fr: 'Violences physiques intrafamiliales',
      en: 'Domestic physical assault',
    },
    'violences-hors-famille': {
      fr: 'Violences physiques hors cadre familial',
      en: 'Physical assault outside the family',
    },
    'violences-sexuelles': { fr: 'Violences sexuelles', en: 'Sexual violence' },
    'vols-armes': { fr: 'Vols avec armes', en: 'Theft with a weapon' },
    'vols-violents': { fr: 'Vols violents sans arme', en: 'Violent theft without a weapon' },
    'vols-sans-violence': {
      fr: 'Vols sans violence contre des personnes',
      en: 'Theft from a person without violence',
    },
    cambriolages: { fr: 'Cambriolages de logement', en: 'Home burglary' },
    'vols-vehicules': { fr: 'Vols de véhicule', en: 'Vehicle theft' },
    'vols-dans-vehicules': { fr: 'Vols dans les véhicules', en: 'Theft from vehicles' },
    'vols-accessoires': {
      fr: "Vols d'accessoires sur véhicules",
      en: 'Theft of vehicle parts and accessories',
    },
    degradations: {
      fr: 'Destructions et dégradations volontaires',
      en: 'Criminal damage and destruction',
    },
    'usage-stupefiants': { fr: 'Usage de stupéfiants', en: 'Drug use' },
    'usage-stupefiants-afd': { fr: 'Usage de stupéfiants (AFD)', en: 'Drug use (AFD)' },
    'usage-stupefiants-hors-afd': {
      fr: 'Usage de stupéfiants (hors AFD)',
      en: 'Drug use (excluding AFD)',
    },
    'trafic-stupefiants': { fr: 'Trafic de stupéfiants', en: 'Drug trafficking' },
    escroqueries: {
      fr: 'Escroqueries et fraudes aux moyens de paiement',
      en: 'Fraud and payment fraud',
    },
    tous: { fr: 'Tous les indicateurs — total calculé', en: 'All indicators — computed total' },
  },

  /** The chip label of each indicator: shorter, and the same key set. */
  indicatorsShort: {
    homicides: { fr: 'Homicides', en: 'Homicides' },
    'tentatives-homicide': { fr: 'Tentatives d’homicide', en: 'Attempted homicides' },
    'violences-intrafamiliales': { fr: 'Violences intrafamiliales', en: 'Domestic assault' },
    'violences-hors-famille': { fr: 'Violences hors famille', en: 'Assault outside the family' },
    'violences-sexuelles': { fr: 'Violences sexuelles', en: 'Sexual violence' },
    'vols-armes': { fr: 'Vols avec armes', en: 'Armed theft' },
    'vols-violents': { fr: 'Vols violents', en: 'Violent theft' },
    'vols-sans-violence': { fr: 'Vols sans violence', en: 'Theft without violence' },
    cambriolages: { fr: 'Cambriolages', en: 'Burglary' },
    'vols-vehicules': { fr: 'Vols de véhicule', en: 'Vehicle theft' },
    'vols-dans-vehicules': { fr: 'Vols dans les véhicules', en: 'Theft from vehicles' },
    'vols-accessoires': { fr: 'Vols d’accessoires', en: 'Parts theft' },
    degradations: { fr: 'Dégradations', en: 'Criminal damage' },
    'usage-stupefiants': { fr: 'Usage de stupéfiants', en: 'Drug use' },
    'usage-stupefiants-afd': { fr: 'Usage stup. (AFD)', en: 'Drug use (AFD)' },
    'usage-stupefiants-hors-afd': { fr: 'Usage stup. (hors AFD)', en: 'Drug use (excl. AFD)' },
    'trafic-stupefiants': { fr: 'Trafic de stupéfiants', en: 'Drug trafficking' },
    escroqueries: { fr: 'Escroqueries', en: 'Fraud' },
    tous: { fr: 'Tous', en: 'All' },
  },

  /** The computed total's unit, which is deliberately a mouthful. */
  totalUnit: {
    fr: 'Victimes, infractions, véhicules et mis en cause confondus',
    en: 'Victims, offenses, vehicles and named suspects combined',
    note: 'Five different units added together. Naming the limit is the honest thing.',
  },
});
