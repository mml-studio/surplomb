/**
 * Strings of `src/data/schoolsFrance.js` — the Enseignement layer.
 *
 * Three regimes, three vocabularies, one rule running through all of them: an
 * ABSENCE IS NEVER A ZERO, and the English says so as loudly as the French.
 * A school with no published roll reads "roll not published", never "0
 * pupils"; a département the national sweep could not prove reads "not
 * surveyed", never "no school"; a density that could not be divided reads
 * "cannot be computed", never "0.0". Those four sentences are the layer.
 *
 * WHAT IS NOT HERE. The band names (`École`, `Collège`…) and the geocoding
 * ladder live in `schoolsFeed.i18n.js`, because the feed is what folds the
 * register's eight types onto them. The IPS lines live in `ipsFeed.i18n.js`.
 * The prism's own frame — what a height means, what a frozen domain is — is
 * `choroplethPrism.i18n.js`; what this file supplies is the NAME of the two
 * variables that prism measures, which is the caller's job by that module's
 * own contract.
 *
 * The three prism labels are read twice: once from `.definition` at load, to
 * build the frozen scale with the exact French bytes it always carried, and
 * once at draw time, so the legend speaks the page's language. Neither is a
 * locale read at module level (docs/i18n/CONVENTIONS.md § 2).
 *
 * Every number arrives formatted (`formatNumber`, `formatDecimal`).
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The two variables the national prism carries, named for its legend.
   *
   * `heightLabel` names the count, `ratioLabel` the density, and `heightUnit`
   * is what a tick value is counted in. Establishments and not schools: 2 756
   * rows of the register are rectorats, DSDEN and CIO.
   */
  prism: {
    heightLabel: { fr: 'établissements par département', en: 'establishments per department' },
    heightUnit: { fr: 'établissements', en: 'establishments' },
    ratioLabel: { fr: 'établissements pour 1 000 km²', en: 'establishments per 1,000 km²' },
  },

  /** The Cesium data source that holds the 96 département polygons. */
  departementSourceName: {
    fr: 'Établissements scolaires — implantation par département',
    en: 'Schools — distribution by department',
    note: 'An internal name for the loaded GeoJSON, not a caption a reader sees.',
  },

  /**
   * What a failed polygon load says on the layer's row.
   *
   * The `fr` is the string this layer has always printed — half English, as
   * the three sibling failure strings next to it still are. Rewriting it in
   * French would change what a French reader sees, which this wave does not
   * do; the English side is the one that moves.
   */
  departementShapesError: {
    fr: 'département polygons unavailable',
    en: 'department outlines unavailable',
  },

  /** The legend of the two POSITION regimes. */
  legend: {
    /**
     * A gloss under a swatch, and only where the label cannot stand alone.
     * `École`, `Collège` and `Lycée` answer the key's question with the word
     * itself; `autre` does not, because its dots are not schools at all.
     */
    autreBlurb: {
      fr: 'Rectorats et CIO, pas des écoles.',
      en: 'Education authorities and guidance centers, not schools.',
      note: 'Rectorat = the académie’s head office; CIO = centre d’information et d’orientation.',
    },
    /** Printed once under the classes, because it qualifies all of them. */
    meshNote: {
      fr: 'Échantillon de la vue, pas tous les établissements. '
        + 'Cliquez un point pour son nom et son indice social (IPS).',
      en: 'A sample of the view, not every establishment. '
        + 'Click a dot for its name and its social position index (IPS).',
    },
    /** The national regime's one entry that the shared prism key cannot hold. */
    offshore: {
      fr: 'hors des polygones — aucun prisme',
      en: 'outside the polygons — no prism',
    },
    offshoreBlurb: {
      fr: (snapped) => 'Établissements ouverts et géolocalisés que le découpage embarqué ne peut '
        + 'pas porter : les collectivités d’outre-mer, et quelques îles que les contours '
        + `simplifiés ne dessinent pas. Ils sont dans les régimes maillage et sites, jamais dans `
        + `ces 96 prismes.${snapped}`,
      en: (snapped) => 'Open, geolocated establishments the bundled outlines cannot carry: the '
        + 'overseas collectivities, and a few islands the simplified shapes do not draw at all. '
        + `They are in the mesh and site regimes, never in these 96 prisms.${snapped}`,
      note: '`snapped` is the coastal-snap clause below, or an empty string.',
      sample: [''],
    },
    offshoreSnapped: {
      fr: (count) => ` ${count} établissements littoraux ont été rattachés au département le plus `
        + 'proche à moins de 2 km — un déplacement fait par la carte, pas une donnée du registre.',
      en: (count) => ` ${count} coastal establishments were attached to the nearest department `
        + 'within 2 km — a move the map made, not something the register said.',
      sample: ['99'],
    },
  },

  /** The card of one selected school, in the exact regime. */
  site: {
    untitled: {
      fr: 'Établissement scolaire',
      en: 'School establishment',
      note: 'When the register published neither a name nor a municipality.',
    },
    sectorPublic: { fr: 'public', en: 'public' },
    sectorPrivate: { fr: 'privé', en: 'private' },
    enrolled: {
      fr: (pupils) => `${pupils} élèves — rentrée 2025`,
      en: (pupils) => `${pupils} pupils — 2025 school year`,
      note: 'The roll, joined from four per-level files at the newest common school year.',
      sample: ['412'],
    },
    noRoll: {
      fr: 'Effectif non publié pour cet UAI',
      en: 'Roll not published for this UAI',
      note: 'True of 8.3% of teaching establishments. NOT the same claim as “0 pupils”.',
    },
    priorityEducation: {
      fr: (label) => `Éducation prioritaire : ${label}`,
      en: (label) => `Priority education network: ${label}`,
      note: '`label` is the register’s own `REP` or `REP+`.',
      sample: ['REP+'],
    },
    /** Services the register declares. Null is “not declared”, never “no”. */
    services: {
      restauration: { fr: 'restauration', en: 'canteen' },
      hebergement: { fr: 'internat', en: 'boarding' },
      ulis: { fr: 'ULIS', en: 'ULIS', note: 'Inclusive-education unit. The acronym is the name.' },
      segpa: { fr: 'SEGPA', en: 'SEGPA', note: 'Adapted general and vocational section.' },
      apprentissage: { fr: 'apprentissage', en: 'apprenticeship' },
    },
    /** A coordinate geocoded to the town, not to the school. 2 159 rows. */
    precisionWarning: {
      fr: (label) => `⚠ Position : ${label}`,
      en: (label) => `⚠ Position: ${label}`,
      sample: ['Center of the municipality'],
    },
    precision: {
      fr: (label) => `Position : ${label}`,
      en: (label) => `Position: ${label}`,
      sample: ['Accuracy not published'],
    },
    /** Two dots at one address: the register's unit is administrative. */
    sharingOne: {
      fr: '1 autre UAI enregistré à cette position',
      en: '1 other UAI registered at this position',
    },
    sharingMany: {
      fr: (count) => `${count} autres UAI enregistrés à cette position`,
      en: (count) => `${count} other UAIs registered at this position`,
      sample: ['2'],
    },
    motherUai: {
      fr: (uai) => `Rattaché à l'UAI ${uai}`,
      en: (uai) => `Attached to UAI ${uai}`,
      note: 'A SEGPA or SEP section names the collège or lycée that contains it.',
      sample: ['0690123A'],
    },
    uai: {
      fr: (uai) => `UAI ${uai}`,
      en: (uai) => `UAI ${uai}`,
      note: 'Unité administrative immatriculée — the State’s identifier. Kept as an acronym.',
      sample: ['0690123A'],
    },
  },

  /** The card of a dot picked in the maillage, before its name has arrived. */
  mesh: {
    title: { fr: 'Établissement', en: 'Establishment' },
    resolving: {
      fr: 'Position réelle, échantillonnée — lecture du nom dans le registre…',
      en: 'Real position, sampled — reading the name from the register…',
    },
    unresolved: {
      fr: 'Position réelle, échantillonnée — nom introuvable dans le registre',
      en: 'Real position, sampled — name not found in the register',
    },
  },

  /** The card of one département at national altitude. */
  departement: {
    notSurveyed: {
      fr: 'Effectif non relevé — relevé national incomplet',
      en: 'Count not surveyed — the national sweep is incomplete',
      note: 'A short export served as HTTP 200 turns every zero into an unproven number.',
    },
    measuredZero: {
      fr: 'Aucun établissement ouvert géolocalisé',
      en: 'No open, geolocated establishment',
    },
    count: {
      fr: (count) => `${count} établissements`,
      en: (count) => `${count} establishments`,
      sample: ['1,416'],
    },
    clipped: {
      fr: (domainMax) => `Au-dessus du domaine gelé (${domainMax} établissements) : le prisme est `
        + 'à sa hauteur maximale et ne dit plus combien',
      en: (domainMax) => `Above the frozen domain (${domainMax} establishments): the prism is at `
        + 'its maximum height and no longer says how many',
      sample: ['2,600'],
    },
    density: {
      fr: (rate) => `${rate} pour 1 000 km² — la couleur du prisme`,
      en: (rate) => `${rate} per 1,000 km² — the prism’s color`,
      sample: ['140.5'],
    },
    noDensity: {
      fr: 'Densité non calculable : aire du polygone inconnue',
      en: 'Density cannot be computed: the polygon’s area is unknown',
    },
    pupils: {
      fr: (pupils) => `${pupils} élèves — rentrée 2025`,
      en: (pupils) => `${pupils} pupils — 2025 school year`,
      sample: ['284,510'],
    },
    publicShare: {
      fr: (count) => `${count} public`,
      en: (count) => `${count} public`,
      sample: ['1,102'],
    },
    privateShare: {
      fr: (count) => `${count} privé`,
      en: (count) => `${count} private`,
      sample: ['314'],
    },
    priorityEducation: {
      fr: (count) => `${count} en éducation prioritaire`,
      en: (count) => `${count} in a priority education network`,
      sample: ['87'],
    },
    /** The ambient label: the name, then the height's own datum. */
    label: {
      fr: (name, count) => `${name} · ${count}`,
      en: (name, count) => `${name} · ${count}`,
      sample: ['Gironde', '1,416'],
    },
    labelNotSurveyed: {
      fr: (name) => `${name} · non relevé`,
      en: (name) => `${name} · not surveyed`,
      note: 'The department’s own name, which stays French on an English label.',
      sample: ['Lozère'],
      keep: ['Lozère'],
    },
  },

  /** The DETECT callout: one line, the name first. */
  callout: {
    levelAndPupils: {
      fr: (level, pupils) => `${level} · ${pupils} élèves`,
      en: (level, pupils) => `${level} · ${pupils} pupils`,
      sample: ['Middle school', '412'],
    },
  },

  /** The one line under the layer's toggle: what this view actually contains. */
  status: {
    loadingMesh: { fr: 'lecture du maillage national...', en: 'reading the national mesh...' },
    loadingNational: {
      fr: 'lecture du registre national...',
      en: 'reading the national register...',
    },
    loadingViewport: { fr: 'lecture du registre...', en: 'reading the register...' },
    empty: {
      fr: 'aucun établissement dans cette vue',
      en: 'no establishment in this view',
    },
    meshThinned: {
      fr: (drawn, inBox) => `${drawn} tracés sur ${inBox} dans la vue — échantillon spatial`,
      en: (drawn, inBox) => `${drawn} drawn of ${inBox} in the view — a spatial sample`,
      note: 'A thinned map that does not say it is thinned claims France has 1,100 schools.',
      sample: ['1,842', '12,004'],
    },
    meshWhole: {
      fr: (drawn) => `${drawn} établissements dans la vue`,
      en: (drawn) => `${drawn} establishments in the view`,
      sample: ['640'],
    },
    nationalCount: {
      fr: (assigned, painted) => `${assigned} établissements sur ${painted} départements en prismes`,
      en: (assigned, painted) => `${assigned} establishments over ${painted} departments as prisms`,
      sample: ['65,396', '96'],
    },
    nationalOffshore: {
      fr: (count) => `${count} hors métropole non cartographiés`,
      en: (count) => `${count} outside mainland France, not mapped`,
      sample: ['2,762'],
    },
    truncated: {
      fr: 'relevé national tronqué en amont',
      en: 'the national survey was truncated upstream',
    },
    siteCount: {
      fr: (count) => `${count} établissements`,
      en: (count) => `${count} establishments`,
      sample: ['1,335'],
    },
    sitePupils: {
      fr: (pupils) => `${pupils} élèves`,
      en: (pupils) => `${pupils} pupils`,
      sample: ['284,510'],
    },
    capped: { fr: 'réponse tronquée en amont', en: 'the answer was capped upstream' },
  },
});
