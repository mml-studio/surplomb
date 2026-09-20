/**
 * Strings of `src/data/meteoStationsFrFeed.js` — the weather-station registry.
 *
 * ── WHAT THE SERVER TAKES FROM THIS MODULE, AND IT IS NOT THE WORDS ─────────
 *
 * `vite.config.js` imports `createSynopReducer` and `parseFicheClim` only —
 * the two parsers — so every table below is read in a browser, at draw time,
 * and this is an ordinary catalog. The French anchors those parsers match on
 * (`TEMPERATURE SOUS ABRI HORAIRE`, `La température la plus élevée`) stay
 * exactly as Météo-France writes them: they are keys into a file, not words.
 *
 * ── THE INSTRUMENT LIST IS THE LAYER'S WHOLE ARGUMENT ───────────────────────
 *
 * A reader who clicks a dot expecting a thermometer and a barometer should
 * learn within one line which of the two is actually there. So the fourteen
 * families and the seven classes are worded for somebody who has never read a
 * `POSTES_MF.csv`: the class says what the station can answer, the family
 * names the instrument, and neither is left as an acronym.
 *
 * `D+1` is `J+1`: the glossary fixes `J-2 → D-2`, and *expertisé* is
 * *quality-checked* — the reading exists in real time and is reviewed the
 * next day, which is a different claim from “verified”.
 */
import { defineMessages } from '../i18n/messages.js';

/** The two publication packs the real-time list distinguishes. */
export const STATION_PACK_WORDS = defineMessages({
  RADOME: {
    label: {
      fr: 'RADOME',
      en: 'RADOME',
      note: 'The network’s own name. Not translated, in either direction.',
    },
    blurb: {
      fr: 'réseau de référence, expertisé à J+1',
      en: 'reference network, quality-checked at D+1',
    },
  },
  ETENDU: {
    label: { fr: 'Étendu', en: 'Extended' },
    blurb: {
      fr: 'réseau complémentaire temps réel',
      en: 'complementary real-time network',
    },
  },
});

/**
 * Météo-France's own station typology, keyed by the code it publishes.
 *
 * The French is verbatim from `POSTES_descriptif_champs`; the English says
 * the same thing for a reader who will never open that file.
 */
export const POSTE_TYPE_WORDS = defineMessages({
  0: {
    fr: 'station synoptique, temps réel, expertisée à J+1',
    en: 'synoptic station, real time, quality-checked at D+1',
  },
  1: {
    fr: 'station automatique Radome-Resome, temps réel, expertisée à J+1',
    en: 'automatic Radome-Resome station, real time, quality-checked at D+1',
    keep: ['Radome-Resome'],
  },
  2: {
    fr: 'station automatique hors Radome-Resome, temps réel, expertisée à J+1',
    en: 'automatic station outside Radome-Resome, real time, quality-checked at D+1',
    keep: ['Radome-Resome'],
  },
  3: {
    fr: 'station automatique, temps réel, expertisée en temps différé',
    en: 'automatic station, real time, quality-checked in deferred time',
  },
  4: {
    fr: 'poste climatologique manuel ou automatique, acquisition en temps différé',
    en: 'manual or automatic climatological station, deferred-time acquisition',
  },
});

/**
 * The fourteen instrument families, keyed by family key.
 *
 * `short` is NOT here: `T`, `RR`, `FF`, `NEIG` are Météo-France's own field
 * codes and mean the same thing in both languages.
 */
export const INSTRUMENT_FAMILY_WORDS = defineMessages({
  temp: {
    label: { fr: 'température', en: 'temperature' },
    blurb: {
      fr: 'thermomètre sous abri',
      en: 'thermometer in a screen',
      note: '“Sous abri” is the Stevenson screen: the reading is in the shade, '
        + 'which is what makes it comparable between stations.',
    },
  },
  rain: {
    label: { fr: 'précipitations', en: 'precipitation' },
    blurb: { fr: 'pluviomètre', en: 'rain gauge' },
  },
  humidity: {
    label: { fr: 'humidité', en: 'humidity' },
    blurb: { fr: 'hygromètre', en: 'hygrometer' },
  },
  wind: {
    label: { fr: 'vent à 10 m', en: 'wind at 10 m' },
    blurb: { fr: 'anémomètre à 10 m', en: 'anemometer at 10 m' },
  },
  snow: {
    label: { fr: 'neige au sol', en: 'snow on the ground' },
    blurb: { fr: 'hauteur de neige totale', en: 'total snow depth' },
  },
  radiation: {
    label: { fr: 'rayonnement global', en: 'global radiation' },
    blurb: { fr: 'pyranomètre', en: 'pyranometer' },
  },
  pressure: {
    label: { fr: 'pression', en: 'pressure' },
    blurb: { fr: 'baromètre', en: 'barometer' },
  },
  sunshine: {
    label: { fr: 'insolation', en: 'sunshine duration' },
    blurb: { fr: 'héliographe', en: 'sunshine recorder' },
  },
  visibility: {
    label: { fr: 'visibilité', en: 'visibility' },
    blurb: { fr: 'visibilimètre', en: 'visibility meter' },
  },
  weather: {
    label: { fr: 'temps présent', en: 'present weather' },
    blurb: { fr: 'capteur de temps présent', en: 'present-weather sensor' },
  },
  cloud: {
    label: { fr: 'nébulosité', en: 'cloud cover' },
    blurb: { fr: 'célomètre', en: 'ceilometer' },
  },
  road: {
    label: { fr: 'température de chaussée', en: 'road surface temperature' },
    blurb: {
      fr: 'sonde de chaussée — station routière',
      en: 'road sensor — roadside station',
    },
  },
  soil: {
    label: { fr: 'température du sol', en: 'soil temperature' },
    blurb: { fr: 'sondes enterrées', en: 'buried probes' },
  },
  sea: {
    label: { fr: 'état de la mer', en: 'sea state' },
    blurb: { fr: 'observation de l’état de la mer', en: 'sea-state observation' },
  },
});

/**
 * The sixteen compass points, clockwise from north.
 *
 * Not the same letters in the two languages: west is `O` for *ouest* in
 * French, `W` in English, so nine of the sixteen change. The card says which
 * way the wind blows FROM, and a reader who decodes `O` as “east” has been
 * told the opposite of the truth.
 */
export const COMPASS_POINTS = defineMessages({
  points: {
    fr: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'],
    en: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'],
  },
});

/**
 * What a station can answer, as the layer's palette, keyed by class key.
 *
 * `unknown` is not a seventh grade of instrument: it is the six stations that
 * appear in the real-time list and in NO metadata file, so nothing is known
 * about what they measure. Both languages say that, and neither says “empty”.
 */
export const STATION_CLASS_WORDS = defineMessages({
  synoptic: {
    label: { fr: 'Synoptique complète', en: 'Full synoptic' },
    blurb: {
      fr: 'température, pluie, vent, humidité et pression',
      en: 'temperature, rain, wind, humidity and pressure',
    },
  },
  wind: {
    label: { fr: 'Automatique avec vent', en: 'Automatic with wind' },
    blurb: {
      fr: 'température, pluie et vent — pas de pression',
      en: 'temperature, rain and wind — no pressure',
    },
  },
  'temp-rain': {
    label: { fr: 'Température et pluie', en: 'Temperature and rain' },
    blurb: {
      fr: 'ne mesure ni le vent ni la pression',
      en: 'measures neither wind nor pressure',
    },
  },
  thermo: {
    label: { fr: 'Température seule', en: 'Temperature only' },
    blurb: { fr: 'thermomètre sans pluviomètre', en: 'thermometer with no rain gauge' },
  },
  rain: {
    label: { fr: 'Pluviomètre', en: 'Rain gauge' },
    blurb: { fr: 'la pluie et rien d’autre', en: 'rainfall and nothing else' },
  },
  other: {
    label: { fr: 'Autres capteurs', en: 'Other sensors' },
    blurb: {
      fr: 'ni température ni pluie — capteurs spécialisés',
      en: 'neither temperature nor rain — specialized sensors',
    },
  },
  unknown: {
    label: { fr: 'Inventaire non publié', en: 'Inventory not published' },
    blurb: {
      fr: 'station listée en temps réel, absente des métadonnées',
      en: 'station listed in real time, absent from the metadata',
    },
  },
});

/**
 * No default export: every table in this file is named, because the module
 * next door reads them one at a time to build its own frozen records. The
 * parity test wants a default all the same, so the four are re-exported as
 * one catalog rather than left unchecked.
 */
export default defineMessages({
  compass: COMPASS_POINTS.definition,
  packs: STATION_PACK_WORDS.definition,
  posteTypes: POSTE_TYPE_WORDS.definition,
  families: INSTRUMENT_FAMILY_WORDS.definition,
  classes: STATION_CLASS_WORDS.definition,
});
