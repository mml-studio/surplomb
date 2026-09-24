/**
 * Strings of `src/data/adresseRadiographie.js` — the Address X-ray.
 *
 * Every number arrives already formatted (`formatInteger`, `formatEuros`,
 * `formatPercent`, `ordinal`): a message places words around a value, it never
 * formats one. The sheet's prose is ARGUED — it says why a figure is missing,
 * what a register does not cover, what a letter would be worth — and the
 * English makes exactly the same claim, refusals included.
 *
 * ── THE TABLES AT THE BOTTOM ARE NOT PROSE ──────────────────────────────────
 *
 * Seven of the seventeen routes publish their own French labels: the ATMO
 * band, the ARCEP technology, the rent segment, the Géorisques verdict. Those
 * strings are DATA, and the server that composes them has no locale by design
 * (docs/i18n/CONVENTIONS.md, "Server-side modules"). So the payload keeps
 * them, French prints them byte for byte, and English looks the stable key up
 * in the tables below — falling back to the published words when a key is new,
 * because a label nobody translated yet is better than an empty cell.
 *
 * Their `fr` repeats the producer's own wording; `adresseRadiographie.en.test.mjs`
 * compares the two against the captured payload and fails when they drift.
 */
import { defineMessages } from '../i18n/messages.js';

// ── Data tables: one entry per stable key the payloads carry ────────────────

/** Rent segments of `loyersFeed.js`, keyed by `segment.key`. */
export const LOYERS_SEGMENTS = defineMessages({
  app: { fr: 'Appartement', en: 'Apartment' },
  app12: { fr: 'Appartement T1-T2', en: 'Apartment, 1–2 rooms', note: 'T1-T2 is the French room count of the published segment.' },
  app3: { fr: 'Appartement T3 et plus', en: 'Apartment, 3 rooms and over' },
  maison: { fr: 'Maison', en: 'House' },
});

/** How the ministry's model arrived at a rent, keyed by `segment.basis`. */
export const LOYERS_BASIS = defineMessages({
  commune: { fr: 'estimé sur la commune', en: 'estimated on the municipality' },
  maille: {
    fr: 'repris d’une maille de communes voisines',
    en: 'taken from a mesh of neighboring municipalities',
  },
  epci: { fr: 'repris de l’intercommunalité', en: 'taken from the intercommunality (EPCI)' },
});

/** School levels of the ministry's register, as `schoolsFeed.js` keys them. */
export const SCHOOL_LEVELS = defineMessages({
  maternelle: { fr: 'maternelle', en: 'preschool' },
  elementaire: { fr: 'elementaire', en: 'elementary' },
  ecole: { fr: 'ecole', en: 'school' },
  college: { fr: 'college', en: 'middle school' },
  lycee: { fr: 'lycee', en: 'high school' },
  superieur: { fr: 'superieur', en: 'higher education' },
  autre: { fr: 'autre', en: 'other' },
});

/** Who runs a school. The register writes these unaccented. */
export const SCHOOL_SECTORS = defineMessages({
  public: { fr: 'public', en: 'public' },
  prive: { fr: 'prive', en: 'private' },
});

/** The ATMO bands, keyed by `band.code` (1 to 6). */
export const ATMO_BANDS = defineMessages({
  1: { fr: 'Bon', en: 'Good' },
  2: { fr: 'Moyen', en: 'Fair' },
  3: { fr: 'Dégradé', en: 'Degraded' },
  4: { fr: 'Mauvais', en: 'Poor' },
  5: { fr: 'Très mauvais', en: 'Very poor' },
  6: { fr: 'Extrêmement mauvais', en: 'Extremely poor' },
});

/** The five sub-indices, keyed by `pollutant.key`. Written for mid-sentence use. */
export const ATMO_POLLUTANTS = defineMessages({
  no2: { fr: 'dioxyde d’azote', en: 'nitrogen dioxide' },
  o3: { fr: 'ozone', en: 'ozone' },
  pm10: { fr: 'particules PM10', en: 'PM10 particulates' },
  pm25: { fr: 'particules PM2,5', en: 'PM2.5 particulates' },
  so2: { fr: 'dioxyde de soufre', en: 'sulfur dioxide' },
});

/** Fixed-line technologies of `arcepFeed.js`, keyed by `technology.key`. */
export const ARCEP_TECHNOLOGIES = defineMessages({
  ftth: { fr: 'fibre optique', en: 'fiber (FTTH)' },
  coax: { fr: 'câble coaxial', en: 'coaxial cable' },
  cuivre30: { fr: 'cuivre à 30 Mbit/s ou plus', en: 'copper at 30 Mbit/s or more' },
  cuivre8: { fr: 'cuivre entre 8 et 30 Mbit/s', en: 'copper between 8 and 30 Mbit/s' },
  thdr: { fr: 'radio très haut débit', en: 'very-high-speed radio' },
  hdr: { fr: 'radio haut débit', en: 'broadband radio' },
  '4gf': { fr: '4G fixe', en: 'fixed 4G' },
  sat: { fr: 'satellite', en: 'satellite' },
  // Not a technology but the premises the register places under none: the
  // feed appends it to the same list, so the sheet has to be able to name it.
  aucune: { fr: 'aucune offre à 8 Mbit/s', en: 'no offer at 8 Mbit/s' },
});

/**
 * The hazard families Géorisques answers about, keyed by the id the upstream
 * uses. The `fr` is the register's own `libelle`, which is what this sheet
 * printed before and what it still prints in French.
 */
export const RISK_LABELS = defineMessages({
  inondation: { fr: 'Inondation', en: 'Flooding' },
  mouvementTerrain: { fr: 'Mouvements de terrain', en: 'Ground movements' },
  radon: { fr: 'Radon', en: 'Radon' },
  remonteeNappe: { fr: 'Remontée de nappe', en: 'Rising groundwater' },
  retraitGonflementArgile: { fr: 'Retrait gonflement des argiles', en: 'Clay shrink-swell' },
  seisme: { fr: 'Séisme', en: 'Earthquake' },
  avalanche: { fr: 'Avalanche', en: 'Avalanche' },
  cyclone: { fr: 'Vent violent', en: 'High wind' },
  eruptionVolcanique: { fr: 'Volcan', en: 'Volcano' },
  feuForet: { fr: 'Feu de foret', en: 'Forest fire' },
  reculTraitCote: { fr: 'Recul du trait de cote', en: 'Coastline retreat' },
  risqueCotier: {
    fr: 'Risques côtiers (submersion marine, tsunami)',
    en: 'Coastal risks (marine flooding, tsunami)',
  },
  canalisationsMatieresDangereuses: {
    fr: 'Canalisations de transport de matières dangereuses',
    en: 'Hazardous material pipelines',
  },
  icpe: {
    fr: 'Installations industrielles classées (ICPE)',
    en: 'Classified industrial facilities (ICPE)',
  },
  pollutionSols: { fr: 'Pollution des sols', en: 'Soil contamination' },
  nucleaire: { fr: 'Nucléaire', en: 'Nuclear' },
  risqueMinier: { fr: 'Risques miniers', en: 'Mining risks' },
  ruptureBarrage: { fr: 'Rupture de barrage', en: 'Dam failure' },
});

/**
 * The verdicts Géorisques publishes, verbatim on the left.
 *
 * A graded one (`Risque Existant - important`) is split on the dash by
 * {@link RISK_GRADES}: the register grades a dozen hazards on four words and
 * listing every combination here would be a table nobody maintains.
 */
export const RISK_VERDICTS = defineMessages({
  'Risque Existant': { fr: 'Risque Existant', en: 'Risk present' },
  'Risque non Connu': { fr: 'Risque non Connu', en: 'Risk not known' },
  'Risque Inexistant': { fr: 'Risque Inexistant', en: 'No risk' },
  // "Concerne" is the register's word for "this hazard reaches here", not the
  // English "concerned": a technological hazard AFFECTS a place or it does not.
  'Risque Concerne': { fr: 'Risque Concerne', en: 'Affected' },
  'Risque non Concerne': { fr: 'Risque non Concerne', en: 'Not affected' },
});

/** The grade a verdict may carry after its dash. */
export const RISK_GRADES = defineMessages({
  faible: { fr: 'faible', en: 'low' },
  moyen: { fr: 'moyen', en: 'medium' },
  modéré: { fr: 'modéré', en: 'moderate' },
  fort: { fr: 'fort', en: 'high' },
  important: { fr: 'important', en: 'major' },
  'très important': { fr: 'très important', en: 'very major' },
});

/** The commune's radon potential, keyed by class (1 to 3). */
export const RADON_LABELS = defineMessages({
  1: { fr: 'Potentiel radon faible', en: 'Low radon potential' },
  2: { fr: 'Potentiel radon faible à moyen', en: 'Low to medium radon potential' },
  3: { fr: 'Potentiel radon significatif', en: 'Significant radon potential' },
});

export default defineMessages({
  /** The ten themes, and the question each one answers on the sheet. */
  themes: {
    immobilier: {
      label: { fr: 'Immobilier', en: 'Real estate' },
      question: {
        fr: 'Ce que le terrain vaut, et ce qu’il coûte à louer.',
        en: 'What the ground is worth, and what it costs to rent.',
      },
    },
    transport: {
      label: { fr: 'Transport', en: 'Transport' },
      question: {
        fr: 'Ce qu’on atteint depuis cette porte, à pied et en voiture.',
        en: 'What this door reaches, on foot and by car.',
      },
    },
    education: {
      label: { fr: 'Éducation', en: 'Education' },
      question: { fr: 'Quelles écoles, et lesquelles.', en: 'How many schools, and which ones.' },
    },
    commodites: {
      label: { fr: 'Commodités', en: 'Amenities' },
      question: {
        fr: 'Les commerces et services du quotidien à portée de marche.',
        en: 'The everyday shops and services within walking distance.',
      },
    },
    nuisances: {
      label: { fr: 'Nuisances', en: 'Nuisances' },
      question: {
        fr: 'L’air qu’on y respire, et le bruit qui passe au-dessus.',
        en: 'The air breathed here, and the noise that passes overhead.',
      },
    },
    risques: {
      label: { fr: 'Risques', en: 'Risks' },
      question: {
        fr: 'Ce que l’État a inscrit au registre pour ce point.',
        en: 'What the State has entered in the register for this point.',
      },
    },
    numerique: {
      label: { fr: 'Numérique', en: 'Digital' },
      question: {
        fr: 'Ce qu’une ligne fixe peut porter ici, et ce qui émet au-dessus.',
        en: 'What a fixed line can carry here, and what transmits overhead.',
      },
    },
    emploi: {
      label: { fr: 'Emploi', en: 'Employment' },
      question: {
        fr: 'L’activité des habitants, et son sens de marche.',
        en: 'What the residents do for a living, and which way it is moving.',
      },
    },
    urbanisme: {
      label: { fr: 'Urbanisme', en: 'Planning' },
      question: {
        fr: 'Ce qui peut être bâti, et ce qui l’est déjà.',
        en: 'What may be built, and what already is.',
      },
    },
    voisinage: {
      label: { fr: 'Voisinage', en: 'Neighborhood' },
      question: {
        fr: 'Qui habite autour, d’après le carroyage INSEE.',
        en: 'Who lives around, according to the INSEE 200 m grid.',
      },
    },
  },

  /** Where a value is placed in the national distribution — or refused one. */
  rank: {
    priceLabel: { fr: 'Ce prix dans le pays', en: 'This price in the country' },
    walkLabel: { fr: 'Cet accès à pied dans le pays', en: 'This walking access in the country' },
    unranked: { fr: 'non classé', en: 'not ranked' },
    // The refusal itself and the direction notes come from
    // `baremeNational.i18n.js`, which publishes them in both languages.
    bracket: {
      fr: (low, high) => `${low} à ${high} centile`,
      en: (low, high) => `${low} to ${high} percentile`,
      note: 'Both ends are already ordinals (`25ᵉ`, `25th`).',
      sample: ['25th', '40th'],
    },
    percentile: {
      fr: (place) => `${place} centile national`,
      en: (place) => `${place} percentile nationally`,
      sample: ['62nd'],
    },
    letter: { fr: (letter) => `note ${letter}`, en: (letter) => `score ${letter}`, sample: ['B'] },
    letterEither: {
      fr: (high, low) => `note ${high} ou ${low}`,
      en: (high, low) => `score ${high} or ${low}`,
      note: 'The two ends of the bracket fall in different bands, so there is no single letter.',
      sample: ['B', 'C'],
    },
  },

  /** Immobilier — sales, rents, diagnostics. */
  immobilier: {
    medianPrice: {
      fr: (radius) => `Prix médian dans ${radius} m`,
      en: (radius) => `Median price within ${radius} m`,
      sample: [300],
    },
    comparables: {
      fr: (comparables, sales) => `${comparables} ventes comparables sur ${sales} mutations`,
      en: (comparables, sales) => `${comparables} comparable sales out of ${sales} transactions`,
      sample: ['119', '153'],
    },
    middleHalf: { fr: 'Moitié centrale des ventes', en: 'Middle half of the sales' },
    priceRange: {
      fr: (low, high) => `${low} à ${high} €/m²`,
      en: (low, high) => `€${low} to €${high}/m²`,
      sample: ['8,001', '10,505'],
    },
    quartiles: {
      fr: 'premier et troisième quartiles — la moitié des ventes tient dans cet écart',
      en: 'first and third quartiles — half the sales fall inside this spread',
    },
    dvfSilent: {
      fr: 'DVF n’a pas répondu — aucun prix de vente sur ce point.',
      en: 'DVF did not answer — no sale price for this point.',
    },
    reference: {
      fr: (name) => `Référence ${name}`,
      en: (name) => `Reference ${name}`,
      note: '`name` is a commune or a department, as DVF folded the comparison.',
      sample: ['Paris 13e Arrondissement'],
      keep: ['Paris 13e Arrondissement'],
    },
    referenceSales: {
      fr: (sales) => `${sales} ventes comparables`,
      en: (sales) => `${sales} comparable sales`,
      sample: ['4,233'],
    },
    rent: {
      fr: (segment) => `Loyer — ${segment}`,
      en: (segment) => `Rent — ${segment}`,
      sample: ['Apartment'],
    },
    rentNote: {
      fr: (low, high, monthly, surface, basis) => `${low} à ${high} €/m² — `
        + `environ ${monthly} €/mois pour ${surface} m², ${basis}`,
      en: (low, high, monthly, surface, basis) => `€${low} to €${high}/m² — `
        + `about €${monthly}/month for ${surface} m², ${basis}`,
      note: '`basis` says how the ministry’s model reached the figure (LOYERS_BASIS).',
      sample: ['24.4', '37.78', '1,579', 52, 'estimated on the municipality'],
    },
    rentModel: {
      fr: 'Loyers charges comprises, non meublé : c’est une prédiction du modèle du ministère '
        + 'pour un bien-type, pas un loyer médian observé.',
      en: 'Rents include charges, unfurnished: this is a prediction of the ministry’s model '
        + 'for a typical property, not an observed median rent.',
    },
    rentBorrowed: {
      fr: (borrowed, total) => `${borrowed} des ${total} loyers ont été calculés `
        + 'pour une maille de communes voisines, pas pour cette commune.',
      en: (borrowed, total) => `${borrowed} of the ${total} rents ${borrowed === 1 ? 'was' : 'were'} `
        + 'computed for a mesh of neighboring municipalities, not for this municipality.',
      sample: [1, 4],
    },
    rentSilent: {
      fr: 'Carte des loyers muette pour cette commune.',
      en: 'The rent map is silent for this municipality.',
    },
    dpe: {
      fr: (radius) => `Diagnostics dans ${radius} m`,
      en: (radius) => `Energy ratings within ${radius} m`,
      note: 'DPE, the energy rating of a dwelling.',
      sample: [200],
    },
    dpeSpread: {
      fr: (letters, read) => `${letters} — répartition sur les ${read} diagnostics lus`,
      en: (letters, read) => `${letters} — spread over the ${read} ratings read`,
      sample: ['C 63, D 9', '100'],
    },
    dpeCost: { fr: 'Coût énergétique annuel médian', en: 'Median annual energy cost' },
    dpeCostNote: {
      fr: 'tous usages, tel que le DPE l’estime pour le logement diagnostiqué',
      en: 'all uses, as the DPE estimates them for the dwelling assessed',
    },
    dpeNotAveraged: {
      fr: 'Les étiquettes ne sont pas moyennées : un DPE décrit une enveloppe, '
        + 'et la moyenne des lettres d’une rue n’est pas une propriété de la rue.',
      en: 'The labels are not averaged: a DPE describes one building envelope, '
        + 'and the average of a street’s letters is not a property of the street.',
    },
  },

  /** Transport — what the door actually reaches. */
  transport: {
    onFoot: { fr: (minutes) => `${minutes} à pied`, en: (minutes) => `${minutes} on foot`, sample: ['10 min'] },
    byCar: { fr: (minutes) => `${minutes} en voiture`, en: (minutes) => `${minutes} by car`, sample: ['15 min'] },
    reachable: {
      fr: 'surface réellement atteignable par la voirie, pas un cercle',
      en: 'ground actually reachable along the street network, not a circle',
    },
    noTraffic: {
      fr: 'hors trafic — l’isochrone IGN est calculée sur la voirie, pas sur le temps réel',
      en: 'excluding traffic — the IGN isochrone is computed on the street network, not on live conditions',
    },
    silent: {
      fr: 'Le service isochrone IGN n’a pas répondu.',
      en: 'The IGN isochrone service did not answer.',
    },
    noTransit: {
      fr: 'Les réseaux de transport en commun ne sont pas encore comptés ici : '
        + 'la couche Transit FR les dessine en direct sur le globe.',
      en: 'Public transit networks are not counted here yet: '
        + 'the Transit FR layer draws them live on the globe.',
      keep: ['Transit FR'],
    },
    onlyTenMinutes: {
      fr: 'Seul l’anneau de dix minutes est situé dans le pays : le barème national '
        + 'a été mesuré sur cette forme-là, et une valeur ne se classe que dans une '
        + 'distribution mesurée sur la même géométrie.',
      en: 'Only the ten-minute ring is placed in the country: the national scale '
        + 'was measured on that very shape, and a value can be ranked only in a '
        + 'distribution measured on the same geometry.',
    },
  },

  /** Éducation — the schools, and the index Cityscan does not print. */
  education: {
    silent: {
      fr: 'L’annuaire de l’éducation n’a pas répondu.',
      en: 'The school register did not answer.',
    },
    count: { fr: 'Établissements dans la boîte de scan', en: 'Schools in the scan box' },
    byLevel: {
      fr: (level, n) => `${level} ${n}`,
      en: (level, n) => `${level} ${n}`,
      note: 'One pair per level, joined with commas. `level` comes from SCHOOL_LEVELS.',
      sample: ['high school', 3],
    },
    unnamed: { fr: 'Établissement', en: 'School', note: 'A site the register left without a name.' },
    noIps: { fr: 'IPS non publié', en: 'IPS not published' },
    ips: { fr: (value) => `IPS ${value}`, en: (value) => `IPS ${value}`, sample: ['89.3'] },
    ipsAgainst: {
      fr: (value, national) => `IPS ${value} contre ${national} en France`,
      en: (value, national) => `IPS ${value} against ${national} nationwide`,
      sample: ['89.3', '89.9'],
    },
    sectorAndIps: {
      fr: (sector, index) => `${sector} — ${index}`,
      en: (sector, index) => `${sector} — ${index}`,
      note: '`sector` is public or private (SCHOOL_SECTORS).',
      sample: ['public', 'IPS 89.3'],
    },
    more: {
      fr: (n) => `${n} autres établissements`,
      en: (n) => `${n} more schools`,
      sample: ['12'],
    },
    ipsCoverage: {
      fr: (withIndex, shown) => `IPS publié pour ${withIndex} des ${shown} `
        + 'établissements les plus proches — un IPS absent n’est jamais lu comme une moyenne.',
      en: (withIndex, shown) => `IPS published for ${withIndex} of the ${shown} `
        + 'nearest schools — a missing IPS is never read as an average one.',
      sample: [5, 6],
    },
  },

  /** Commodités — the everyday registers, by family and by distance. */
  commodites: {
    silent: {
      fr: 'Le pack national BPE / FINESS n’a pas répondu.',
      en: 'The national BPE / FINESS pack did not answer.',
    },
    count: { fr: 'Équipements dans la boîte de scan', en: 'Amenities in the scan box' },
    capped: {
      fr: (capped) => `${capped} points au-delà du plafond de la réponse`,
      en: (capped) => `${capped} points beyond the response cap`,
      sample: ['120'],
    },
    dots: {
      fr: (dots) => `${dots} points distincts`,
      en: (dots) => `${dots} distinct points`,
      sample: ['412'],
    },
    onlyOne: { fr: 'un seul dans la boîte', en: 'only one in the box' },
    inBox: {
      fr: (total, family) => `${total} ${family} dans la boîte`,
      en: (total, family) => `${total} ${family} in the box`,
      note: '`family` is a plural head-word (AMENITY_FAMILY_PLURALS in amenitiesFamilies.i18n.js).',
      sample: ['14', 'bakeries'],
    },
    nearest: {
      fr: (many, name) => `${many} — le plus proche : ${name}`,
      en: (many, name) => `${many} — nearest: ${name}`,
      sample: ['14 bakeries in the box', 'PARIS PATAY BP'],
    },
    noName: { fr: 'sans nom', en: 'unnamed' },
    empty: {
      fr: 'Aucun équipement de ces familles dans la boîte de scan.',
      en: 'No amenity of these families in the scan box.',
    },
    bpeGaps: {
      fr: 'La BPE ne publie ni bar ni café ni musée, et ses écoles sont écartées '
        + 'au profit du registre du ministère — voir le thème Éducation.',
      en: 'The BPE publishes no bar, no café and no museum, and its schools are set aside '
        + 'in favor of the ministry’s register — see the Education theme.',
    },
  },

  /** Nuisances — today's air. */
  nuisances: {
    uncovered: {
      fr: 'Aucune AASQA ne publie d’indice pour cette commune ni autour d’elle.',
      en: 'No AASQA publishes an index for this municipality or around it.',
    },
    index: { fr: 'Indice ATMO du jour', en: 'ATMO index of the day' },
    indexValue: {
      fr: (quality, band) => `${quality} sur 6 — ${band}`,
      en: (quality, band) => `${quality} out of 6 — ${band}`,
      sample: [2, 'Fair'],
    },
    drivenBy: {
      fr: (pollutants) => `tiré par : ${pollutants}`,
      en: (pollutants) => `driven by: ${pollutants}`,
      sample: ['ozone'],
    },
    pollutantValue: {
      fr: (quality, band) => `${quality} — ${band}`,
      en: (quality, band) => `${quality} — ${band}`,
      sample: [1, 'Good'],
    },
    forecast: {
      fr: (date) => `Prévision ${date}`,
      en: (date) => `Forecast ${date}`,
      note: '`date` is the ISO day the agency published, printed as it comes.',
      sample: ['2026-09-09'],
    },
    borrowed: {
      fr: (zone, scale, distance) => `Indice publié pour ${zone} (${scale})${distance}`
        + ' — pas pour cette commune.',
      en: (zone, scale, distance) => `Index published for ${zone} (${scale})${distance}`
        + ' — not for this municipality.',
      sample: ['Paris', 'neighboring municipality', ', 3.8 km away'],
    },
    borrowedEpci: { fr: 'intercommunalité', en: 'intercommunality (EPCI)' },
    borrowedCommune: { fr: 'commune voisine', en: 'neighboring municipality' },
    borrowedDistance: {
      fr: (distance) => `, à ${distance}`,
      en: (distance) => `, ${distance} away`,
      sample: ['3.8 km'],
    },
    agency: {
      fr: (agency) => `Publié par ${agency}.`,
      en: (agency) => `Published by ${agency}.`,
      sample: ['Airparif'],
    },
    maximum: {
      fr: 'L’indice global est le MAXIMUM des cinq sous-indices, pas leur moyenne.',
      en: 'The overall index is the MAXIMUM of the five sub-indices, not their average.',
    },
  },

  /** Le bruit des aéronefs, lu au sol. */
  bruit: {
    silent: {
      fr: 'Les plans d’exposition au bruit n’ont pas répondu.',
      en: 'The noise exposure plans did not answer.',
    },
    zone: {
      fr: (zone) => `Zone ${zone} du PEB`,
      en: (zone) => `PEB zone ${zone}`,
      sample: ['C'],
    },
    psophic: { fr: 'indice psophique', en: 'psophic index' },
    order: {
      fr: (date) => `arrêté du ${date}`,
      en: (date) => `order of ${date}`,
      sample: ['2007-04-03'],
    },
    plan: { fr: 'Plan d’exposition au bruit', en: 'Noise exposure plan' },
    none: { fr: 'aucun à ce point', en: 'none at this point' },
    nearest: {
      fr: (name, km) => `le plus proche : ${name} à ${km} km`,
      en: (name, km) => `nearest: ${name}, ${km} km away`,
      sample: ['ISSY-LES-MOULINEAUX', '7.6'],
      keep: ['ISSY-LES-MOULINEAUX'],
    },
    planningConstraint: {
      fr: 'Un PEB est une CONTRAINTE D’URBANISME, pas une mesure : il décrit '
        + 'une exposition prévue à long terme, jamais le bruit d’aujourd’hui.',
      en: 'A PEB is a PLANNING CONSTRAINT, not a measurement: it describes '
        + 'an exposure forecast for the long term, never today’s noise.',
    },
    psophicNote: {
      fr: 'Certains arrêtés sont encore écrits en indice psophique, qui ne se '
        + 'convertit pas en décibels — les deux échelles ne sont pas comparables.',
      en: 'Some orders are still written in the psophic index, which does not '
        + 'convert to decibels — the two scales are not comparable.',
    },
    aircraftOnly: {
      fr: 'Bruit AÉRONAUTIQUE seulement. Il n’existe pas de carte de bruit '
        + 'stratégique nationale ouverte pour la route et le rail (voir bruitFrance.js).',
      en: 'AIRCRAFT noise only. There is no open national strategic noise map '
        + 'for road and rail (see bruitFrance.js).',
    },
  },

  /** Risques — the statutory register. */
  risques: {
    silent: { fr: 'Géorisques n’a pas répondu.', en: 'Géorisques did not answer.' },
    onRecord: { fr: 'Risques inscrits pour ce point', en: 'Risks on record for this point' },
    notRead: { fr: 'non lus', en: 'not read' },
    notReadNote: {
      fr: 'le rapport Géorisques n’a pas répondu — ce n’est pas « aucun risque »',
      en: 'the Géorisques report did not answer — this is not “no risk”',
    },
    reportMissing: {
      fr: 'L’état des risques n’a pas pu être lu pour ce point. '
        + 'Les installations classées et le potentiel radon ci-dessous viennent '
        + 'de deux autres appels, qui ont répondu.',
      en: 'The risk statement could not be read for this point. '
        + 'The classified facilities and the radon potential below come from '
        + 'two other calls, which did answer.',
    },
    families: {
      fr: (families, radius) => `sur ${families} familles interrogées dans ${radius} m`,
      en: (families, radius) => `out of ${families} families checked within ${radius} m`,
      sample: ['18', 500],
    },
    disagree: {
      fr: (verdict) => `la commune est classée « ${verdict} » — les deux verdicts diffèrent`,
      en: (verdict) => `the municipality is classed “${verdict}” — the two verdicts differ`,
      sample: ['Risk present — major'],
    },
    verdictGraded: {
      fr: (verdict, grade) => `${verdict} - ${grade}`,
      en: (verdict, grade) => `${verdict} — ${grade}`,
      note: 'French keeps the register’s own hyphen; English uses an em dash.',
      sample: ['Risk present', 'low'],
    },
    radon: { fr: 'Potentiel radon de la commune', en: 'Radon potential of the municipality' },
    radonClass: {
      fr: (klass) => `classe ${klass} sur 3`,
      en: (klass) => `class ${klass} of 3`,
      sample: [1],
    },
    icpe: { fr: 'Installations classées', en: 'Classified facilities (ICPE)' },
    icpeTruncated: { fr: 'liste tronquée par la source', en: 'list truncated by the source' },
    within: {
      fr: (radius) => `dans ${radius} m`,
      en: (radius) => `within ${radius} m`,
      sample: [500],
    },
    twoVerdicts: {
      fr: 'Le registre publie un verdict pour la commune et un pour l’adresse ; '
        + 'ils ne disent pas toujours la même chose, et c’est celui de l’adresse qui est affiché.',
      en: 'The register publishes one verdict for the municipality and one for the address; '
        + 'they do not always say the same thing, and the address’s is the one shown.',
    },
  },

  /** Numérique — the fixed line. */
  numerique: {
    silent: {
      fr: 'Ma connexion internet n’a pas répondu.',
      en: 'Ma connexion internet did not answer.',
      note: 'The ARCEP service is named Ma connexion internet; the name is not translated.',
      keep: ['Ma connexion internet'],
    },
    premises: { fr: 'Locaux dans la commune', en: 'Premises in the municipality' },
    edition: {
      fr: (edition) => `édition ${edition}`,
      en: (edition) => `edition ${edition}`,
      sample: ['2026-03-31'],
    },
    premisesCount: {
      fr: (premises) => `${premises} locaux`,
      en: (premises) => `${premises} premises`,
      sample: ['1,575,954'],
    },
    gigabit: { fr: 'Éligibles à 1 Gbit/s (filaire)', en: 'Eligible for 1 Gbit/s (wired)' },
    noWired: { fr: 'Sans offre haut débit filaire', en: 'With no wired broadband offer' },
    copper: { fr: 'Encore raccordables au cuivre', en: 'Still connectable over copper' },
    copperClosed: {
      fr: 'le cuivre est déjà fermé ici',
      en: 'copper is already switched off here',
    },
    wiredOnly: {
      fr: 'Débits filaires uniquement. Le fichier par défaut de l’ARCEP compte le satellite '
        + 'et répond 100 % à la même question.',
      en: 'Wired speeds only. ARCEP’s default file counts satellite and answers 100% '
        + 'to the same question.',
    },
    folded: {
      fr: 'L’ARCEP ne publie pas les arrondissements : ces parts décrivent la commune entière.',
      en: 'ARCEP does not publish arrondissements: these shares describe the whole municipality.',
    },
  },

  /** Le mobile, sous la même thématique que le filaire. */
  antennes: {
    silent: {
      fr: 'Le registre des supports ANFR n’a pas répondu.',
      en: 'The ANFR mast register did not answer.',
    },
    emptyRegister: {
      fr: (edition) => `Le registre ANFR est vide dans cette édition${edition}`
        + ' — aucun support n’y figure NULLE PART, donc l’absence ici ne dit rien de l’adresse.',
      en: (edition) => `The ANFR register is empty in this edition${edition}`
        + ' — NO mast appears in it ANYWHERE, so their absence here says nothing about this address.',
      note: '`edition` is either empty or ` (2026-09-03)`.',
      sample: [' (2026-09-03)'],
    },
    around: { fr: 'Supports ANFR autour', en: 'ANFR masts around' },
    boxSide: {
      fr: (metres, edition) => `dans ${metres} m de côté${edition}`,
      en: (metres, edition) => `in a box ${metres} m across${edition}`,
      note: '`edition` is either empty or ` · edition 2026-08-27`.',
      sample: [668, ' · edition 2026-08-27'],
    },
    editionSuffix: {
      fr: (edition) => ` · édition ${edition}`,
      en: (edition) => ` · edition ${edition}`,
      sample: ['2026-08-27'],
    },
    generation: {
      fr: (generation) => `Supports ${generation}`,
      en: (generation) => `${generation} masts`,
      sample: ['5G'],
    },
    planned: {
      fr: (planned) => `${planned} de plus autorisés, pas encore en service`,
      en: (planned) => `${planned} more approved, not yet in service`,
      sample: ['2'],
    },
    noneLive: {
      fr: 'Aucun support en service ici : tout ce qui est recensé est à l’état de projet.',
      en: 'No mast in service here: everything on record is still a project.',
    },
    truncated: {
      fr: (listed, inBox) => `Le registre a rendu ${listed} supports sur `
        + `${inBox} dans la boîte — la liste est tronquée, le compte ne l’est pas.`,
      en: (listed, inBox) => `The register returned ${listed} masts out of `
        + `${inBox} in the box — the list is truncated, the count is not.`,
      sample: ['200', '412'],
    },
    mastNotAntenna: {
      fr: 'Un support est un PYLÔNE, pas une antenne : plusieurs opérateurs '
        + 'et plusieurs générations partagent le même mât.',
      en: 'A mast is a TOWER, not an antenna: several operators '
        + 'and several generations share the same one.',
    },
    indoor: {
      fr: 'Le registre ne dit rien de la couverture ressentie à l’intérieur d’un bâtiment.',
      en: 'The register says nothing about the coverage felt inside a building.',
    },
  },

  /** Emploi — the census, and its direction of travel. */
  emploi: {
    silent: { fr: 'L’API Melodi n’a pas répondu.', en: 'The Melodi API did not answer.' },
    outOfScope: {
      fr: 'Le recensement publie ce jeu de données pour la France hors Mayotte.',
      en: 'The census publishes this dataset for France excluding Mayotte.',
      keep: ['Mayotte'],
    },
    noObservation: {
      fr: 'Aucune observation du recensement pour cette commune.',
      en: 'No census observation for this municipality.',
    },
    population: {
      fr: (year) => `Population de 15 à 64 ans (${year})`,
      en: (year) => `Population aged 15 to 64 (${year})`,
      sample: ['2023'],
    },
    unemployment: { fr: 'Taux de chômage', en: 'Unemployment rate' },
    notPublished: { fr: 'non publié', en: 'not published' },
    /** Why the rates are withheld, as `emploiFeed.js` decided on the server. */
    withheldInconsistent: {
      fr: 'identités arithmétiques non vérifiées',
      en: 'arithmetic identities not verified',
    },
    withheldTooFew: {
      fr: (floor) => `moins de ${floor} actifs`,
      en: (floor) => `fewer than ${floor} economically active residents`,
      sample: [100],
    },
    unemployed: {
      fr: (unemployed, active) => `${unemployed} chômeurs sur ${active} actifs`,
      en: (unemployed, active) => `${unemployed} unemployed out of ${active} economically active`,
      sample: ['11,280', '94,521'],
    },
    participation: { fr: 'Taux d’activité', en: 'Participation rate' },
    employment: { fr: 'Taux d’emploi', en: 'Employment rate' },
    sincePrevious: { fr: 'Depuis le recensement précédent', en: 'Since the previous census' },
    points: {
      fr: (points) => `${points} point`,
      en: (points) => `${points} point`,
      note: 'Percentage points of unemployment, signed. Always singular here: it is a gap.',
      sample: ['-1.0'],
    },
    trendUp: { fr: 'chômage en hausse', en: 'unemployment rising' },
    trendDown: { fr: 'chômage en baisse', en: 'unemployment falling' },
    trendFlat: { fr: 'chômage stable', en: 'unemployment steady' },
    census: {
      fr: (year) => `Recensement ${year}`,
      en: (year) => `Census ${year}`,
      sample: ['2012'],
    },
    censusSense: {
      fr: 'Chômage au sens du recensement, à la résidence — pas le taux du BIT.',
      en: 'Unemployment as the census defines it, by place of residence — not the ILO rate.',
    },
  },

  /** Urbanisme — the zoning and the live permits. */
  urbanisme: {
    zoning: { fr: 'Zonage PLU', en: 'PLU zoning' },
    noZoning: { fr: 'aucun zonage à ce point', en: 'no zoning at this point' },
    overlap: {
      fr: (zones) => `${zones} zonages se superposent à ce point — `
        + 'deux communes ne placent pas leur limite au même endroit.',
      en: (zones) => `${zones} zonings overlap at this point — `
        + 'two municipalities do not put their boundary in the same place.',
      sample: [2],
    },
    easements: { fr: 'Servitudes d’utilité publique', en: 'Public utility easements (SUP)' },
    permits: {
      fr: (radius) => `Autorisations dans ${radius} m`,
      en: (radius) => `Planning permits within ${radius} m`,
      sample: [500],
    },
    permitsWindow: {
      fr: 'déposées sur les 36 derniers mois',
      en: 'filed over the last 36 months',
    },
    byKind: { fr: 'Par nature', en: 'By type' },
    kinds: {
      fr: 'PC permis de construire, DP déclaration préalable, PA aménager, PD démolir',
      en: 'PC building permit, DP prior declaration, PA development permit, PD demolition permit',
    },
    housing: { fr: 'Logements autorisés', en: 'Dwellings authorized' },
    housingNote: { fr: 'sur ces mêmes dossiers', en: 'on those same files' },
    underInstruction: { fr: 'Encore en instruction', en: 'Still under review' },
    unplaced: {
      fr: (unplaced) => `${unplaced} autorisations de la commune n’ont pas pu être `
        + 'positionnées faute de référence cadastrale résolue : elles ne sont ni dessinées ni comptées ici.',
      en: (unplaced) => `${unplaced} permits in the municipality could not be `
        + 'placed for want of a resolved cadastral reference: they are neither drawn nor counted here.',
      sample: ['7'],
    },
    silent: {
      fr: 'Le Géoportail de l’urbanisme n’a pas répondu.',
      en: 'The Géoportail de l’urbanisme did not answer.',
    },
  },

  /** Voisinage — the 200 m grid. */
  voisinage: {
    silent: { fr: 'Le carroyage INSEE n’a pas répondu.', en: 'The INSEE grid did not answer.' },
    empty: {
      fr: 'Aucun carreau habité dans la boîte de scan.',
      en: 'No inhabited grid cell in the scan box.',
    },
    extent: {
      fr: (cells, resolution, areaKm2) => `${cells} carreaux de ${resolution} m, soit ${areaKm2} km²`,
      en: (cells, resolution, areaKm2) => `${cells} cells of ${resolution} m, that is ${areaKm2} km²`,
      sample: ['105', 200, '4.2'],
    },
    people: { fr: 'Habitants', en: 'Residents' },
    households: { fr: 'Ménages', en: 'Households' },
    standardOfLiving: { fr: 'Niveau de vie moyen', en: 'Average standard of living' },
    perYear: {
      fr: (amount) => `${amount} €/an`,
      en: (amount) => `€${amount}/year`,
      sample: ['24,600'],
    },
    weighted: {
      fr: 'pondéré par la population du carreau',
      en: 'weighted by each cell’s population',
    },
    poverty: { fr: 'Ménages pauvres', en: 'Households below the poverty line' },
    alone: { fr: 'Personnes seules', en: 'People living alone' },
    elders: { fr: '65 ans et plus', en: '65 and over' },
    children: { fr: 'Moins de 18 ans', en: 'Under 18' },
    imputed: {
      fr: (imputed, cells) => `${imputed} des ${cells} carreaux portent des valeurs imputées `
        + 'par l’INSEE — approchées, pas observées.',
      en: (imputed, cells) => `${imputed} of the ${cells} cells carry values imputed `
        + 'by INSEE — approximated, not observed.',
      sample: ['55', '78'],
    },
    truncated: {
      fr: 'Le carroyage a renvoyé une page tronquée : ces totaux sont des planchers.',
      en: 'The grid returned a truncated page: these totals are floors.',
    },
    notACatchment: {
      fr: 'Ce sont des carreaux autour du point, pas une zone de chalandise : '
        + 'la fiche implantation du globe calcule la même chose sur l’isochrone réelle.',
      en: 'These are cells around the point, not a catchment area: '
        + 'the globe’s site report computes the same thing on the real isochrone.',
    },
    noRank: {
      fr: 'Aucun de ces chiffres n’est situé dans le pays : le barème national les '
        + 'mesure sur l’anneau piéton de dix minutes, pas sur un rectangle de carreaux. '
        + 'C’est la fiche implantation du globe qui en porte les rangs.',
      en: 'None of these figures is placed in the country: the national scale measures '
        + 'them on the ten-minute walking ring, not on a rectangle of grid cells. '
        + 'It is the globe’s site report that carries their ranks.',
    },
  },

  /** The caveat at the top of the sheet: what it grades, and what it will not. */
  gradingNote: {
    fr: (rings, margin) => 'Deux chiffres sont situés dans le pays — la surface atteignable à pied '
      + 'en dix minutes et le prix médian au m² — contre un barème tiré sur '
      + `${rings} résidents (±${margin} `
      + 'points de centile). Tout le reste est donné en valeur : une note exige une '
      + 'distribution nationale mesurée sur la même géométrie, et il n’en existe pas '
      + 'encore pour ces indicateurs-là.',
    en: (rings, margin) => 'Two figures are placed in the country — the ground reachable on foot '
      + 'in ten minutes and the median price per m² — against a scale drawn on '
      + `${rings} residents (±${margin} `
      + 'percentile points). Everything else is given as a value: a score demands a '
      + 'national distribution measured on the same geometry, and there is none yet '
      + 'for those indicators.',
    sample: ['1,200', '4.5'],
  },
});
