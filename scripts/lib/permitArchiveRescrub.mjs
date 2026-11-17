/**
 * Pass every stored row of the permit archive through today's scrub, once.
 *
 * `readCartdsArchive` already restores each row as it is read, so a sweep or
 * a scan that touches a municipality writes it back clean. This rewrites the
 * files nothing touches any more — a stopped source, a retired municipality —
 * so that no name the filter has since learned to drop stays on disk.
 * Introduced 2026-11-15 with the representatives filter (« SCI … - M. NOM »,
 * ~330 cells then) and the description filter (« isolation chez Prénom NOM »).
 *
 * Read-only unless `write`. A file that cannot be read as an archive is left
 * as it is: it may be the only copy of something. Rows the stricter filter
 * makes identical are merged with the earliest `first` and the latest `last`,
 * exactly as the next reading would merge them.
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { CARTDS_ROWS, readCartdsArchive } from '../../src/data/cartdsArchive.js';
import { EPERMIS_ROWS } from '../../src/data/epermisFeed.js';
import { MMM_ROWS } from '../../src/data/mmmPermitsFeed.js';
import { PERMIT_LIST_ROWS } from '../../src/data/permitListsFeed.js';
import { SIRAP_ROWS } from '../../src/data/sirapFeed.js';
import { PORTAL_ROWS } from '../../src/data/portalArchive.js';
import { PUBACTES_ROWS } from '../../src/data/publicationActesFeed.js';

/** The kind of rows each archive directory holds, as the server hands them to its stores. */
export const ARCHIVE_KINDS = Object.freeze({
  cartds: CARTDS_ROWS,
  sirap: SIRAP_ROWS,
  epermis: EPERMIS_ROWS,
  'permit-lists': PERMIT_LIST_ROWS,
  mmm: MMM_ROWS,
  portals: PORTAL_ROWS,
  'publication-actes': PUBACTES_ROWS,
});

async function writeAtomic(file, text) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(temp, text);
  await fsp.rename(temp, file);
}

/**
 * @param {string} root The archive root (`.gev-cache/archive`).
 * @param {{write?: boolean}} [options]
 * @returns {Promise<Record<string, {files: number, changed: number, restored: number, merged: number, skipped: number}>>}
 */
export async function rescrubPermitArchive(root, { write = false } = {}) {
  const report = {};
  for (const [family, kind] of Object.entries(ARCHIVE_KINDS)) {
    const dir = path.join(root, family);
    let names;
    try { names = await fsp.readdir(dir); } catch { continue; }
    const tally = { files: 0, changed: 0, restored: 0, merged: 0, skipped: 0 };
    for (const name of names) {
      if (!name.endsWith('.json') || name === 'sweep.json') continue;
      const file = path.join(dir, name);
      let document;
      try { document = JSON.parse(await fsp.readFile(file, 'utf8')); } catch { tally.skipped += 1; continue; }
      if (!document || typeof document.instance !== 'string' || typeof document.insee !== 'string') { tally.skipped += 1; continue; }
      tally.files += 1;
      const { archive, usable, restored } = readCartdsArchive(document, { key: document.instance }, document.insee, kind);
      if (!usable) { tally.skipped += 1; continue; }
      const merged = (document.rows?.length ?? 0) - archive.rows.length;
      if (!restored) continue;
      tally.changed += 1;
      tally.restored += restored;
      tally.merged += merged;
      if (write) await writeAtomic(file, JSON.stringify(archive));
    }
    report[family] = tally;
  }
  return report;
}
