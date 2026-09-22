/**
 * Strings of src/data/anfrFrance.js — Mobile antennas (ANFR).
 *
 * WRITTEN FOR A FIRST-TIME READER. The card is five short lines — what and
 * whose, the networks, where, the waves, the source — and the key names each
 * colour in two or three words. No frequency, no register number, no licence
 * on the card; the English is as short as the French.
 *
 * THREE REFUSALS SURVIVE THE SIMPLIFICATION, in both languages: a multiple of
 * the legal limit is a measurement and never "safe"; a measurement older than
 * the antennas beside it says so; a planned antenna is never called a
 * transmitter.
 *
 * The statuses and the five colour rungs are shared with the feed and live in
 * `anfrFeed.i18n.js`.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

/**
 * The 38 natures of ANFR's `SUP_NATURE.txt`, keyed on the register's own word
 * lower-cased — which is the form `anfrPlacementLine` already computes.
 *
 * A closed vocabulary, so it is translated rather than quoted: “Roof of
 * immeuble” is not English, and the difference between a *pylône autostable*
 * and an *immeuble* is the difference between a tower in a field and a rooftop
 * installation, which is the whole reason the card names it. A nature this
 * table has never seen falls through to the register's own French, which is
 * what `labelFor` does and what the module did before it had any English.
 */
export const ANFR_NATURE_LABELS = defineMessages({
  'sans nature': { fr: 'sans nature', en: 'no type given' },
  'sémaphore': { fr: 'sémaphore', en: 'signal station' },
  phare: { fr: 'phare', en: 'lighthouse' },
  "château d'eau - réservoir": { fr: "château d'eau - réservoir", en: 'water tower – reservoir' },
  immeuble: { fr: 'immeuble', en: 'apartment building' },
  'local technique': { fr: 'local technique', en: 'utility room' },
  'mât': { fr: 'mât', en: 'mast' },
  'intérieur galerie': { fr: 'intérieur galerie', en: 'indoor gallery' },
  'intérieur sous-terrain': { fr: 'intérieur sous-terrain', en: 'underground interior' },
  tunnel: { fr: 'tunnel', en: 'tunnel' },
  'mât béton': { fr: 'mât béton', en: 'concrete mast' },
  'mât métallique': { fr: 'mât métallique', en: 'steel mast' },
  'pylône': { fr: 'pylône', en: 'pylon' },
  'bâtiment': { fr: 'bâtiment', en: 'building' },
  'monument historique': { fr: 'monument historique', en: 'historic monument' },
  'monument religieux': { fr: 'monument religieux', en: 'religious building' },
  'pylône autoportant': { fr: 'pylône autoportant', en: 'self-supporting pylon' },
  'pylône autostable': { fr: 'pylône autostable', en: 'free-standing pylon' },
  'pylône haubané': { fr: 'pylône haubané', en: 'guyed pylon' },
  'pylône treillis': { fr: 'pylône treillis', en: 'lattice pylon' },
  'pylône tubulaire': { fr: 'pylône tubulaire', en: 'tubular pylon' },
  silo: { fr: 'silo', en: 'silo' },
  "ouvrage d'art (pont, viaduc)": {
    fr: "ouvrage d'art (pont, viaduc)",
    en: 'engineering structure (bridge, viaduct)',
  },
  'tour hertzienne': { fr: 'tour hertzienne', en: 'radio tower' },
  'dalle en béton': { fr: 'dalle en béton', en: 'concrete slab' },
  'support non décrit': { fr: 'support non décrit', en: 'support not described' },
  'fût': { fr: 'fût', en: 'shaft' },
  'tour de contrôle': { fr: 'tour de contrôle', en: 'control tower' },
  'contre-poids au sol': { fr: 'contre-poids au sol', en: 'counterweight on the ground' },
  'contre-poids sur shelter': { fr: 'contre-poids sur shelter', en: 'counterweight on a shelter' },
  'support defense': { fr: 'support defense', en: 'defence support' },
  'pylône arbre': { fr: 'pylône arbre', en: 'tree-disguised pylon' },
  'ouvrage de signalisation (portique routier, panneau routier)': {
    fr: 'ouvrage de signalisation (portique routier, panneau routier)',
    en: 'signage structure (road gantry, road sign)',
  },
  'balise ou bouée': { fr: 'balise ou bouée', en: 'beacon or buoy' },
  xxx: { fr: 'xxx', en: 'xxx', note: 'The register really does file one nature as XXX.' },
  eolienne: { fr: 'eolienne', en: 'wind turbine' },
  'mobilier urbain': { fr: 'mobilier urbain', en: 'street furniture' },
  roche: { fr: 'roche', en: 'rock' },
});

export default defineMessages({
  /**
   * The card of one antenna — written for someone who has never heard of the
   * ANFR. One short line per question, in the order people ask them: what is
   * it, whose is it, what does it carry, where is it, what are the waves like
   * around it.
   */
  card: {
    title: {
      fr: (generation, count, n) => `Antenne ${generation} · ${count} ${plural(n, 'opérateur', 'opérateurs')}`,
      en: (generation, count, n) => `${generation} antenna · ${count} ${plural(n, 'operator', 'operators')}`,
      note: '`generation` is the newest one on the air: 5G, 4G, 3G or 2G.',
      sample: ['5G', '4', 4],
    },
    titleProject: {
      fr: (count, n) => `Antenne en projet · ${count} ${plural(n, 'opérateur', 'opérateurs')}`,
      en: (count, n) => `Planned antenna · ${count} ${plural(n, 'operator', 'operators')}`,
      note: 'Authorized by the ANFR, nothing on the air yet.',
      sample: ['2', 2],
    },
    titleNoOperator: {
      fr: 'Antenne sans opérateur déclaré',
      en: 'Antenna with no operator declared',
    },
    where: {
      fr: (placement, commune) => `${placement} · ${commune}`,
      en: (placement, commune) => `${placement} · ${commune}`,
      sample: ['Pylon, 30 m tall', 'Vallorcine'],
    },
    loading: { fr: 'Chargement…', en: 'Loading…' },
    zoomIn: {
      fr: 'Rapprochez-vous pour voir cette antenne en détail.',
      en: 'Zoom in to see this antenna in detail.',
    },
    source: {
      fr: (edition) => `Source : ANFR, ${edition}`,
      en: (edition) => `Source: ANFR, ${edition}`,
      sample: ['Aug 27, 2026'],
    },
  },

  /** What the antenna carries: the networks on the air, and the planned ones. */
  networks: {
    live: {
      fr: (generations) => `Réseaux : ${generations}`,
      en: (generations) => `Networks: ${generations}`,
      sample: ['5G, 4G, 3G, 2G'],
    },
    liveAndPlanned: {
      fr: (generations, planned, n) => `Réseaux : ${generations} · ${planned} ${plural(n, 'prévue', 'prévues')}`,
      en: (generations, planned, n) => `Networks: ${generations} · ${planned} planned`,
      note: '`n` is how many planned generations, for the French agreement.',
      sample: ['4G', '5G', 1],
    },
    plannedOnly: {
      fr: (planned) => `Prévu : ${planned} — pas encore installé`,
      en: (planned) => `Planned: ${planned} — not installed yet`,
      sample: ['4G, 3G, 2G'],
    },
    nothing: { fr: 'N’émet pas', en: 'Not transmitting' },
  },

  /** What the antenna stands on, and how high. `height` is empty when not published. */
  placement: {
    pylon: {
      fr: (height) => (height ? `Pylône de ${height} m` : 'Pylône'),
      en: (height) => (height ? `Pylon, ${height} m tall` : 'Pylon'),
      sample: ['30'],
    },
    mast: {
      fr: (height) => (height ? `Mât de ${height} m` : 'Mât'),
      en: (height) => (height ? `Mast, ${height} m tall` : 'Mast'),
      sample: ['12'],
    },
    tower: {
      fr: (height) => (height ? `Tour de ${height} m` : 'Tour'),
      en: (height) => (height ? `Tower, ${height} m tall` : 'Tower'),
      sample: ['48'],
    },
    roof: {
      fr: (height) => (height ? `Sur un toit, à ${height} m de haut` : 'Sur un toit'),
      en: (height) => (height ? `On a roof, ${height} m up` : 'On a roof'),
      sample: ['65'],
    },
    waterTower: {
      fr: (height) => (height ? `Sur un château d’eau, à ${height} m de haut` : 'Sur un château d’eau'),
      en: (height) => (height ? `On a water tower, ${height} m up` : 'On a water tower'),
      sample: ['25'],
    },
    religious: {
      fr: (height) => (height ? `Sur un édifice religieux, à ${height} m de haut` : 'Sur un édifice religieux'),
      en: (height) => (height ? `On a religious building, ${height} m up` : 'On a religious building'),
      sample: ['40'],
    },
    other: {
      fr: (noun, height) => (height ? `${noun}, ${height} m` : noun),
      en: (noun, height) => (height ? `${noun}, ${height} m` : noun),
      note: '`noun` is the register’s own word, named by ANFR_NATURE_LABELS.',
      sample: ['Lighthouse', '30'],
    },
    underground: { fr: 'Sous terre, sans mât', en: 'Underground, no mast' },
    unknown: { fr: 'Type de support non publié', en: 'Support type not published' },
  },

  /**
   * The waves around the antenna, in ONE line. A multiple of the legal limit
   * rather than volts per metre, which mean nothing to the person who came
   * here worried — and never a verdict: "32 times below the limit" is a
   * measurement, "safe" would be a claim.
   */
  exposure: {
    none: {
      fr: (radius) => `Aucune mesure d’ondes publiée à moins de ${radius} m`,
      en: (radius) => `No wave measurement published within ${radius} m`,
      sample: ['300'],
    },
    unreadable: {
      fr: (metres) => `Mesure d’ondes à ${metres} m : rapport illisible`,
      en: (metres) => `Wave measurement ${metres} m away: unreadable report`,
      sample: ['120'],
    },
    measured: {
      fr: (metres, year) => `Ondes mesurées à ${metres} m en ${year}`,
      en: (metres, year) => `Waves measured ${metres} m away in ${year}`,
      sample: ['120', '2025'],
    },
    measuredBefore: {
      fr: (metres, year) => `Ondes mesurées à ${metres} m en ${year}, avant les antennes actuelles`,
      en: (metres, year) => `Waves measured ${metres} m away in ${year}, before the current antennas`,
      note: 'A measurement older than the antennas beside it, or blind to some of their '
        + 'bands, is a true reading of a DIFFERENT installation.',
      sample: ['40', '2009'],
    },
    belowLimit: {
      fr: (measured, times) => `${measured} : ${times} fois sous la limite légale`,
      en: (measured, times) => `${measured}: ${times} times below the legal limit`,
      sample: ['Waves measured 120 m away in 2025', '32'],
    },
    volts: {
      fr: (measured, volts) => `${measured} : ${volts} V/m`,
      en: (measured, volts) => `${measured}: ${volts} V/m`,
      note: 'Only when the report publishes no legal limit to compare with.',
      sample: ['Waves measured 120 m away in 2025', '0.86'],
    },
    tooWeak: {
      fr: (measured) => `${measured} : trop faibles pour être mesurées`,
      en: (measured) => `${measured}: too weak to measure`,
      note: 'The protocol’s floor, not a zero.',
      sample: ['Waves measured 40 m away in 2009'],
    },
    noValue: {
      fr: (measured) => `${measured} : valeur non publiée`,
      en: (measured) => `${measured}: value not published`,
      sample: ['Waves measured 120 m away in 2025'],
    },
    aboveLimit: {
      fr: (measured) => `⚠ ${measured} : au-dessus de la limite légale`,
      en: (measured) => `⚠ ${measured}: above the legal limit`,
      sample: ['Waves measured 120 m away in 2025'],
    },
  },

  /** The row's errors and its one line of status. */
  errors: {
    meshUnavailable: {
      fr: 'maillage national ANFR indisponible',
      en: 'national ANFR mesh unavailable',
    },
    refreshUnavailable: {
      fr: 'rafraîchissement du registre ANFR indisponible',
      en: 'ANFR register refresh unavailable',
    },
    registerUnavailable: {
      fr: 'registre ANFR indisponible',
      en: 'ANFR register unavailable',
    },
    timedOut: { fr: 'délai dépassé', en: 'timed out' },
  },

  status: {
    loading: { fr: 'lecture du registre ANFR...', en: 'reading the ANFR register...' },
    empty: {
      fr: 'aucun support ANFR dans cette vue',
      en: 'no ANFR support in this view',
    },
    thinned: {
      fr: (points, supports) => `${points} points pour ${supports} supports dans la vue`,
      en: (points, supports) => `${points} points for ${supports} supports in view`,
      sample: ['1,100', '42,318'],
    },
    supports: {
      fr: (count) => `${count} supports`,
      en: (count) => `${count} supports`,
      sample: ['842'],
    },
    inFrance: {
      fr: (count) => `${count} en France`,
      en: (count) => `${count} in France`,
      sample: ['72,700'],
    },
    plannedZoomOnly: {
      fr: (count) => `${count} projets d’extension visibles seulement en zoom`,
      en: (count) => `${count} extension projects visible only when zoomed in`,
      note: 'The mesh tuple has no plan mask, so the ring cannot be drawn: it says how '
        + 'many rings it is NOT showing rather than letting the absence read as absence.',
      sample: ['3,638'],
    },
    notDrawn: {
      fr: (count) => `${count} non tracés`,
      en: (count) => `${count} not drawn`,
      sample: ['18'],
    },
    approvedOnly: {
      fr: (count, n) => `${count} ${plural(n, 'projet approuvé', 'projets approuvés')}, rien n’émet`,
      en: (count, n) => `${count} approved ${plural(n, 'project', 'projects')}, nothing transmits`,
      sample: ['12', 12],
    },
    extensions: {
      fr: (count, n) => `${count} ${plural(n, 'extension autorisée', 'extensions autorisées')}`,
      en: (count, n) => `${count} authorized ${plural(n, 'extension', 'extensions')}`,
      sample: ['7', 7],
    },
    shaftsWhenClose: {
      fr: 'fûts à leur hauteur en vue rapprochée',
      en: 'shafts at their true height in close-up view',
    },
    shafts: {
      fr: (count) => `${count} fûts à leur hauteur`,
      en: (count) => `${count} shafts at their true height`,
      sample: ['412'],
    },
    noHeight: {
      fr: (count, n) => `${count} sans hauteur publiée, ${plural(n, 'sans fût', 'sans fût')}`,
      en: (count, n) => `${count} with no published height, no shaft`,
      sample: ['9', 9],
    },
    clipped: {
      fr: (count) => `${count} fûts écrêtés par le plafond`,
      en: (count) => `${count} shafts cut off by the cap`,
      sample: ['120'],
    },
  },

  /** Detectable labels, for the voice and the LLM context. */
  detectable: {
    withOperators: {
      fr: (band, operators) => `${band} · ${operators} opérateurs`,
      en: (band, operators) => `${band} · ${operators} operators`,
      sample: ['5G', 4],
    },
  },

  /** What the mast channel still owes the reader: the absences. */
  /** The key: one plain name per colour, and the few absences worth a line. */
  legend: {
    bands: {
      '5g': { fr: 'Antenne 5G', en: '5G antenna' },
      '4g': { fr: 'Antenne 4G', en: '4G antenna' },
      '3g': { fr: 'Antenne 3G', en: '3G antenna' },
      '2g': { fr: 'Antenne 2G', en: '2G antenna' },
      projet: {
        fr: 'En projet, n’émet pas',
        en: 'Planned, not transmitting',
        note: 'A hollow ring: authorized by the ANFR, nothing installed.',
      },
    },
    noMast: { fr: 'Sous terre, sans mât', en: 'Underground, no mast' },
    clipped: { fr: 'Mâts non dessinés : trop nombreux ici', en: 'Masts not drawn: too many here' },
    azimuths: {
      label: { fr: 'Direction des antennes', en: 'Direction of the antennas' },
      blurb: { fr: 'Longueur des traits indicative.', en: 'Line length is indicative only.' },
    },
  },

  /**
   * The selected antenna's line of sight (mastViewshed.js): the ground it can
   * be SEEN from, over the relief alone. Never called coverage.
   */
  viewshed: {
    loading: {
      fr: 'Calcul de la zone d’où l’on voit l’antenne…',
      en: 'Working out where the antenna can be seen from…',
    },
    ready: {
      fr: (share, radius) => `Visible depuis ${share} du terrain dans un rayon de ${radius}`,
      en: (share, radius) => `Visible from ${share} of the land within ${radius}`,
      sample: ['41%', '27.6 km'],
    },
    photoreal: {
      fr: 'Zone de visibilité : passez en vue Satellite, Plan IGN ou OSM',
      en: 'Visibility area: switch to Satellite, IGN map or OSM',
    },
    failed: { fr: 'Zone de visibilité indisponible', en: 'Visibility area unavailable' },
    legend: {
      label: { fr: 'Terrain d’où l’on voit l’antenne', en: 'Ground the antenna can be seen from' },
      blurb: {
        fr: 'D’après le relief, sans bâtiments ni arbres.',
        en: 'From the relief alone, without buildings or trees.',
      },
    },
  },
});
