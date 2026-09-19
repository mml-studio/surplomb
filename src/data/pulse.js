/**
 * @module pulse
 * @description The four live figures on the home page (« En ce moment au-dessus
 * de la France »), counted from what the server ALREADY holds — and the rules
 * that decide whether a figure may be shown at all.
 *
 * ── The one rule ────────────────────────────────────────────────────────────
 * A figure is a positive whole number with the time it describes, or it is
 * `null`. Null when the server holds nothing, when what it holds is older than
 * {@link PULSE_MAX_AGE_MS}, when it covers less than the label claims, or when
 * it is zero. The page hides every null, and hides the whole group when all
 * four are (docs/designs/landing/BRIEF-CHATGPT.md § 5 bis n° 2: « zéro ou
 * indisponible ne se montrent jamais »). There is no fallback figure, no
 * estimate, no "typical Saturday": a count we did not make is not shown.
 *
 * ── Nothing here fetches ────────────────────────────────────────────────────
 * Every input is a cache another proxy fills for readers of the globe. A visit
 * to the home page must not spend an OpenSky credit, open a fourth AISStream
 * socket (the key allows three, and the fourth is refused in silence) or pull
 * a 23 MB archive. So a figure is only as warm as the layer behind it:
 *
 *   avions   the OpenSky `/states/all` snapshot — warm while somebody has the
 *            flights layer on (it is off by default);
 *   navires  the AISStream socket — held open by a server-side watchdog, so
 *            warm whenever the key is set and the feed is live;
 *   bus      the per-network GTFS-RT cache — shown only when EVERY network of
 *            the national index was heard in the window, because a sum over
 *            the two cities someone happened to look at is not « la France »;
 *   meteo    the Météo-France SYNOP archive — consolidated once a day, so its
 *            newest reading is 11 to 35 hours old and never passes the window.
 *
 * ── « Au-dessus de la France » ──────────────────────────────────────────────
 * Aircraft are counted over LAND: inside one of the 96 simplified IGN
 * département outlines. National airspace legally extends over the 12-mile
 * territorial sea too, but a buffer drawn off these outlines cannot tell a
 * coast from a land border, and it would count the traffic over Geneva, Basel
 * and Luxembourg as French. Undercounting a few aircraft off Nice is the error
 * that invents nothing.
 *
 * Vessels are counted within the territorial sea: inside an outline (rivers,
 * docks) or within {@link TERRITORIAL_SEA_KM} of one. The AISStream box is a
 * RECTANGLE from Porto to Antwerp — Barcelona, Genoa, the Solent and the
 * Scheldt are in it. Measured on the hosted feed on 2026-09-19 at 12:10 UTC:
 * 1 925 of the 5 004 hulls heard in ten minutes were in French waters, so the
 * uncut box would have said « 5 004 » over France, 2.6 times the truth. The
 * same buffer leaks at the land borders (Monaco, Pasaia, Nieuwpoort, the Swiss
 * shore of Lake Geneva, the Rhine at Basel): a handful of hulls, disclosed
 * here rather than hidden.
 *
 * The same day, an OpenSky snapshot of a box around France held 1 433
 * airborne aircraft, of which 454 were over French land.
 *
 * Dependency-free apart from the outline lookup, so it runs identically in the
 * Vite proxy and under `node --test`.
 */

import {
  buildDepartementIndex,
  locateDepartement,
  segmentDistanceKm,
} from './franceDepartements.js';
import { fleetMergeKey } from './transitFleetMerge.js';

/** The four figures, in the page's order. */
export const PULSE_KEYS = Object.freeze(['avions', 'navires', 'bus', 'meteo']);

/** Older than this, a figure is not « en ce moment » any more. */
export const PULSE_MAX_AGE_MS = 10 * 60_000;

/**
 * How long the server keeps one counting pass.
 *
 * Counting is the only work `/api/pulse` does — parsing a worldwide OpenSky
 * snapshot, walking the vessel map — so it happens at most once per minute
 * however many readers arrive. The age rule is applied again at every answer,
 * so the cache can never serve a figure past {@link PULSE_MAX_AGE_MS}.
 */
export const PULSE_CACHE_MS = 60_000;

/** Twelve nautical miles, the territorial sea (UNCLOS art. 3). */
export const TERRITORIAL_SEA_KM = 22.224;

/**
 * An aircraft whose last position is older than this, against the snapshot's
 * own clock, is not counted. OpenSky keeps a state for up to ~20 minutes after
 * the last position (1 190 s measured on 2026-09-19, 4 % of the airborne states
 * over 60 s), and a position that old says where the aircraft WAS.
 */
export const AIRCRAFT_POSITION_MAX_LAG_S = 60;

/**
 * OpenSky emitter categories that are not aircraft: surface emergency and
 * service vehicles, and the three obstacle kinds (extended state vector,
 * index 17).
 */
const NON_AIRCRAFT_CATEGORIES = new Set([16, 17, 18, 19, 20]);

/**
 * Why a figure is null — reported beside the figures so an operator can read
 * the state of the four sources from one request.
 */
export const PULSE_WHY = Object.freeze({
  /** The server holds nothing for it yet (layer never lit, key absent). */
  cold: 'cold',
  /** The feed behind it is not delivering (socket down, key refused). */
  off: 'off',
  /** What it holds is older than the window. */
  stale: 'stale',
  /** What it holds covers less than the label claims. */
  partial: 'partial',
  /** It counted zero, which the page never shows. */
  empty: 'empty',
});

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.320;

/** Flat distance in km between two nearby points; Infinity if either is unplaced. */
function distanceKm(a, b) {
  if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return Infinity;
  const kx = KM_PER_DEG_LON_EQUATOR * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * KM_PER_DEG_LAT);
}

/**
 * Index the département outlines for « is this point French? ».
 *
 * @param {object} geojson The bundled `departements.geojson`.
 * @param {{seaKm?: number}} [options]
 * @returns {?{onLand: (lat: number, lon: number) => boolean,
 *   inWaters: (lat: number, lon: number) => boolean}}
 *   Null when the file carries no outline.
 */
export function createFranceTerritory(geojson, { seaKm = TERRITORIAL_SEA_KM } = {}) {
  const index = buildDepartementIndex(geojson);
  if (!index.list.length) return null;
  const padLat = seaKm / KM_PER_DEG_LAT;
  // Padding in longitude is widest at the part's northern edge, where a degree
  // is shortest; using that everywhere over-admits candidates, never misses one.
  const padded = (bbox) => {
    const coslat = Math.cos((Math.max(Math.abs(bbox[1]), Math.abs(bbox[3])) * Math.PI) / 180);
    const padLon = seaKm / (KM_PER_DEG_LON_EQUATOR * Math.max(coslat, 0.1));
    return [bbox[0] - padLon, bbox[1] - padLat, bbox[2] + padLon, bbox[3] + padLat];
  };
  const parts = [];
  for (const entry of index.list) {
    for (const part of entry.parts) parts.push({ ring: part.rings[0], box: padded(part.bbox) });
  }
  const land = [Infinity, Infinity, -Infinity, -Infinity];
  const sea = [Infinity, Infinity, -Infinity, -Infinity];
  for (const entry of index.list) {
    land[0] = Math.min(land[0], entry.bbox[0]);
    land[1] = Math.min(land[1], entry.bbox[1]);
    land[2] = Math.max(land[2], entry.bbox[2]);
    land[3] = Math.max(land[3], entry.bbox[3]);
  }
  for (const part of parts) {
    sea[0] = Math.min(sea[0], part.box[0]);
    sea[1] = Math.min(sea[1], part.box[1]);
    sea[2] = Math.max(sea[2], part.box[2]);
    sea[3] = Math.max(sea[3], part.box[3]);
  }
  const inBox = (box, lat, lon) => lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3];

  function onLand(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBox(land, lat, lon)) return false;
    return locateDepartement(index, lat, lon) !== null;
  }

  function inWaters(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBox(sea, lat, lon)) return false;
    if (locateDepartement(index, lat, lon) !== null) return true;
    for (const part of parts) {
      if (!inBox(part.box, lat, lon)) continue;
      const { ring } = part;
      for (let i = 0; i < ring.length - 1; i += 1) {
        if (segmentDistanceKm(lat, lon, ring[i], ring[i + 1]) <= seaKm) return true;
      }
    }
    return false;
  }

  return { onLand, inWaters };
}

/**
 * Aircraft in the air over France, from one OpenSky `/states/all` body.
 *
 * @param {string|object} body The cached JSON text, or its parse.
 * @param {{onLand: Function}} territory
 * @returns {{value: number, at: number}|{value: null, why: string}}
 *   `at` is the snapshot's own time (OpenSky `time`), in epoch ms.
 */
export function countAircraftOverFrance(body, territory) {
  let snapshot = body;
  if (typeof body === 'string') {
    try { snapshot = JSON.parse(body); } catch { return { value: null, why: PULSE_WHY.cold }; }
  }
  const time = Number(snapshot?.time);
  if (!Number.isFinite(time) || time <= 0 || !territory) return { value: null, why: PULSE_WHY.cold };
  let value = 0;
  for (const state of Array.isArray(snapshot.states) ? snapshot.states : []) {
    if (!Array.isArray(state) || state[8] !== false) continue;
    const lon = state[5];
    const lat = state[6];
    const positionAt = state[3];
    if (typeof lat !== 'number' || typeof lon !== 'number' || typeof positionAt !== 'number') continue;
    if (time - positionAt > AIRCRAFT_POSITION_MAX_LAG_S) continue;
    if (NON_AIRCRAFT_CATEGORIES.has(state[17])) continue;
    if (territory.onLand(lat, lon)) value += 1;
  }
  return { value, at: time * 1000 };
}

/**
 * How far back a hull may have been heard to count, from the counting pass.
 *
 * The window minus the server's cache: a pass is served for up to a minute
 * after it was counted, and every hull in the figure must still have been
 * heard within {@link PULSE_MAX_AGE_MS} at the moment it is SERVED — not only
 * at the moment it was counted.
 */
export const VESSEL_HEARD_WITHIN_MS = PULSE_MAX_AGE_MS - PULSE_CACHE_MS;

/**
 * Vessels heard in French waters within the window.
 *
 * @param {Iterable<{lat: number, lon: number, _updatedAt: number}>} rows
 *   The live vessel map's values; `_updatedAt` is the server's receipt time,
 *   which on a streaming socket is the report's time to within a second.
 * @param {{inWaters: Function}} territory
 * @param {{now: number, live: boolean, windowMs?: number}} options `live` is
 *   the socket watchdog's verdict: a map that stopped filling is not a fleet.
 * @returns {{value: number, at: number}|{value: null, why: string}}
 *   `at` is the newest report counted.
 */
export function countVesselsInFrenchWaters(rows, territory, { now, live, windowMs = VESSEL_HEARD_WITHIN_MS }) {
  if (!live) return { value: null, why: PULSE_WHY.off };
  if (!territory) return { value: null, why: PULSE_WHY.cold };
  const cutoff = now - windowMs;
  let value = 0;
  let newest = 0;
  for (const row of rows || []) {
    if (!(row?._updatedAt >= cutoff)) continue;
    if (!territory.inWaters(row.lat, row.lon)) continue;
    value += 1;
    if (row._updatedAt > newest) newest = row._updatedAt;
  }
  return value ? { value, at: newest } : { value: null, why: PULSE_WHY.empty };
}

/**
 * Two records of one `trip_id` further apart than this are two buses.
 *
 * `transitFleetMerge.js` merges on the trip id alone, which is right inside
 * one viewport and not across a country: two unrelated networks may both
 * publish a generic id like `100001`. The duplicates it exists for (Seine-Eure
 * inside the Normandy aggregate) sit on the same coordinates to the metre.
 */
const SAME_RUN_MAX_KM = 2;

/**
 * Buses and trams running on the national index, when the whole index was
 * heard inside the window — and only then.
 *
 * The GTFS-RT cache is filled per network, by whoever is looking at that city.
 * Measured on the hosted server from 2026-09-12 to 2026-09-19: a network was
 * fetched in 0.5 % of ten-minute windows, two networks at a time (median). A
 * sum over those is a count of what one reader was looking at, dressed up as a
 * country — the exact figure `recordTransitChronicle` refuses to record. So
 * partial coverage is null, and the figure appears by itself the day a
 * national sweep fills every network (docs/CHRONIQUE-GTFS-RT.md prices one).
 *
 * The same run published by two feeds (Seine-Eure inside the Normandy
 * aggregate) is counted once: same `trip_id` AND within {@link SAME_RUN_MAX_KM}
 * of each other. A vehicle whose own position time is older than the window
 * is not counted, however recently its feed answered: a feed can republish a
 * position for hours.
 *
 * @param {Array<{id: string}>} feeds The selectable feeds of the index.
 * @param {Map<string, {at: number, vehicles: Array, error: ?string}>} cache
 * @param {{now: number, maxAgeMs?: number}} options
 * @returns {{value: number, at: number}|{value: null, why: string, heard?: number, of?: number}}
 *   `at` is the OLDEST network reading, which is how old the sum is.
 */
export function countTransitFleet(feeds, cache, { now, maxAgeMs = PULSE_MAX_AGE_MS }) {
  if (!Array.isArray(feeds) || !feeds.length || !cache) return { value: null, why: PULSE_WHY.cold };
  const cutoff = now - maxAgeMs;
  let heard = 0;
  let oldest = Infinity;
  const entries = [];
  for (const feed of feeds) {
    const entry = cache.get(feed.id);
    if (!entry || entry.error || !(entry.at >= cutoff)) continue;
    heard += 1;
    oldest = Math.min(oldest, entry.at);
    entries.push(entry);
  }
  if (heard < feeds.length) return { value: null, why: PULSE_WHY.partial, heard, of: feeds.length };
  /** @type {Map<string, Array<{lat: number, lon: number}>>} trip id → where it was counted */
  const runs = new Map();
  let value = 0;
  for (const entry of entries) {
    for (const vehicle of entry.vehicles || []) {
      if (Number.isFinite(vehicle?.timestampMs) && vehicle.timestampMs < cutoff) continue;
      const key = fleetMergeKey(vehicle);
      if (key !== null) {
        const seen = runs.get(key) || [];
        const here = { lat: Number(vehicle.lat), lon: Number(vehicle.lon) };
        if (seen.some((other) => distanceKm(other, here) <= SAME_RUN_MAX_KM)) continue;
        seen.push(here);
        runs.set(key, seen);
      }
      value += 1;
    }
  }
  return value ? { value, at: oldest } : { value: null, why: PULSE_WHY.empty };
}

/**
 * Weather stations that reported in the newest round of the SYNOP archive.
 *
 * @param {?{newest: ?string, observations: Record<string, {at: string}>}} snapshot
 * @returns {{value: number, at: number}|{value: null, why: string}}
 *   `at` is that round's validity time.
 */
export function countReportingStations(snapshot) {
  const at = Date.parse(snapshot?.newest ?? '');
  if (!Number.isFinite(at) || !snapshot?.observations) return { value: null, why: PULSE_WHY.cold };
  let value = 0;
  for (const observation of Object.values(snapshot.observations)) {
    if (Date.parse(observation?.at ?? '') === at) value += 1;
  }
  return value ? { value, at } : { value: null, why: PULSE_WHY.empty };
}

/**
 * The answer, from one counting pass, at the moment it is served.
 *
 * Shape (the contract `src/vitrine/counters.js` reads):
 *
 *   {
 *     at: "2026-09-19T12:10:00.000Z",        // when this answer was made
 *     countedAt: "2026-09-19T12:09:41.000Z", // the counting pass it reads
 *     maxAgeMs: 600000,
 *     avions:  {value: 1236, at: "…Z"} | null,
 *     navires: {value: 1874, at: "…Z"} | null,
 *     bus:     {value: …,    at: "…Z"} | null,
 *     meteo:   {value: …,    at: "…Z"} | null,
 *     why: {bus: "partial", meteo: "stale"}  // one entry per null, for operators
 *   }
 *
 * `value` is always a positive integer; `at` is the time the figure describes,
 * never the time it was served.
 *
 * @param {Record<string, {value: ?number, at?: number, why?: string}>} readings
 * @param {{now: number, countedAt?: number, maxAgeMs?: number}} options
 * @returns {object}
 */
export function finalizePulse(readings, { now, countedAt = now, maxAgeMs = PULSE_MAX_AGE_MS }) {
  const pulse = { at: new Date(now).toISOString(), countedAt: new Date(countedAt).toISOString(), maxAgeMs };
  const why = {};
  for (const key of PULSE_KEYS) {
    const reading = readings?.[key];
    const value = reading?.value;
    if (!Number.isInteger(value) || value <= 0) {
      pulse[key] = null;
      why[key] = reading?.why || (value === 0 ? PULSE_WHY.empty : PULSE_WHY.cold);
      continue;
    }
    // A reading from the future is a clock problem, not a fresh figure; one
    // older than the window is not « en ce moment ».
    const age = now - reading.at;
    if (!Number.isFinite(age) || age > maxAgeMs || age < -60_000) {
      pulse[key] = null;
      why[key] = PULSE_WHY.stale;
      continue;
    }
    pulse[key] = { value, at: new Date(reading.at).toISOString() };
  }
  pulse.why = why;
  return pulse;
}
