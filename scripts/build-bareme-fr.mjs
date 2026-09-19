#!/usr/bin/env node
/**
 * Measure the national scale — the distribution, among French residents, of
 * what the site report computes at an address.
 *
 * ── THE PROBLEM IT SOLVES ───────────────────────────────────────────────────
 * `implantationFiche.js` can say “1.04 km² reachable on foot in ten minutes,
 * 4,210 residents, average standard of living €22,400/yr”. Nobody knows
 * whether that is a lot, and no source publishes it: the national distribution
 * of “the area a French resident reaches on foot in ten minutes” does not
 * exist in open data. It only exists if someone measures it. That is what this
 * script does.
 *
 * ── WHY IT DOES NOT REUSE `FILOSOFI_RAMPS` ──────────────────────────────────
 * The repository already carries national quantiles of the same indicators,
 * and reusing them would have cost nothing. They are the quantiles of a 200 m
 * grid CELL; the report averages some thirty cells over a ring. Averaging
 * flattens the tails, and a ring value scored against a cell scale gets a
 * plausible and wrong letter. So the script measures both on THE SAME sample
 * and publishes the gap: that is the figure that justifies this work.
 *
 * ── THE SAMPLE IS A SAMPLE OF RESIDENTS, NOT OF PLACES ──────────────────────
 * Drawing points at random on the map of France means drawing fields. Drawing
 * municipalities means giving Saint-Front-sur-Lémance the weight of Lyon. The
 * draw is therefore made with probability proportional to population, in two
 * stages: first a 1 km cell among the 377,234 INSEE publishes, with a
 * probability proportional to its residents; then a 200 m cell inside it, the
 * same way. Each draw therefore designates ONE resident, and the center of
 * their 200 m cell — at most 141 m from their home — serves as the door. The
 * quantiles are then read without weighting: the weighting is IN the draw.
 *
 * SYSTEMATIC draw, not multinomial: a constant step over the cumulative
 * population, which spreads the sample over the whole country instead of
 * letting chance bunch it up. A cell more populated than the step is drawn
 * several times, which is correct — it carries several residents — and each
 * draw picks a different 200 m cell in it.
 *
 * ── EVERY POINT GOES THROUGH THE APP'S ROUTES ───────────────────────────────
 * `/api/isochrone`, `/api/filosofi/carreaux` and `/api/dvf`, on a running
 * instance, and the aggregation by `aggregateInRing()` imported from the
 * module the report uses. Querying IGN directly would have been simpler and
 * would have measured ANOTHER distribution than the one the reader sees: the
 * national scale must come out of the same code path as the measurement it
 * scores.
 *
 * ── WHAT IT COSTS ───────────────────────────────────────────────────────────
 * The national 1 km grid: 76 WFS pages, ~50 MB, two and a half minutes,
 * cached in `.gev-cache/` — it is only fetched again when the data vintage
 * changes. Each sample point: one 200 m WFS, one IGN isochrone, one grid WFS
 * through the proxy, one DVF. Measured at ~5 s per point, so about 25 minutes
 * for 300 draws. The raw observations are written next to the grid, so that
 * recomputing a scale no longer costs anything.
 *
 * Usage:
 *   node scripts/build-bareme-fr.mjs --frame
 *   node scripts/build-bareme-fr.mjs --sample 300 --url http://localhost:5199
 *   node scripts/build-bareme-fr.mjs --from .gev-cache/bareme-fr/observations.json
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCarreauxUrl, cellCentre, cellCorners, parseCellId, projectCarreaux, resolutionForBox,
} from '../src/data/filosofiFeed.js';
import { aggregateInRing, ringBounds } from '../src/data/implantationFeed.js';
import { BAREME_INDICATORS, BAREME_LADDER_Q } from '../src/data/baremeNational.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(REPO_ROOT, '.gev-cache', 'bareme-fr');
const FRAME_PATH = path.join(CACHE_DIR, 'frame-1km.json');
const OBSERVATIONS_PATH = path.join(CACHE_DIR, 'observations.json');

const WFS = 'https://data.geopf.fr/wfs/ows';
const FRAME_TYPENAME = 'INSEE.FILOSOFI.INDICATORS:carreaux_1km';
const FRAME_PAGE = 5_000;

/**
 * The three boxes where INSEE publishes a grid, and not one more.
 *
 * The same as the local pack's `PACK_BOXES`. A single mainland box would have
 * left Martinique and La Réunion out of the national scale, and the scale
 * would still have been applied to them — the failure the grid's color scale
 * has already run into.
 */
const FRAME_BOXES = Object.freeze([
  { name: 'métropole', box: { west: -5.3, south: 41.2, east: 9.7, north: 51.2 } },
  { name: 'Martinique', box: { west: -61.3, south: 14.3, east: -60.7, north: 15.0 } },
  { name: 'La Réunion', box: { west: 55.1, south: -21.5, east: 55.9, north: -20.8 } },
]);

/** The ring the national scale describes. The report's default time step. */
const RING_SECONDS = 600;
/** The radius the DVF layer sweeps, and so the radius of the price per m². */
const DVF_RADIUS_M = 300;
/** The grid's box padding, in degrees — the same as `ficheFetch`. */
const PAD_DEG = 0.004;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const say = (line) => process.stderr.write(`${line}\n`);

/**
 * A reproducible pseudo-random generator.
 *
 * The draw must be replayable: two runs of the same script with the same seed
 * must designate the same residents, otherwise comparing two data vintages
 * measures the draw as much as the country.
 * @param {number} seed
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Systematic sampling with probability proportional to size.
 *
 * @param {Array<{weight: number}>} units Stable order — it fixes the result.
 * @param {number} n Number of draws.
 * @param {() => number} random For the starting offset only.
 * @returns {number[]} Drawn indices, repeats possible.
 */
export function systematicPps(units, n, random) {
  const total = units.reduce((sum, unit) => sum + Math.max(0, unit.weight || 0), 0);
  if (!(total > 0) || n <= 0) return [];
  const step = total / n;
  let target = random() * step;
  const picked = [];
  let cursor = 0;
  for (let i = 0; i < units.length && picked.length < n; i += 1) {
    cursor += Math.max(0, units[i].weight || 0);
    while (picked.length < n && target < cursor) {
      picked.push(i);
      target += step;
    }
  }
  return picked;
}

/**
 * A simple weighted draw, to pick a 200 m cell inside a 1 km one.
 * @param {Array<{weight: number}>} units
 * @param {() => number} random
 * @returns {number} The drawn index, or -1.
 */
export function weightedPick(units, random) {
  const total = units.reduce((sum, unit) => sum + Math.max(0, unit.weight || 0), 0);
  if (!(total > 0)) return -1;
  let target = random() * total;
  for (let i = 0; i < units.length; i += 1) {
    target -= Math.max(0, units[i].weight || 0);
    if (target <= 0) return i;
  }
  return units.length - 1;
}

/**
 * UNweighted quantiles of a sample already drawn in proportion to
 * population.
 *
 * Reweighting here would count the population twice. The convention is the
 * nearest lower rank, the same as `build-filosofi-ramp.mjs`, so that the two
 * scales stay readable side by side.
 * @param {number[]} values
 * @param {number[]} quantiles
 * @returns {Array<number|null>}
 */
export function sampleQuantiles(values, quantiles) {
  const usable = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!usable.length) return quantiles.map(() => null);
  return quantiles.map((q) => {
    const index = Math.min(usable.length - 1, Math.max(0, Math.ceil(q * usable.length) - 1));
    return usable[index];
  });
}

/** Round to a step without leaving the binary residue trailing. */
export function roundTo(value, step) {
  if (!Number.isFinite(value)) return null;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/** @param {string} url @param {number} [timeoutMs] */
async function getJson(url, timeoutMs = 60_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Same as above, but a failure is an absence, not an exception. */
async function tryJson(url, timeoutMs = 40_000) {
  try {
    const payload = await getJson(url, timeoutMs);
    return payload && !payload.error ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Sweep the national 1 km grid, or read it back from the cache.
 * @returns {Promise<{builtAt: string, cells: Array<{id: string, ind: number}>}>}
 */
async function loadFrame({ refresh = false } = {}) {
  if (!refresh && fs.existsSync(FRAME_PATH)) {
    const cached = JSON.parse(await fsp.readFile(FRAME_PATH, 'utf8'));
    say(`Trame relue du cache : ${cached.cells.length} carreaux de 1 km`
      + ` (${cached.builtAt}).`);
    return cached;
  }
  const cells = [];
  for (const { name, box } of FRAME_BOXES) {
    let start = 0;
    let matched = null;
    for (;;) {
      const params = new URLSearchParams({
        SERVICE: 'WFS',
        VERSION: '2.0.0',
        REQUEST: 'GetFeature',
        TYPENAMES: FRAME_TYPENAME,
        OUTPUTFORMAT: 'application/json',
        PROPERTYNAME: 'id_inspire,ind',
        COUNT: String(FRAME_PAGE),
        STARTINDEX: String(start),
        BBOX: `${box.west},${box.south},${box.east},${box.north},EPSG:4326`,
      });
      // eslint-disable-next-line no-await-in-loop -- pagination is sequential by nature.
      const payload = await getJson(`${WFS}?${params}`);
      const features = payload.features || [];
      if (matched === null) matched = Number(payload.numberMatched) || null;
      for (const feature of features) {
        const props = feature.properties || {};
        const ind = Number(props.ind);
        if (props.id_inspire && Number.isFinite(ind) && ind > 0) {
          cells.push({ id: String(props.id_inspire), ind });
        }
      }
      start += features.length;
      say(`  ${name.padEnd(12)} ${String(start).padStart(7)} / ${matched ?? '?'}`);
      if (!features.length || (matched !== null && start >= matched)) break;
      // eslint-disable-next-line no-await-in-loop -- deliberate pacing.
      await sleep(250);
    }
  }
  // Stable order: the systematic draw depends on the order, and an order that
  // changes from one run to the next makes the seed useless.
  cells.sort((a, b) => (a.id < b.id ? -1 : 1));
  const frame = { builtAt: new Date().toISOString().slice(0, 10), cells };
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  await fsp.writeFile(FRAME_PATH, JSON.stringify(frame));
  return frame;
}

/**
 * Choose the door: a 200 m cell drawn inside the designated 1 km cell.
 * @returns {Promise<{lon: number, lat: number, cell: object}|null>}
 */
async function drawDoor(kmCellId, random) {
  const parsed = parseCellId(kmCellId);
  if (!parsed || parsed.res !== 1000) return null;
  const corners = cellCorners(parsed);
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  const box = {
    west: Math.min(...lons), east: Math.max(...lons),
    south: Math.min(...lats), north: Math.max(...lats),
  };
  const payload = await tryJson(buildCarreauxUrl({ box, resolution: 200, count: 200 }));
  if (!payload) return null;
  const { cells } = projectCarreaux(payload, { resolution: 200, count: 200 });
  const inhabited = cells.filter((cell) => Number.isFinite(cell.ind) && cell.ind > 0);
  if (!inhabited.length) return null;
  const index = weightedPick(inhabited.map((cell) => ({ weight: cell.ind })), random);
  if (index < 0) return null;
  const cell = inhabited[index];
  const [lon, lat] = cellCentre({ res: 200, n: cell.n, e: cell.e, crs: cell.crs });
  return { lon, lat, cell };
}

/**
 * Measure a point exactly as the report measures it.
 * @returns {Promise<object>} An observation, or a named refusal.
 */
async function measurePoint(base, lon, lat) {
  const isochrone = await tryJson(
    `${base}/api/isochrone?lat=${lat}&lon=${lon}&profile=foot&seconds=${RING_SECONDS}`,
  );
  const ring = isochrone?.rings?.[0] ?? null;
  if (!ring?.ring?.length) return { refused: 'isochrone' };

  const bounds = ringBounds(ring.ring);
  if (!bounds) return { refused: 'anneau' };
  const resolution = resolutionForBox(bounds);
  const carreaux = await tryJson(`${base}/api/filosofi/carreaux`
    + `?south=${(bounds.south - PAD_DEG).toFixed(5)}`
    + `&west=${(bounds.west - PAD_DEG).toFixed(5)}`
    + `&north=${(bounds.north + PAD_DEG).toFixed(5)}`
    + `&east=${(bounds.east + PAD_DEG).toFixed(5)}`
    + `&resolution=${resolution}`);
  if (!carreaux) return { refused: 'carroyage' };
  // A truncated page does not give a floor usable in a quantile: it gives a
  // value that is too low, which no flag will catch once the scale is
  // published. It is counted as a refusal, not as a measurement.
  if (carreaux.truncated) return { refused: 'carroyage tronqué' };

  const demand = aggregateInRing(
    carreaux.cells || [],
    ring.holes?.length ? [ring.ring, ...ring.holes] : ring.ring,
    carreaux.resolution || resolution,
  );
  if (!demand || !(demand.people.count > 0)) return { refused: 'anneau vide' };

  const dvf = await tryJson(`${base}/api/dvf?lat=${lat}&lon=${lon}&radius=${DVF_RADIUS_M}`);

  return {
    lon,
    lat,
    resolution: demand.resolution,
    acces: ring.areaKm2 ?? null,
    habitants: demand.people.count,
    menages: demand.households.count,
    niveau: demand.niveau,
    pauvrete: demand.pauvrete,
    social: demand.social,
    jeunes: demand.jeunes,
    aines: demand.aines,
    solo: demand.solo,
    proprietaires: demand.proprietaires,
    prixM2: dvf?.summary?.medianPrixM2 ?? null,
    dvfSales: dvf?.summary?.count ?? 0,
  };
}

/** The scales, from the observations. */
function buildLadders(observations) {
  const bareme = {};
  for (const indicator of BAREME_INDICATORS) {
    const values = observations
      .map((row) => row[indicator.id])
      .filter((v) => Number.isFinite(v));
    bareme[indicator.id] = {
      geometry: indicator.geometry,
      unit: indicator.unit,
      measured: values.length,
      ladder: sampleQuantiles(values, BAREME_LADDER_Q)
        .map((value) => roundTo(value, indicator.round)),
    };
  }
  return bareme;
}

/**
 * The gap between the ring scale and the cell scale, on the SAME sample —
 * the figure that says whether this work was worth it.
 */
function carreauComparison(doors) {
  const keys = ['niveau', 'pauvrete', 'social', 'jeunes', 'aines', 'solo', 'proprietaires'];
  const out = {};
  for (const key of keys) {
    const indicator = BAREME_INDICATORS.find((entry) => entry.id === key);
    const values = doors.map((cell) => cell?.[key]).filter((v) => Number.isFinite(v));
    out[key] = sampleQuantiles(values, BAREME_LADDER_Q)
      .map((value) => roundTo(value, indicator?.round ?? 0.1));
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  const base = String(flag('--url', process.env.QA_BASE_URL || 'http://localhost:5199'))
    .replace(/\/+$/, '');
  const size = Number(flag('--sample', '300'));
  const seed = Number(flag('--seed', '20260908'));
  const asJson = argv.includes('--json');
  const from = flag('--from', null);

  let observations;
  let doors;
  let meta;

  if (from) {
    const saved = JSON.parse(await fsp.readFile(path.resolve(REPO_ROOT, from), 'utf8'));
    ({ observations, doors, meta } = saved);
    say(`Observations relues : ${observations.length} anneaux (${meta.measuredAt}).`);
    // A checkpoint has only seen the southern half of the country — the grid is
    // sorted by northing. It is read back to resume or to look, never to publish
    // a scale, and the script refuses to print a block to paste from it.
    if (meta.partial) {
      say(`⚠ Fichier PARTIEL (${meta.partial} tirages sur la campagne, sud du pays`
        + ' seulement). Sortie limitée à --json.');
      if (!asJson) {
        process.exitCode = 1;
        return;
      }
    }
  } else {
    const frame = await loadFrame({ refresh: argv.includes('--frame') });
    const framePeople = frame.cells.reduce((sum, cell) => sum + cell.ind, 0);
    say(`Trame : ${frame.cells.length} carreaux habités de 1 km,`
      + ` ${Math.round(framePeople).toLocaleString('fr-FR')} habitants.`);
    if (argv.includes('--frame') && !argv.includes('--sample')) return;

    const random = mulberry32(seed);
    const picks = systematicPps(frame.cells.map((cell) => ({ weight: cell.ind })), size, random);
    say(`Tirage systématique : ${picks.length} habitants sur`
      + ` ${new Set(picks).size} carreaux de 1 km distincts.\n`);

    observations = [];
    doors = [];
    const refusals = {};
    let done = 0;
    for (const index of picks) {
      done += 1;
      const kmCell = frame.cells[index];
      // eslint-disable-next-line no-await-in-loop -- sequential on purpose: see the header.
      const door = await drawDoor(kmCell.id, random);
      if (!door) {
        refusals.porte = (refusals.porte || 0) + 1;
        // eslint-disable-next-line no-await-in-loop
        await sleep(250);
        continue;
      }
      doors.push(door.cell);
      // eslint-disable-next-line no-await-in-loop
      const observation = await measurePoint(base, door.lon, door.lat);
      if (observation.refused) {
        refusals[observation.refused] = (refusals[observation.refused] || 0) + 1;
      } else {
        observations.push(observation);
      }
      const label = observation.refused
        ? `refus (${observation.refused})`
        : `${observation.acces} km², ${observation.habitants} hab.`;
      say(`  ${String(done).padStart(4)}/${picks.length}`
        + ` ${door.lat.toFixed(4)},${door.lon.toFixed(4)}  ${label}`);
      // Checkpoint. A campaign lasts half an hour, and half an hour of
      // measurements lost because the machine went to sleep is that much public
      // service wasted on top of ours: the file is rewritten every twenty-five
      // points, and `--from` knows how to read it back.
      //
      // A PARTIAL FILE IS NOT A NATIONAL SAMPLE. The grid is sorted by
      // `id_inspire`, so by ascending northing: the draw climbs the country
      // from south to north — which implicitly stratifies the COMPLETE sample
      // by latitude, and that is the reason for the sort — but a campaign
      // stopped halfway has only seen the southern half. The file is for
      // resuming, never for publishing a scale.
      if (done % 25 === 0) {
        // eslint-disable-next-line no-await-in-loop
        await fsp.mkdir(CACHE_DIR, { recursive: true });
        // eslint-disable-next-line no-await-in-loop
        await fsp.writeFile(OBSERVATIONS_PATH, JSON.stringify({
          meta: { measuredAt: new Date().toISOString().slice(0, 10), partial: done, refusals },
          observations,
          doors,
        }, null, 1));
      }
      // eslint-disable-next-line no-await-in-loop -- IGN publishes 5 req/s with no SLA.
      await sleep(250);
    }
    meta = {
      measuredAt: new Date().toISOString().slice(0, 10),
      seconds: RING_SECONDS,
      dvfRadiusM: DVF_RADIUS_M,
      seed,
      drawn: picks.length,
      kmCells: new Set(picks).size,
      frameCells: frame.cells.length,
      framePeople: Math.round(framePeople),
      frameBuiltAt: frame.builtAt,
      refusals,
    };
    await fsp.mkdir(CACHE_DIR, { recursive: true });
    await fsp.writeFile(OBSERVATIONS_PATH,
      JSON.stringify({ meta, observations, doors }, null, 1));
    say(`\nObservations écrites dans ${path.relative(REPO_ROOT, OBSERVATIONS_PATH)}.`);
  }

  const bareme = buildLadders(observations);
  const result = {
    ...meta,
    rings: observations.length,
    quantiles: BAREME_LADDER_Q,
    bareme,
    carreau: carreauComparison(doors || []),
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stderr.write('\n');
  process.stdout.write(`// Mesuré le ${result.measuredAt} sur ${result.rings} anneaux piétons`
    + ` de ${RING_SECONDS / 60} min, tirés à probabilité proportionnelle à la population\n`);
  process.stdout.write(`// sur ${result.frameCells.toLocaleString('fr-FR')} carreaux de 1 km`
    + ` (${result.framePeople.toLocaleString('fr-FR')} habitants).`
    + ` Refus : ${JSON.stringify(result.refusals)}\n`);
  for (const indicator of BAREME_INDICATORS) {
    const scale = bareme[indicator.id];
    process.stdout.write(`  ${indicator.id}: Object.freeze({ geometry: '${scale.geometry}',`
      + ` measured: ${scale.measured},\n    ladder: Object.freeze(${
        JSON.stringify(scale.ladder)}) }),\n`);
  }
  // The sample block, ready to paste as well: half the errors in this kind of
  // work come from a scale copied with the previous campaign's sample size,
  // and the percentile margin is derived from it.
  process.stdout.write(`\n  measuredAt: '${result.measuredAt}',\n`
    + `  rings: ${result.rings},\n`
    + `  drawn: ${result.drawn},\n`
    + `  marginPt: ${roundTo(2 * Math.sqrt(0.25 / result.rings) * 100, 0.1)},\n`
    + `  frameCells: ${result.frameCells},\n`
    + `  framePeople: ${result.framePeople},\n`
    + `  frameBuiltAt: '${result.frameBuiltAt}',\n`
    + `  seconds: ${result.seconds},\n`
    + `  dvfRadiusM: ${result.dvfRadiusM},\n`
    + `  seed: ${result.seed},\n`
    + `  refusals: ${JSON.stringify(result.refusals)},\n`);
  process.stdout.write('\n// Les mêmes indicateurs au CARREAU de 200 m, même échantillon :\n');
  for (const [key, ladder] of Object.entries(result.carreau)) {
    process.stdout.write(`// ${key.padEnd(14)} ${JSON.stringify(ladder)}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
