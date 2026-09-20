/**
 * Strings of `src/data/meteoStationsFrance.js` — Weather stations (France).
 *
 * The station classes, the fourteen instrument families and Météo-France's
 * own station typology live next door in `meteoStationsFrFeed.i18n.js`; what
 * is here is the card, the key and the three fault lines.
 *
 * ── THE ONE LINE THIS LAYER EXISTS FOR ──────────────────────────────────────
 *
 * “relevés non publiés en accès libre — API Météo-France sur clé” is NOT “no
 * data”. The station is measuring and the reading exists behind a credential,
 * and saying so is the difference between a gap and a paywall. Same for the
 * six stations with no metadata at all, and for the seven the register says
 * are CLOSED while the real-time list still carries them: each is kept,
 * flagged, and never removed in silence. All three survive in English.
 *
 * ── THE CLOCK IS UTC, AND SAYS SO ───────────────────────────────────────────
 *
 * SYNOP validity times are UTC, on both globes: converting them to a reader's
 * zone would invent a precision the product does not have, and the label says
 * `UTC` so nobody has to guess.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** A station the register named with a code rather than a place. */
  untitled: {
    fr: 'Station météo',
    en: 'Weather station',
  },
  untitledAt: {
    fr: (commune) => `Station météo à ${commune}`,
    en: (commune) => `Weather station at ${commune}`,
    sample: ['Bassussarry'],
  },

  /** The instant one observation describes. */
  observedAt: {
    fr: (day, month, hour, minute) => `${day}/${month} à ${hour} h ${minute} UTC`,
    en: (day, month, hour, minute) => `${month}/${day}, ${hour}:${minute} UTC`,
    sample: ['02', '09', '12', '00'],
    note: 'Day-first in French, month-first in English, and UTC in both: the '
      + 'SYNOP product publishes UTC and converting it would invent a '
      + 'precision it does not have.',
  },

  /** The live reading, field by field. Each is optional independently. */
  observation: {
    readings: {
      fr: (bits) => `🌡 ${bits}`,
      en: (bits) => `🌡 ${bits}`,
      sample: ['14.2 °C · 71% RH · 1,013.2 hPa'],
    },
    readingsAt: {
      fr: (bits, at) => `🌡 ${bits}  — ${at}`,
      en: (bits, at) => `🌡 ${bits}  — ${at}`,
      sample: ['14.2 °C · 71% RH', '09/02, 12:00 UTC'],
    },
    humidity: {
      fr: (value) => `${value} % HR`,
      en: (value) => `${value}% RH`,
      sample: ['71'],
      note: 'HR / RH is relative humidity; the glossary’s rule puts no space '
        + 'before % in English.',
    },
    wind: {
      fr: (kmh) => `💨 ${kmh} km/h`,
      en: (kmh) => `💨 ${kmh} km/h`,
      sample: ['24'],
    },
    windFrom: {
      fr: (point) => ` de secteur ${point}`,
      en: (point) => ` from the ${point}`,
      sample: ['WSW'],
      note: 'French says “de secteur OSO”, never “de OSO”: five of the sixteen '
        + 'points start with a vowel sound and would need an elision the other '
        + 'eleven must not have. English has no such problem.',
    },
    gust: {
      fr: (kmh) => `, rafale ${kmh} km/h`,
      en: (kmh) => `, gusting ${kmh} km/h`,
      sample: ['58'],
    },
    rain: {
      fr: (mm) => `🌧 ${mm} mm sur la dernière heure`,
      en: (mm) => `🌧 ${mm} mm in the last hour`,
      sample: ['1.4'],
    },
    noRain: {
      fr: '🌧 pas de pluie sur la dernière heure',
      en: '🌧 no rain in the last hour',
      note: 'A measured zero, which is a reading and not a missing field.',
    },
    snow: {
      fr: (cm) => `❄ ${cm} cm de neige au sol`,
      en: (cm) => `❄ ${cm} cm of snow on the ground`,
      sample: ['12'],
    },
    visibility: {
      fr: (km) => `👁 visibilité ${km} km`,
      en: (km) => `👁 visibility ${km} km`,
      sample: ['8.5'],
    },
  },

  /** The records line, from the station's climate summary sheet. */
  records: {
    line: {
      fr: (high, highYear, low, lowYear) => `📈 record ${high} °C en ${highYear}`
        + ` · ${low} °C en ${lowYear}`,
      en: (high, highYear, low, lowYear) => `📈 record ${high} °C in ${highYear}`
        + ` · ${low} °C in ${lowYear}`,
      sample: ['42.4', '2019', '-19.2', '1985'],
    },
    over: {
      fr: (period) => ` — records établis sur ${period}`,
      en: (period) => ` — records set over ${period}`,
      sample: ['01-01-1947 → 31-12-2025'],
      note: 'Never dropped: 42.4 °C at a station open since 1947 is a '
        + 'different claim from 39.2 °C at one open since 2004.',
    },
  },

  /** The card for one station. */
  card: {
    closed: {
      fr: (day) => `⚠ station FERMÉE le ${day} — toujours présente `
        + 'dans la liste temps réel de Météo-France',
      en: (day) => `⚠ station CLOSED on ${day} — still present `
        + 'in Météo-France’s real-time list',
      sample: ['31/12/2019'],
    },
    noInventory: {
      fr: '⊘ inventaire non publié — cette station est absente des métadonnées Météo-France',
      en: '⊘ inventory not published — this station is absent from Météo-France’s metadata',
    },
    measures: {
      fr: (list) => `◈ mesure ${list}`,
      en: (list) => `◈ measures ${list}`,
      sample: ['temperature, precipitation, wind at 10 m'],
    },
    doesNotMeasure: {
      fr: (list) => `⊘ ne mesure pas ${list}`,
      en: (list) => `⊘ does not measure ${list}`,
      sample: ['pressure, humidity'],
    },
    measuresNothing: {
      fr: '⊘ aucun paramètre en cours de mesure au dernier inventaire publié',
      en: '⊘ no parameter currently measured in the last published inventory',
    },
    readingUnavailable: {
      fr: '🌡 relevé public indisponible pour l’instant',
      en: '🌡 public reading unavailable right now',
    },
    readingLoading: {
      fr: '🌡 relevé en cours de chargement…',
      en: '🌡 reading loading…',
    },
    behindKey: {
      fr: '🔒 relevés non publiés en accès libre — API Météo-France sur clé',
      en: '🔒 readings not published openly — Météo-France API, key required',
      note: 'NOT “no data”: the station is measuring and the reading exists '
        + 'behind a credential. The difference between a gap and a paywall.',
    },
    ficheLoading: {
      fr: '📈 fiche climatologique en cours de chargement…',
      en: '📈 climate summary sheet loading…',
    },
    locality: {
      fr: (place) => `lieu-dit ${place}`,
      en: (place) => `locality ${place}`,
      sample: ['Les Aubrais'],
      keep: ['Les Aubrais'],
    },
    where: {
      fr: (place) => `📍 ${place}`,
      en: (place) => `📍 ${place}`,
      sample: ['Bassussarry (64)'],
    },
    opened: {
      fr: (day) => `🕐 ouverte depuis le ${day}`,
      en: (day) => `🕐 open since ${day}`,
      sample: ['01/01/1947'],
    },
    pack: {
      fr: (label, blurb) => `▣ pack ${label} — ${blurb}`,
      en: (label, blurb) => `▣ pack ${label} — ${blurb}`,
      sample: ['RADOME', 'reference network, quality-checked at D+1'],
    },
    posteType: {
      fr: (type) => `▸ ${type}`,
      en: (type) => `▸ ${type}`,
      sample: ['synoptic station, real time, quality-checked at D+1'],
    },
    ids: {
      fr: (omm, id) => `# indicatif OMM ${omm} · poste ${id}`,
      en: (omm, id) => `# WMO number ${omm} · station ${id}`,
      sample: ['07510', '33281001'],
      note: 'OMM is the WMO in French. Both are the organization’s own '
        + 'acronym in that language.',
    },
    idsNotInSynop: {
      fr: (omm, id) => `# indicatif OMM ${omm} (non publié en SYNOP) · poste ${id}`,
      en: (omm, id) => `# WMO number ${omm} (not published in SYNOP) · station ${id}`,
      sample: ['07510', '33281001'],
    },
    idOnly: {
      fr: (id) => `# poste ${id}`,
      en: (id) => `# station ${id}`,
      sample: ['33281001'],
    },
  },

  /** The two conditional rows of the key. */
  legend: {
    ring: { fr: 'Anneau = relevés publics', en: 'Ring = public readings' },
    ringBlurb: {
      fr: 'Observation lisible sans clé. Météo-France en liste 62 ; '
        + 'son archive en contient 190, et la couche compte l’archive.',
      en: 'Observation readable with no key. Météo-France lists 62 of them; '
        + 'its archive holds 190, and this layer counts the archive.',
    },
    closed: { fr: 'Disque creux = station fermée', en: 'Hollow disc = closed station' },
    closedBlurb: {
      fr: 'Fermée selon les métadonnées Météo-France, toujours listée dans '
        + 'son réseau temps réel. Conservée et signalée, jamais supprimée en silence.',
      en: 'Closed according to Météo-France’s metadata, still listed in its '
        + 'real-time network. Kept and flagged, never removed in silence.',
    },
  },

  /** The registry could not be read. */
  errors: {
    http: {
      fr: (status) => `Réseau stations HTTP ${status}`,
      en: (status) => `Station network HTTP ${status}`,
      sample: [503],
    },
    malformed: { fr: 'Réseau stations malformé', en: 'Station network malformed' },
    unreadable: { fr: 'Réseau stations illisible', en: 'Station network unreadable' },
  },

  /** Why a station France measures is not on the map. */
  withheldReason: {
    fr: 'relevés non publiés en accès libre — API Météo-France sur clé',
    en: 'readings not published openly — Météo-France API, key required',
  },
});
