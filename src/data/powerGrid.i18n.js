/**
 * Strings of src/data/powerGrid.js — the card a clicked line, pylon or
 * substation opens, the row's own sentence, and the key.
 *
 * THIS LAYER IS HALF-INHERITED AND THE CATALOG SHOWS IT. The card was written
 * in English upstream and has been printing English on the French globe ever
 * since. A translation batch may not change what a French reader sees, so
 * every `fr` in the card is exactly the bytes it printed before — English where
 * it was English — and the `en` is the English it should read. The KEY is the
 * exception: it was rewritten in plain words on 2026-09-21 (`plainLegend`), and
 * a French reader now gets French there.
 *
 * Operator names, route names, substation names and OpenStreetMap tag values
 * are data and stay as mapped.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The card of a line, a cable, a pylon or a yard. */
  card: {
    lineTitle: {
      fr: (kv) => `${kv} line`,
      en: (kv) => `${kv} line`,
      note: 'Used only when OpenStreetMap maps no route name.',
      sample: ['225 kV'],
    },
    cableTitle: {
      fr: (kv) => `${kv} cable`,
      en: (kv) => `${kv} cable`,
      sample: ['225 kV'],
    },
    voltage: {
      fr: (kv, mapped) => `⚡ ${kv}${mapped}`,
      en: (kv, mapped) => `⚡ ${kv}${mapped}`,
      sample: ['225 kV', ' · mapped as 225000;90000'],
    },
    voltageMapped: {
      fr: (raw) => ` · mapped as ${raw}`,
      en: (raw) => ` · mapped as ${raw}`,
      note: 'The raw OSM tag, when it holds several voltages.',
      sample: ['225000;90000'],
    },
    circuits: {
      fr: (count) => `⌇ ${count} circuits mapped`,
      en: (count) => `⌇ ${count} circuits mapped`,
      sample: [2],
    },
    underground: {
      fr: '⌄ Underground cable — no pylons on this route',
      en: '⌄ Underground cable — no pylons on this route',
    },
    overhead: {
      fr: '⌃ Overhead line — drawn on the ground, not at conductor height',
      en: '⌃ Overhead line — drawn on the ground, not at conductor height',
    },
    length: {
      fr: (km) => `↔ ${km} of this mapped way`,
      en: (km) => `↔ ${km} of this mapped way`,
      sample: ['12.4 km'],
    },
    simplified: {
      fr: (metres, ceiling) => `〰 Tracé national simplifié à ${metres} m — zoome sous ${ceiling} km pour le tracé exact`,
      en: (metres, ceiling) => `〰 National route simplified to ${metres} m — zoom below ${ceiling} km for the exact one`,
      note: 'Said on the card because the length above is the mapped way’s, not the drawn one’s.',
      sample: ['50', '120'],
    },
    pylonPositionTitle: { fr: 'Pylon position', en: 'Pylon position' },
    pylonRoute: {
      fr: (kv) => `⚡ ${kv} overhead route`,
      en: (kv) => `⚡ ${kv} overhead route`,
      sample: ['400 kV'],
    },
    pylonUntaggedA: {
      fr: '△ Vertex of the mapped way — a pylon stands on it, and',
      en: '△ Vertex of the mapped way — a pylon stands on it, and',
      note: 'Two lines: the card refuses to claim a pylon record it does not have.',
    },
    pylonUntaggedB: {
      fr: '   OpenStreetMap has not tagged this one',
      en: '   OpenStreetMap has not tagged this one',
    },
    portalTitle: { fr: 'Portal', en: 'Portal' },
    pylonTitle: { fr: 'Pylon', en: 'Pylon' },
    height: {
      fr: (metres) => `↕ ${metres} m tall`,
      en: (metres) => `↕ ${metres} m tall`,
      sample: ['45'],
    },
    heightUnmapped: { fr: '↕ height not mapped', en: '↕ height not mapped' },
    substationTitle: {
      fr: (ref) => `Substation ${ref}`,
      en: (ref) => `Substation ${ref}`,
      sample: ['VERGER'],
    },
    substationFallbackTitle: { fr: 'Substation', en: 'Substation' },
    yardCentre: {
      fr: 'Position is the mapped yard’s centre',
      en: 'Position is the mapped yard’s center',
      note: 'US spelling in English; the French copy is the inherited English.',
    },
  },

  /** The ambient label on a yard with no mapped name. */
  substationFallbackLabel: {
    fr: (ref) => `Poste ${ref}`,
    en: (ref) => `Substation ${ref}`,
    note: 'Trimmed when OSM maps neither a name nor a ref.',
    sample: ['VERGER'],
  },

  /** The row's sentence, in every state it can be in. */
  row: {
    refining: {
      fr: 'affinage du tracé exact pour cette vue…',
      en: 'refining the exact route for this view…',
    },
    loading: {
      fr: 'loading the mapped grid for this view...',
      en: 'loading the mapped grid for this view...',
    },
    localUnavailable: {
      fr: ' · détail local indisponible, tracé national affiché',
      en: ' · local detail unavailable, showing the national route',
    },
    zoomIn: {
      fr: (ceiling) => `Zoome sous ${ceiling} km pour charger le réseau cartographié`,
      en: (ceiling) => `Zoom below ${ceiling} km to load the mapped grid`,
      sample: ['120'],
    },
    unavailable: { fr: 'unavailable', en: 'unavailable' },
    empty: {
      fr: 'nothing high-voltage mapped in this view',
      en: 'nothing high-voltage mapped in this view',
    },
    mappedRoute: {
      fr: (km) => `${km} of mapped route`,
      en: (km) => `${km} of mapped route`,
      sample: ['1,240 km'],
    },
    substations: {
      fr: (count) => `${count} substations`,
      en: (count) => `${count} substations`,
      sample: [42],
    },
    pylons: {
      fr: (count) => `${count} pylons`,
      en: (count) => `${count} pylons`,
      sample: [318],
    },
    truncated: {
      fr: (what) => `${what} truncated — zoom in`,
      en: (what) => `${what} truncated — zoom in`,
      sample: ['lines + towers'],
    },
    cached: { fr: 'serving cached geometry', en: 'serving cached geometry' },
    refreshFailed: {
      fr: 'refresh failed, showing the last answer',
      en: 'refresh failed, showing the last answer',
    },
    heldView: {
      fr: 'grid held from the last framed view',
      en: 'grid held from the last framed view',
    },
    nationalZoomIn: {
      fr: (ceiling) => `Réseau national : France seulement. Ailleurs, zoome sous ${ceiling} km`,
      en: (ceiling) => `National grid: France only. Anywhere else, zoom below ${ceiling} km`,
      sample: ['120'],
    },
    nationalBackbone: {
      fr: (km) => `Réseau national · ${km} de lignes 400 et 225 kV`,
      en: (km) => `National grid · ${km} of 400 and 225 kV lines`,
      sample: ['48,200 km'],
    },
    nationalBackboneMore: {
      fr: 'le 63/90 kV apparaît sous 600 km',
      en: '63/90 kV appears below 600 km',
    },
    nationalAll: {
      fr: (km) => `Réseau national · ${km} de lignes haute tension`,
      en: (km) => `National grid · ${km} of high-voltage lines`,
      sample: ['98,300 km'],
    },
    nationalAllMore: {
      fr: (ceiling) => `pylônes et postes nommés sous ${ceiling} km`,
      en: (ceiling) => `pylons and named substations below ${ceiling} km`,
      sample: ['120'],
    },
  },

  /**
   * The key, in plain words (2026-09-21): one line per voltage band, one short
   * sentence under it, no counts. The key is read by anyone who opens the
   * scene, not by grid engineers; kilometres, yard counts and the drawing's
   * caveats are on the cards, one click away.
   *
   * The LABEL names the band in words and the sentence gives the French
   * voltage: the band thresholds are generic (`POWER_GRID_TIERS`), so abroad
   * the words stay true where a French number would not.
   */
  plainLegend: {
    tiers: {
      ehv: {
        label: { fr: 'Très haute tension', en: 'Extra-high voltage' },
        blurb: {
          fr: '400 kV en France : les grands axes, d’une région à l’autre.',
          en: '400 kV in France: the long-distance backbone, region to region.',
        },
      },
      'hv-high': {
        label: { fr: 'Haute tension', en: 'High voltage' },
        blurb: {
          fr: '225 kV : alimente les grandes villes et l’industrie.',
          en: '225 kV: feeds large cities and industry.',
        },
      },
      'hv-mid': {
        label: { fr: 'Haute tension (rare)', en: 'High voltage (rare)' },
        blurb: {
          fr: '150 kV : quelques lignes seulement en France.',
          en: '150 kV: only a few lines in France.',
        },
      },
      'hv-low': {
        label: { fr: 'Lignes régionales', en: 'Regional lines' },
        blurb: {
          fr: '63 et 90 kV : le dernier relais avant le réseau de quartier.',
          en: '63 and 90 kV: the last step before the neighbourhood network.',
        },
      },
    },
    dashed: {
      fr: 'Pointillés : ligne enterrée.',
      en: 'Dashed: underground line.',
    },
    allUnderground: {
      fr: 'Ici, les lignes sont enterrées : il n’y a pas de pylône.',
      en: 'Here the lines run underground: there are no pylons.',
    },
    source: {
      fr: (day) => `Source : OpenStreetMap${day ? ` (${day})` : ''}.`,
      en: (day) => `Source: OpenStreetMap${day ? ` (${day})` : ''}.`,
      note: 'The OSM base date, as the national pack records it (ISO, not localized).',
      sample: ['2026-09-19'],
    },
    zoom: {
      fr: 'Zoomez pour le tracé exact et les postes.',
      en: 'Zoom in for the exact routes and the substations.',
    },
  },
});
