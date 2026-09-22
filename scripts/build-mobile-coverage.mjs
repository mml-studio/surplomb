#!/usr/bin/env node
/**
 * Build the ARCEP 4G coverage pyramid the `anfr-fr` layer draws under its
 * masts — into `.gev-cache/mobile-coverage/<edition>/`, out of process.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A PROXY ────────────────────────────────────
 * The input is 1.35 GB of 7z that expands to 3.4 GB of GeoPackage — 55 million
 * vertices for Orange alone — and turning it into tiles takes GDAL, which the
 * container does not have, and about 9 GB of scratch disk. None of that belongs
 * in the process serving the globe (see `build-amenities-pack.mjs` for what
 * happened the one time something similar did). The server only reads the
 * finished tiles.
 *
 * ── WHAT IT NEEDS ───────────────────────────────────────────────────────────
 *   GDAL ≥ 3.8   ogr2ogr, gdal_rasterize        (`brew install gdal`)
 *   7-Zip        7zz or 7z                       (`brew install sevenzip`)
 *   ~12 GB of free disk in --work, network to data.arcep.fr and data.geopf.fr
 *
 * ── WHAT IT DOES ────────────────────────────────────────────────────────────
 *   1. finds the edition (`last` by default) on data.arcep.fr and downloads
 *      the four metropolitan 4G archives;
 *   2. extracts them, checks each file's operator code and levels;
 *   3. fetches the land mask — IGN ADMIN EXPRESS regions, full precision,
 *      metropolitan only — from the Géoplateforme WFS;
 *   4. reprojects each operator to Web Mercator and burns it into a zoom-12
 *      grid (38.2 m at the equator), one byte per pixel;
 *   5. streams the five rasters into a PNG pyramid (`scripts/lib/coverageTiler.mjs`)
 *      and writes `meta.json`: tile index, area histogram, provenance.
 *
 * Everything is staged in `<edition>.partial` and renamed into place, so an
 * interrupted build never leaves a half pyramid where the server looks.
 *
 * ── MEASURED ON 2026 T1 (2026-09-22, M-series Mac, 16 GB) ───────────────────
 * See the numbers `meta.json` records and `docs/CURRENT-STATE.md`. The slow
 * step is `gdal_rasterize`: give it a cache that holds the whole 1.86 GB grid
 * (`GDAL_CACHEMAX`, set here to 2 200 MB) or it thrashes the disk — four in
 * parallel on the default cache ran at 4–8 % CPU each.
 *
 * Usage:
 *   node scripts/build-mobile-coverage.mjs                      # last edition
 *   node scripts/build-mobile-coverage.mjs --edition 2026_T1
 *   node scripts/build-mobile-coverage.mjs --work ~/gev-couverture --out .gev-cache/mobile-coverage
 *   node scripts/build-mobile-coverage.mjs --check              # report the installed pyramid
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildCoveragePyramid } from './lib/coverageTiler.mjs';
import {
  COVERAGE_CURRENT_FILE,
  COVERAGE_META_FILE,
  readCoverageMeta,
} from './lib/mobileCoveragePack.mjs';
import {
  ARCEP_LEVEL_VALUES,
  COVERAGE_FORMAT,
  COVERAGE_MAX_ZOOM,
  COVERAGE_MIN_ZOOM,
  COVERAGE_OPERATORS,
  COVERAGE_TILE_PX,
} from '../src/data/mobileCoverage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCEP_BASE = 'https://data.arcep.fr/mobile/couvertures_theoriques';
const WFS_URL = 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0';
const WFS_REGIONS = 'ADMINEXPRESS-COG.LATEST:region';
/** INSEE region codes of metropolitan France start at 11 (01–06 are overseas). */
const METRO_REGION_FILTER = "code_insee >= '11'";
const MERCATOR_HALF_M = 20037508.342789244;
const GDAL_CACHE_MB = '2200';

export function parseArgs(argv) {
  const options = {
    edition: 'last',
    work: path.join(os.homedir(), 'gev-couverture'),
    out: path.join(ROOT, '.gev-cache', 'mobile-coverage'),
    check: false,
    jobs: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      return next;
    };
    if (arg === '--edition') options.edition = value();
    else if (arg === '--work') options.work = path.resolve(value());
    else if (arg === '--out') options.out = path.resolve(value());
    else if (arg === '--jobs') options.jobs = Math.max(1, Number.parseInt(value(), 10) || 1);
    else if (arg === '--check') options.check = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.edition !== 'last' && !/^\d{4}_T[1-4]$/.test(options.edition)) {
    throw new Error(`--edition must be last or YYYY_Tn, got ${options.edition}`);
  }
  return options;
}

/**
 * The tile-aligned Web-Mercator window around an extent, at `z`.
 * @returns {{tileX0:number, tileY0:number, cols:number, rows:number, te:number[], res:number}}
 */
export function mercatorTileWindow([minX, minY, maxX, maxY], z) {
  const res = (2 * MERCATOR_HALF_M) / (COVERAGE_TILE_PX * 2 ** z);
  const span = res * COVERAGE_TILE_PX;
  const tileX0 = Math.floor((minX + MERCATOR_HALF_M) / span);
  const tileX1 = Math.ceil((maxX + MERCATOR_HALF_M) / span);
  const tileY0 = Math.floor((MERCATOR_HALF_M - maxY) / span);
  const tileY1 = Math.ceil((MERCATOR_HALF_M - minY) / span);
  return {
    tileX0,
    tileY0,
    cols: (tileX1 - tileX0) * COVERAGE_TILE_PX,
    rows: (tileY1 - tileY0) * COVERAGE_TILE_PX,
    te: [tileX0 * span - MERCATOR_HALF_M, MERCATOR_HALF_M - tileY1 * span, tileX1 * span - MERCATOR_HALF_M, MERCATOR_HALF_M - tileY0 * span],
    res,
  };
}

/** `[west, south, east, north]` in degrees of a {@link mercatorTileWindow}. */
export function mercatorWindowBounds(window, z) {
  const n = 2 ** z;
  const lon = (tileX) => (tileX / n) * 360 - 180;
  const lat = (tileY) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * tileY) / n))) * 180) / Math.PI;
  const tileX1 = window.tileX0 + window.cols / COVERAGE_TILE_PX;
  const tileY1 = window.tileY0 + window.rows / COVERAGE_TILE_PX;
  const round = (v) => Math.round(v * 1e6) / 1e6;
  return [round(lon(window.tileX0)), round(lat(tileY1)), round(lon(tileX1)), round(lat(window.tileY0))];
}

function run(command, args, { env = {}, capture = false } = {}) {
  const result = spawnSync(command, args, {
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
  return result.stdout;
}

function which(names) {
  for (const name of names) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0) return name;
  }
  return null;
}

async function exists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

/** The archive names of one edition, read off the ARCEP directory listing. */
async function listEdition(edition) {
  const url = `${ARCEP_BASE}/${edition}/Metropole/00_Metropole/index.html`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const html = await response.text();
  const names = [...html.matchAll(/href="([^"]+_4G_data\.gpkg\.7z)"/g)].map((m) => m[1]);
  if (!names.length) throw new Error(`${url}: no 4G archive listed`);
  const resolved = /^(\d{4}_T[1-4])_/.exec(names[0])?.[1];
  if (!resolved) throw new Error(`${url}: cannot read the edition from ${names[0]}`);
  const archives = {};
  for (const op of COVERAGE_OPERATORS) {
    const name = names.find((n) => n.includes(`_Metropole_${op.arcep}_4G_data`));
    if (!name) throw new Error(`${url}: no 4G archive for ${op.name} (${op.arcep})`);
    archives[op.id] = { name, url: `${ARCEP_BASE}/${edition}/Metropole/00_Metropole/${name}` };
  }
  return { edition: resolved, archives };
}

function sqlQuote(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** Read one GeoPackage's layer name, `date` and `operateur` values, and levels. */
function inspectOperatorFile(gpkg) {
  const info = JSON.parse(run('ogrinfo', ['-json', '-so', gpkg], { capture: true }));
  const layer = info.layers?.[0]?.name;
  if (!layer) throw new Error(`${gpkg}: no layer`);
  const sql = `SELECT niveau, date, operateur, COUNT(*) AS n FROM ${sqlQuote(layer)} GROUP BY niveau, date, operateur`;
  const rows = JSON.parse(run('ogrinfo', ['-json', '-features', '-dialect', 'sqlite', '-sql', sql, gpkg], { capture: true }))
    .layers?.[0]?.features?.map((f) => f.properties) || [];
  return { layer, rows };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.check) {
    const meta = await readCoverageMeta(options.out);
    if (!meta) {
      console.log(`No coverage pyramid installed in ${options.out}`);
      process.exitCode = 1;
      return;
    }
    const tiles = Object.values(meta.tiles).reduce((sum, level) => sum + level.count, 0);
    console.log(`${meta.edition} (${meta.quarterEnd}) — ${tiles} tiles, z${meta.minZoom}–${meta.maxZoom}, `
      + `${(meta.bytes / 1e6).toFixed(1)} MB, land ${Math.round(meta.stats.landKm2)} km²`);
    return;
  }

  const sevenZip = which(['7zz', '7z']);
  if (!sevenZip) throw new Error('7-Zip not found (brew install sevenzip)');
  if (!which(['gdal_rasterize']) || !which(['ogr2ogr'])) throw new Error('GDAL not found (brew install gdal)');

  const listing = await listEdition(options.edition);
  const edition = listing.edition;
  const work = path.join(options.work, edition);
  const rasterDir = path.join(work, 'raster');
  await fsp.mkdir(rasterDir, { recursive: true });
  console.log(`[coverage] edition ${edition}, work dir ${work}`);

  // 1–2. Archives and GeoPackages.
  const operatorFiles = [];
  let quarterEnd = null;
  for (const op of COVERAGE_OPERATORS) {
    const { name, url } = listing.archives[op.id];
    const archive = path.join(work, name);
    if (!(await exists(archive))) {
      console.log(`[coverage] downloading ${name}`);
      run('curl', ['-fL', '--retry', '3', '-C', '-', '-o', archive, url]);
    }
    const gpkg = archive.replace(/\.7z$/, '');
    if (!(await exists(gpkg))) run(sevenZip, ['x', '-y', `-o${work}`, archive]);
    const { layer, rows } = inspectOperatorFile(gpkg);
    const codes = new Set(rows.map((r) => Number(r.operateur)));
    if (codes.size !== 1 || !codes.has(op.mccMnc)) {
      throw new Error(`${name}: operateur ${[...codes].join(',')} — expected ${op.mccMnc} (${op.name})`);
    }
    const levels = new Set(rows.map((r) => r.niveau));
    for (const level of levels) {
      if (!(level in ARCEP_LEVEL_VALUES)) throw new Error(`${name}: unknown niveau ${level}`);
    }
    const dates = new Set(rows.map((r) => r.date));
    if (dates.size !== 1) throw new Error(`${name}: several dates ${[...dates].join(', ')}`);
    quarterEnd ??= [...dates][0];
    if ([...dates][0] !== quarterEnd) throw new Error(`${name}: date ${[...dates][0]} ≠ ${quarterEnd}`);
    operatorFiles.push({ op, gpkg, layer, features: rows.reduce((sum, r) => sum + Number(r.n), 0) });
  }

  // 3. The land mask.
  const maskGpkg = path.join(options.work, 'regions-metropole-3857.gpkg');
  if (!(await exists(maskGpkg))) {
    const raw = path.join(options.work, 'regions-wfs.gpkg');
    console.log('[coverage] fetching IGN ADMIN EXPRESS regions');
    run('ogr2ogr', ['-f', 'GPKG', raw, `WFS:${WFS_URL}`, WFS_REGIONS, '-nln', 'region']);
    // The WFS answers MULTISURFACE, which gdal_rasterize silently skips.
    run('ogr2ogr', ['-f', 'GPKG', maskGpkg, raw, 'region', '-where', METRO_REGION_FILTER,
      '-nlt', 'MULTIPOLYGON', '-t_srs', 'EPSG:3857', '-nln', 'region']);
  }
  const maskInfo = JSON.parse(run('ogrinfo', ['-json', '-so', maskGpkg, 'region'], { capture: true }));
  const extent = maskInfo.layers[0].geometryFields[0].extent;
  const window = mercatorTileWindow(extent, COVERAGE_MAX_ZOOM);
  const te = window.te.map(String);
  const tr = [String(window.res), String(window.res)];
  console.log(`[coverage] grid ${window.cols} × ${window.rows} px at z${COVERAGE_MAX_ZOOM}, `
    + `tiles x ${window.tileX0}… y ${window.tileY0}…`);

  const rasterize = (source, layer, target, burn) => {
    if (fs.existsSync(target) && fs.statSync(target).size === window.cols * window.rows) return;
    const started = Date.now();
    run('gdal_rasterize', ['-q', ...burn, '-l', layer, '-te', ...te, '-tr', ...tr,
      '-ot', 'Byte', '-init', '0', '-of', 'ENVI', source, target], { env: { GDAL_CACHEMAX: GDAL_CACHE_MB } });
    console.log(`[coverage] ${path.basename(target)} in ${Math.round((Date.now() - started) / 1000)} s`);
  };
  rasterize(maskGpkg, 'region', path.join(rasterDir, 'mask.bin'), ['-burn', '1']);

  // 4. Each operator: Lambert-93 → Web Mercator, levels as 1/2/3, burnt.
  for (const file of operatorFiles) {
    const projected = path.join(work, `${file.op.arcep}-3857.gpkg`);
    const target = path.join(rasterDir, `${file.op.arcep}.bin`);
    if (fs.existsSync(target) && fs.statSync(target).size === window.cols * window.rows) continue;
    if (!(await exists(projected))) {
      const cases = Object.entries(ARCEP_LEVEL_VALUES).map(([k, v]) => `WHEN '${k}' THEN ${v}`).join(' ');
      run('ogr2ogr', ['-f', 'GPKG', projected, file.gpkg, '-dialect', 'sqlite',
        '-sql', `SELECT geom, CASE niveau ${cases} ELSE 0 END AS v FROM ${sqlQuote(file.layer)}`,
        '-t_srs', 'EPSG:3857', '-nln', 'cov', '-nlt', 'MULTIPOLYGON']);
    }
    rasterize(projected, 'cov', target, ['-a', 'v']);
  }

  // 5. The pyramid.
  const staging = path.join(options.out, `${edition}.partial`);
  await fsp.rm(staging, { recursive: true, force: true });
  await fsp.mkdir(staging, { recursive: true });
  const files = [...COVERAGE_OPERATORS.map((op) => `${op.arcep}.bin`), 'mask.bin']
    .map((name) => fs.openSync(path.join(rasterDir, name), 'r'));
  const buffers = files.map(() => Buffer.allocUnsafe(window.cols * COVERAGE_TILE_PX));
  const started = Date.now();
  let result;
  try {
    result = await buildCoveragePyramid({
      readRows: (rowStart, rows) => {
        files.forEach((fd, i) => {
          const length = window.cols * rows;
          const read = fs.readSync(fd, buffers[i], 0, length, rowStart * window.cols);
          if (read !== length) throw new Error(`short read at row ${rowStart}`);
        });
        return { ops: buffers.slice(0, 4), mask: buffers[4] };
      },
      dataCols: window.cols,
      dataRows: window.rows,
      originTileX: window.tileX0,
      originTileY: window.tileY0,
      maxZoom: COVERAGE_MAX_ZOOM,
      minZoom: COVERAGE_MIN_ZOOM,
      outDir: staging,
      onProgress: ({ strip, strips, files: written }) => {
        if (strip % 16 === 0 || strip === strips) console.log(`[coverage] strip ${strip}/${strips}, ${written} tiles`);
      },
    });
  } finally {
    files.forEach((fd) => fs.closeSync(fd));
  }

  const landKm2 = result.histogram.reduce((sum, v) => sum + v, 0);
  const meta = {
    format: COVERAGE_FORMAT,
    edition,
    quarterEnd,
    technology: '4G',
    usage: 'data',
    territory: 'metropole',
    minZoom: COVERAGE_MIN_ZOOM,
    maxZoom: COVERAGE_MAX_ZOOM,
    bounds: mercatorWindowBounds(window, COVERAGE_MAX_ZOOM),
    operators: COVERAGE_OPERATORS.map((op) => op.id),
    tiles: result.tiles,
    bytes: result.bytes,
    stats: {
      landKm2,
      histogramKm2: result.histogram.map((v) => Math.round(v * 1000) / 1000),
    },
    source: {
      publisher: 'ARCEP — Mon réseau mobile, cartes de couverture théorique',
      url: `${ARCEP_BASE}/${edition}/Metropole/00_Metropole/`,
      licence: 'Licence Ouverte (Etalab)',
      mask: 'IGN — ADMIN EXPRESS COG, régions (Licence Ouverte 2.0)',
      files: operatorFiles.map((f) => ({ operator: f.op.id, file: listing.archives[f.op.id].name, features: f.features })),
    },
    builtAt: new Date().toISOString(),
    buildSeconds: Math.round((Date.now() - started) / 1000),
  };
  await fsp.writeFile(path.join(staging, COVERAGE_META_FILE), `${JSON.stringify(meta)}\n`);
  const target = path.join(options.out, edition);
  await fsp.rm(target, { recursive: true, force: true });
  await fsp.rename(staging, target);
  await fsp.writeFile(path.join(options.out, COVERAGE_CURRENT_FILE), `${edition}\n`);
  console.log(`[coverage] ${result.files} tiles, ${(result.bytes / 1e6).toFixed(1)} MB, land ${Math.round(landKm2)} km², `
    + `in ${meta.buildSeconds} s → ${target}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[coverage] ${error.message}`);
    process.exitCode = 1;
  });
}
