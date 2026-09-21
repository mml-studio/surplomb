/**
 * @file The card a clicked stretch of the TomTom ribbon opens — pure, so every
 * line can be pinned without a GL context.
 *
 * WHY A CARD ON THE ROAD, NOT ON A CAR. The dots are simulated; what is
 * measured is the road they drive on. So the information attaches to the
 * stretch TomTom published: its rung, the ratio that earned it, and when it
 * was received from TomTom. A frame with `VEH-0412` over a dot used to be the only thing a
 * reader could inspect, and it described nothing real.
 *
 * WHAT IT DOES NOT SAY. TomTom's relative flow tiles carry a ratio to the
 * road's free-flow speed and no km/h, so the card prints no speed rather than
 * inventing one from a limit sign. Nor does it name the street: the tile has
 * no name, and guessing one from the nearest OSM way would put a boulevard's
 * name on the side street that crosses it.
 *
 * @module data/trafficFlowCard
 */

import { CONGESTION_RUNGS } from './congestionLadder.js';
import { flowBucket } from './trafficFlowStyle.js';
import { formatDate, formatTime } from '../i18n/format.js';
import messages from './traffic.i18n.js';

/** Colour of a closed stretch — the ribbon's own closure red. */
export const FLOW_CARD_CLOSURE_COLOR = '#ff3b30';

/**
 * Identity of a flow segment that survives a re-decode.
 *
 * The ribbon is rebuilt on every refresh from freshly decoded tiles, so the
 * objects — and the instance ids — change under an open card. The geometry
 * does not: TomTom cuts a road at the same vertices tile after tile.
 *
 * @param {{coords?:number[][], roadType?:string}} segment
 * @returns {?string}
 */
export function flowSegmentKey(segment) {
  const coords = segment?.coords;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const fmt = (point) => `${Number(point?.[0]).toFixed(6)},${Number(point?.[1]).toFixed(6)}`;
  return `${segment.roadType || ''}|${coords.length}|${fmt(first)}|${fmt(last)}`;
}

/**
 * The point halfway ALONG a polyline, in degrees — where its card is anchored.
 *
 * Halfway along rather than the mean of the vertices: a stretch that bends
 * round a corner has its vertex mean off the road.
 *
 * @param {number[][]} coords - [[lon, lat], …]
 * @returns {?{lon:number, lat:number}}
 */
export function flowSegmentMidpoint(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  if (coords.length === 1) return { lon: coords[0][0], lat: coords[0][1] };
  const lengths = [];
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const [lon0, lat0] = coords[i - 1];
    const [lon1, lat1] = coords[i];
    const k = Math.cos(((lat0 + lat1) / 2) * (Math.PI / 180));
    const length = Math.hypot((lon1 - lon0) * k, lat1 - lat0);
    lengths.push(length);
    total += length;
  }
  if (!(total > 0)) return { lon: coords[0][0], lat: coords[0][1] };
  let remaining = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] > 0 ? remaining / lengths[i] : 0;
      const [lon0, lat0] = coords[i];
      const [lon1, lat1] = coords[i + 1];
      return { lon: lon0 + (lon1 - lon0) * t, lat: lat0 + (lat1 - lat0) * t };
    }
    remaining -= lengths[i];
  }
  const tail = coords[coords.length - 1];
  return { lon: tail[0], lat: tail[1] };
}

/**
 * When a flow tile was received from TomTom, as the key and the card print it:
 * `{ time: '12:16', day: null }` today, `{ time: '14:16', day: '20 sept.' }`
 * on any other day.
 *
 * A clock time rather than "il y a 2 min", for two reasons. An open card does
 * not re-render every second, so a relative age goes stale in front of the
 * reader; and the time comes from the SERVER's clock (`x-tomtom-fetched-at`),
 * so subtracting it from this machine's clock would print the skew between
 * the two as if it were the data's age. And a day as soon as it is not today:
 * a budget-stale tile from yesterday afternoon must not read as this afternoon.
 *
 * @param {number} at - ms timestamp.
 * @param {Object} [opts]
 * @param {number} [opts.now=Date.now()]
 * @param {string} [opts.timeZone] - Tests only; the reader's own clock otherwise.
 * @returns {?{time:string, day:?string}} Null when the time is unknown.
 */
export function flowClockTime(at, { now = Date.now(), timeZone } = {}) {
  if (!Number.isFinite(at)) return null;
  const zone = timeZone ? { timeZone } : {};
  const time = formatTime(at, { hour: '2-digit', minute: '2-digit', ...zone });
  const stamp = (ms) => formatDate(ms, {
    year: 'numeric', month: '2-digit', day: '2-digit', ...zone,
  });
  const day = stamp(at) === stamp(now)
    ? null
    : formatDate(at, { day: 'numeric', month: 'short', ...zone });
  return { time, day };
}

/**
 * The rungs a click can open. Free flow is drawn as a faint 2 px thread under
 * most of the network, and making it answer clicks would turn every "click
 * the map to close this" into a traffic card; the stretches worth a card are
 * the coloured ones.
 */
export const FLOW_CLICKABLE_RUNGS = Object.freeze(['slow', 'jam', 'closure']);

/**
 * The drawn stretch nearest a clicked ground point, within a tolerance.
 *
 * WHY THE RIBBON CARRIES NO PICK IDS. A picked id is a claim of ownership to
 * every other layer's click handler (`pickRegistry.js`): with ids on a ribbon
 * that lies under most streets, flights stopped releasing their tracking on a
 * street click, and on a phone — where a tap picks the first OWNED object in a
 * 24 px square — nearly every tap in a city would have opened a traffic card.
 * So the ribbon stays part of the map, and this layer asks, on a click that
 * landed on the map, which of its stretches is under the pointer.
 *
 * Distances are measured in a local equirectangular frame around the click,
 * which is exact to well under a metre at the few metres this cares about.
 *
 * @param {{lon:number, lat:number}} point - Clicked ground point, degrees.
 * @param {Iterable<{segment:object, style:{bucket:string, width:number}}>} records
 * @param {number} metresPerPixel - Ground size of one CSS pixel at the click.
 * @param {Object} [opts]
 * @param {number} [opts.slackPx=6] - Reach beyond the drawn half-width.
 * @returns {?object} The record, or null.
 */
export function nearestFlowStretch(point, records, metresPerPixel, { slackPx = 6 } = {}) {
  if (!Number.isFinite(point?.lon) || !Number.isFinite(point?.lat)) return null;
  if (!(metresPerPixel > 0)) return null;
  const kx = 111_320 * Math.cos(point.lat * (Math.PI / 180));
  const ky = 110_574;
  let best = null;
  let bestD = Infinity;
  for (const record of records || []) {
    if (!FLOW_CLICKABLE_RUNGS.includes(record?.style?.bucket)) continue;
    const coords = record.segment?.coords;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const reach = metresPerPixel * ((record.style.width || 1) / 2 + slackPx);
    for (let i = 1; i < coords.length; i += 1) {
      const ax = (coords[i - 1][0] - point.lon) * kx;
      const ay = (coords[i - 1][1] - point.lat) * ky;
      const bx = (coords[i][0] - point.lon) * kx;
      const by = (coords[i][1] - point.lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d <= reach && d < bestD) {
        bestD = d;
        best = record;
      }
    }
  }
  return best;
}

/**
 * Title, lines and accent of the card for one decoded flow segment.
 *
 * @param {{trafficLevel:number, closure:boolean, roadType:string, fetchedAt?:number}} segment
 * @param {Object} [opts]
 * @param {number} [opts.now=Date.now()]
 * @param {string} [opts.timeZone] - Tests only.
 * @returns {{title:string, details:string[], accent:string, rung:string}}
 */
export function buildFlowCard(segment, { now = Date.now(), timeZone } = {}) {
  const m = messages();
  const title = Object.prototype.hasOwnProperty.call(m.roadClass, segment?.roadType)
    ? m.roadClass[segment.roadType]
    : m.roadClass.unknown;
  const details = [];
  let accent;
  let rung;
  if (segment?.closure === true) {
    rung = 'closure';
    accent = FLOW_CARD_CLOSURE_COLOR;
    details.push(`● ${m.legend.closedRoad}`);
    details.push(m.card.closed);
  } else {
    rung = flowBucket(segment?.trafficLevel);
    accent = CONGESTION_RUNGS[rung].color;
    details.push(`● ${CONGESTION_RUNGS[rung].label}`);
    if (Number.isFinite(segment?.trafficLevel)) {
      details.push(m.card.ratio(Math.round(segment.trafficLevel * 100)));
    }
  }
  const clock = flowClockTime(segment?.fetchedAt, { now, timeZone });
  if (clock) details.push(m.card.received(clock.time, clock.day));
  details.push(m.card.simulated);
  return {
    title, details, accent, rung,
  };
}
