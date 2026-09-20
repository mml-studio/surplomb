/**
 * Strings of `src/data/idfmNetwork.js` — the IDFM stops and their hourly
 * offer. See docs/i18n/CONVENTIONS.md.
 *
 * ── WHAT THIS CARD IS ARGUING ───────────────────────────────────────────────
 *
 * The card was rewritten in French on 2026-09-10 after a reader called the
 * previous one « du charabia »: it now opens on the CONSEQUENCE — how long
 * you stand at the pole — and gives the rate as its proof. The English keeps
 * that order, and every qualifier with it: this is the average of a term-time
 * week and not a timetable; an accessibility nobody surveyed is not "not
 * accessible"; a stop with no row in the offer file is a measured absence and
 * not the map's ceiling quoted back at the reader.
 *
 * Numbers arrive already formatted (`formatNumber`, `formatRate`): a message
 * places words around a value.
 *
 * Stop names, line names, commune names and fare zones are DATA and stay as
 * the referential publishes them.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The referential's modes, keyed by this app's mode id.
 *
 * Deliberately NOT the offer file's table (`idfmFrequencyFeed.i18n.js`): the
 * two publications word `rail` differently — "RER / Transilien" here, "Train —
 * RER & Transilien" there — and each label belongs to the file it came from.
 * The server stamps its own French `modeLabel` into the payload; the browser
 * labels the mode itself so the card can answer in either language.
 */
export const IDFM_MODE_NAMES = defineMessages({
  metro: { fr: 'Métro', en: 'Metro' },
  rail: { fr: 'RER / Transilien', en: 'RER / Transilien', keep: ['Transilien'] },
  tram: { fr: 'Tramway', en: 'Tram' },
  bus: { fr: 'Bus', en: 'Bus' },
  funicular: { fr: 'Funiculaire', en: 'Funicular' },
  cableway: { fr: 'Téléphérique', en: 'Cable car' },
});

/** What a rider is waiting FOR, in the sentence that says how long. */
export const IDFM_MODE_VEHICLES = defineMessages({
  bus: { fr: 'bus', en: 'bus' },
  metro: { fr: 'métro', en: 'metro' },
  rail: { fr: 'train', en: 'train', note: '"train" inside a sentence; the header says RER / Transilien.' },
  tram: { fr: 'tram', en: 'tram' },
  funicular: { fr: 'passage', en: 'departure' },
  cableway: { fr: 'passage', en: 'departure' },
  unknown: { fr: 'passage', en: 'departure' },
});

export default defineMessages({
  /** One sentence per mode: what it is, and why its badge is that size. */
  modeBlurbs: {
    metro: {
      fr: 'Bouche ou station de métro. Le plus grand badge, avec le RER : une station porte des '
        + 'ordres de grandeur de voyageurs de plus qu’un poteau de bus, et à cette altitude c’est '
        + 'l’ossature du réseau qu’on lit.',
      en: 'Metro entrance or station. The largest badge, with the RER: a station carries orders '
        + 'of magnitude more riders than a bus pole, and at this altitude what you read is the '
        + 'backbone of the network.',
    },
    rail: {
      fr: 'Gare RER ou Transilien, au même diamètre que le métro.',
      en: 'RER or Transilien station, at the same diameter as the metro.',
      keep: ['Transilien'],
    },
    tram: { fr: 'Station de tramway.', en: 'Tram stop.' },
    bus: {
      fr: 'Poteau de bus. Le mode le plus nombreux du référentiel de très loin, donc le plus petit '
        + 'badge — sans quoi il recouvrirait les trois autres.',
      en: 'Bus pole. By far the most numerous mode in the referential, so the smallest badge — '
        + 'anything bigger would bury the other three.',
    },
    funicular: { fr: 'Funiculaire.', en: 'Funicular.' },
    cableway: {
      fr: 'Téléphérique. Une seule ligne publiée dans tout le référentiel, le Câble C1 vers Créteil.',
      en: 'Cable car. One single line published in the whole referential, the Câble C1 to Créteil.',
      keep: ['Câble', 'Créteil'],
    },
    unknown: {
      fr: 'Arrêt dont le référentiel ne publie pas le mode — jamais emprunté à un voisin.',
      en: 'A stop whose mode the referential does not publish — never borrowed from a neighbor.',
    },
  },
  unknownMode: { fr: 'Mode non publié', en: 'Mode not published' },

  /**
   * The mean wait, on a clock face rather than as a decimal: `2 min 30` is
   * what a person says, `2,5 min` is what the arithmetic gives. Rounded to the
   * half-minute and never finer — this is a mean derived from a count of
   * departures, not a headway the file publishes.
   */
  wait: {
    underAMinute: { fr: 'moins d’une minute', en: 'under a minute' },
    overAnHour: { fr: 'plus d’une heure', en: 'over an hour' },
    minutes: {
      fr: (minutes) => `${minutes} min`,
      en: (minutes) => `${minutes} min`,
      sample: [12],
    },
    minutesAndAHalf: {
      fr: (minutes) => `${minutes} min 30`,
      en: (minutes) => `${minutes} min 30 s`,
      note: 'Half-minute precision: 2 min 30, never 2.5 min.',
      sample: [2],
    },
  },

  /** The seven moments, one panel row. `now` follows the Paris clock. */
  moments: {
    now: { fr: 'Maintenant', en: 'Now' },
    b06: { fr: '06 h', en: '06:00' },
    b08: { fr: '08 h', en: '08:00' },
    b12: { fr: '12 h', en: '12:00' },
    b18: { fr: '18 h', en: '18:00' },
    b22: { fr: '22 h', en: '22:00' },
    b01: { fr: '01 h', en: '01:00' },
  },
  chipTitles: {
    followParis: {
      fr: (when) => `Suivre l’horloge de Paris — actuellement ${when}`,
      en: (when) => `Follow the Paris clock — now ${when}`,
      sample: ['Tuesday 08:00–08:59'],
    },
    pinBand: {
      fr: (when) => `${when} · déplace aussi les autres couches de semaine type`,
      en: (when) => `${when} · also moves the other typical-week layers`,
      note: 'A band chip reaches past its own row, and a control that does has to say so.',
      sample: ['Tuesday 18:00–18:59'],
    },
  },

  legend: {
    silentBlurb: {
      fr: 'L’arrêt existe et publie ses horaires. À cette heure-ci, il ne dessert rien.',
      en: 'The stop exists and publishes its schedule. At this hour, it serves nothing.',
    },
    unmeasured: { fr: 'offre horaire non publiée', en: 'hourly offer not published' },
    unmeasuredBlurb: {
      fr: 'Arrêt du référentiel qui n’a AUCUNE ligne dans le fichier d’offre — 3 053 des '
        + '37 956, soit 8,0 %. Le gris « non mesuré » de toute l’application, et non la couleur '
        + 'du passage nul, qui est une mesure. Un clic sur cet arrêt va tout de même chercher '
        + 'son profil : le fichier d’offre est interrogé par arrêt, pas seulement par vue.',
      en: 'A referential stop with NO row at all in the offer file — 3,053 of 37,956, or 8.0%. '
        + 'The “not measured” grey the whole application uses, and not the color of zero '
        + 'departures, which is a measurement. Clicking this stop still fetches its profile: '
        + 'the offer file is queried per stop, not only per view.',
    },
    unplaced: {
      fr: (count) => `${count} arrêts sans coordonnée publiée : sur aucune carte, ici ni ailleurs`,
      en: (count) => `${count} stops with no published coordinate: on no map, here or anywhere`,
      note: 'Published with no swatch: these are the stops that CANNOT be drawn, not a tally of marks.',
      sample: ['549'],
    },
    unplacedBlurb: {
      fr: 'Sans latitude ni longitude dans le fichier : 473 Train, 69 Bus, '
        + '7 Tramway. 518 se rattachent à une zone d’arrêt, mais 512 de ces zones ont deux quais '
        + 'ou plus — il n’existe aucun point publié à emprunter. Ils portent 2,8 % des passages.',
      en: 'No latitude or longitude in the file: 473 Train, 69 Bus, 7 Tram. 518 do attach to a '
        + 'stop area, but 512 of those areas have two platforms or more — there is no published '
        + 'point to borrow. They carry 2.8% of all departures.',
    },
  },

  card: {
    stopFallbackName: {
      fr: (id) => `Arrêt ${id}`,
      en: (id) => `Stop ${id}`,
      note: 'Neither file published a name for this stop.',
      sample: ['22154'],
    },
    title: {
      fr: (name, mode) => `${name} · ${mode}`,
      en: (name, mode) => `${name} · ${mode}`,
      sample: ['Alésia', 'Metro'],
      keep: ['Alésia'],
    },
    whenDayHour: {
      fr: (day, hour) => `${day.toLowerCase()} à ${hour}`,
      en: (day, hour) => `${day} at ${hour}`,
      note: 'French writes the weekday lower-case mid-sentence, English capitalizes it: '
        + 'the day arrives capitalized and each language does its own agreement.',
      sample: ['Tuesday', '08:00'],
    },
    /** `08:00–08:59` → `08 h` / `08:00`. The hour a band opens on. */
    hour: {
      fr: (hour) => `${hour} h`,
      en: (hour) => `${hour}:00`,
      note: '`hour` is the two-digit hour of the band (08, 22, 01).',
      sample: ['08'],
    },
    /** `06:00–06:59` → `06 h 00` / `06:00`. The card names a moment. */
    clock: {
      fr: (hour, minute) => `${hour} h ${minute}`,
      en: (hour, minute) => `${hour}:${minute}`,
      sample: ['06', '00'],
    },
    wait: {
      fr: (vehicle, wait, when) => `Un ${vehicle} toutes les ${wait} — ce ${when}`,
      en: (vehicle, wait, when) => `A ${vehicle} every ${wait} — this ${when}`,
      note: 'The consequence first: how long a rider stands at the pole.',
      sample: ['metro', '3 min', 'Tuesday at 08:00'],
    },
    nothing: {
      fr: (when) => `Rien ne passe ici ce ${when}`,
      en: (when) => `Nothing runs here this ${when}`,
      sample: ['Tuesday at 01:00'],
    },
    ratePeak: {
      fr: (rate, peakRate, peakHour) => `${rate} par heure ici, jusqu’à ${peakRate} vers ${peakHour}`,
      en: (rate, peakRate, peakHour) => `${rate} an hour here, up to ${peakRate} around ${peakHour}`,
      sample: ['12', '18.4', '08:00'],
    },
    rate: {
      fr: (rate) => `${rate} par heure ici`,
      en: (rate) => `${rate} an hour here`,
      sample: ['12'],
    },
    span: {
      fr: (first, last) => `premier ${first}, dernier ${last}`,
      en: (first, last) => `first ${first}, last ${last}`,
      note: 'When service starts and stops, as clock times.',
      sample: ['05:00', '00:30'],
    },
    otherDay: {
      fr: (day, wait) => `${day} à la même heure : un toutes les ${wait}`,
      en: (day, wait) => `${day} at the same hour: one every ${wait}`,
      note: 'The day whose service differs MOST from the one on screen.',
      sample: ['Sunday', '12 min'],
    },
    otherDayNothing: {
      fr: (day) => `${day} à la même heure : rien`,
      en: (day) => `${day} at the same hour: nothing`,
      sample: ['Sunday'],
    },
    probeLoading: {
      fr: 'Lecture de l’offre horaire de cet arrêt…',
      en: 'Reading this stop’s hourly offer…',
    },
    probeError: {
      fr: 'Offre horaire IDFM momentanément indisponible pour cet arrêt',
      en: 'IDFM hourly offer temporarily unavailable for this stop',
    },
    noProfile: {
      fr: 'Aucun profil horaire publié pour cet arrêt dans l’offre IDFM',
      en: 'No hourly profile published for this stop in the IDFM offer',
      note: 'A measured absence — 3,053 of 37,956 stops — never the map\'s own ceiling.',
    },
    stepFree: { fr: 'accès de plain-pied', en: 'step-free access' },
    stepFreePartial: { fr: 'accès de plain-pied partiel', en: 'partial step-free access' },
    noStepFree: { fr: 'pas d’accès de plain-pied', en: 'no step-free access' },
    accessUnknown: {
      fr: 'accessibilité non renseignée',
      en: 'accessibility not recorded',
      note: 'Nobody surveyed it, which is not "not accessible".',
    },
    fareZone: {
      fr: (zone) => `zone ${zone}`,
      en: (zone) => `fare zone ${zone}`,
      sample: [2],
    },
    communeWithDept: {
      fr: (commune, dept) => `${commune} (${dept})`,
      en: (commune, dept) => `${commune} (${dept})`,
      note: 'Both are data: a commune name and its department code.',
      sample: ['Melun', '77'],
    },
    wholeDay: {
      fr: (glyphs) => `04 h ${glyphs} 03 h — la journée entière`,
      en: (glyphs) => `04:00 ${glyphs} 03:00 — the whole day`,
      note: 'The operating day of this file runs 04:00 → 03:59.',
      sample: ['▁▂▅█▆▃▁'],
    },
    aliases: {
      fr: (names) => `Aussi publié « ${names} » au même point`,
      en: (names) => `Also published as “${names}” at the same point`,
      note: '`names` is already joined with the language\'s own quotes and separators.',
      sample: ['Alésia'],
      keep: ['Alésia'],
    },
    aliasSeparator: {
      fr: ' », « ',
      en: '”, “',
      note: 'Between two alternative names inside the quotes of `aliases`.',
    },
    missingWindows: {
      fr: (count) => `${count} des 4 fenêtres horaires n’ont pas répondu — un creux `
        + 'du graphique peut être une panne amont, pas une absence de service',
      en: (count) => `${count} of the 4 time windows did not answer — a dip in the chart `
        + 'can be an upstream outage rather than an absence of service',
      sample: [1],
    },
    modeNotPublished: {
      fr: 'Mode non publié par ce jeu de données — non emprunté au référentiel',
      en: 'Mode not published by this dataset — not borrowed from the referential',
    },
    averageWeek: {
      fr: (year) => `Moyenne d’une semaine ordinaire ${year}, hors vacances — ce n’est pas un horaire`,
      en: (year) => `Average of an ordinary ${year} week, term time — this is not a timetable`,
      sample: ['2025'],
    },
  },

  /** The line under the layer's toggle: what this view actually contains. */
  row: {
    dormant: {
      fr: 'Zoome : le réseau IDFM se dessine sous 20 km d’altitude',
      en: 'Zoom in: the IDFM network draws below 20 km altitude',
    },
    loading: { fr: 'lecture de l’offre horaire IDFM…', en: 'reading the IDFM hourly offer…' },
    stops: {
      fr: (count) => `${count} arrêts`,
      en: (count) => `${count} stops`,
      sample: ['1,204'],
    },
    colorByMode: { fr: 'couleur par mode', en: 'color by mode' },
    frequencyFrom: {
      fr: 'fréquence à partir d’une vue de 5 km',
      en: 'frequency from a 5 km view',
    },
    when: {
      fr: (day, band) => `${day} ${band}`,
      en: (day, band) => `${day} ${band}`,
      sample: ['Tuesday', '08:00–08:59'],
    },
    parisClock: {
      fr: (when) => `${when} (heure de Paris)`,
      en: (when) => `${when} (Paris time)`,
      sample: ['Tuesday 08:00–08:59'],
    },
    offerUnavailable: { fr: 'offre horaire IDFM indisponible', en: 'IDFM hourly offer unavailable' },
    refreshUnavailable: {
      fr: 'rafraîchissement de l’offre IDFM indisponible',
      en: 'IDFM offer refresh unavailable',
      note: 'What is drawn is kept: an older box is still a true map of the service in it.',
    },
    tooDense: {
      fr: (atLeast, inBox, ceiling) => `${atLeast}${inBox} arrêts dans cette vue, plus que les ${ceiling} chiffrés — zoome`,
      en: (atLeast, inBox, ceiling) => `${atLeast}${inBox} stops in this view, more than the ${ceiling} with figures — zoom in`,
      note: '`atLeast` is the "au moins " / "at least " prefix or an empty string.',
      sample: ['at least ', '2,000', '1,200'],
    },
    atLeast: { fr: 'au moins ', en: 'at least ' },
    noFrequency: {
      fr: 'aucune fréquence publiée dans cette vue',
      en: 'no frequency published in this view',
    },
    charted: {
      fr: (count) => `${count} chiffrés`,
      en: (count) => `${count} with figures`,
      sample: ['842'],
    },
    aboveTop: {
      fr: (count, rate) => `${count} à plus de ${rate}/h`,
      en: (count, rate) => `${count} above ${rate}/h`,
      sample: ['17', 32],
    },
    silent: {
      fr: (count) => `${count} sans passage`,
      en: (count) => `${count} with no departure`,
      sample: ['31'],
    },
    refused: {
      fr: (count) => `${count} non chiffrés`,
      en: (count) => `${count} without figures`,
      sample: ['12'],
    },
    missingWindows: {
      fr: (count) => `${count} fenêtres horaires manquantes en amont`,
      en: (count) => `${count} time windows missing upstream`,
      note: 'An unnamed hole in the day would read as "no service between 16:00 and 21:00".',
      sample: [1],
    },
  },

  /** The stop entity's own name, when the referential published none. */
  stop: { fr: 'Arrêt', en: 'Stop' },

  /** Said in the stats so nobody concludes the layer is broken. */
  noLiveVehicles: {
    fr: 'IDFM ne publie aucune position de véhicule en temps réel',
    en: 'IDFM publishes no real-time vehicle position',
  },
});
