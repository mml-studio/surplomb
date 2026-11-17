/**
 * @module data/portalArchive
 *
 * What the métropoles' and cities' open-data permit files held, kept after
 * they let it go.
 *
 * WHY. The six portals the permit layer reads (`LOCAL_ADS_PORTALS` in
 * `adsFeed.js`: Paris, Bordeaux, Nantes, Tours, Brest, dODu) were read per
 * scan and never kept, while every board family beside them was archived
 * nightly. Paris publishes « 6 derniers mois » only: a dossier filed in May is
 * gone from the file by December, and nothing public keeps it. Brest's rows
 * carry the instruction stage (`STADE`), rewritten as the dossier moves. A
 * file that is rewritten is a register whose history is lost unless somebody
 * keeps it — the boards' argument (`cartdsArchive.js`), on another kind of
 * source.
 *
 * WHAT IS KEPT: THE RECORD, NOT THE DOSSIER. Each distinct record a portal
 * ever served is stored once, as one canonical JSON cell (keys sorted), with
 * the first and last day it was seen, by the store every board family uses
 * (`createCartdsArchiveStore` with {@link PORTAL_ROWS}). A record whose text
 * changes — a new stage, a decision filled in — is a new row beside the old
 * one, which is the history. One cell and not one cell per column, so that a
 * portal adding a column does not make its old rows unreadable.
 *
 * WHAT IS NEVER KEPT. A person's name: the applicant column goes through
 * `organisationApplicant`, free-text columns through `withoutPersonMentions`,
 * and the columns that only ever name people (dODu's `nom_demandeur`, its
 * `personne_phys_mor`) are dropped — they are never asked for either. The
 * same scrub runs again on every stored row as it is read
 * (`PORTAL_ROWS.restore`), so a stricter filter reaches the whole archive.
 *
 * Dependency-free apart from the applicant filter, and side-effect-free: the
 * requests and files are in `scripts/lib/portalArchive.mjs`.
 */

import { organisationApplicant, withoutPersonMentions } from './permitApplicant.js';

/** The one board a portal's archive has: its records. */
export const PORTAL_ARCHIVE_BOARD = 'records';

/**
 * Per portal, what the nightly sweep asks beyond what a scan asks, and how a
 * record finds its municipality. Keys are `LOCAL_ADS_PORTALS` keys.
 *
 * - `extra`: columns a scan does not need but the archive keeps — Brest's
 *   instruction stage and deadline, Paris's status line and programme. Never
 *   a column that names a person.
 * - `drop`: columns a scan asks for but that change on every republication
 *   without the dossier changing (none yet).
 * - `communeColumn`: the column that holds the INSEE code, when it is not the
 *   portal's own `communeColumn`. Bordeaux's file has one (`insee`) although
 *   the layer reads it by radius.
 * - `months`: how far back the sweep reads, when not the whole file.
 *   Bordeaux's starts in 2003 (315 408 records on 2026-11-17); its last 36
 *   months without certificats are 39 939 records and 37 MB, the window the
 *   layer itself reads.
 * - `fileAs`: the one file a portal without a commune column writes. Paris's
 *   records name their arrondissement, but the city is one register.
 * - `alsoCommunes`: municipalities the file holds that the layer reads from
 *   another source, and the archive keeps anyway.
 */
export const PORTAL_ARCHIVE = Object.freeze({
  paris: Object.freeze({
    extra: Object.freeze(['commune', 'libelle', 'programme', 'circonscription']), // i18n-ignore-line — upstream column names, never shown
    fileAs: '75056',
  }),
  bordeaux: Object.freeze({ communeColumn: 'insee', months: 36 }),
  nantes: Object.freeze({}),
  tours: Object.freeze({}),
  brest: Object.freeze({
    extra: Object.freeze([
      'NATURE_TRAVAUX', 'NB_LOGE_INDIV', 'NB_LOGE_COLLEC', 'NB_LOTS',
      'DATE_LIMITE_INSTRUCTION', 'STADE', 'OBSERVATION',
    ]),
    // No commune column: `PC 029 212 26 00040` is Plougastel-Daoulas (29212).
    communeFromDossier: 'NOM_DOSSIER',
    // Guipavas is left out of the portal's communes because the layer reads
    // its own lists (`adsFeed.js`), but the file holds it: 4 522 of 32 179
    // records on 2026-11-17. The archive keeps them under their own code.
    alsoCommunes: Object.freeze(['29075']),
  }),
  dodu: Object.freeze({}),
});

/** Columns that name the applicant; kept only as `organisationApplicant` lets them through. */
const APPLICANT_COLUMNS = new Set(['demandeur', 'applicant']);

/**
 * Columns never stored: those that only ever name people, whatever a portal
 * sends, and publication-actes.fr's `resultat_recherche`, which says how the
 * act was found, not what it is.
 */
const PERSON_COLUMNS = new Set(['nom_demandeur', 'personne_phys_mor', 'architecte', 'architect', 'resultat_recherche']); // i18n-ignore-line — upstream column names, never shown

/** Free text the applicant typed, where a name sometimes sits. */
const TEXT_COLUMNS = new Set([
  'objet', 'programme', 'details_du_projet', 'description_travaux', 'objet_des_travaux', // i18n-ignore-line — upstream column names, never shown
  'OBJET_DEMANDE', 'PRECISION_TRAVAUX', 'NATURE_TRAVAUX', 'OBSERVATION', 'purpose',
]);

/**
 * The columns the sweep asks a portal for: the scan's, plus the archive's
 * extras, minus what it drops.
 * @param {object} portal One of `LOCAL_ADS_PORTALS`.
 * @returns {Array<string>}
 */
export function portalArchiveColumns(portal) {
  const plan = PORTAL_ARCHIVE[portal.key] ?? {};
  const drop = new Set(plan.drop ?? []);
  const columns = [...portal.select, ...(plan.extra ?? [])].filter((column) => !drop.has(column));
  return [...new Set(columns)];
}

/** `{b: 1, a: {d, c}}` → `{"a":{"c":…,"d":…},"b":1}`: one text per record, whatever the key order. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * A record as it may be stored: persons out, everything else as served.
 * @param {*} record One portal record (a flat object).
 * @returns {?object} Null for anything that is not a record.
 */
export function scrubPortalRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const kept = {};
  for (const [column, value] of Object.entries(record)) {
    if (PERSON_COLUMNS.has(column)) continue;
    if (APPLICANT_COLUMNS.has(column)) kept[column] = organisationApplicant(value);
    else if (TEXT_COLUMNS.has(column) && typeof value === 'string') kept[column] = withoutPersonMentions(value);
    else kept[column] = value;
  }
  return Object.keys(kept).length ? kept : null;
}

/**
 * One record as the store keeps it: a single canonical JSON cell.
 * @param {*} record
 * @returns {?Array<string>}
 */
function scrubPortalRow(record) {
  const kept = scrubPortalRecord(record);
  return kept ? [canonical(kept)] : null;
}

/** A stored row, filtered again with today's scrub. */
function restorePortalRow(cells) {
  if (!Array.isArray(cells) || cells.length !== 1 || typeof cells[0] !== 'string') return cells;
  try {
    return scrubPortalRow(JSON.parse(cells[0])) ?? cells;
  } catch {
    return cells;
  }
}

/**
 * A store `kind` for any source whose rows are records (flat objects): each
 * kept as one canonical JSON cell, persons out. The portals use it, and so do
 * publication-actes.fr's acts and lists (`PUBACTES_ROWS`).
 * @param {Iterable<string>} boards The board names the source writes.
 * @returns {{board: Function, scrub: Function, restore: Function}}
 */
export function recordArchiveKind(boards) {
  const names = new Set(boards);
  return Object.freeze({
    board: (board) => names.has(board),
    scrub: scrubPortalRow,
    restore: restorePortalRow,
  });
}

/** How the archive store reads and keeps a portal's records (`createCartdsArchiveStore`'s `kind`). */
export const PORTAL_ROWS = recordArchiveKind([PORTAL_ARCHIVE_BOARD]);

/**
 * The stored records of a portal's archive, parsed back, each with the first
 * and last day it was served.
 * @param {?object} archive
 * @returns {Array<{record: object, first: string, last: string}>}
 */
export function archivedPortalRecords(archive) {
  const out = [];
  for (const row of archive?.rows ?? []) {
    try {
      out.push({ record: JSON.parse(row.cells[0]), first: row.first, last: row.last });
    } catch { /* an unreadable row is skipped, never thrown on */ }
  }
  return out;
}

/** `PC 029 212 26 00040` → `29212`; `DP 075 108 26 V0143` → `75108`. */
const DOSSIER_COMMUNE = /^[A-Z]{2,3}\s*0?(\d{2}|2[AB])\s*(\d{3})\b/i;

/**
 * The municipality a record is filed under in the archive: its own INSEE
 * code when it is one of the portal's, else the portal's single file.
 *
 * A record whose municipality cannot be read is NOT dropped: it is filed
 * under the portal's first municipality and counted by the sweep
 * (`unplaced`), because a record the archive does not keep is the loss this
 * archive exists to prevent.
 *
 * @param {object} portal One of `LOCAL_ADS_PORTALS`.
 * @param {object} record
 * @returns {{insee: string, placed: boolean}}
 */
export function portalArchiveCommune(portal, record) {
  const plan = PORTAL_ARCHIVE[portal.key] ?? {};
  if (plan.fileAs) return { insee: plan.fileAs, placed: true };
  const known = new Set(portalArchiveFiles(portal));
  let code = null;
  const column = plan.communeColumn ?? portal.communeColumn;
  if (column && record?.[column] !== null && record?.[column] !== undefined) {
    code = String(record[column]).trim().toUpperCase();
    if (/^\d{4}$/.test(code)) code = `0${code}`;
  } else if (plan.communeFromDossier) {
    const match = DOSSIER_COMMUNE.exec(String(record?.[plan.communeFromDossier] ?? '').trim());
    if (match) code = `${match[1]}${match[2]}`.toUpperCase();
  }
  if (code && known.has(code)) return { insee: code, placed: true };
  return { insee: portal.communes[0], placed: false };
}

/**
 * The municipalities a portal's archive writes a file for — what the archive
 * check expects after a sweep.
 * @param {object} portal One of `LOCAL_ADS_PORTALS`.
 * @returns {Array<string>}
 */
export function portalArchiveFiles(portal) {
  const plan = PORTAL_ARCHIVE[portal.key] ?? {};
  return plan.fileAs ? [plan.fileAs] : [...new Set([...portal.communes, ...(plan.alsoCommunes ?? [])])];
}

/**
 * Whether the sweep reads a portal one municipality at a time: when it can
 * ask by commune, so one failed commune is one failure and one answer stays
 * small. Paris (one file) and Brest (no commune column) are read whole.
 * @param {object} portal
 * @returns {?string} The column to ask by, or null.
 */
export function portalSweepColumn(portal) {
  if (portal.api === 'arcgis') return null;
  const plan = PORTAL_ARCHIVE[portal.key] ?? {};
  if (plan.fileAs) return null;
  return plan.communeColumn ?? portal.communeColumn ?? null;
}
