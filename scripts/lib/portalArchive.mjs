/**
 * Reading the open-data permit portals whole, once a day, and keeping every
 * record they serve — the half of `src/data/portalArchive.js` that cannot be
 * pure: requests and files.
 *
 * The twin of `mmmPermits.mjs`. A portal is read through the same Opendatasoft
 * export (or ArcGIS query) the layer's scans use, but for the whole file —
 * one municipality at a time where the portal can be asked by commune — and
 * each record is folded into `.gev-cache/archive/portals/<insee>.json` by the
 * store every board family uses (`createCartdsArchiveStore` with
 * `PORTAL_ROWS`). The portals do not overlap: one municipality, one portal,
 * one file.
 *
 * NETWORK THROUGH THE CALLER, as there: every request goes through the `http`
 * object handed in — `{fetch, text}`, neither of which ever throws.
 */

import path from 'node:path';
import { cartdsDay } from '../../src/data/cartdsArchive.js';
import { cartdsSweepDue, parisHour } from './cartdsArchive.mjs';
import {
  portalArchiveColumns,
  portalArchiveCommune,
  portalArchiveFiles,
  portalSweepColumn,
  PORTAL_ARCHIVE,
  PORTAL_ARCHIVE_BOARD,
} from '../../src/data/portalArchive.js';

/** Where the archive lives, under the server's persistent cache. */
export const PORTALS_ARCHIVE_DIR = path.join('.gev-cache', 'archive', 'portals');

/**
 * publication-actes.fr's acts and lists, archived by the same store with
 * `PUBACTES_ROWS` (`publicationActesFeed.js`); read and swept in
 * `vite.config.js`, where its reader lives.
 */
export const PUBACTES_ARCHIVE_DIR = path.join('.gev-cache', 'archive', 'publication-actes');

/**
 * Ceiling on one answer. Paris's whole file and Bordeaux's largest commune
 * over 36 months are a few MB each (2026-11-17); the ceiling is for the day
 * a portal grows, not for today.
 */
export const PORTAL_ANSWER_MAX_BYTES = 192 * 1024 * 1024;

/** ArcGIS answers 2 000 features at most (`maxRecordCount` of Brest's layer). */
export const ARCGIS_PAGE = 2000;

/** Brest's file is 32 179 records (2026-11-17): 17 pages. The ceiling is three times that. */
export const ARCGIS_MAX_PAGES = 50;

/** Between two requests to one host. Two seconds: a nightly read, not a crawl. */
export const PORTAL_PAUSE_MS = 2000;

/**
 * A reading that failed is asked once more after this pause, the same night:
 * one of Bordeaux's 28 exports dropped its connection on the second test
 * sweep (2026-11-17) and answered at once when asked again.
 */
export const PORTAL_RETRY_PAUSE_MS = 30_000;

/**
 * The portals are swept in the late morning, not with the boards at ~00:40.
 * A portal is rewritten once a day, so the hour costs no freshness, and the
 * night is when every other family sweeps — the city lists until ~04:47
 * with their OCR, the Cart@DS second pass from 08:00. Brest and Bordeaux
 * each lift the process by ~300 MB for a few minutes, in a container capped
 * at 1 GB that idles at ~410 MB: on 2026-11-17 it was killed twice during
 * the first Brest reading. The archive check allows its stamp a day's lag.
 */
export const PORTAL_SWEEP_FROM_HOUR = 11;

/**
 * A sweep is due once per French calendar day, from {@link PORTAL_SWEEP_FROM_HOUR}.
 * @param {?object} stamp The last sweep's summary.
 * @param {Date} [now]
 */
export function portalSweepDue(stamp, now = new Date()) {
  return parisHour(now) >= PORTAL_SWEEP_FROM_HOUR && cartdsSweepDue(stamp, cartdsDay(now));
}

/**
 * The day `months` calendar months before `day`, `YYYY-MM-DD`.
 * @param {string} day
 * @param {number} months
 */
export function monthsBefore(day, months) {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate();
  at.setUTCDate(Math.min(d, last));
  return at.toISOString().slice(0, 10);
}

/**
 * One Opendatasoft export, for one municipality or the whole file.
 * @param {object} portal One of `LOCAL_ADS_PORTALS`, not ArcGIS.
 * @param {{insee?: ?string, since?: ?string}} query
 * @returns {string}
 */
export function portalExportUrl(portal, { insee = null, since = null } = {}) {
  const clauses = [];
  const column = portalSweepColumn(portal);
  if (insee && column) {
    const numeric = portal.communeIsNumeric && column === portal.communeColumn;
    clauses.push(numeric ? `${column} = ${Number.parseInt(insee, 10)}` : `${column} = "${insee}"`);
  }
  if (since) clauses.push(`${portal.dateColumn} >= date'${since}'`);
  // The certificats the layer leaves upstream stay upstream here too: two
  // thirds of Bordeaux's rows, never drawn, never read.
  if (portal.kindColumn && portal.excludedKind) clauses.push(`${portal.kindColumn} != "${portal.excludedKind}"`);
  const params = new URLSearchParams({ select: portalArchiveColumns(portal).join(','), limit: '-1' });
  if (clauses.length) params.set('where', clauses.join(' and '));
  return `https://${portal.portal}/api/explore/v2.1/catalog/datasets/${portal.dataset}/exports/json?${params}`;
}

/**
 * One page of an ArcGIS layer, in WGS 84, ordered so that pages do not
 * overlap.
 * @param {object} portal An `api: 'arcgis'` portal.
 * @param {{since?: ?string, offset?: number}} query
 * @returns {string}
 */
export function portalArcgisUrl(portal, { since = null, offset = 0 } = {}) {
  const params = new URLSearchParams({
    where: since ? `${portal.dateColumn} >= DATE '${since}'` : '1=1',
    outFields: portalArchiveColumns(portal).join(','),
    outSR: '4326',
    orderByFields: 'OBJECTID',
    resultOffset: String(offset),
    resultRecordCount: String(ARCGIS_PAGE),
    f: 'geojson',
  });
  return `${portal.service}/query?${params}`;
}

/**
 * One formatter for every date. Built per call, as `adsFeed.js` does for a
 * scan's few hundred rows, Brest's 32 179 records × 3 dates took the
 * container past its 1 GB ceiling on 2026-11-17 (killed twice mid-sweep):
 * measured in a bare process, the read alone peaked at 478 MB RSS.
 */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Milliseconds since 1970 → the `YYYY-MM-DD` it is in Paris; anything else as it came. */
function parisDay(value) {
  const ms = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(ms)) return value ?? null;
  return PARIS_DAY.format(new Date(ms));
}

/** A GeoJSON feature as one flat record, its `DATE_*` columns as Paris days. */
function arcgisRecord(feature) {
  const record = { ...(feature?.properties ?? {}), geometry: feature?.geometry ?? null };
  for (const column of Object.keys(record)) {
    if (/^DATE_/.test(column)) record[column] = parisDay(record[column]);
  }
  return record;
}

async function readJson(url, http) {
  const response = await http.fetch(url, { headers: { Accept: 'application/json' } });
  if (!response?.ok) return null;
  const body = await http.text(response, PORTAL_ANSWER_MAX_BYTES);
  if (body === null) return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Every record a portal serves for one municipality (or all of them), or null
 * when the portal did not answer with records. A partial reading is null:
 * recorded, it would make every record it missed look gone for a day.
 *
 * @param {object} portal One of `LOCAL_ADS_PORTALS`.
 * @param {{fetch: Function, text: Function}} http
 * @param {{insee?: ?string, since?: ?string, sleep?: Function, pauseMs?: number}} [options]
 * @returns {Promise<?Array<object>>}
 */
export async function readPortalRecords(portal, http, {
  insee = null, since = null, sleep = null, pauseMs = 0,
} = {}) {
  if (portal.api !== 'arcgis') {
    const answer = await readJson(portalExportUrl(portal, { insee, since }), http);
    return Array.isArray(answer) ? answer : null;
  }
  const records = [];
  for (let page = 0; page < ARCGIS_MAX_PAGES; page += 1) {
    if (page && sleep && pauseMs > 0) await sleep(pauseMs);
    const answer = await readJson(portalArcgisUrl(portal, { since, offset: page * ARCGIS_PAGE }), http);
    if (!answer || answer.type !== 'FeatureCollection' || !Array.isArray(answer.features)) return null;
    for (const feature of answer.features) records.push(arcgisRecord(feature));
    const more = answer.properties?.exceededTransferLimit === true || answer.exceededTransferLimit === true
      || answer.features.length === ARCGIS_PAGE;
    if (!more) return records;
  }
  // Fifty full pages and still more: read too far to be whole.
  return null;
}

/**
 * Read every portal once and fold each record into its municipality's file.
 *
 * Where a portal can be asked by commune (Bordeaux, Nantes, Tours, dODu), it
 * is, so that a failure costs one municipality and not the whole métropole;
 * Paris and Brest are read whole and split here. A municipality that answered
 * with no record is still written, so the archive check sees it read.
 *
 * @param {object} options
 * @param {Array<object>} options.portals `LOCAL_ADS_PORTALS`, or a subset.
 * @param {ReturnType<import('./cartdsArchive.mjs').createCartdsArchiveStore>} options.store
 * @param {{fetch: Function, text: Function}} options.http
 * @param {string} [options.day]
 * @param {number} [options.pauseMs]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {{log?: Function}} [options.log]
 * @param {number} [options.retryPauseMs] Before the one second attempt.
 * @returns {Promise<object>} The summary, as the stamp stores it.
 */
export async function sweepPortalArchive({
  portals, store, http, day = cartdsDay(), pauseMs = PORTAL_PAUSE_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = console,
  retryPauseMs = PORTAL_RETRY_PAUSE_MS,
}) {
  const read = async (portal, options) => {
    const records = await readPortalRecords(portal, http, options);
    if (records) return records;
    if (retryPauseMs > 0) await sleep(retryPauseMs);
    return readPortalRecords(portal, http, options);
  };
  const summary = {
    day,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    portals: portals.length,
    communes: portals.reduce((n, portal) => n + portalArchiveFiles(portal).length, 0),
    read: 0,
    records: 0,
    added: 0,
    rows: 0,
    unplaced: 0,
    perPortal: {},
    failed: [],
    unsaved: [],
  };
  let first = true;
  const pause = async () => {
    if (!first && pauseMs > 0) await sleep(pauseMs);
    first = false;
  };
  const keep = async (portal, insee, records) => {
    const instance = { key: portal.key };
    const { archive, added, saved } = await store.record(instance, insee, { [PORTAL_ARCHIVE_BOARD]: records }, day);
    if (!saved) summary.unsaved.push(insee);
    summary.read += 1;
    summary.records += records.length;
    summary.added += added;
    summary.rows += archive.rows.length;
    const tally = summary.perPortal[portal.key];
    tally.records += records.length;
    tally.added += added;
  };
  for (const portal of portals) {
    summary.perPortal[portal.key] = { records: 0, added: 0, failed: 0 };
    const plan = PORTAL_ARCHIVE[portal.key] ?? {};
    const since = plan.months ? monthsBefore(day, plan.months) : null;
    if (portalSweepColumn(portal)) {
      for (const insee of portalArchiveFiles(portal)) {
        await pause();
        const records = await read(portal, { insee, since });
        if (!records) {
          summary.failed.push(insee);
          summary.perPortal[portal.key].failed += 1;
          continue;
        }
        await keep(portal, insee, records);
      }
      continue;
    }
    await pause();
    const records = await read(portal, { since, sleep, pauseMs });
    if (!records) {
      const files = portalArchiveFiles(portal);
      summary.failed.push(...files);
      summary.perPortal[portal.key].failed += files.length;
      continue;
    }
    const byCommune = new Map(portalArchiveFiles(portal).map((insee) => [insee, []]));
    for (const record of records) {
      const { insee, placed } = portalArchiveCommune(portal, record);
      if (!placed) summary.unplaced += 1;
      if (!byCommune.has(insee)) byCommune.set(insee, []);
      byCommune.get(insee).push(record);
    }
    for (const [insee, group] of byCommune) await keep(portal, insee, group);
  }
  summary.finishedAt = new Date().toISOString();
  log.log?.(`[portal-archive] ${day}: ${summary.read}/${summary.communes} municipalities read, `
    + `${summary.records} records, ${summary.added} new rows, ${summary.rows} kept`
    + (summary.unplaced ? `, ${summary.unplaced} without a municipality` : '')
    + (summary.failed.length ? `, failed: ${summary.failed.join(' ')}` : ''));
  return summary;
}
