/**
 * Strings of src/data/powerGrid.js — the card a clicked line, pylon or
 * substation opens, the row's own sentence, and the two keys (the viewport
 * answer's and the pre-built national pack's).
 *
 * THIS LAYER IS HALF-INHERITED AND THE CATALOG SHOWS IT. The card and the
 * viewport key were written in English upstream and have been printing
 * English on the French globe ever since; the national pack, added by this
 * fork, is French. A translation batch may not change what a French reader
 * sees, so every `fr` below is exactly the bytes that row printed before —
 * English where it was English — and the `en` is the English it should read.
 * The rows whose French is still English are listed in the pull request as a
 * defect of their own.
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

  /** The key of the pre-built national pack. */
  nationalLegend: {
    mappedInFrance: {
      fr: (km) => `${km} cartographiés en France`,
      en: (km) => `${km} mapped in France`,
      sample: ['48,200 km'],
    },
    underground: {
      fr: (km) => `dont ${km} en souterrain, en tirets`,
      en: (km) => `of which ${km} underground, drawn dashed`,
      sample: ['1,900 km'],
    },
    substations: {
      fr: (count) => `${count} postes`,
      en: (count) => `${count} substations`,
      sample: [239],
    },
    blurb: {
      fr: (parts) => `${parts}. Tracé au sol : la route cartographiée, pas la hauteur des câbles.`,
      en: (parts) => `${parts}. Drawn on the ground: the mapped route, not the height of the cables.`,
      sample: ['The backbone: the 400 kV grid RTE runs the country on · 48,200 km mapped in France'],
    },
    noteBase: {
      fr: (state, metres) => `Réseau national OpenStreetMap${state}, simplifié à ${metres} m près.`,
      en: (state, metres) => `National OpenStreetMap grid${state}, simplified to within ${metres} m.`,
      sample: [' (as of 2026-07-12)', '50'],
    },
    noteState: {
      fr: (day, age) => ` (état du ${day}${age})`,
      en: (day, age) => ` (as of ${day}${age})`,
      note: 'The OSM base date, as the pack records it (ISO, not localized).',
      sample: ['2026-07-12', ', 94 days'],
    },
    noteAge: {
      fr: (days) => `, ${days} jours`,
      en: (days) => `, ${days} days`,
      note: 'Only shown past 60 days, where the age is worth a reader’s attention.',
      sample: ['94'],
    },
    noteZoom: {
      fr: (ceiling) => `Sous ${ceiling} km, la vue charge le tracé exact, les postes nommés et les pylônes.`,
      en: (ceiling) => `Below ${ceiling} km, the view loads the exact route, the named substations and the pylons.`,
      sample: ['120'],
    },
  },

  /**
   * The line under the key that says what a pylon glyph means: how often one
   * is drawn, and that it stands on a surveyed node. Inherited English.
   */
  pylonNote: {
    spacing: {
      fr: (spacing) => `Pylons: one drawn per ${spacing} of mapped overhead route, `
        + 'thinning as you climb and walking back down to every mapped vertex as you descend.',
      en: (spacing) => `Pylons: one drawn per ${spacing} of mapped overhead route, `
        + 'thinning as you climb and walking back down to every mapped vertex as you descend.',
      sample: ['1.2 km'],
    },
    surveyed: {
      fr: 'Each one stands on a node OpenStreetMap has surveyed — never interpolated between two.',
      en: 'Each one stands on a node OpenStreetMap has surveyed — never interpolated between two.',
    },
    records: {
      fr: (count) => `${count} of the nodes in view also carry a pylon record `
        + '(reference, design, height where it was measured); click one to read it.',
      en: (count) => `${count} of the nodes in view also carry a pylon record `
        + '(reference, design, height where it was measured); click one to read it.',
      sample: [318],
    },
    allUnderground: {
      fr: (percent) => 'No pylons here, and none are missing: '
        + `${percent} of the mapped grid in this view runs `
        + 'UNDERGROUND, which is how a dense city is fed. A cable has no pylons, '
        + 'and the dashed strokes are the cable.',
      en: (percent) => 'No pylons here, and none are missing: '
        + `${percent} of the mapped grid in this view runs `
        + 'UNDERGROUND, which is how a dense city is fed. A cable has no pylons, '
        + 'and the dashed strokes are the cable.',
      note: 'An absence with a reason is information; an absence on its own reads as a bug.',
      sample: ['100%'],
    },
  },

  /** The key of the viewport answer — inherited English, see the header. */
  legend: {
    inView: {
      fr: (km) => `${km} of mapped route in view`,
      en: (km) => `${km} of mapped route in view`,
      sample: ['1,240 km'],
    },
    underground: {
      fr: (km) => `${km} of it underground, drawn dashed`,
      en: (km) => `${km} of it underground, drawn dashed`,
      sample: ['86 km'],
    },
    substations: {
      fr: (count) => `${count} substations`,
      en: (count) => `${count} substations`,
      sample: [42],
    },
    blurb: {
      fr: (parts) => `${parts}. Routes are drawn on the ground — the mapped route, `
        + 'not the conductor height, which OpenStreetMap does not publish.',
      en: (parts) => `${parts}. Routes are drawn on the ground — the mapped route, `
        + 'not the conductor height, which OpenStreetMap does not publish.',
      sample: ['The backbone. In France this is the 400 kV grid RTE runs the country on'],
    },
  },
});
