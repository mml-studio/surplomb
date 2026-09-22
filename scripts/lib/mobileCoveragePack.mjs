/**
 * The on-disk contract of the ARCEP coverage pyramid, and the two HTTP
 * handlers that serve it: `/api/anfr-fr/coverage` (the meta) and
 * `/tiles/mobile-coverage/<edition>/<z>/<x>/<y>.png` (the tiles).
 *
 * Under `scripts/` for the same reason as `filosofiPack.mjs`: it imports
 * `node:fs` and is read by the Vite config and a build script, never by a page.
 *
 * ── THE LAYOUT ──────────────────────────────────────────────────────────────
 *   .gev-cache/mobile-coverage/
 *     current                 the edition being served, e.g. `2026_T1`
 *     2026_T1/meta.json       tile index, area histogram, provenance
 *     2026_T1/<z>/<x>/<y>.png grey+alpha tiles (see src/data/mobileCoverage.js)
 *
 * ── WHY THE TILES ARE NOT UNDER /api ────────────────────────────────────────
 * A coverage view asks for 30 to 90 tiles at once. Cloudflare's rule on the
 * public origin counts `/api/*` per IP (measured at 30 requests per 10 s on
 * the old hostname), and the `anfr-fr` proxy has its own limiter at 60 a
 * minute: one pan across the Alps would lock the reader out of every API in
 * the app. Static tiles go around both, and their URL carries the edition, so
 * they are immutable and cacheable at the edge.
 *
 * @module scripts/lib/mobileCoveragePack
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { COVERAGE_FORMAT } from '../../src/data/mobileCoverage.js';

export const COVERAGE_META_FILE = 'meta.json';
export const COVERAGE_CURRENT_FILE = 'current';
export const COVERAGE_TILE_ROUTE = '/tiles/mobile-coverage';
const EDITION_PATTERN = /^\d{4}_T[1-4]$/;
const TILE_PATTERN = /^\/(\d{4}_T[1-4])\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png$/;

let _cached = null;

/**
 * The installed pyramid's meta, or null when none is installed.
 *
 * Re-read when `current` or the meta file changes on disk, so installing a new
 * edition does not need a restart; otherwise served from memory.
 */
export async function readCoverageMeta(root) {
  let edition;
  let metaPath;
  let stamp;
  try {
    edition = (await fsp.readFile(path.join(root, COVERAGE_CURRENT_FILE), 'utf8')).trim();
    if (!EDITION_PATTERN.test(edition)) return null;
    metaPath = path.join(root, edition, COVERAGE_META_FILE);
    stamp = `${metaPath}:${(await fsp.stat(metaPath)).mtimeMs}`;
  } catch {
    return null;
  }
  if (_cached?.stamp === stamp) return _cached.meta;
  try {
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'));
    if (meta?.format !== COVERAGE_FORMAT || meta.edition !== edition) return null;
    _cached = { stamp, meta };
    return meta;
  } catch {
    return null;
  }
}

/**
 * `GET /api/anfr-fr/coverage` — the meta, or a 404 that names the command.
 * @returns {Promise<{status:number, body:object, headers:object}>}
 */
export async function coverageMetaResponse(root) {
  const meta = await readCoverageMeta(root);
  if (!meta) {
    return {
      status: 404,
      body: {
        error: 'No coverage pyramid on this server',
        build: 'node scripts/build-mobile-coverage.mjs',
      },
      headers: { 'Cache-Control': 'no-store' },
    };
  }
  return { status: 200, body: meta, headers: { 'Cache-Control': 'public, max-age=300' } };
}

/** Parse a tile path relative to the route, or null. */
export function parseCoverageTilePath(pathname) {
  const match = TILE_PATTERN.exec(pathname || '');
  if (!match) return null;
  const [, edition, z, x, y] = match;
  return { edition, z: Number(z), x: Number(x), y: Number(y) };
}

/**
 * Connect-style handler for `/tiles/mobile-coverage`.
 *
 * The path is rebuilt from four validated integers and an edition that must
 * match `YYYY_Tn`, so nothing a client sends reaches the filesystem as text.
 * A tile that was never written — sea, or abroad — is a 404 with a day of
 * cache; the client does not ask for those anyway (it reads the meta's index).
 */
export function createCoverageTileHandler(root) {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    const tile = parseCoverageTilePath(pathname);
    if (!tile) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('Not a coverage tile');
      return;
    }
    const file = path.join(root, tile.edition, String(tile.z), String(tile.x), `${tile.y}.png`);
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' });
        res.end('No tile');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(file).pipe(res);
    });
  };
}
