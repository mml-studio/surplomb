/**
 * @module vrsStandingData
 * @description Flight routes, airlines and aircraft types from Virtual Radar
 * Server's standing data, served from the server's own copy. SERVER-ONLY:
 * loaded by `vite.config.js`, never by the page.
 *
 * WHY THIS REPLACED ADSBDB. The flight label ("Air France · Airbus A320neo"),
 * the route line ("CDG → BUD · 812 km"), the SHOW ROUTE arc, the cockpit
 * FROM/TO panel, the airport card's "N en approche" and the voice's route and
 * airline answers were all fed by api.adsbdb.com, whose route data "may not be
 * copied, published, or incorporated into other databases without the explicit
 * permission of David J Taylor". A cache on disk, answered to every visitor, is
 * exactly that. VRS standing data is dedicated to the public domain (CC0 1.0,
 * `LICENSE` at https://github.com/vradarserver/standing-data), so the server
 * downloads the whole repository once a day and answers from memory: no
 * per-flight request leaves the server at all.
 *
 * WHAT IT HOLDS (2026-09-22): 620 700 routes keyed by normalised callsign,
 * 34 128 airports, 5 964 airlines, the ICAO 8643 model-type list, and 16 873
 * airframes submitted since June 2022 — the airframe table is small by design
 * (its README says why), so a hex lookup is a bonus and the designator the
 * live feed already carries is what names the type.
 *
 * MEMORY. The routes are kept as ONE sorted string of `CALLSIGN,AIRPORTS`
 * lines plus a Uint32Array of line offsets, searched by bisection: about
 * 11 MB + 2.5 MB, where a Map of the same rows measured 167 MB of heap.
 *
 * WHAT IT DOES NOT DO. Judge a route. A callsign's scheduled leg is often not
 * the one flying today; `src/data/routePlausible.js` gates every route against
 * the aircraft's live position in the page, and the server only uses it to
 * pick WHICH leg of a multi-stop route to answer when the page says where the
 * aircraft is.
 */

import { promises as defaultFs } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { routePlausible } from './data/routePlausible.js';

/** The whole repository, one gzip tarball, straight from the CC0 source. */
export const VRS_STANDING_DATA_URL = 'https://codeload.github.com/vradarserver/standing-data/tar.gz/refs/heads/main';

/** Where the licence can be read. */
export const VRS_STANDING_DATA_LICENCE_URL = 'https://github.com/vradarserver/standing-data/blob/main/LICENSE';

/** Upstream commits roughly daily; a day-old copy is the freshest worth having. */
export const VRS_REFRESH_MS = 24 * 3600_000;

/** After a failed download, how long before the next attempt. */
export const VRS_RETRY_MS = 60 * 60_000;

/** Refuse a tarball larger than this (the 2026-09-22 one is 6.3 MB). */
export const VRS_MAX_TARBALL_BYTES = 64 * 1024 * 1024;

/** Refuse to inflate past this (the 2026-09-22 tarball inflates to ~25 MB). */
export const VRS_MAX_INFLATED_BYTES = 256 * 1024 * 1024;

/** Download timeout. */
export const VRS_DOWNLOAD_TIMEOUT_MS = 90_000;

const TAR_BLOCK = 512;

/**
 * Walk a (decompressed) POSIX tar archive.
 *
 * Handles the three things a GitHub tarball actually contains: ustar headers
 * with a `prefix`, a pax global header (`g`, the commit id — skipped) and pax
 * per-file headers (`x`) carrying a `path=` longer than 100 bytes. GNU `L`
 * long names are read too, for any other producer.
 *
 * @param {Buffer} buffer
 * @returns {Generator<{name: string, data: Buffer}>} Regular files only.
 */
export function* tarEntries(buffer) {
  let offset = 0;
  let longName = null;
  while (offset + TAR_BLOCK <= buffer.length) {
    const header = buffer.subarray(offset, offset + TAR_BLOCK);
    if (header.every((byte) => byte === 0)) break; // end-of-archive marker
    const field = (start, length) => {
      const raw = header.subarray(start, start + length);
      const end = raw.indexOf(0);
      return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8');
    };
    const size = Number.parseInt(field(124, 12).trim() || '0', 8);
    if (!Number.isFinite(size) || size < 0) throw new Error('tar: bad size field');
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + TAR_BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length) throw new Error('tar: truncated archive');
    const data = buffer.subarray(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;

    if (type === 'x') {
      const match = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString('utf8'));
      longName = match ? match[1] : longName;
      continue;
    }
    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    if (type === 'g') continue;
    const prefix = field(345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = null;
    if (type === '0' || type === '\0') yield { name, data };
  }
}

/**
 * Split one CSV line. Quotes are optional, a doubled quote inside quotes is a
 * literal one (the format every VRS schema README describes).
 * @param {string} line
 * @returns {string[]}
 */
export function splitCsvLine(line) {
  if (!line.includes('"')) return line.split(',');
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

/**
 * The data rows of one CSV file: BOM and header dropped, blank lines skipped.
 * @param {Buffer|string} data
 * @returns {string[][]}
 */
export function csvRows(data) {
  const text = String(data).replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]) rows.push(splitCsvLine(lines[i]));
  }
  return rows;
}

/** Which table a path inside the tarball belongs to, or null. */
function tableOf(name) {
  const match = /(?:^|\/)(routes|airports|airlines|model-type|aircraft)\/schema-01\/.+\.csv$/.exec(name);
  return match ? match[1] : null;
}

/**
 * "Airbus A-320neo" → "Airbus A320neo"; "ATR ATR-72-600" → "ATR-72-600".
 * ICAO 8643 hyphenates model numbers the manufacturer does not ("A-320neo"),
 * and a few manufacturers repeat their own name in the model.
 */
function modelDisplayName(manufacturer, model) {
  const maker = String(manufacturer || '').trim();
  let name = String(model || '').trim();
  if (/^airbus$/i.test(maker)) name = name.replace(/^A-(\d)/, 'A$1');
  if (!maker) return name || null;
  if (!name) return maker;
  if (name.toUpperCase().startsWith(maker.toUpperCase())) return name;
  return `${maker} ${name}`;
}

/** Character bigrams of a name, letters and digits only. */
function bigrams(text) {
  const clean = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const grams = new Map();
  for (let i = 0; i + 1 < clean.length; i += 1) {
    const gram = clean.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) || 0) + 1);
  }
  return grams;
}

/** Dice coefficient over bigrams: 1 for the same name, 0 for nothing shared. */
function nameSimilarity(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;
  let total = 0;
  for (const count of left.values()) total += count;
  for (const count of right.values()) total += count;
  for (const [gram, count] of left) shared += Math.min(count, right.get(gram) || 0);
  return total ? (2 * shared) / total : 0;
}

/**
 * One display name per ICAO designator.
 *
 * The model-type table lists every name a designator has been sold under, in
 * alphabetical order (C172 has 22 rows, from "Aviones Colombia 172" to "Reims
 * FR172 Hawk XP"; CRJ9 starts with "Challenger 890"). Where airframes of that
 * designator are on file, the active row closest to the name most of them
 * carry wins ("Bombardier CRJ-900LR" → "Canadair CL-600 Regional Jet
 * CRJ-900"); otherwise the maker with the most rows, and its first active row.
 *
 * @param {string[][]} rows Model-type rows.
 * @param {Map<string, string>} [commonFrameNames] Designator → the
 *   manufacturer-and-model most of its airframes carry.
 * @returns {Map<string, string>}
 */
export function buildModelNames(rows, commonFrameNames = new Map()) {
  /** @type {Map<string, {makers: Map<string, number>, rows: string[][]}>} */
  const byCode = new Map();
  for (const row of rows) {
    const code = String(row[0] || '').trim().toUpperCase();
    if (!code || code.startsWith('-')) continue; // fake codes: ground vehicles, towers
    let entry = byCode.get(code);
    if (!entry) { entry = { makers: new Map(), rows: [] }; byCode.set(code, entry); }
    const maker = String(row[1] || '').trim();
    entry.makers.set(maker, (entry.makers.get(maker) || 0) + 1);
    entry.rows.push(row);
  }
  const names = new Map();
  for (const [code, entry] of byCode) {
    const active = entry.rows.filter((row) => String(row[8]).trim() === '1');
    const reference = commonFrameNames.get(code);
    let chosen = null;
    if (reference && active.length) {
      let best = -1;
      for (const row of active) {
        const score = nameSimilarity(modelDisplayName(row[1], row[2]), reference);
        if (score > best) { best = score; chosen = row; }
      }
    }
    if (!chosen) {
      let bestMaker = null;
      let bestCount = -1;
      for (const [maker, count] of entry.makers) {
        if (count > bestCount) { bestMaker = maker; bestCount = count; }
      }
      const ofMaker = entry.rows.filter((row) => String(row[1] || '').trim() === bestMaker);
      chosen = ofMaker.find((row) => String(row[8]).trim() === '1') || ofMaker[0];
    }
    const name = modelDisplayName(chosen[1], chosen[2]);
    if (name) names.set(code, name);
  }
  return names;
}

/**
 * Build the in-memory index from the tarball's files.
 *
 * @param {Iterable<{name: string, data: Buffer}>} entries
 * @returns {object} The index `lookupRoute`/`lookupAircraftType` read.
 */
export function buildStandingIndex(entries) {
  const files = { routes: [], airports: [], airlines: [], 'model-type': [], aircraft: [] };
  for (const entry of entries) {
    const table = tableOf(entry.name);
    if (table) files[table].push(entry.data);
  }

  // Routes: "CALLSIGN,AIRPORTS" lines, sorted. ',' sorts below every digit
  // and letter, so line order IS callsign order ("AFR1," < "AFR10,").
  const lines = [];
  const airportCodesUsed = new Set();
  for (const data of files.routes) {
    for (const row of csvRows(data)) {
      const callsign = String(row[0] || '').trim().toUpperCase();
      const airports = String(row[4] || '').trim().toUpperCase();
      if (!callsign || !airports || airports === 'UNKNOWN' || airports.includes(',')) continue;
      lines.push(`${callsign},${airports}`);
      for (const code of airports.split('-')) airportCodesUsed.add(code);
    }
  }
  lines.sort();
  let deduped = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const key = lines[i].slice(0, lines[i].indexOf(','));
    const previous = deduped > 0 ? lines[deduped - 1] : null;
    if (previous && previous.slice(0, previous.indexOf(',')) === key) continue;
    lines[deduped] = lines[i];
    deduped += 1;
  }
  lines.length = deduped;
  const offsets = new Uint32Array(lines.length + 1);
  let position = 0;
  for (let i = 0; i < lines.length; i += 1) {
    offsets[i] = position;
    position += lines[i].length + 1;
  }
  offsets[lines.length] = position;
  const routeText = lines.join('\n') + (lines.length ? '\n' : '');
  lines.length = 0;

  // Airports: only those a route names, [code, displayName, icao, iata, lat, lon].
  const airports = new Map();
  for (const data of files.airports) {
    for (const row of csvRows(data)) {
      const code = String(row[0] || '').trim().toUpperCase();
      if (!airportCodesUsed.has(code)) continue;
      const lat = Number.parseFloat(row[6]);
      const lon = Number.parseFloat(row[7]);
      airports.set(code, Object.freeze({
        icao: String(row[2] || '').trim().toUpperCase() || null,
        iata: String(row[3] || '').trim().toUpperCase() || null,
        // The town first, like the card has always printed ("Paris", not
        // "Paris Charles de Gaulle Airport"); the airport's name when the
        // table has no town.
        name: String(row[4] || '').trim() || String(row[1] || '').trim() || null,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
      }));
    }
  }

  // Airlines: code → name; and the IATA → ICAO swap, only where it is unique.
  const airlines = new Map();
  const iataCandidates = new Map();
  for (const data of files.airlines) {
    for (const row of csvRows(data)) {
      const code = String(row[0] || '').trim().toUpperCase();
      const name = String(row[1] || '').trim();
      const icao = String(row[2] || '').trim().toUpperCase();
      const iata = String(row[3] || '').trim().toUpperCase();
      if (code && name) airlines.set(code, name);
      if (iata && icao) {
        const list = iataCandidates.get(iata) || new Set();
        list.add(icao);
        iataCandidates.set(iata, list);
      }
    }
  }
  const iataToIcao = new Map();
  for (const [iata, icaos] of iataCandidates) {
    if (icaos.size === 1) iataToIcao.set(iata, [...icaos][0]);
  }

  // Airframes: hex → [registration, designator, manufacturer and model].
  const aircraft = new Map();
  /** @type {Map<string, Map<string, number>>} designator → name → airframes */
  const frameNames = new Map();
  for (const data of files.aircraft) {
    for (const row of csvRows(data)) {
      const hex = String(row[0] || '').trim().toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(hex)) continue;
      const designator = String(row[2] || '').trim().toUpperCase();
      const name = String(row[5] || '').trim() || modelDisplayName(row[3], row[4]);
      aircraft.set(hex, Object.freeze([
        String(row[1] || '').trim() || null,
        designator && !designator.startsWith('-') ? designator : null,
        name,
      ]));
      if (designator && name) {
        const counts = frameNames.get(designator) || new Map();
        counts.set(name, (counts.get(name) || 0) + 1);
        frameNames.set(designator, counts);
      }
    }
  }
  const commonFrameNames = new Map();
  for (const [designator, counts] of frameNames) {
    let best = null;
    let bestCount = 0;
    for (const [name, count] of counts) if (count > bestCount) { best = name; bestCount = count; }
    commonFrameNames.set(designator, best);
  }

  const modelRows = [];
  for (const data of files['model-type']) modelRows.push(...csvRows(data));
  const modelNames = buildModelNames(modelRows, commonFrameNames);

  return Object.freeze({
    routeText,
    routeOffsets: offsets,
    routeCount: offsets.length - 1,
    airports,
    airlines,
    iataToIcao,
    modelNames,
    aircraft,
  });
}

/**
 * Normalise a callsign the way VRS stores it (routes/schema-01/README.md):
 * code + number, the number stripped of leading zeros (a lone "0" kept when
 * nothing numeric is left), an IATA code swapped for its airline's ICAO.
 *
 * @param {string} callsign
 * @param {Map<string, string>} [iataToIcao]
 * @returns {?string} Null when it cannot be a scheduled flight number.
 */
export function normalizeCallsign(callsign, iataToIcao = new Map()) {
  const raw = String(callsign || '').trim().toUpperCase();
  const match = /^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])(\d[A-Z0-9]*)$/.exec(raw);
  if (!match) return null;
  let [, code, number] = match;
  if (code.length === 2 && iataToIcao.has(code)) code = iataToIcao.get(code);
  number = number.replace(/^0+/, '');
  if (!/^\d/.test(number)) number = `0${number}`;
  if (!/^(\d{1,4}|\d{1,3}[A-Z]|\d{1,2}[A-Z]{2})$/.test(number)) return null;
  return `${code}${number}`;
}

/** The airport string of one callsign, or null. Bisection over the sorted lines. */
function routeAirports(index, callsign) {
  const { routeText, routeOffsets, routeCount } = index;
  let lo = 0;
  let hi = routeCount - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const start = routeOffsets[mid];
    const comma = routeText.indexOf(',', start);
    const key = routeText.slice(start, comma);
    if (key === callsign) return routeText.slice(comma + 1, routeOffsets[mid + 1] - 1);
    if (key < callsign) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}

function airportView(index, code) {
  const airport = index.airports.get(code);
  if (!airport) return null;
  return {
    // The short code a reader knows: IATA first, like the route line always
    // printed ("CDG → BUD"); ICAO for the fields that have no IATA code.
    code: airport.iata || airport.icao || code,
    icao: airport.icao,
    iata: airport.iata,
    name: airport.name,
    lat: airport.lat,
    lon: airport.lon,
  };
}

/**
 * The scheduled leg for a callsign.
 *
 * A route of more than two airports is several legs flown under one number.
 * When the page says where the aircraft is, the first leg it is plausibly on
 * is answered; otherwise, or when none fits, the whole route end to end, which
 * the page's own plausibility gate then hides.
 *
 * @param {object} index
 * @param {string} callsign
 * @param {{latDeg?: number, lonDeg?: number, altitudeM?: ?number, verticalRateMps?: ?number}} [position]
 * @returns {?{airline: ?string, origin: object, destination: object, stops: number}}
 */
export function lookupRoute(index, callsign, position = null) {
  if (!index) return null;
  const key = normalizeCallsign(callsign, index.iataToIcao);
  if (!key) return null;
  const airportsText = routeAirports(index, key);
  if (!airportsText) return null;
  const legs = airportsText.split('-').map((code) => airportView(index, code));
  if (legs.length < 2 || legs.some((airport) => !airport)) return null;
  let origin = legs[0];
  let destination = legs[legs.length - 1];
  if (legs.length > 2 && Number.isFinite(position?.latDeg) && Number.isFinite(position?.lonDeg)) {
    for (let i = 0; i + 1 < legs.length; i += 1) {
      if (routePlausible({ ...position, origin: legs[i], destination: legs[i + 1] })) {
        origin = legs[i];
        destination = legs[i + 1];
        break;
      }
    }
  }
  const code = key.match(/^([A-Z]{2,3}|[A-Z][0-9]|[0-9][A-Z])/)[1];
  return {
    airline: index.airlines.get(code) || null,
    origin,
    destination,
    stops: legs.length,
  };
}

/**
 * Type and tail for one airframe.
 *
 * @param {object} index
 * @param {string} hex Six hex digits.
 * @param {?string} [designator] The ICAO designator the live feed carries, if any.
 * @returns {?{typeCode: ?string, typeName: ?string, registration: ?string}}
 */
export function lookupAircraftType(index, hex, designator = null) {
  if (!index) return null;
  const frame = index.aircraft.get(String(hex || '').toLowerCase()) || null;
  const fed = String(designator || '').trim().toUpperCase();
  const typeCode = frame?.[1] || (/^[A-Z0-9]{2,4}$/.test(fed) ? fed : null);
  const typeName = frame?.[2] || (typeCode ? index.modelNames.get(typeCode) || null : null);
  const registration = frame?.[0] || null;
  if (!typeCode && !typeName && !registration) return null;
  return { typeCode, typeName, registration };
}

/**
 * Inflate and index a downloaded tarball.
 * @param {Buffer} gzipped
 * @returns {object}
 */
export function indexFromTarball(gzipped) {
  const tar = zlib.gunzipSync(gzipped, { maxOutputLength: VRS_MAX_INFLATED_BYTES });
  const index = buildStandingIndex(tarEntries(tar));
  if (index.routeCount === 0) throw new Error('standing data: no routes in the archive');
  return index;
}

/**
 * The server's copy: read from disk, downloaded when missing, refreshed once a
 * day in the background. Never throws to a caller: `current()` is null until a
 * copy exists, and a failed download keeps the copy it has.
 *
 * @param {object} [options]
 * @param {string} [options.cacheDir] Where the tarball lives (`.gev-cache/vrs-standing-data`).
 * @param {string} [options.url]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {typeof defaultFs} [options.fs]
 * @param {{info?: Function, warn?: Function}} [options.log]
 */
export function createStandingDataStore({
  cacheDir = path.join(process.cwd(), '.gev-cache', 'vrs-standing-data'),
  url = VRS_STANDING_DATA_URL,
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  fs = defaultFs,
  log = console,
} = {}) {
  const tarballPath = path.join(cacheDir, 'standing-data.tar.gz');
  const metaPath = path.join(cacheDir, 'standing-data.json');
  let index = null;
  let fetchedAt = 0;
  let lastAttemptAt = 0;
  let lastError = null;
  let loading = null;
  let refreshing = null;

  async function download() {
    lastAttemptAt = now();
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'surplomb-standing-data/1.0 (+https://surplomb.app)' },
      signal: AbortSignal.timeout(VRS_DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`standing data: HTTP ${response.status}`);
    const declared = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > VRS_MAX_TARBALL_BYTES) {
      throw new Error('standing data: archive too large');
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > VRS_MAX_TARBALL_BYTES) throw new Error('standing data: archive too large');
    // Indexed BEFORE it is written: a truncated or foreign download must never
    // replace a copy that works.
    const fresh = indexFromTarball(body);
    const at = now();
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(`${tarballPath}.tmp`, body);
    await fs.rename(`${tarballPath}.tmp`, tarballPath);
    await fs.writeFile(metaPath, JSON.stringify({ fetchedAt: at, bytes: body.length, url }), 'utf8');
    index = fresh;
    fetchedAt = at;
    lastError = null;
    log.info?.(`[standing-data] ${fresh.routeCount} routes, ${fresh.airlines.size} airlines, `
      + `${fresh.modelNames.size} types, ${fresh.aircraft.size} airframes`);
    return index;
  }

  async function readDisk() {
    try {
      const [body, metaText] = await Promise.all([
        fs.readFile(tarballPath),
        fs.readFile(metaPath, 'utf8').catch(() => null),
      ]);
      const meta = metaText ? JSON.parse(metaText) : null;
      index = indexFromTarball(body);
      fetchedAt = Number.isFinite(meta?.fetchedAt) ? meta.fetchedAt : 0;
      return index;
    } catch {
      return null;
    }
  }

  function refreshInBackground() {
    if (refreshing) return refreshing;
    refreshing = download()
      .catch((error) => {
        lastError = error?.message || String(error);
        log.warn?.(`[standing-data] refresh failed, keeping the copy in hand: ${lastError}`);
        return index;
      })
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  /**
   * The index, loading it on first call (disk, else download). Resolves to
   * null when there is no copy and none could be fetched.
   * @returns {Promise<object|null>}
   */
  function ready() {
    if (index) {
      maybeRefresh();
      return Promise.resolve(index);
    }
    if (!loading) {
      loading = (async () => {
        // The adsbdb cache this replaced held rows whose terms forbid keeping
        // them; it goes on the first load of its successor.
        await fs.rm(path.join(path.dirname(cacheDir), 'adsbdb.json'), { force: true }).catch(() => {});
        if (await readDisk()) {
          maybeRefresh();
          return index;
        }
        if (now() - lastAttemptAt < VRS_RETRY_MS && lastAttemptAt) return null;
        try {
          return await download();
        } catch (error) {
          lastError = error?.message || String(error);
          log.warn?.(`[standing-data] unavailable: ${lastError}`);
          return null;
        }
      })().finally(() => { loading = null; });
    }
    return loading;
  }

  function maybeRefresh() {
    const t = now();
    if (!index || refreshing) return;
    if (t - fetchedAt < VRS_REFRESH_MS) return;
    if (lastAttemptAt && t - lastAttemptAt < VRS_RETRY_MS) return;
    void refreshInBackground();
  }

  return {
    ready,
    current: () => index,
    status: () => ({
      loaded: Boolean(index),
      fetchedAt: fetchedAt || null,
      routes: index?.routeCount ?? 0,
      error: lastError,
    }),
    /** Test seam: wait for a background refresh to settle. */
    settled: () => refreshing || loading || Promise.resolve(index),
  };
}

const ROUTE_PATH = /^\/route\/([^/?#]+)$/;
const TYPE_PATH = /^\/type\/([^/?#]+)$/;

function finiteParam(params, name) {
  const raw = params.get(name);
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * `/api/flight-info/route/:callsign` and `/api/flight-info/type/:hex`, in the
 * shapes the flights layer has always read:
 *
 *   route → {found, airline, origin:{code, icao, iata, name, lat, lon}, destination:{…}, stops}
 *   type  → {found, typeCode, typeName, registration}
 *
 * A route request may carry `lat`, `lon`, `alt` (m) and `vr` (m/s) so a
 * multi-stop route answers the leg the aircraft is on; a type request may
 * carry `t`, the designator the feed already has, which names the type when
 * the airframe table does not know the hex.
 *
 * 503 while the server holds no copy at all (first download failed): the page
 * forgets that key and asks again later, instead of caching a miss.
 *
 * @param {{store: ReturnType<typeof createStandingDataStore>}} options
 * @returns {(req: any, res: any) => Promise<void>}
 */
export function createFlightInfoMiddleware({ store }) {
  return async function flightInfo(req, res) {
    const send = (status, body, cache = 'no-store') => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cache,
        'X-Flight-Info-Source': 'vrs-standing-data',
      });
      res.end(JSON.stringify(body));
    };
    try {
      const incoming = new URL(req.url || '/', 'http://localhost');
      const routeMatch = ROUTE_PATH.exec(incoming.pathname);
      const typeMatch = TYPE_PATH.exec(incoming.pathname);
      if (!routeMatch && !typeMatch) return send(404, { error: 'unknown endpoint' });
      const key = decodeURIComponent((routeMatch || typeMatch)[1]);
      if (routeMatch && !/^[A-Z0-9]{2,8}$/i.test(key)) return send(400, { error: 'invalid callsign' });
      if (typeMatch && !/^[0-9a-f]{6}$/i.test(key)) return send(400, { error: 'invalid hex' });
      const index = await store.ready();
      if (!index) {
        res.setHeader?.('Retry-After', '600');
        return send(503, { found: false, error: 'standing data unavailable' });
      }
      const cache = 'private, max-age=3600';
      if (routeMatch) {
        const params = incoming.searchParams;
        const position = {
          latDeg: finiteParam(params, 'lat'),
          lonDeg: finiteParam(params, 'lon'),
          altitudeM: finiteParam(params, 'alt'),
          verticalRateMps: finiteParam(params, 'vr'),
        };
        const route = lookupRoute(index, key, position);
        return send(200, route ? { found: true, ...route } : { found: false }, cache);
      }
      const answer = lookupAircraftType(index, key, incoming.searchParams.get('t'));
      return send(200, answer ? { found: true, ...answer } : { found: false }, cache);
    } catch (error) {
      return send(500, { error: String(error?.message || error) });
    }
  };
}
