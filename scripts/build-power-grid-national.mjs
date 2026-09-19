#!/usr/bin/env node
/**
 * Build the national pack the Power Grid layer draws above 120 km:
 * `src/data/local_data/power_grid_fr/national.json`.
 *
 * Every high-voltage route and substation OpenStreetMap has mapped in
 * metropolitan France, projected by the same code the per-viewport proxy runs
 * (`projectPowerGrid`), then cut and simplified by `buildPowerGridNationalPack`
 * — see `src/data/powerGridNational.js` for what each cut is and what it
 * measured.
 *
 *   npm run power-grid:national                  # tiles from cache, fetch the missing ones
 *   npm run power-grid:national -- --refresh     # re-query every tile
 *   npm run power-grid:national -- --from a.json # build from an Overpass dump instead
 *   npm run power-grid:national -- --check       # read the shipped pack and report it
 *
 * The country is asked for in 2° tiles, one at a time, and each answer is kept
 * under `.gev-cache/power-grid-national/` (gitignored). A single query for the
 * whole country took four minutes on 2026-09-19 and loses everything to one
 * 504; a tile is seconds, and a rebuild after a failure only re-asks the tiles
 * that failed. Tiles go out SERIALLY with a pause between them: this is a
 * build, not a race, and a public mirror escalates a burst from 504 to 429 to a
 * refused connection (see the Overpass notes in `vite.config.js`).
 *
 * A tile that no mirror answers FAILS the build rather than shipping a pack
 * with a hole the shape of a region in it. `--allow-partial` accepts the hole
 * deliberately and records the missing tiles in the pack.
 */
import { promises as fsp, readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  buildDepartementIndex,
  locateDepartement,
  nearestDepartementWithin,
} from '../src/data/franceDepartements.js';
import {
  POWER_GRID_NATIONAL_BBOX,
  POWER_GRID_NATIONAL_QUERY_TIMEOUT_SEC,
  POWER_GRID_NATIONAL_TOLERANCE_M,
  POWER_GRID_NATIONAL_VERSION,
  buildPowerGridNationalPack,
  mergeOverpassElements,
  powerGridNationalAgeDays,
  powerGridNationalTileQuery,
  powerGridNationalTiles,
} from '../src/data/powerGridNational.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'src/data/local_data/power_grid_fr/national.json');
const CACHE_DIR = path.join(REPO_ROOT, '.gev-cache/power-grid-national');
const DEPARTEMENTS = path.join(REPO_ROOT, 'src/data/local_data/france_departements/departements.geojson');

/** Same agent string as the proxy — FOSSGIS answers an anonymous one with 406. */
const USER_AGENT = 'surplomb/1.0 (+https://github.com/mml-studio/surplomb)';
/**
 * The proxy's own rotation, minus the last-resort mirror: a build can wait for
 * FOSSGIS to come back, and has no reason to send a country's worth of queries
 * to a third party the proxy only reaches when everything else is down.
 */
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
/** Pause between two tiles, and between two retry rounds. */
const TILE_PAUSE_MS = 2_000;
const RETRY_ROUND_PAUSE_MS = 30_000;
const RETRY_ROUNDS = 3;
/** Coastal snap for the France test — the bundled outlines cut small bays straight across. */
const COAST_SNAP_KM = 2;
/**
 * Oldest OSM base a tile may be built from, in days.
 *
 * NOT a nicety: on 2026-09-19 `overpass.private.coffee` answered five tiles of
 * this build from THREE different databases — bases of 2026-06-01, 07-15 and
 * 07-24 — while FOSSGIS answered the other twenty-five from that morning. A
 * mirror serving a months-old snapshot answers `200` with a plausible element
 * count, so the only thing that gives it away is `osm3s.timestamp_osm_base`.
 * A stale answer is treated like a failed one: the next mirror is asked.
 */
const MAX_BASE_AGE_DAYS = 7;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (line) => process.stderr.write(`${line}\n`);

/** `inFrance` over the bundled département outlines, with the coastal snap. */
function franceTest(index) {
  const box = POWER_GRID_NATIONAL_BBOX;
  return (lat, lon) => {
    if (lat < box.south || lat > box.north || lon < box.west || lon > box.east) return false;
    if (locateDepartement(index, lat, lon)) return true;
    return Boolean(nearestDepartementWithin(index, lat, lon, COAST_SNAP_KM));
  };
}

/** One tile, against the first mirror that answers with a usable body. */
async function fetchTile(tile) {
  const query = powerGridNationalTileQuery(tile);
  let lastError = null;
  for (const mirror of OVERPASS_MIRRORS) {
    const started = Date.now();
    try {
      const response = await fetch(mirror, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          'Accept-Encoding': 'gzip',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout((POWER_GRID_NATIONAL_QUERY_TIMEOUT_SEC + 30) * 1000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload?.elements)) throw new Error('no elements array');
      // Overpass reports a query that ran out of time or memory as a 200 with a
      // `remark` and whatever it had so far — a truncated tile, not an answer.
      if (/runtime error|timed out|out of memory/i.test(String(payload.remark || ''))) {
        throw new Error(`truncated: ${String(payload.remark).slice(0, 120)}`);
      }
      const osmBase = payload.osm3s?.timestamp_osm_base || null;
      const ageDays = (Date.now() - Date.parse(osmBase || '')) / 86_400_000;
      if (!(ageDays <= MAX_BASE_AGE_DAYS)) {
        throw new Error(`stale database (OSM base ${osmBase || 'missing'})`);
      }
      log(`  ${tile.key}: ${payload.elements.length} elements in ${((Date.now() - started) / 1000).toFixed(1)} s from ${new URL(mirror).host}`);
      return { elements: payload.elements, osmBase };
    } catch (error) {
      lastError = error;
      log(`  ${tile.key}: ${new URL(mirror).host} failed (${error.message})`);
    }
  }
  throw lastError || new Error('every Overpass mirror failed');
}

function tilePath(tile) {
  return path.join(CACHE_DIR, `${tile.key}.json.gz`);
}

/**
 * A cached tile, or null when there is none — or when the cache holds one from
 * a stale database, which a rebuild must re-ask for rather than ship again.
 * Staleness here is against the tile's own FETCH time, so a cache a month old
 * but fetched fresh from a live database stays usable offline.
 */
async function readCachedTile(tile) {
  try {
    const parsed = JSON.parse(zlib.gunzipSync(await fsp.readFile(tilePath(tile))).toString('utf8'));
    if (!Array.isArray(parsed?.elements)) return null;
    const lagDays = (Date.parse(parsed.at || '') - Date.parse(parsed.osmBase || '')) / 86_400_000;
    if (!(lagDays <= MAX_BASE_AGE_DAYS)) {
      log(`  ${tile.key}: cached answer came from a stale database (OSM base ${parsed.osmBase}) — re-asking`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedTile(tile, answer) {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  const body = JSON.stringify({ at: new Date().toISOString(), tile, ...answer });
  await fsp.writeFile(tilePath(tile), zlib.gzipSync(body));
}

/** Every tile, from cache when allowed, fetching the rest in serial rounds. */
async function collectTiles(tiles, { refresh }) {
  const answers = new Map();
  let pending = [];
  for (const tile of tiles) {
    const cached = refresh ? null : await readCachedTile(tile);
    if (cached) answers.set(tile.key, cached);
    else pending.push(tile);
  }
  log(`${tiles.length} tiles: ${answers.size} cached, ${pending.length} to fetch`);
  for (let round = 1; round <= RETRY_ROUNDS && pending.length; round += 1) {
    if (round > 1) {
      log(`retry round ${round} for ${pending.length} tile(s) in ${RETRY_ROUND_PAUSE_MS / 1000} s`);
      await sleep(RETRY_ROUND_PAUSE_MS);
    }
    const failed = [];
    for (const tile of pending) {
      try {
        const answer = await fetchTile(tile);
        await writeCachedTile(tile, answer);
        answers.set(tile.key, answer);
      } catch {
        failed.push(tile);
      }
      await sleep(TILE_PAUSE_MS);
    }
    pending = failed;
  }
  return { answers, missing: pending.map((tile) => tile.key) };
}

/** Oldest Overpass base among the answers — the pack is as old as its oldest tile. */
function oldestBase(bases) {
  const stamps = bases.filter(Boolean).map((base) => [base, Date.parse(base)]).filter(([, t]) => Number.isFinite(t));
  if (!stamps.length) return null;
  stamps.sort((a, b) => a[1] - b[1]);
  return stamps[0][0];
}

/**
 * The pack as text, one array element per line — strokes, substations and the
 * dictionaries alike.
 *
 * A single 2.8 MB line is a file git can only ever store whole: every rebuild
 * would add the full pack to the history. One element per line lets a rebuild
 * that moved forty routes cost forty lines of delta, and lets a reviewer read
 * the diff.
 */
function serializePack(pack) {
  const parts = Object.entries(pack).map(([key, value]) => {
    if (!Array.isArray(value)) return `${JSON.stringify(key)}:${JSON.stringify(value)}`;
    if (!value.length) return `${JSON.stringify(key)}:[]`;
    return `${JSON.stringify(key)}:[\n${value.map((item) => JSON.stringify(item)).join(',\n')}\n]`;
  });
  return `{\n${parts.join(',\n')}\n}\n`;
}

function summarize(pack) {
  const stats = pack.stats || {};
  const lines = [
    `version ${pack.version}, built ${pack.builtAt}, OSM base ${pack.osmBase || 'unknown'}`
      + ` (${powerGridNationalAgeDays(pack) ?? '?'} days old)`,
    `${stats.strokes} strokes, ${Math.round(stats.lengthKm).toLocaleString('fr-FR')} km`
      + ` (${Math.round(stats.undergroundKm).toLocaleString('fr-FR')} km underground),`
      + ` ${stats.substations} substations, ${stats.routes} route names`,
    `${stats.vertices} vertices drawn of ${stats.publishedVertices} mapped (tolerance ${pack.toleranceM} m)`,
    `dropped: ${JSON.stringify(stats.dropped)}`,
  ];
  for (const tier of pack.tiers || []) {
    lines.push(`  ${tier.label.padEnd(12)} ${String(tier.strokes).padStart(6)} strokes`
      + ` ${String(Math.round(tier.lengthKm)).padStart(7)} km ${String(tier.substations).padStart(5)} substations`);
  }
  if (pack.missingTiles?.length) lines.push(`MISSING TILES: ${pack.missingTiles.join(', ')}`);
  return lines.join('\n');
}

async function main() {
  const out = path.resolve(option('--out', DEFAULT_OUT));

  if (flag('--check')) {
    const pack = JSON.parse(await fsp.readFile(out, 'utf8'));
    if (pack.version !== POWER_GRID_NATIONAL_VERSION) {
      throw new Error(`pack version ${pack.version}, this build reads ${POWER_GRID_NATIONAL_VERSION} — rebuild it`);
    }
    process.stdout.write(`${summarize(pack)}\n`);
    return;
  }

  const index = buildDepartementIndex(JSON.parse(readFileSync(DEPARTEMENTS, 'utf8')));
  const inFrance = franceTest(index);
  const tolerance = Number(option('--tolerance', POWER_GRID_NATIONAL_TOLERANCE_M));

  let elementLists = [];
  let bases = [];
  let missingTiles = [];
  const from = option('--from');
  if (from) {
    for (const file of from.split(',')) {
      const text = file.endsWith('.gz')
        ? zlib.gunzipSync(await fsp.readFile(file)).toString('utf8')
        : await fsp.readFile(file, 'utf8');
      const payload = JSON.parse(text);
      elementLists.push(payload.elements || []);
      bases.push(payload.osm3s?.timestamp_osm_base || payload.osmBase || null);
      log(`${file}: ${(payload.elements || []).length} elements`);
    }
  } else {
    const tiles = powerGridNationalTiles(index.list.map((entry) => entry.bbox));
    const { answers, missing } = await collectTiles(tiles, { refresh: flag('--refresh') });
    if (missing.length && !flag('--allow-partial')) {
      throw new Error(`${missing.length} tile(s) never answered (${missing.join(', ')}) — `
        + 're-run to retry only those, or pass --allow-partial to ship the hole deliberately');
    }
    missingTiles = missing;
    elementLists = [...answers.values()].map((answer) => answer.elements);
    bases = [...answers.values()].map((answer) => answer.osmBase);
  }

  const started = Date.now();
  const elements = mergeOverpassElements(elementLists);
  const pack = buildPowerGridNationalPack(elements, {
    inFrance,
    toleranceM: tolerance,
    osmBase: oldestBase(bases),
  });
  if (missingTiles.length) pack.missingTiles = missingTiles;
  if (pack.stats.strokes < 1000) {
    // A national build with a few hundred routes is a mirror serving an empty
    // or regional database, not France — refuse it rather than ship it.
    throw new Error(`only ${pack.stats.strokes} strokes — refusing to write a pack that small`);
  }
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const text = serializePack(pack);
  // The serializer is hand-rolled, so the file is proven to BE the pack before
  // it replaces the one the layer ships.
  const reread = JSON.parse(text);
  if (reread.strokes.length !== pack.strokes.length || reread.substations.length !== pack.substations.length) {
    throw new Error('serialized pack does not read back as the pack that was built');
  }
  await fsp.writeFile(out, text, 'utf8');
  const bytes = (await fsp.stat(out)).size;
  const brotli = zlib.brotliCompressSync(await fsp.readFile(out)).length;
  log(`built in ${Date.now() - started} ms from ${elements.length} elements`);
  process.stdout.write(`${summarize(pack)}\n`);
  process.stdout.write(`wrote ${path.relative(REPO_ROOT, out)}: ${(bytes / 1e6).toFixed(2)} MB,`
    + ` ${(brotli / 1e3).toFixed(0)} KB brotli\n`);
}

main().catch((error) => {
  process.stderr.write(`build-power-grid-national: ${error.message}\n`);
  process.exitCode = 1;
});
