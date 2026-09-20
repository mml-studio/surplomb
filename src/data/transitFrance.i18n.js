/**
 * Strings of `src/data/transitFrance.js` — live French ground transit.
 * See docs/i18n/CONVENTIONS.md.
 *
 * ── THIS CARD SHIPS IN ENGLISH, IN BOTH LANGUAGES ───────────────────────────
 *
 * The layer came from the upstream project and its card was never translated:
 * a French reader sees `LINE 7 · Gare`, `no heading published`, `⏱ fix 12s
 * ago` today. Translating them here would change what a French reader sees,
 * which this wave does not do — French output stays byte-identical. So `fr`
 * repeats the shipped English word for word and `en` carries it forward,
 * which is what puts the whole surface in one place for whoever writes the
 * French next. Only one string in this module was actually French, the zoom
 * prompt, and it is translated properly below.
 *
 * The GTFS-RT enumerations (`stopStatus`, `occupancy`) are looked up by their
 * wire value with `labelFor()`: a value this build has never met prints as
 * itself rather than vanishing from the card.
 */
import { defineMessages } from '../i18n/messages.js';

/** GTFS-RT `currentStatus`, keyed by the wire value. */
export const TRANSIT_STOP_STATUS = defineMessages({
  'in-transit': { fr: 'in transit', en: 'in transit' },
  incoming: { fr: 'arriving', en: 'arriving' },
  stopped: { fr: 'at stop', en: 'at stop' },
});

/** GTFS-RT `occupancyStatus`, keyed by the wire value. */
export const TRANSIT_OCCUPANCY = defineMessages({
  empty: { fr: 'empty', en: 'empty' },
  'many-seats': { fr: 'many seats', en: 'many seats' },
  'few-seats': { fr: 'few seats', en: 'few seats' },
  'standing-room': { fr: 'standing room', en: 'standing room' },
  crushed: { fr: 'crush load', en: 'crush load' },
  full: { fr: 'full', en: 'full' },
  'not-accepting': { fr: 'not boarding', en: 'not boarding' },
});

export default defineMessages({
  kind: {
    unknown: {
      fr: 'Type unknown',
      en: 'Type unknown',
      note: 'The static join did not resolve this vehicle\'s route_id. Ships in English on the French globe.',
    },
    uniform: {
      fr: 'single-mode network',
      en: 'single-mode network',
      note: 'Every route this network publishes is one class, so the class holds without the join.',
    },
    fallbackMode: { fr: 'Transit', en: 'Transit', note: 'Service mode when the PAN catalog declares none.' },
  },

  card: {
    line: {
      fr: (shortName) => `LINE ${shortName}`,
      en: (shortName) => `LINE ${shortName}`,
      note: 'The public line number, what is written on the front of the bus. Data.',
      sample: ['7'],
    },
    lineUnknown: { fr: 'LINE —', en: 'LINE —' },
    titleWithHeadsign: {
      fr: (line, headsign) => `${line} · ${headsign}`,
      en: (line, headsign) => `${line} · ${headsign}`,
      note: 'The headsign is the operator\'s own destination text: data.',
      keep: ['Gare'],
      sample: ['LINE 7', 'Gare Saint-Jean'],
    },
    network: {
      fr: (network) => `🚍 ${network}`,
      en: (network) => `🚍 ${network}`,
      sample: ['TBM'],
    },
    speed: {
      fr: (kph) => `${kph} km/h`,
      en: (kph) => `${kph} km/h`,
      sample: ['32'],
    },
    bearing: {
      fr: (degrees) => `${degrees}°`,
      en: (degrees) => `${degrees}°`,
      sample: ['184'],
    },
    noHeading: {
      fr: 'no heading published',
      en: 'no heading published',
      note: '16% of the national fleet publishes no bearing; a missing value is never printed as 0°.',
    },
    occupancy: {
      fr: (level) => `👥 ${level}`,
      en: (level) => `👥 ${level}`,
      sample: ['few seats'],
    },
    fixSeconds: {
      fr: (seconds) => `⏱ fix ${seconds}s ago`,
      en: (seconds) => `⏱ fix ${seconds}s ago`,
      note: 'Age of the newest position the operator published, not of the glyph on screen.',
      sample: [12],
    },
    fixMinutes: {
      fr: (minutes) => `⏱ fix ${minutes}m ago`,
      en: (minutes) => `⏱ fix ${minutes}m ago`,
      sample: [4],
    },
    kindWithQualifier: {
      fr: (kind, qualifier) => `${kind} (${qualifier})`,
      en: (kind, qualifier) => `${kind} (${qualifier})`,
      sample: ['Bus', 'single-mode network'],
    },
  },

  legend: {
    joined: {
      fr: 'Vehicle class joined from the network\'s static GTFS route_type.',
      en: 'Vehicle class joined from the network\'s static GTFS route_type.',
    },
    declared: {
      fr: 'This network publishes no route_id the static feed resolves, so only '
        + 'its declared SERVICE class is known — not what the vehicle is.',
      en: 'This network publishes no route_id the static feed resolves, so only '
        + 'its declared SERVICE class is known — not what the vehicle is.',
    },
  },

  row: {
    zoomIn: {
      fr: 'Zoome pour charger les transports en direct',
      en: 'Zoom in to load live transit',
      note: 'The one genuinely French string of this module: a viewport gate, in the tutoiement the gated layers use.',
    },
    refreshing: { fr: 'refreshing networks...', en: 'refreshing networks...' },
    resolving: { fr: 'resolving networks...', en: 'resolving networks...' },
    noVehicles: {
      fr: 'no vehicles reporting here',
      en: 'no vehicles reporting here',
      note: 'Feeds matched and reported nothing: the buses are parked, the network exists.',
    },
    noFeed: {
      fr: 'no PAN feed covers this view',
      en: 'no PAN feed covers this view',
      note: 'Nobody publishes positions here. PAN = transport.data.gouv.fr, the national access point.',
    },
    networks: {
      fr: (count) => `${count} network${count === 1 ? '' : 's'}`,
      en: (count) => `${count} network${count === 1 ? '' : 's'}`,
      sample: [3],
    },
    placing: { fr: 'placing on the ground', en: 'placing on the ground' },
    late: {
      fr: (count) => `${count} late`,
      en: (count) => `${count} late`,
      note: 'Only shown when a network in view published deviations at all.',
      sample: [12],
    },
    cancelled: {
      fr: (count) => `${count} cancelled`,
      en: (count) => `${count} cancelled`,
      sample: [2],
    },
    skipping: {
      fr: (count) => `${count} skipping stops`,
      en: (count) => `${count} skipping stops`,
      sample: [16],
    },
    projected: {
      fr: (count) => `${count} projected`,
      en: (count) => `${count} projected`,
      note: 'Drawn along their run rather than at the position they reported.',
      sample: [24],
    },
    inRange: {
      fr: (count) => `${count} in range`,
      en: (count) => `${count} in range`,
      sample: [8],
    },
    capped: { fr: 'capped', en: 'capped' },
    stale: {
      fr: (count) => `${count} stale`,
      en: (count) => `${count} stale`,
      sample: [1],
    },
  },

  errors: {
    missingIndex: { fr: 'feed index missing', en: 'feed index missing' },
    unavailable: { fr: 'transit feed unavailable', en: 'transit feed unavailable' },
  },
});
