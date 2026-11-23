/**
 * Fuel prices (FR) — the server route behind the `fuel-prices-fr` layer.
 *
 *   GET /api/fuel-fr/stations — every station, joined onto the frozen
 *                               before-prices pack (see `fuelPricesFeed.js`)
 *   GET /api/fuel-fr/status   — provenance and counts, no rows
 *
 * WHY A ROUTE when the upstream export answers `Access-Control-Allow-Origin: *`:
 * the join reads a 9 000-station pack the browser has no reason to download,
 * a cold export takes 7.6 s (measured 2026-11-23) and ten minutes of shelf life
 * turns that into one upstream call per ten minutes for every visitor, and an
 * upstream outage is answered from the last copy on disk rather than with an
 * empty map.
 *
 * ARCHIVED, ONCE A DAY. The first successful read of each Paris day is kept
 * whole under `.gev-cache/archive/fuel-fr/<YYYY-MM-DD>.json.gz` (535 KB on
 * 2026-11-23, about 195 MB a year):
 * every source this project reads is archived, not only shown. The State also
 * publishes the full yearly history, so this is a second copy of a public
 * record rather than the only one — which is the cheap end of that rule.
 *
 * Node-only: imported by `vite.config.js`, never by the client.
 */
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  FUEL_FR_EXPORT_URL,
  fuelPayload,
  joinFuelStations,
} from './fuelPricesFeed.js';

/** Upstream shelf life. The feed itself moves every ten minutes. */
export const FUEL_FR_TTL_MS = 10 * 60_000;
/** How old a copy may be and still be served when the upstream fails. */
export const FUEL_FR_STALE_MAX_MS = 7 * 86_400_000;
/**
 * Fewer rows than this is a broken answer, not a quiet day: the feed held
 * 9 826 stations on 2026-11-23 and no weekday ever closes half of them.
 */
export const FUEL_FR_MIN_RECORDS = 5_000;
const UPSTREAM_TIMEOUT_MS = 60_000;
const USER_AGENT = 'Surplomb/1.0 (+https://surplomb.app; fuel-prices-fr layer)';

const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** @returns {string} `YYYY-MM-DD` in Europe/Paris. */
export function parisDay(epochMs) {
  return PARIS_DAY.format(new Date(epochMs));
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.root] Repository root (process.cwd() by default).
 * @param {() => number} [options.now]
 * @param {(message: string) => void} [options.log]
 */
export function createFuelPricesService({
  fetchImpl = (...args) => fetch(...args),
  root = process.cwd(),
  now = () => Date.now(),
  log = (message) => console.warn(`[Fuel FR] ${message}`),
} = {}) {
  const referencePath = path.join(root, 'src', 'data', 'local_data', 'fuel_fr', 'reference.json');
  const cachePath = path.join(root, '.gev-cache', 'fuel-fr', 'latest.json.gz');
  const archiveDir = path.join(root, '.gev-cache', 'archive', 'fuel-fr');

  let reference;
  let entry = null; // { at, records, payload }
  let diskChecked = false;
  let inFlight = null;
  let lastError = null;

  function readReference() {
    if (reference !== undefined) return reference;
    try {
      reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
    } catch (error) {
      log(`no reference pack at ${path.relative(root, referencePath)} (${error?.code || error?.message}) — `
        + 'every station will read as unknown; run `npm run fuel:reference`');
      reference = null;
    }
    return reference;
  }

  function build(records, at, stale) {
    const ref = readReference();
    const joined = joinFuelStations(records, ref, { now: now() });
    return fuelPayload(joined, ref, { fetchedAt: at, stale });
  }

  async function readDisk() {
    if (diskChecked) return;
    diskChecked = true;
    try {
      const raw = JSON.parse(zlib.gunzipSync(await fsp.readFile(cachePath)).toString('utf8'));
      if (Number.isFinite(raw?.at) && Array.isArray(raw?.records)) {
        entry = { at: raw.at, records: raw.records, payload: null };
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') log(`disk copy unreadable: ${error?.message || error}`);
    }
  }

  async function writeCopies(records, at) {
    const body = zlib.gzipSync(JSON.stringify({ at, records }), { level: 6 });
    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    await fsp.writeFile(cachePath, body);
    const archivePath = path.join(archiveDir, `${parisDay(at)}.json.gz`);
    if (!fs.existsSync(archivePath)) {
      await fsp.mkdir(archiveDir, { recursive: true });
      await fsp.writeFile(archivePath, body);
    }
  }

  async function fetchUpstream() {
    const response = await fetchImpl(FUEL_FR_EXPORT_URL, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`upstream HTTP ${response.status}`);
    const records = await response.json();
    if (!Array.isArray(records) || records.length < FUEL_FR_MIN_RECORDS) {
      throw new Error(`upstream answered ${Array.isArray(records) ? records.length : 'no'} rows`);
    }
    return records;
  }

  /**
   * @returns {Promise<{payload: object, source: 'HIT'|'MISS'|'STALE'}>}
   */
  async function stations() {
    await readDisk();
    const t = now();
    if (entry && t - entry.at < FUEL_FR_TTL_MS) {
      entry.payload ||= build(entry.records, entry.at, false);
      return { payload: entry.payload, source: 'HIT' };
    }
    inFlight ||= (async () => {
      try {
        const records = await fetchUpstream();
        const at = now();
        entry = { at, records, payload: build(records, at, false) };
        lastError = null;
        writeCopies(records, at).catch((error) => log(`copy write failed: ${error?.message || error}`));
        return { payload: entry.payload, source: 'MISS' };
      } catch (error) {
        lastError = { at: now(), message: String(error?.message || error) };
        log(`upstream failed: ${lastError.message}`);
        if (entry && now() - entry.at < FUEL_FR_STALE_MAX_MS) {
          return { payload: build(entry.records, entry.at, true), source: 'STALE' };
        }
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function status() {
    const ref = readReference();
    return {
      dataset: FUEL_FR_EXPORT_URL,
      fetchedAt: entry?.at ?? null,
      cachedStations: entry?.records?.length ?? 0,
      lastError,
      reference: ref
        ? { builtAt: ref.builtAt, window: ref.window, counts: ref.counts, sources: ref.sources }
        : null,
    };
  }

  return { stations, status, readReference };
}

/**
 * Mount the two routes.
 * @param {object} middlewares connect instance.
 * @param {{service: ReturnType<typeof createFuelPricesService>, allow: (key: string) => boolean, clientKey: (req: object) => string}} deps
 */
export function installFuelPricesRoutes(middlewares, { service, allow, clientKey }) {
  // 1.18 MB of JSON for 9 826 stations (2026-11-23), 0.40 MB gzipped: worth
  // compressing once per upstream read rather than once per visitor.
  const gzipped = new WeakMap();
  const send = (res, status, body, headers = {}) => {
    if (res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };
  // `/status` first: connect matches by prefix.
  middlewares.use('/api/fuel-fr/status', (req, res) => {
    if (req.method !== 'GET') { send(res, 405, { error: 'Method Not Allowed' }); return; }
    send(res, 200, service.status());
  });
  middlewares.use('/api/fuel-fr/stations', async (req, res) => {
    if (req.method !== 'GET') { send(res, 405, { error: 'Method Not Allowed' }); return; }
    if (!allow(clientKey(req))) { send(res, 429, { error: 'Rate limit exceeded' }, { 'Retry-After': '10' }); return; }
    try {
      const { payload, source } = await service.stations();
      const headers = { 'X-FUEL-FR': source, 'Cache-Control': 'public, max-age=300', Vary: 'Accept-Encoding' };
      if (/\bgzip\b/.test(String(req.headers?.['accept-encoding'] || ''))) {
        let body = gzipped.get(payload);
        if (!body) {
          body = zlib.gzipSync(JSON.stringify(payload), { level: 6 });
          gzipped.set(payload, body);
        }
        if (res.headersSent) return;
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', ...headers });
        res.end(body);
        return;
      }
      send(res, 200, payload, headers);
    } catch (error) {
      send(res, 503, {
        error: 'The fuel price feed did not answer and no recent copy exists.',
        code: 'fuel-feed-unavailable',
        detail: String(error?.message || error),
      });
    }
  });
}
