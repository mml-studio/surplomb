// The shipped day-of-burning rings, read the way the layer will read them.
//
// bands.json is generated once and committed, so nothing re-runs the pipeline
// before a reader sees it. These tests are the contract the layer code is
// written against — the schema, the three bands and their instants, rings
// that nest, fills that tile the footprint, labels that do not collide — and
// the budget that keeps the file cheap to ship: 20 000 vertices, 300 KB.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildMegafireBands,
  detectionsOutside,
  distanceToBoundaryM,
  distanceToRegionM,
  pointInRegion,
  polygonsBbox,
  regionAreaHa,
  regionVertexCount,
  ringAreaHa,
} from './megafireBandsMath.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACK = path.join(HERE, 'local_data', 'gironde_megafire_2026');
const FILE = path.join(PACK, 'bands.json');
const bytes = fs.readFileSync(FILE);
const pack = JSON.parse(bytes.toString('utf8'));
const event = JSON.parse(fs.readFileSync(path.join(PACK, 'event.json'), 'utf8'));
const hotspots = JSON.parse(fs.readFileSync(path.join(PACK, 'hotspots.json'), 'utf8'));

// Written out rather than imported: the file must match the contract, not
// whatever the builder's constant says today.
const EXPECTED = [
  { id: 'jul-22-23', days: ['2026-07-22', '2026-07-23'], from: '2026-07-22T11:55:00Z', to: '2026-07-23T22:00:00Z' },
  { id: 'jul-24-25', days: ['2026-07-24', '2026-07-25'], from: '2026-07-23T22:00:00Z', to: '2026-07-25T22:00:00Z' },
  {
    id: 'jul-26-aug-01',
    days: ['2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01'],
    from: '2026-07-25T22:00:00Z',
    to: '2026-08-01T12:44:00Z',
  },
];

const eachRing = function* (region) {
  for (const polygon of region) for (const ring of polygon) yield ring;
};

test('bands.json carries its schema, build date and method', () => {
  assert.equal(pack.schema, 'gironde-megafire-2026/bands-1');
  assert.match(pack.builtAt, /^\d{4}-\d{2}-\d{2}$/);
  const m = pack.method;
  assert.equal(m.timeZone, 'Europe/Paris');
  assert.equal(m.cellM, 60);
  for (const key of ['radiusM', 'smoothM', 'footprintSmoothM', 'minPolygonHa', 'simplifyM']) {
    assert.ok(Number.isFinite(m[key]) && m[key] > 0, key);
  }
  assert.ok(m.radiusM >= 300 && m.radiusM <= 1500, 'the radius comes from the 300–1500 m search');
});

test('the calibration record: shape against 26 and 27 July, checked on 29 July and 1 August', () => {
  const cal = pack.method.calibration;
  assert.equal(cal.objective, 'iou');
  assert.deepEqual(cal.products, ['DEL_MONIT01', 'GRA_PRODUCT']);
  assert.deepEqual(cal.fit.map((f) => f.product), cal.products);
  assert.deepEqual(cal.checks.map((c) => c.product), ['DEL_MONIT02', 'GRA_MONIT01']);
  for (const c of cal.checks) assert.ok(c.iou >= 0.6, `${c.product} IoU ${c.iou}`);
  const radii = cal.perRadius.map((r) => r.radiusM);
  assert.deepEqual(radii, Array.from({ length: 25 }, (_, i) => 300 + i * 50));
  const best = Math.max(...cal.perRadius.map((r) => r.iou));
  const chosen = cal.perRadius.find((r) => r.radiusM === pack.method.radiusM);
  assert.equal(chosen.iou, cal.chosenIoU);
  // The rule runs on unrounded means; the record is rounded to 0.001.
  assert.ok(chosen.iou >= best - 0.005 - 0.001, 'the chosen radius is within 0.005 of the best');
  for (const r of cal.perRadius) {
    if (r.radiusM < chosen.radiusM) assert.ok(r.iou < best - 0.005 + 0.001, `${r.radiusM} m would have qualified`);
  }
});

test('DEL_PRODUCT is excluded with the count of detections that outran it', () => {
  const first = event.steps[0];
  assert.equal(first.product, 'DEL_PRODUCT');
  const epoch = Date.parse(hotspots.epoch);
  const lag = detectionsOutside(
    first.rings,
    hotspots.rows.map((r) => r[0]),
    hotspots.rows.map((r) => r[1]),
    hotspots.rows.map((r) => epoch + r[2] * 60000),
    Date.parse(first.acq),
    500,
  );
  assert.deepEqual(pack.method.calibration.excluded, {
    product: 'DEL_PRODUCT',
    reason: `lags the detections: ${lag.outside} of ${lag.total} earlier detections lie > 500 m outside it`,
  });
  assert.ok(lag.outside / lag.total > 0.2, 'a fifth of the earlier detections is a lag, not noise');
});

/**
 * IoU of a drawn region against a Copernicus product, point-sampled on a
 * 200 m lattice — deliberately NOT the builder's grid, so the recorded figure
 * is checked by a second method.
 */
function sampledAgreement(region, rings) {
  const boxes = rings.map((polygon) => polygonsBbox([polygon]));
  const burnt = (lon, lat) => rings.some((polygon, i) => {
    const b = boxes[i];
    return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north && pointInRegion(lon, lat, [polygon]);
  });
  const box = polygonsBbox([...region, ...rings]);
  const dLat = 200 / 111132; const dLon = 200 / (111320 * Math.cos((box.south * Math.PI) / 180));
  let both = 0; let union = 0; let mappedOnly = 0;
  for (let lat = box.south; lat <= box.north; lat += dLat) {
    for (let lon = box.west; lon <= box.east; lon += dLon) {
      const a = pointInRegion(lon, lat, region); const b = burnt(lon, lat);
      if (a || b) union += 1;
      if (a && b) both += 1;
      if (b && !a) mappedOnly += 1;
    }
  }
  return { iou: both / union, copernicusOnly: mappedOnly / union };
}

test('at the chosen radius the rings match the 26–27 July images in shape: IoU ≥ 0.6, ≤ 10 % left out on 26 July', () => {
  const step = (product) => event.steps.find((s) => s.product === product);
  const [monit, grading] = [step('DEL_MONIT01'), step('GRA_PRODUCT')];
  // The same pipeline, with bands that end at the two acquisitions.
  const rebuilt = buildMegafireBands({
    event,
    hotspots,
    bands: [
      { id: 'monit', days: [], from: event.window.start, to: monit.acq },
      { id: 'grading', days: [], from: monit.acq, to: grading.acq },
      { id: 'rest', days: [], from: grading.acq, to: event.window.end },
    ],
    params: { radiusM: pack.method.radiusM },
  });
  const a = sampledAgreement(rebuilt.bands[0].region, monit.rings);
  const b = sampledAgreement(rebuilt.bands[1].region, grading.rings);
  const mean = (a.iou + b.iou) / 2;
  assert.ok(mean >= 0.6, `mean IoU ${mean.toFixed(3)}`);
  assert.ok(a.copernicusOnly <= 0.1, `${(a.copernicusOnly * 100).toFixed(1)} % of 26 July's burnt ground left to a later ring`);
  assert.ok(Math.abs(mean - pack.method.calibration.chosenIoU) < 0.02,
    `sampled ${mean.toFixed(3)} against recorded ${pack.method.calibration.chosenIoU}`);
  const fit = pack.method.calibration.fit.find((f) => f.product === 'DEL_MONIT01');
  assert.ok(fit.copernicusOnly <= 0.1);
});

test('three bands, in order, with the fixed ids, days and instants', () => {
  assert.equal(pack.bands.length, 3);
  pack.bands.forEach((band, b) => {
    assert.equal(band.id, EXPECTED[b].id);
    assert.deepEqual(band.days, EXPECTED[b].days);
    assert.equal(band.from, EXPECTED[b].from);
    assert.equal(band.to, EXPECTED[b].to);
  });
  assert.equal(pack.bands[0].from, event.window.start);
  assert.equal(pack.bands.at(-1).to, event.window.end);
});

test('the detection counts split the window without gap or overlap', () => {
  const epoch = Date.parse(hotspots.epoch);
  const counts = pack.bands.map((band, b) => hotspots.rows.filter((r) => {
    const t = epoch + r[2] * 60000;
    return t <= Date.parse(band.to) && (t > Date.parse(band.from) || (b === 0 && t === Date.parse(band.from)));
  }).length);
  assert.deepEqual(pack.bands.map((b) => b.detections), counts);
  assert.equal(counts.reduce((s, v) => s + v, 0), hotspots.rows.length);
});

test('every ring is open, rounded, and wound outer counter-clockwise, holes clockwise', () => {
  for (const band of pack.bands) {
    for (const region of [band.region, band.band]) {
      assert.ok(region.length >= 1);
      for (const polygon of region) {
        polygon.forEach((ring, r) => {
          assert.ok(ring.length >= 6 && ring.length % 2 === 0);
          assert.ok(ring[0] !== ring.at(-2) || ring[1] !== ring.at(-1), 'the first vertex is not repeated');
          for (const v of ring) assert.equal(v, Math.round(v * 1e5) / 1e5);
          assert.ok(r === 0 ? ringAreaHa(ring) > 0 : ringAreaHa(ring) < 0, `${band.id} ring ${r} winding`);
        });
      }
    }
  }
});

test('each region nests in the next, to 150 m', () => {
  for (let b = 0; b + 1 < pack.bands.length; b += 1) {
    let worst = 0;
    for (const ring of eachRing(pack.bands[b].region)) {
      for (let i = 0; i < ring.length; i += 2) {
        worst = Math.max(worst, distanceToRegionM(ring[i], ring[i + 1], pack.bands[b + 1].region));
      }
    }
    assert.ok(worst <= 150, `${pack.bands[b].id} strays ${worst.toFixed(0)} m outside ${pack.bands[b + 1].id}`);
  }
});

test('region areas are what the rings enclose, growing to the whole footprint', () => {
  for (const band of pack.bands) assert.ok(Math.abs(regionAreaHa(band.region) - band.regionHa) < 0.1, band.id);
  assert.ok(Math.abs(regionAreaHa(pack.bands.at(-1).region) - pack.footprintHa) < 0.1);
  assert.equal(pack.bands.at(-1).regionHa, pack.footprintHa);
  for (let b = 1; b < pack.bands.length; b += 1) assert.ok(pack.bands[b].regionHa > pack.bands[b - 1].regionHa);
});

test('the band fills tile the footprint to 3 %', () => {
  const fills = pack.bands.reduce((s, band) => s + regionAreaHa(band.band), 0);
  assert.ok(Math.abs(fills - pack.footprintHa) / pack.footprintHa <= 0.03, `${fills} ha against ${pack.footprintHa} ha`);
  assert.deepEqual(pack.bands[0].band, pack.bands[0].region, 'the first fill is the first region');
});

test('every label anchor sits on its ring and at least 3 km from the others', () => {
  for (const band of pack.bands) {
    const d = distanceToBoundaryM(band.anchor.lon, band.anchor.lat, band.region);
    assert.ok(d <= 100, `${band.id} anchor ${d.toFixed(0)} m off its ring`);
  }
  for (let a = 0; a < pack.bands.length; a += 1) {
    for (let b = a + 1; b < pack.bands.length; b += 1) {
      const p = pack.bands[a].anchor; const q = pack.bands[b].anchor;
      const dx = (p.lon - q.lon) * 111320 * Math.cos((p.lat * Math.PI) / 180);
      const dy = (p.lat - q.lat) * 111132;
      assert.ok(Math.hypot(dx, dy) >= 3000, `${pack.bands[a].id} and ${pack.bands[b].id} labels ${Math.hypot(dx, dy).toFixed(0)} m apart`);
    }
  }
});

test('the file stays within budget: 20 000 vertices and 300 KB', () => {
  const vertices = pack.bands.reduce((s, band) => s + regionVertexCount(band.region) + regionVertexCount(band.band), 0);
  assert.ok(vertices <= 20000, `${vertices} vertices`);
  assert.ok(bytes.length <= 300 * 1024, `${bytes.length} bytes`);
});
