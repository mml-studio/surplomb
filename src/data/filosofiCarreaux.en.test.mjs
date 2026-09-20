// The INSEE grid in English, on the same Lyon 1er cell the French tests pin.
//
// Two claims have to survive the translation intact:
//
//  1. the IMPUTATION line, which is three sentences and not two. INSEE models
//     a cell's figures under statistical confidentiality; with the flag absent
//     the card says the flag is absent, because "observed" is a claim a
//     missing column does not support.
//  2. the two channels a viewer cannot read off the picture — the disc's area
//     is a count, its color is the indicator — and the sentence that says the
//     emptiness around a disc is the basemap, not an absence of data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import {
  cellId, createFilosofiSelectedOverlayEntry, drawnOutline, filosofiLegend,
} from './filosofiCarreaux.js';
import {
  FILOSOFI_METRICS, cellSymbol, filosofiMetrics, resolveMetric,
} from './filosofiFeed.js';
import metricWords from './filosofiFeed.i18n.js';

const LYON_CELL = Object.freeze({
  n: 2_531_400, e: 3_918_600, ind: 538.5, men: 274, niveau: 22_872, pauvrete: 16.8,
  social: 28.5, surface: 68.5, jeunes: 22.8, aines: 8.9, proprietaires: 29.6,
  solo: 47.4, collectif: 100, est: 0, com: '69381',
});
const IMPUTED_CELL = Object.freeze({ ...LYON_CELL, n: 2_531_600, est: 1, ind: 6, men: 3 });

function record(cell, { resolution = 200, metric = 'niveau' } = {}) {
  const symbol = withLocale('fr', () => cellSymbol(cell, resolveMetric(metric), { resolution }));
  return {
    id: cellId(cell, resolution),
    cell,
    resolution,
    color: '#4f97c4',
    fill: symbol.fill,
    baseM: 180,
    lon: 4.83,
    lat: 45.76,
    corners: drawnOutline(cell, resolution, symbol.fill),
    holeCorners: symbol.hole > 0 ? drawnOutline(cell, resolution, symbol.hole) : null,
    position: Cesium.Cartesian3.fromDegrees(4.83, 45.76, 400),
  };
}

test('a cell card answers in English, with the euro where English puts it', (t) => {
  useTestLocale('en', t);
  const card = createFilosofiSelectedOverlayEntry(record(LYON_CELL), { 69381: 'Lyon 1er' });
  assert.equal(card.title, 'Lyon 1er');
  assert.ok(card.details.includes('539 residents · 274 households'), card.details);
  assert.ok(card.details.includes('Mean standard of living €22,872/year'), card.details);
  assert.ok(card.details.includes('16.8% of households below the poverty line'), card.details);
  assert.ok(card.details.includes('22.8% under 18 · 8.9% aged 65 and over'), card.details);
  assert.ok(card.details.includes('68.5 m² per dwelling on average'), card.details);
  assertNoFrench(card, { allow: ['Lyon 1er'] });
});

test('the imputation line is three sentences in English too', (t) => {
  useTestLocale('en', t);
  const imputed = createFilosofiSelectedOverlayEntry(record(IMPUTED_CELL), {});
  assert.ok(imputed.details.some((line) => line.startsWith('IMPUTED cell:')), imputed.details);
  const observed = createFilosofiSelectedOverlayEntry(record(LYON_CELL), {});
  assert.ok(observed.details.includes('Observed cell, not imputed'), observed.details);
  // The flag absent is its own sentence: "observed" is a claim a missing
  // column does not support.
  const silent = createFilosofiSelectedOverlayEntry(record({ ...LYON_CELL, est: null }), {});
  assert.ok(silent.details.includes('INSEE did not report whether this cell was imputed'),
    silent.details);
  // And both cards say what the two channels mean.
  for (const card of [imputed, observed]) {
    assert.ok(card.details.some((line) => line.startsWith('Disc area = ')), card.details);
  }
});

test('an absent income is published as an absence, in both languages', () => {
  const cell = { ...LYON_CELL, niveau: null };
  assert.ok(withLocale('en', () => createFilosofiSelectedOverlayEntry(record(cell), {}))
    .details.includes('Standard of living not published for this cell'));
  assert.ok(withLocale('fr', () => createFilosofiSelectedOverlayEntry(record(cell), {}))
    .details.includes('Niveau de vie non publié pour ce carreau'));
});

test('a 1 km cell names no commune, and titles itself in English', (t) => {
  useTestLocale('en', t);
  const coarse = createFilosofiSelectedOverlayEntry(
    record({ ...LYON_CELL, com: null }, { resolution: 1000 }), {},
  );
  assert.equal(coarse.title, '1 km cell');
  assert.ok(coarse.details.some((line) => line.startsWith('1 km cell · 2019 incomes')), coarse.details);
});

test('the legend carries its break VALUES and both shape channels in English', (t) => {
  useTestLocale('en', t);
  const legend = filosofiLegend(resolveMetric('niveau'), [LYON_CELL, IMPUTED_CELL]);
  // The ramp is absolute, so the numbers are the legend — not "low" and "high".
  assert.ok(legend[0].label.startsWith('< '), legend[0].label);
  assert.equal(legend[0].blurb, 'Bottom national decile — €/year per person');
  assert.ok(legend.at(-1).label === 'Hollow = imputed', legend.at(-1).label);
  const area = legend.find((row) => row.label === 'Area = residents');
  assert.ok(area, legend.map((row) => row.label).join(', '));
  assert.ok(area.blurb.includes('the emptiness around it is the basemap, not an absence of data'),
    area.blurb);
  assertNoFrench(legend);
});

test('a percentage legend says percent the English way, and a euro one says none', () => {
  const percent = withLocale('en', () => filosofiLegend(resolveMetric('pauvrete'), []));
  assert.match(percent[0].label, /%$/);
  assert.doesNotMatch(percent[0].label, / %$/, 'no space before the sign in English');
  assert.match(withLocale('fr', () => filosofiLegend(resolveMetric('pauvrete'), []))[0].label, / %$/);
  assert.doesNotMatch(withLocale('en', () => filosofiLegend(resolveMetric('niveau'), []))[0].label, /%/);
});

test('the eight indicators answer in English, and their ids never move', () => {
  const en = withLocale('en', () => filosofiMetrics());
  assert.deepEqual(en.map((metric) => metric.id), FILOSOFI_METRICS.map((metric) => metric.id));
  for (const metric of en) {
    for (const key of ['label', 'short', 'unit', 'blurb']) {
      assertNoFrench(metric[key], { message: `${metric.id}.${key}` });
    }
    // Every indicator states its unit: "27,100" means nothing without it.
    assert.ok(metric.unit.length > 2, `${metric.id} must state its unit`);
  }
  assert.equal(withLocale('en', () => resolveMetric('niveau')).label, 'Standard of living');
  assert.equal(withLocale('fr', () => resolveMetric('niveau')).label, 'Niveau de vie');
  // The drift guard: the exported table is the catalog's own French.
  for (const metric of FILOSOFI_METRICS) {
    assert.equal(metric.label, metricWords('fr')[metric.id].label, `${metric.id} drifted`);
  }
  // A metric id this build does not know falls back, in both languages.
  assert.equal(withLocale('en', () => resolveMetric('nope')).id, 'niveau');
});
