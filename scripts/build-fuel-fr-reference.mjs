#!/usr/bin/env node
/**
 * Build src/data/local_data/fuel_fr/reference.json — the frozen "before" half
 * of the fuel-price layer ("Prix des carburants").
 *
 * The layer shows, per filling station, today's live Gazole and E10 price
 * against the price the same station charged from 24 to 30 October 2026, and
 * the brand on the forecourt. The live price is fetched at runtime; this
 * script freezes the rest.
 *
 * SOURCES
 * -------
 * A. Annual 2026 history of every price declaration at every French station,
 *    from the official fuel-price feed (prix-carburants.gouv.fr).
 *    Licence Ouverte / Etalab 2.0. A 33 MB ZIP holding one 378 MB XML in
 *    ISO-8859-1. Streamed through `unzip -p`, never held whole in memory.
 * B. OpenStreetMap `amenity=fuel` across the French Republic, via Overpass.
 *    ODbL 1.0. The official feed carries no brand; OSM does, and the tag
 *    `ref:FR:prix-carburants` joins an OSM station to its official id.
 *
 * Both raw answers are cached under `.gev-cache/fuel-fr/` (gitignored), so a
 * rerun reads the disk and takes about a minute.
 *
 * RULES
 * -----
 * They mirror a pre-registered analysis and live, with their exact
 * boundaries, in `src/data/fuelReference.js` (tested by
 * `fuelReference.test.mjs`). In short: daily price = last declaration on or
 * before day J (Paris time), missing when older than 30 days; prices outside
 * 1.00–4.00 €/L are ignored; "before" = mean of the valid days of 24–30
 * October 2026 when at least 5 of the 7 are valid, rounded to 3 decimals.
 * Ruptures and closures are NOT applied: the pre-registered rule does not use
 * them.
 *
 * OVERPASS MIRRORS
 * ----------------
 * `overpass.osm.ch` serves a Switzerland-only extract and answers a French
 * query with HTTP 200 and zero elements (see scripts/grid-audit/fetch-osm.mjs).
 * Every mirror is probed on Paris first, and any national answer holding fewer
 * than MIN_FUEL_ELEMENTS fuel stations is treated as a failed mirror.
 *
 * MEASURED (2026-11-23 build)
 * ---------------------------
 * 14 935 stations and 4 871 919 declarations in the annual file; 9 970
 * stations kept, 9 243 with a Gazole before price (mean 2.373 €/L). Overpass
 * returned 12 610 fuel elements in 114 s from overpass-api.de (kumi answered
 * 504 after 256 s); 99.8 % of the Gazole stations matched an OSM element.
 * Cold build 8 min 47 s, warm rebuild 3 s, 220 MB peak memory.
 *
 * Usage:
 *   npm run fuel:reference                        # cached sources if present
 *   npm run fuel:reference -- --refresh           # re-download both sources
 *   npm run fuel:reference -- --refresh-osm       # re-query Overpass only
 *   npm run fuel:reference -- --refresh-annual    # re-download the annual file only
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BRANDS,
  BRAND_GROUPS,
  BRAND_GROUP_OF,
  FUEL_REFERENCE_VERSION,
  OSM_STATION_REF_KEY,
  REFERENCE_FUELS,
  REFERENCE_WINDOW,
  createStationSplitter,
  isMetropolitanPostcode,
  parisLocalStamp,
  parseStationBlock,
  parseStationRefs,
  pickStationBrand,
  referencePrice,
} from '../src/data/fuelReference.js';

const ANNUAL_URL = 'https://donnees.roulez-eco.fr/opendata/annee/2026';
const USER_AGENT = 'surplomb-fuel-reference/1.0 (+https://github.com/mml-studio/surplomb)';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, '.gev-cache', 'fuel-fr');
const ANNUAL_ZIP = path.join(CACHE_DIR, 'PrixCarburants_annuel_2026.zip');
const ANNUAL_META = path.join(CACHE_DIR, 'PrixCarburants_annuel_2026.meta.json');
const OSM_RAW = path.join(CACHE_DIR, 'overpass-fuel-fr.json');
const OSM_META = path.join(CACHE_DIR, 'overpass-fuel-fr.meta.json');
const OUT_DIR = path.join(ROOT, 'src', 'data', 'local_data', 'fuel_fr');
const OUT = path.join(OUT_DIR, 'reference.json');

/** Same mirrors, same order, as scripts/grid-audit/fetch-osm.mjs. */
const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  // Listed so it is never silently re-added: a Switzerland-only extract that
  // answers France with HTTP 200 and zero elements. The probe and the floor
  // below both reject it.
  'https://overpass.osm.ch/api/interpreter',
];
/** Central Paris holds dozens of stations; a mirror answering 0 cannot see France. */
const PROBE_QUERY = '[out:json][timeout:60];nwr["amenity"="fuel"](48.80,2.25,48.91,2.42);out count;';
const FRANCE_AREA = '["ISO3166-1"="FR"][admin_level=2]';
const QUERY_TIMEOUT_S = 600;
const FULL_QUERY = [
  `[out:json][timeout:${QUERY_TIMEOUT_S}];`,
  `area${FRANCE_AREA}->.scope;`,
  'nwr["amenity"="fuel"](area.scope);',
  'out tags center;',
].join('\n');
/** France has well over 10 000 mapped stations; fewer means a broken mirror. */
const MIN_FUEL_ELEMENTS = 8000;
const OVERPASS_ROUNDS = 2;
const OVERPASS_BACKOFF_MS = 60_000;

const args = new Set(process.argv.slice(2));
const refreshAll = args.has('--refresh');
const refreshAnnual = refreshAll || args.has('--refresh-annual');
const refreshOsm = refreshAll || args.has('--refresh-osm');

const log = (line = '') => process.stderr.write(`${line}\n`);
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const formatInt = (value) => value.toLocaleString('en-US').replace(/,/g, ' ');
const percent = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)} %` : 'n/a');

function writeAtomic(file, data) {
  const scratch = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(scratch, data);
  fs.renameSync(scratch, file);
}

// ── Source A: the annual history ──────────────────────────────────────────

async function ensureAnnual() {
  if (!refreshAnnual && fs.existsSync(ANNUAL_ZIP) && fs.existsSync(ANNUAL_META)) {
    const meta = JSON.parse(fs.readFileSync(ANNUAL_META, 'utf8'));
    log(`[annual] cached ${path.relative(ROOT, ANNUAL_ZIP)} (${formatInt(meta.bytes)} bytes, ${meta.lastModified})`);
    return meta;
  }
  log(`[annual] ↓ ${ANNUAL_URL}`);
  const started = Date.now();
  const response = await fetch(ANNUAL_URL, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) {
    throw new Error(`annual download failed: HTTP ${response.status}. The current URL is listed on`
      + ' https://www.prix-carburants.gouv.fr/rubrique/opendata/');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 2).toString('latin1') !== 'PK') throw new Error('annual download is not a ZIP');
  const lastModifiedHeader = response.headers.get('last-modified');
  const meta = {
    url: ANNUAL_URL,
    bytes: bytes.length,
    lastModified: lastModifiedHeader ? new Date(lastModifiedHeader).toISOString() : null,
    fetchedAt: new Date().toISOString(),
  };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  writeAtomic(ANNUAL_ZIP, bytes);
  writeAtomic(ANNUAL_META, `${JSON.stringify(meta, null, 2)}\n`);
  log(`[annual]   ${formatInt(bytes.length)} bytes in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return meta;
}

/** Stream the XML out of the ZIP and hand every parsed station to `onStation`. */
async function readAnnual(onStation) {
  const child = spawn('unzip', ['-p', ANNUAL_ZIP], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const splitter = createStationSplitter((block) => {
    const station = parseStationBlock(block);
    if (station) onStation(station);
  });
  // ISO-8859-1 is one byte per character, so chunk boundaries never split one.
  for await (const chunk of child.stdout) splitter.push(chunk.toString('latin1'));
  const tail = splitter.end();
  const code = await exited;
  if (code !== 0) throw new Error(`unzip exited with ${code}: ${stderr.trim()}`);
  if (tail.includes('<pdv ')) throw new Error('the annual XML ends inside an unclosed <pdv>');
}

/** Whether a rupture of `fuelId` overlaps the reference window (Paris dates). */
function ruptureOverlapsWindow(ruptures, fuelId) {
  return ruptures.some((rupture) => {
    if (rupture.fuelId !== fuelId) return false;
    const debut = parisLocalStamp(rupture.debut);
    const fin = rupture.fin ? parisLocalStamp(rupture.fin) : null;
    if (!debut) return false;
    return debut.slice(0, 10) <= REFERENCE_WINDOW.end && (!fin || fin.slice(0, 10) >= REFERENCE_WINDOW.start);
  });
}

// ── Source B: OpenStreetMap ───────────────────────────────────────────────

async function overpassPost(mirror, query, timeoutMs) {
  const response = await fetch(mirror, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ data: query }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

const countFuel = (payload) => (payload.elements || []).filter((element) => element?.tags?.amenity === 'fuel').length;

/** Mirrors that can see France; unreachable ones are kept as a long shot. */
async function probeMirrors() {
  const usable = [];
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const payload = JSON.parse(await overpassPost(mirror, PROBE_QUERY, 60_000));
      const total = Number(payload.elements?.[0]?.tags?.total ?? 0);
      if (total > 0) {
        usable.push(mirror);
        log(`[osm] probe ${mirror} — sees France (${total} stations in central Paris)`);
      } else {
        log(`[osm] probe ${mirror} — REJECTED, regional extract (0 stations in central Paris)`);
      }
    } catch (error) {
      usable.push(mirror);
      log(`[osm] probe ${mirror} — unreachable (${error.message}), kept as a long shot`);
    }
  }
  return usable;
}

async function ensureOsm() {
  if (!refreshOsm && fs.existsSync(OSM_RAW) && fs.existsSync(OSM_META)) {
    const meta = JSON.parse(fs.readFileSync(OSM_META, 'utf8'));
    const payload = JSON.parse(fs.readFileSync(OSM_RAW, 'utf8'));
    log(`[osm] cached ${path.relative(ROOT, OSM_RAW)} (${meta.mirror}, ${meta.osmBase})`);
    return { payload, meta };
  }
  const mirrors = await probeMirrors();
  const failures = [];
  for (let round = 0; round < OVERPASS_ROUNDS; round += 1) {
    if (round > 0) {
      log(`[osm] every mirror failed, waiting ${OVERPASS_BACKOFF_MS / 1000} s`);
      await sleep(OVERPASS_BACKOFF_MS);
    }
    for (const mirror of mirrors) {
      const started = Date.now();
      log(`[osm] querying ${mirror}`);
      try {
        const text = await overpassPost(mirror, FULL_QUERY, (QUERY_TIMEOUT_S + 60) * 1000);
        const payload = JSON.parse(text);
        if (!Array.isArray(payload.elements)) throw new Error('no elements array');
        if (payload.remark) throw new Error(`Overpass remark: ${payload.remark}`);
        const fuel = countFuel(payload);
        if (fuel < MIN_FUEL_ELEMENTS) throw new Error(`only ${fuel} fuel elements (< ${MIN_FUEL_ELEMENTS}): not a France-wide answer`);
        const meta = {
          mirror,
          osmBase: payload.osm3s?.timestamp_osm_base ?? null,
          fetchedAt: new Date().toISOString(),
          seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
          bytes: Buffer.byteLength(text),
        };
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        writeAtomic(OSM_RAW, text);
        writeAtomic(OSM_META, `${JSON.stringify(meta, null, 2)}\n`);
        log(`[osm]   ${formatInt(fuel)} fuel elements, ${(meta.bytes / 1e6).toFixed(1)} MB, ${meta.seconds} s`);
        return { payload, meta };
      } catch (error) {
        failures.push(`${mirror}: ${error.message}`);
        log(`[osm]   ↳ ${error.message} after ${((Date.now() - started) / 1000).toFixed(1)} s`);
      }
    }
  }
  throw new Error(`every Overpass mirror failed:\n  ${failures.join('\n  ')}`);
}

// ── Build ─────────────────────────────────────────────────────────────────

/** Numeric order for the all-digit ids of the feed, code-point order otherwise. */
function compareIds(a, b) {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/** Pretty header, one station per line: readable, and a rebuild diffs per station. */
function serializePack(head, stations) {
  const headText = JSON.stringify(head, null, 2);
  const lines = stations.map(([id, row]) => `    ${JSON.stringify(id)}: ${JSON.stringify(row)}`);
  return `${headText.slice(0, -2)},\n  "stations": {\n${lines.join(',\n')}\n  }\n}\n`;
}

const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

async function main() {
  const started = Date.now();
  const [gazoleFuel, e10Fuel] = REFERENCE_FUELS;

  const annualMeta = await ensureAnnual();
  /** @type {Map<string, {gazole: ?number, e10: ?number}>} */
  const inScope = new Map();
  const outOfScope = [];
  const tally = {
    stationsInFile: 0,
    priceRows: 0,
    outOfBounds: 0,
    unparseable: 0,
    ruptureInWindowWithGazole: 0,
  };
  await readAnnual((station) => {
    tally.stationsInFile += 1;
    tally.priceRows += station.prices.length;
    if (!isMetropolitanPostcode(station.cp)) {
      outOfScope.push(`${station.id} (${station.cp || 'no postcode'})`);
      return;
    }
    const gazole = referencePrice(station.prices, gazoleFuel.id);
    const e10 = referencePrice(station.prices, e10Fuel.id);
    tally.outOfBounds += gazole.outOfBounds + e10.outOfBounds;
    tally.unparseable += gazole.unparseable + e10.unparseable;
    if (gazole.price != null && ruptureOverlapsWindow(station.ruptures, gazoleFuel.id)) {
      tally.ruptureInWindowWithGazole += 1;
    }
    inScope.set(station.id, { gazole: gazole.price, e10: e10.price });
  });
  log(`[annual] ${formatInt(tally.stationsInFile)} stations, ${formatInt(tally.priceRows)} price rows,`
    + ` ${formatInt(inScope.size)} in scope, out of scope: ${outOfScope.join(', ') || 'none'}`);

  const { payload, meta: osmMeta } = await ensureOsm();
  /** @type {Map<string, Array<object>>} */
  const elementsByStation = new Map();
  let fuelElements = 0;
  let withRef = 0;
  let refsOutsideScope = 0;
  for (const element of payload.elements || []) {
    if (element?.tags?.amenity !== 'fuel') continue;
    fuelElements += 1;
    const refs = parseStationRefs(element.tags[OSM_STATION_REF_KEY]);
    if (refs.length) withRef += 1;
    for (const id of new Set(refs)) {
      if (!inScope.has(id)) {
        refsOutsideScope += 1;
        continue;
      }
      if (!elementsByStation.has(id)) elementsByStation.set(id, []);
      elementsByStation.get(id).push(element);
    }
  }

  const rows = [];
  let conflicts = 0;
  let matchedWithGazole = 0;
  let gazoleBefore = 0;
  for (const id of [...inScope.keys()].sort(compareIds)) {
    const prices = inScope.get(id);
    const elements = elementsByStation.get(id);
    const brand = elements ? pickStationBrand(elements) : { brandIndex: null, access: false, conflict: false };
    if (brand.conflict) conflicts += 1;
    if (prices.gazole != null) {
      gazoleBefore += 1;
      if (elements) matchedWithGazole += 1;
    }
    if (prices.gazole == null && prices.e10 == null && brand.brandIndex == null) continue;
    rows.push([id, [brand.brandIndex, prices.gazole, prices.e10, brand.access ? 1 : 0]]);
  }

  const counts = {
    stations: rows.length,
    gazoleBefore: rows.filter(([, row]) => row[1] != null).length,
    e10Before: rows.filter(([, row]) => row[2] != null).length,
    branded: rows.filter(([, row]) => row[0] != null).length,
    access: rows.filter(([, row]) => row[3] === 1).length,
    droppedOutOfBounds: tally.outOfBounds,
  };
  if (counts.gazoleBefore !== gazoleBefore) throw new Error('internal: gazole count mismatch');
  if (!counts.stations) throw new Error('the pack came out empty — refusing to write');

  const head = {
    version: FUEL_REFERENCE_VERSION,
    builtAt: new Date().toISOString(),
    window: { ...REFERENCE_WINDOW },
    fuels: REFERENCE_FUELS.map((fuel) => fuel.name),
    groups: [...BRAND_GROUPS],
    brands: [...BRANDS],
    brandGroups: [...BRAND_GROUP_OF],
    sources: {
      annual: {
        url: annualMeta.url,
        bytes: annualMeta.bytes,
        lastModified: annualMeta.lastModified,
        stations: tally.stationsInFile,
        priceRows: tally.priceRows,
      },
      osm: {
        mirror: osmMeta.mirror,
        osmBase: osmMeta.osmBase,
        fuelElements,
        withRef,
        matchedStations: elementsByStation.size,
      },
    },
    counts,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeAtomic(OUT, serializePack(head, rows));

  // ── Report ──────────────────────────────────────────────────────────────
  const gazoleValues = rows.map(([, row]) => row[1]).filter((value) => value != null);
  const e10Values = rows.map(([, row]) => row[2]).filter((value) => value != null);
  const byBrand = new Map();
  for (const [, row] of rows) {
    const label = row[0] == null ? '(no brand)' : BRANDS[row[0]];
    byBrand.set(label, (byBrand.get(label) || 0) + 1);
  }
  log('');
  log(`${path.relative(ROOT, OUT)} — ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
  log(`  stations ${formatInt(counts.stations)} · Gazole before ${formatInt(counts.gazoleBefore)}`
    + ` · E10 before ${formatInt(counts.e10Before)} · branded ${formatInt(counts.branded)}`
    + ` · Access ${formatInt(counts.access)} · out of bounds ${counts.droppedOutOfBounds}`
    + ` · unparseable ${tally.unparseable}`);
  log(`  mean before: Gazole ${mean(gazoleValues)?.toFixed(3)} €/L, E10 ${mean(e10Values)?.toFixed(3)} €/L`);
  log(`  OSM ${osmMeta.mirror} @ ${osmMeta.osmBase}: ${formatInt(fuelElements)} fuel elements,`
    + ` ${formatInt(withRef)} with ${OSM_STATION_REF_KEY}, ${formatInt(elementsByStation.size)} stations matched,`
    + ` ${formatInt(refsOutsideScope)} refs to no in-scope station, ${conflicts} brand conflicts`);
  log(`  match rate: ${formatInt(matchedWithGazole)} / ${formatInt(gazoleBefore)} stations with a Gazole`
    + ` before price = ${percent(matchedWithGazole, gazoleBefore)}`);
  log(`  ${formatInt(tally.ruptureInWindowWithGazole)} stations with a Gazole before price also declare a`
    + ' Gazole rupture overlapping the window (not applied, by rule)');
  for (const [label, count] of [...byBrand.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${String(count).padStart(6)}  ${label}`);
  }
  log(`  done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

await main();
