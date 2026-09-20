/**
 * Strings of src/data/anfrFrance.js — Mobile antennas (ANFR).
 *
 * THE CARD IS A LIST OF PUBLISHED VALUES AND STATED ABSENCES, and the English
 * keeps every one of the refusals, because they are the layer. A ratio is not
 * a health verdict; a CEM report measures a PLACE and not a mast; an absent
 * band is not a band measured at zero; a ray's length is a drawing convention
 * and not a range. None of those four may soften.
 *
 * TWO REGISTERS, TWO LICENCES. The observatoire is published for reuse and
 * gives the dots; Cartoradio is the private backend of ANFR's own map and
 * gives the detailed card. The wording keeps them apart — the Cartoradio half
 * is absent until it lands and says so while it has not, because a card that
 * silently omits the address cannot be told from a mast with no published
 * address.
 *
 * NUMBERS THAT ARE NAMES. `700 MHz` and `3,5 GHz` are band names, not
 * quantities, so they take no thousands separator in either language — nobody
 * in France has ever called LTE 1800 “la 1 800”, and nobody in English calls
 * it “1,800”.
 *
 * The statuses and the five colour rungs are shared with the feed and live in
 * `anfrFeed.i18n.js`.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  /** One short sentence per band swatch, with the national count. */
  bandBlurbs: {
    '5g': {
      fr: 'La 5G émet depuis ce mât. 50 148 supports : un sur deux en France.',
      en: '5G transmits from this mast. 50,148 supports: one in two in France.',
    },
    '4g': {
      fr: 'La 4G est la plus récente qui émet ici : pas de 5G sur ce mât. 18 698 supports.',
      en: '4G is the newest thing transmitting here: no 5G on this mast. 18,698 supports.',
    },
    '3g': {
      fr: 'La 3G est la plus récente qui émet ici. 127 supports dans toute la France.',
      en: '3G is the newest thing transmitting here. 127 supports in the whole of France.',
    },
    '2g': {
      fr: '2G seule. 89 supports dans toute la France.',
      en: '2G only. 89 supports in the whole of France.',
    },
    projet: {
      fr: 'Rien n’émet : une autorisation déposée à l’ANFR, aucune installation. 3 638 supports.',
      en: 'Nothing transmits: an authorization filed with ANFR, nothing installed. 3,638 supports.',
    },
  },

  /** The eight compass points a bearing is read as. */
  compass: {
    fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
    en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    note: 'French writes Sud-Ouest, Ouest, Nord-Ouest; English SW, W, NW.',
  },

  /** `3,5 GHz` / `3.5 GHz` — the one band written in gigahertz. */
  band35: { fr: '3,5 GHz', en: '3.5 GHz' },

  /** The 5G rung, as an adjective inside `5G … (700 MHz)`. */
  fiveG: {
    fast: {
      fr: 'rapide',
      en: 'high-band',
      note: 'The rung, never a speed: the register has no throughput column and this '
        + 'layer will not invent one.',
    },
    mid: { fr: 'moyenne', en: 'mid-band' },
    low: { fr: 'basse', en: 'low-band' },
  },

  /** The report's own band name, in the reader's words. */
  service: {
    mobile: {
      fr: (mhz) => `téléphonie mobile ${mhz} MHz`,
      en: (mhz) => `mobile telephony ${mhz} MHz`,
      sample: ['1800'],
    },
    radio: { fr: 'radio FM', en: 'FM radio' },
    tv: { fr: 'télévision', en: 'television' },
    unknownDate: { fr: 'date inconnue', en: 'date unknown' },
  },

  /** What the mast IS, with the preposition the register omits. */
  placement: {
    unnamedWithHeight: {
      fr: (height) => `Support${height} — nature non publiée`,
      en: (height) => `Support${height} — type not published`,
      note: '`height` is `, 32 m` or empty; it leads with its own comma.',
      sample: [', 32 m'],
    },
    unknown: {
      fr: 'Nature et hauteur non publiées',
      en: 'Type and height not published',
    },
    underground: {
      fr: (noun) => `Installation souterraine (${noun}) — aucun mât`,
      en: (noun) => `Underground installation (${noun}) — no mast`,
      note: '`noun` is the register’s own word, lower-cased and left in French.',
      sample: ['tunnel'],
    },
    noHeight: {
      fr: (noun) => `${noun} — hauteur non publiée`,
      en: (noun) => `${noun} — height not published`,
      sample: ['Self-supporting tower'],
    },
    roof: {
      fr: (of, height) => `Toit ${of}${height}`,
      en: (of, height) => `Roof of ${of}${height}`,
      note: '`of` already carries the French elision (`d’immeuble`, `de bâtiment`); the '
        + 'English adds its own preposition and gets the bare noun.',
      sample: ['a building', ', 32 m'],
    },
    roofNoHeight: {
      fr: (of) => `Toit ${of} — hauteur non publiée`,
      en: (of) => `Roof of ${of} — height not published`,
      sample: ['a building'],
    },
    on: {
      fr: (noun, height) => `Sur ${noun}${height}`,
      en: (noun, height) => `On ${noun}${height}`,
      sample: ['mobilier urbain', ', 8 m'],
    },
    onNoHeight: {
      fr: (noun) => `Sur ${noun} — hauteur non publiée`,
      en: (noun) => `On ${noun} — height not published`,
      sample: ['mobilier urbain'],
    },
    height: {
      fr: (height) => `, ${height} m`,
      en: (height) => `, ${height} m`,
      sample: ['32'],
    },
  },

  /** Who transmits, in one line. */
  operators: {
    all: {
      fr: (total) => `les ${total} opérateurs`,
      en: (total) => `all ${total} operators`,
      sample: ['4'],
    },
    andLast: {
      fr: (first, last) => `${first} et ${last}`,
      en: (first, last) => `${first} and ${last}`,
      note: 'The list is already joined with commas; this adds the last conjunction.',
      sample: ['Orange, Bouygues', 'SFR'],
    },
    rungs: {
      fr: (rungs, who) => `${rungs} : ${who}`,
      en: (rungs, who) => `${rungs}: ${who}`,
      sample: ['5G 3.5 GHz and 4G', 'all 4 operators'],
    },
    rungJoin: { fr: ' et ', en: ' and ' },
  },

  /** What radiates here, said once and plainly. */
  live: {
    nothing: { fr: 'Rien n’émet à cette position', en: 'Nothing transmits at this position' },
    transmits: {
      fr: (generations) => `Émet en ${generations}`,
      en: (generations) => `Transmits on ${generations}`,
      sample: ['5G · 4G'],
    },
  },

  /** The approved project, named by what it would add. */
  plan: {
    alsoAuthorized: {
      fr: (bands, n) => `${bands} ${plural(n, 'autorisée', 'autorisées')} en plus — pas encore ${plural(n, 'installée', 'installées')}`,
      en: (bands, n) => `${bands} also authorized — not installed yet`,
      note: '`n` is how many bands, for the French agreement.',
      sample: ['5G', 1],
    },
    authorizedHere: {
      fr: (bands, n) => `${bands} ${plural(n, 'autorisée', 'autorisées')} ici — rien n’a encore été installé`,
      en: (bands, n) => `${bands} authorized here — nothing has been installed yet`,
      sample: ['4G · 5G', 2],
    },
  },

  /** The card of one selected support. */
  card: {
    title: {
      fr: (count, n, top) => `Antenne-relais · ${count} ${plural(n, 'opérateur', 'opérateurs')}${top}`,
      en: (count, n, top) => `Mobile antenna · ${count} ${plural(n, 'operator', 'operators')}${top}`,
      note: '`top` is ` · 5G`, or the “nothing transmits” tail.',
      sample: ['4', 4, ' · 5G'],
    },
    titleTop: {
      fr: (generation) => ` · ${generation}`,
      en: (generation) => ` · ${generation}`,
      sample: ['5G'],
    },
    titleSilent: { fr: ' · rien n’émet', en: ' · nothing transmits' },
    titleNoOperator: {
      fr: 'Antenne-relais · aucun opérateur déclaré',
      en: 'Mobile antenna · no operator declared',
    },
    noShaft: {
      fr: (count, natures) => `Aucun fût dessiné : ${count} supports du registre ne publient pas `
        + `de hauteur, tous ${natures}`,
      en: (count, natures) => `No shaft drawn: ${count} supports in the register publish no `
        + `height, all of them ${natures}`,
      note: '`natures` is the register’s own list of `nat_id` values, lower-cased.',
      sample: ['551', 'underground · tunnel · indoor gallery'],
    },
    operatorsFallback: {
      fr: (names, rest, live) => `${names}${rest} · ${live}`,
      en: (names, rest, live) => `${names}${rest} · ${live}`,
      sample: ['Orange, SFR', ' +2', 'Transmits on 5G · 4G'],
    },
    detailPending: {
      fr: 'Lecture de la fiche détaillée du mât…',
      en: 'Reading the mast’s detailed record…',
    },
    detailUnavailable: {
      fr: (detail) => `⚠ Fiche détaillée indisponible — ${detail}`,
      en: (detail) => `⚠ Detailed record unavailable — ${detail}`,
      sample: ['HTTP 503'],
    },
    coSited: {
      fr: (count, n) => `⚠ ${count} ${plural(n, 'autre', 'autres')} ${plural(n, 'support', 'supports')} à cette position exacte`,
      en: (count, n) => `⚠ ${count} other ${plural(n, 'support', 'supports')} at this exact position`,
      sample: ['2', 2],
    },
    owner: {
      fr: (owner) => `Propriétaire : ${owner}`,
      en: (owner) => `Owner: ${owner}`,
      sample: ['SCI Horizon'],
    },
    provenance: {
      fr: (id, edition) => `ANFR n° ${id} · registre du ${edition} · Licence Ouverte 2.0`,
      en: (id, edition) => `ANFR no. ${id} · register of ${edition} · Licence Ouverte 2.0`,
      keep: ['Licence Ouverte'],
      sample: ['123456', 'Aug 27, 2026'],
    },
    degraded: {
      fr: (legs) => `⚠ Fiche détaillée muette sur : ${legs}`,
      en: (legs) => `⚠ Detailed record silent on: ${legs}`,
      note: 'A leg of the Cartoradio card that answered with nothing is NAMED, so the '
        + 'card cannot be told from a mast Cartoradio has nothing to say about.',
      sample: ['exposure'],
    },
  },

  /** The exposure block, and the four things it refuses to say. */
  exposure: {
    none: {
      fr: (radius) => `Aucun relevé d’ondes publié dans ${radius} m autour de ce mât`,
      en: (radius) => `No field measurement published within ${radius} m of this mast`,
      sample: ['300'],
    },
    unreadable: {
      fr: (metres) => `Un relevé d’ondes à ${metres} m — rapport illisible`,
      en: (metres) => `One field measurement ${metres} m away — unreadable report`,
      sample: ['120'],
    },
    reading: {
      fr: (volts, metres, year, ratio, peak) => `${volts} V/m à ${metres} m (${year})${ratio}${peak}`,
      en: (volts, metres, year, ratio, peak) => `${volts} V/m at ${metres} m (${year})${ratio}${peak}`,
      sample: ['0.86', '120', '2025', ' — 32× below the limit (28 V/m)', ', peak: 700 MHz'],
    },
    ratio: {
      fr: (times, limit) => ` — ${times}× sous la limite (${limit} V/m)`,
      en: (times, limit) => ` — ${times}× below the limit (${limit} V/m)`,
      note: 'A multiple, not a percentage: a reader who is frightened reads “32× below” '
        + 'faster than “3% of” something they have never heard of. And a ratio is not a '
        + 'health verdict, which is why the sentence says nothing else.',
      sample: ['32', '28'],
    },
    peak: {
      fr: (band) => `, pic : ${band}`,
      en: (band) => `, peak: ${band}`,
      sample: ['700 MHz'],
    },
    peakWithValue: {
      fr: (band, volts) => `, pic : ${band} à ${volts} V/m`,
      en: (band, volts) => `, peak: ${band} at ${volts} V/m`,
      sample: ['700 MHz', '0.31'],
    },
    belowFloor: {
      fr: (metres, year, reading) => `Champ global sous le seuil mesurable, à ${metres} m (${year})${reading}`,
      en: (metres, year, reading) => `Total field below the measurable threshold, ${metres} m away (${year})${reading}`,
      note: 'A global of zero is the protocol’s floor, not a reassuring number.',
      sample: ['120', '2025', ', peak: 700 MHz at 0.31 V/m'],
    },
    noGlobal: {
      fr: (metres, year) => `Relevé à ${metres} m (${year}) — valeur globale non publiée`,
      en: (metres, year) => `Measured ${metres} m away (${year}) — total value not published`,
      sample: ['120', '2025'],
    },
    neighbourUnmeasured: {
      fr: (year, bands) => `⚠ Relevé chez un voisin, ${year} — ${bands} jamais mesurés`,
      en: (year, bands) => `⚠ Measured at a neighbor’s, ${year} — ${bands} never measured`,
      note: 'The sharper of the two caveats: a band the report never looked at is not a '
        + 'band it measured at zero.',
      sample: ['2025', '3.5 GHz, 700 MHz'],
    },
    neighbourStale: {
      fr: (month) => `⚠ Relevé chez un voisin, antérieur à l’équipement de ${month}`,
      en: (month) => `⚠ Measured at a neighbor’s, before the equipment of ${month}`,
      note: 'A report older than the equipment beside it is a true reading of a '
        + 'DIFFERENT installation.',
      sample: ['07/2025'],
    },
    neighbour: {
      fr: 'Relevé chez un voisin, pas sur le mât',
      en: 'Measured at a neighbor’s, not on the mast',
    },
    nonConforming: {
      fr: '⚠ Non conforme selon le rapport ANFR',
      en: '⚠ Non-compliant according to the ANFR report',
    },
  },

  /** What the bearings draw, and what they could not. */
  azimuth: {
    alsoOther: {
      fr: (count, labels) => ` · +${count} ${labels} hors téléphonie`,
      en: (count, labels) => ` · +${count} ${labels} outside mobile telephony`,
      note: 'The observatoire is public mobile ONLY; Cartoradio counts the rest.',
      sample: ['6', 'faisceaux'],
    },
    otherLabel: { fr: 'autres', en: 'others' },
    carries: { fr: 'Porte ', en: 'Carries ' },
    line: {
      fr: (antennas, directions, n, named, tier, also) => `${antennas}${directions} ${plural(n, 'direction', 'directions')}${named}${tier}${also}`,
      en: (antennas, directions, n, named, tier, also) => `${antennas}${directions} ${plural(n, 'direction', 'directions')}${named}${tier}${also}`,
      note: '`antennas` already ends with its own comma and space when present.',
      sample: ['30 antennas, ', '12', 12, ' (0° N · 120° SE)', ', 31 to 49 m above ground', ''],
    },
    antennasPrefix: {
      fr: (count) => `${count} antennes, `,
      en: (count) => `${count} antennas, `,
      sample: ['30'],
    },
    bearing: {
      fr: (deg, point) => `${deg}° ${point}`,
      en: (deg, point) => `${deg}° ${point}`,
      sample: ['120', 'SE'],
    },
    named: {
      fr: (list) => ` (${list})`,
      en: (list) => ` (${list})`,
      sample: ['0° N · 120° SE'],
    },
    oneHeight: {
      fr: (height) => `, ${height} m du sol`,
      en: (height) => `, ${height} m above ground`,
      sample: ['31'],
    },
    heightRange: {
      fr: (low, high) => `, ${low} à ${high} m du sol`,
      en: (low, high) => `, ${low} to ${high} m above ground`,
      note: 'A range, not a count: “16 heights” is true and says nothing.',
      sample: ['31', '49'],
    },
    noDirection: {
      fr: (count, also) => `${count} antennes — aucune direction publiée${also}`,
      en: (count, also) => `${count} antennas — no direction published${also}`,
      sample: ['12', ''],
    },
    unplaced: {
      fr: (count, n) => `⚠ ${count} ${plural(n, 'direction', 'directions')} sans hauteur de fixation publiée — non ${plural(n, 'dessinée', 'dessinées')}`,
      en: (count, n) => `⚠ ${count} ${plural(n, 'direction', 'directions')} with no published mounting height — not drawn`,
      sample: ['3', 3],
    },
    unaimed: {
      fr: (count, n) => `⚠ ${count} ${plural(n, 'antenne', 'antennes')} sans direction publiée`,
      en: (count, n) => `⚠ ${count} ${plural(n, 'antenna', 'antennas')} with no published direction`,
      sample: ['2', 2],
    },
  },

  /** The card of one mesh dot, before and after its lookup. */
  mesh: {
    title: { fr: 'Antenne-relais', en: 'Mobile antenna' },
    operators: {
      fr: (count, n) => `${count} ${plural(n, 'opérateur', 'opérateurs')} ${plural(n, 'déclaré', 'déclarés')}`,
      en: (count, n) => `${count} ${plural(n, 'operator', 'operators')} declared`,
      sample: ['4', 4],
    },
    lookupPending: {
      fr: 'Lecture du mât dans le registre…',
      en: 'Looking the mast up in the register…',
    },
    lookupError: {
      fr: (detail) => `⚠ Registre injoignable pour ce point — ${detail}`,
      en: (detail) => `⚠ Register unreachable for this point — ${detail}`,
      sample: ['timed out'],
    },
    lookupEmpty: {
      fr: '⚠ Aucun mât du registre à cette position exacte',
      en: '⚠ No register mast at this exact position',
    },
    zoomIn: {
      fr: 'Approchez pour la fiche du mât : opérateurs, bandes et relevé d’ondes',
      en: 'Move closer for the mast’s card: operators, bands and field measurement',
    },
    provenance: {
      fr: (edition) => `Vue d’ensemble — un point par cellule · registre du ${edition}`,
      en: (edition) => `Overview — one point per cell · register of ${edition}`,
      sample: ['Aug 27, 2026'],
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
  legend: {
    noMast: {
      label: { fr: 'Sans mât — hauteur non publiée', en: 'No mast — height not published' },
      blurb: {
        fr: (count) => 'Le point reste au sol et aucun fût n’est dessiné. Les '
          + `${count} concernés sont souterrains ou en tunnel : il n’y a pas de mât `
          + 'à mesurer.',
        en: (count) => 'The point stays on the ground and no shaft is drawn. The '
          + `${count} concerned are underground or in a tunnel: there is no mast `
          + 'to measure.',
        sample: ['551'],
      },
    },
    clipped: {
      label: { fr: 'Fûts écrêtés', en: 'Shafts cut off' },
      blurb: {
        fr: (cap) => `Plafond de ${cap} fûts par vue : le point est dessiné, le fût non.`,
        en: (cap) => `Cap of ${cap} shafts per view: the point is drawn, the shaft is not.`,
        sample: ['600'],
      },
    },
    azimuths: {
      label: {
        fr: 'Azimuts du support sélectionné',
        en: 'Bearings of the selected support',
      },
      blurb: {
        fr: 'Une direction publiée par rayon. La longueur est une convention de dessin, pas une '
          + 'portée : ni l’ouverture du faisceau ni la distance couverte ne sont publiées.',
        en: 'One published direction per ray. The length is a drawing convention, not a '
          + 'range: neither the beam width nor the distance covered is published.',
      },
    },
  },
});
