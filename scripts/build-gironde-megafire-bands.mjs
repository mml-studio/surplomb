#!/usr/bin/env node
/**
 * Build src/data/local_data/gironde_megafire_2026/bands.json — the three
 * "day-of-burning" rings of the July 2026 Gironde megafire, for the cinematic
 * rendering of the `gironde-megafire-2026` layer.
 *
 * Input: the frozen pack beside it, nothing else. `event.json` gives the five
 * dated Copernicus EMS perimeters (EMSR899) and the published burnt area of
 * each; `hotspots.json` gives the 9 524 NASA FIRMS detections of the window
 * (VIIRS on S-NPP, NOAA-20 and NOAA-21 at 375 m, MODIS at 1 km). No network,
 * no key: `scripts/build-gironde-megafire-2026.mjs` is what talks to upstreams.
 *
 * METHOD
 * ------
 * The footprint is the union of the five Copernicus perimeters, blurred by a
 * 350 m gaussian and thresholded low so the hundreds of small pieces close into
 * one shape. Every FIRMS detection stamps a disc of radius R with its exact
 * timestamp, and a grid node keeps the earliest. Region b is the footprint
 * ground stamped by the end of band b, blurred by 1.4 km and thresholded at
 * one half so it reads as a few round shapes, clipped to the footprint and
 * OR-ed with region b−1; the last region is the whole footprint. Polygons come
 * from marching squares on the blurred field, Douglas–Peucker at 30 m and two
 * Chaikin passes. Everything is in src/data/megafireBandsMath.js, which the
 * unit tests exercise on synthetic squares and discs.
 *
 * This is the "day-of-burning" map of the fire literature — interpolating
 * coarse satellite fire detections inside a mapped perimeter to date when each
 * part of it burned: S. A. Parks, "Mapping day-of-burning with coarse-resolution
 * satellite fire-detection data", International Journal of Wildland Fire 23
 * (2014) 215–223. Parks dated single days; the rings here group days into
 * three bands a reader can follow.
 *
 * CALIBRATION
 * -----------
 * R is fitted on SHAPE, not area. For each radius from 300 to 1500 m (step
 * 50 m) the region is built at the acquisition instants of DEL_MONIT01
 * (26 July 10:12 UTC) and GRA_PRODUCT (27 July 16:16) and compared node by
 * node, before contouring, with that product's burnt polygons. The radius kept
 * is the smallest whose mean intersection over union is within 0.005 of the
 * best. On this fire: 1 050 m, mean IoU 0.669 (0.623 and 0.715), with 0.7 %
 * and 1.2 % of what each image shows burnt left to a later ring. DEL_MONIT02
 * and GRA_MONIT01 are checks: 0.794 and 0.784. `method.calibration` records
 * the whole curve, so the choice can be re-read from the file.
 *
 * Area was tried first and rejected. At DEL_PRODUCT (24 July 09:05) no radius
 * comes near the 5 775.4 ha published — 300 m overshoots by 115 % — because
 * that delineation lags the detections: 939 of the 3 776 detections before it
 * lie more than 500 m outside its perimeter, 865 of them from the passes of
 * 01:00–03:00 UTC that night. It is excluded. On the later images
 * area is the wrong target: 300 m, the radius that comes nearest the published
 * hectares, scores the worst shape of the range (IoU 0.557 on DEL_MONIT01)
 * and leaves 11.4 % of the ground Copernicus already showed burnt to a later
 * ring — the gaps between 375 m pixels. The full argument is the CALIBRATION
 * note of megafireBandsMath.js.
 *
 * WHAT A RING DOES NOT SAY
 * ------------------------
 * - A ring shows where satellites saw heat ARRIVE, not where the flame front
 *   stood. A detection means "something in this pixel was hot at overpass
 *   time"; the pixel is 375 m (VIIRS) or 1 km (MODIS) across, and the few
 *   overpasses a day — fewer under smoke — quantise arrival to hours.
 * - The last band is "the rest of the footprint", not "ground that burned
 *   between 26 July and 1 August": it includes every patch Copernicus mapped as
 *   burnt where FIRMS never registered heat at all.
 * - Region AREAS read high: the two smoothings widen every edge (footprint
 *   38 916 ha drawn, 31 326.5 ha published), and at 1 050 m a third of the
 *   union on 26 July is ground the region lights and DEL_MONIT01 does not.
 *   Quote Copernicus's hectares, never these.
 * - Copernicus and FIRMS disagree after 27 July. Copernicus gains 3 317.7 ha
 *   between GRA_PRODUCT (27 July 16:16) and DEL_MONIT02 (29 July 14:07), while
 *   the FIRMS region at 1 050 m grows by 17.3 ha: either the late gain is
 *   smouldering or ground fire too cool or too brief for a 375 m pixel, or it
 *   is re-delineation of ground that burned earlier. The rings cannot tell; the
 *   summary below prints the region at every Copernicus image beside the
 *   published area and its IoU, so the gap is measured on each run.
 *
 * OUTPUT
 * ------
 * Compact JSON, coordinates to 5 decimals (~1.1 m). Two runs produce the same
 * bytes except `builtAt`, which is today's date unless `--date` says otherwise.
 * Schema: `gironde-megafire-2026/bands-1`, documented in megafireBandsMath.js.
 *
 * Usage:
 *   node scripts/build-gironde-megafire-bands.mjs
 *   node scripts/build-gironde-megafire-bands.mjs --date 2026-09-23
 *   node scripts/build-gironde-megafire-bands.mjs --radius 1000   (skip the search)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MEGAFIRE_BANDS_PARAMS,
  MEGAFIRE_DAY_BANDS,
  buildMegafireBands,
  regionAreaHa,
  regionVertexCount,
} from '../src/data/megafireBandsMath.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK = path.resolve(HERE, '..', 'src', 'data', 'local_data', 'gironde_megafire_2026');
const OUT = path.join(PACK, 'bands.json');

/** @param {string} message */
function log(message) { process.stdout.write(`${message}\n`); }

/**
 * `--date YYYY-MM-DD`, else today in UTC.
 * @returns {string}
 */
function builtAt() {
  const at = process.argv.indexOf('--date');
  if (at < 0) return new Date().toISOString().slice(0, 10);
  const value = process.argv[at + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error(`--date wants YYYY-MM-DD, got ${value}`);
  return value;
}

/**
 * `--radius <m>`: skip the calibration search and stamp at this radius. The
 * calibration area is still measured and recorded, so the file stays honest
 * about what the chosen radius does at the first Copernicus image.
 * @returns {number|null}
 */
function radiusOverride() {
  const at = process.argv.indexOf('--radius');
  if (at < 0) return null;
  const value = Number(process.argv[at + 1]);
  if (!(value > 0)) throw new Error(`--radius wants metres, got ${process.argv[at + 1]}`);
  return value;
}

const started = performance.now();
const event = JSON.parse(fs.readFileSync(path.join(PACK, 'event.json'), 'utf8'));
const hotspots = JSON.parse(fs.readFileSync(path.join(PACK, 'hotspots.json'), 'utf8'));
const trace = {};
const pack = buildMegafireBands({
  event,
  hotspots,
  bands: MEGAFIRE_DAY_BANDS,
  params: { builtAt: builtAt(), radiusM: radiusOverride() },
  trace,
});
const json = `${JSON.stringify(pack)}\n`;
fs.writeFileSync(OUT, json);
const seconds = (performance.now() - started) / 1000;

const { calibration } = pack.method;
const fmt = (v, d = 0) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => `${(v * 100).toFixed(1)} %`;
log(`bands.json — ${path.relative(process.cwd(), OUT)}`);
log(`  grid ${trace.grid.nx} × ${trace.grid.ny} nodes at ${trace.grid.cellM} m`);
log(`  calibration on shape against ${calibration.products.join(' + ')} — mean IoU, then Copernicus-only per image:`);
for (const c of trace.calibration) {
  const mark = c.radiusM === pack.method.radiusM ? '  ← smallest within 0.005 of the best' : '';
  log(`    R ${String(c.radiusM).padStart(4)} m  IoU ${c.iou.toFixed(3)}  `
    + `${c.perProduct.map((r) => `${r.product} ${r.iou.toFixed(3)} / ${pct(r.copernicusOnly).padStart(6)}`).join('  ')}${mark}`);
}
const bound = pack.method.radiusM === MEGAFIRE_BANDS_PARAMS.radiusCandidatesM[0]
  || pack.method.radiusM === MEGAFIRE_BANDS_PARAMS.radiusCandidatesM.at(-1);
log(`  chosen R = ${pack.method.radiusM} m, mean IoU ${calibration.chosenIoU.toFixed(3)}${bound ? ' — AT A BOUND of the search' : ''}`);
if (calibration.excluded) log(`  excluded ${calibration.excluded.product}: ${calibration.excluded.reason}`);
log(`  every Copernicus image at R = ${pack.method.radiusM} m (region area vs published, IoU, Copernicus-only, FIRMS-only):`);
for (const [i, img] of trace.perImage.entries()) {
  const step = event.steps[i];
  const role = calibration.products.includes(img.product) ? 'fit  '
    : calibration.checks.some((c) => c.product === img.product) ? 'check' : 'out  ';
  log(`    ${role} ${img.at} ${img.product.padEnd(12)} ${fmt(img.regionHa, 1).padStart(9)} ha vs ${fmt(step.burntHa, 1).padStart(9)} ha  `
    + `IoU ${img.iou.toFixed(3)}  ${pct(img.copernicusOnly).padStart(6)}  ${pct(img.firmsOnly).padStart(6)}`);
}
log(`  footprint ${fmt(pack.footprintHa, 1)} ha as drawn (raster ${fmt(trace.footprintRasterHa, 1)} ha)`);
let vertices = 0;
let fillHa = 0;
for (const [b, band] of pack.bands.entries()) {
  const rv = regionVertexCount(band.region); const bv = regionVertexCount(band.band);
  vertices += rv + bv;
  fillHa += regionAreaHa(band.band);
  log(`  ${band.id.padEnd(14)} ${fmt(band.detections).padStart(5)} detections · region ${fmt(band.regionHa, 1).padStart(9)} ha `
    + `(${((band.regionHa / pack.footprintHa) * 100).toFixed(1)} % of footprint) · `
    + `${band.region.length} polygon(s), ${rv} + ${bv} vertices · anchor ${band.anchor.lat}, ${band.anchor.lon}`
    + `${trace.anchorRelaxed[b] < 1 ? ` (thresholds relaxed ×${trace.anchorRelaxed[b]})` : ''}`);
}
log(`  band fills add up to ${fmt(fillHa, 1)} ha, ${(((fillHa - pack.footprintHa) / pack.footprintHa) * 100).toFixed(2)} % off the footprint`);
log(`  ${vertices} vertices · ${fmt(Buffer.byteLength(json) / 1024, 1)} KB · ${seconds.toFixed(1)} s`);
