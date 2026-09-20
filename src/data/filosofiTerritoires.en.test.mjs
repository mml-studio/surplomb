// The national regime in English, on the same captured Melodi answer and the
// same shipped anchor pack the French tests use.
//
// What must survive the translation is the card's refusal to let three
// publishers be read as one: 2023 for the income, 2023 for the population,
// 2024 for the wage — and the two capitalized words, MEDIAN and PEOPLE, that
// keep this regime apart from the grid, which shows a MEAN and counts
// households.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import {
  createTerritorySelectedOverlayEntry,
  joinTerritories,
  territoryChips,
  territoryLegend,
  territoryStats,
} from './filosofiTerritoires.js';
import {
  TERRITORY_METRICS,
  foldTerritoryObservations,
  resolveTerritoryMetric,
  territoryLevel,
  territoryMetrics,
  territoryScope,
} from './filosofiTerritoiresFeed.js';
import metricWords from './filosofiTerritoiresFeed.i18n.js';

const SAMPLE = JSON.parse(
  readFileSync(new URL('./fixtures/filosofi-territoires-sample.json', import.meta.url), 'utf8'),
);
const ANCHORS = JSON.parse(
  readFileSync(new URL('./local_data/france_territoires/territoires.json', import.meta.url), 'utf8'),
);
const rows = () => [...foldTerritoryObservations(SAMPLE).values()];
const gironde = () => joinTerritories(rows(), ANCHORS, 'DEP').records
  .find((record) => record.code === '33');

/** Department and region names the pack publishes. */
const PLACES = ['Gironde', 'La Réunion', 'Nouvelle-Aquitaine'];

test('every card line still carries its year, in English', (t) => {
  useTestLocale('en', t);
  const card = createTerritorySelectedOverlayEntry(gironde(), resolveTerritoryMetric('niveau'));
  assert.equal(card.title, 'Gironde (33)');
  const text = card.details.join('\n');
  assert.match(text, /2023 census/);
  assert.match(text, /Filosofi 2023/);
  assert.match(text, /2024/, 'the wage year');
  // The two words that stop the grid and the territory being read as one.
  assert.match(text, /MEDIAN standard of living/);
  assert.match(text, /of PEOPLE below the poverty line/);
  assert.match(text, /the layer shows a MEAN/);
  assert.match(text, /Disc area = residents/);
  assertNoFrench(card, { allow: PLACES });
});

test('the euro moves to the front of the amount, and the French does not move', () => {
  const en = withLocale('en', () => createTerritorySelectedOverlayEntry(
    gironde(), resolveTerritoryMetric('niveau'),
  )).details.join('\n');
  const fr = withLocale('fr', () => createTerritorySelectedOverlayEntry(
    gironde(), resolveTerritoryMetric('niveau'),
  )).details.join('\n');
  assert.match(en, /MEDIAN standard of living €[\d,]+\/year per person/);
  assert.match(fr, /Niveau de vie MÉDIAN [\d\s ]+ €\/an par personne/);
  assert.match(fr, /MOYENNE/, 'the French sentence is byte-identical');
});

test('the card names the grid vintage the proxy would serve, in English too', () => {
  const packed = withLocale('en', () => createTerritorySelectedOverlayEntry(
    { ...gironde(), carroyageVintage: 2021 }, resolveTerritoryMetric('niveau'),
  ));
  assert.match(packed.details.join('\n'), /2021 vintage/);
});

test('the legend explains both channels in English, and names what it excludes', (t) => {
  useTestLocale('en', t);
  const legend = territoryLegend(resolveTerritoryMetric('pauvrete'), joinTerritories(
    rows(), ANCHORS, 'DEP',
  ).records, 'DEP');
  assert.match(legend[0].label, /%$/);
  assert.doesNotMatch(legend[0].label, / %$/, 'no space before the sign in English');
  assert.ok(legend[0].blurb.includes('2023 vintage'), legend[0].blurb);
  assert.ok(legend[0].blurb.includes('Class breaks measured over the 97 departments'),
    legend[0].blurb);
  const area = legend.find((row) => row.label === 'Area = residents');
  assert.ok(area, legend.map((row) => row.label).join(', '));
  assert.ok(area.blurb.includes('a territory is an aggregate placed on a point, not an extent'),
    area.blurb);
  assertNoFrench(legend, { allow: PLACES });
});

test('an indicator a territory does not publish names the scope it is missing from', () => {
  const legend = withLocale('en', () => territoryLegend(
    resolveTerritoryMetric('salaire'),
    [...joinTerritories(rows(), ANCHORS, 'DEP').records, { code: '99', population: 1 }],
    'DEP',
  ));
  const row = legend.find((entry) => entry.label === 'Not published');
  assert.ok(row, legend.map((entry) => entry.label).join(', '));
  assert.ok(row.blurb.includes('Mainland France and La Réunion'), row.blurb);
  assert.equal(withLocale('en', () => territoryScope()), 'Mainland France and La Réunion');
});

test('the six indicators and the two levels answer in English', () => {
  const en = withLocale('en', () => territoryMetrics());
  assert.deepEqual(en.map((metric) => metric.id), TERRITORY_METRICS.map((metric) => metric.id));
  for (const metric of en) {
    for (const key of ['label', 'short', 'unit', 'blurb']) {
      assertNoFrench(metric[key], { message: `${metric.id}.${key}` });
    }
    assert.ok(metric.unit.length > 2, `${metric.id} must state its unit`);
    assert.ok(metric.blurb.length > 20, `${metric.id} must explain itself`);
  }
  // The blurbs that stop an arithmetic between the two regimes.
  const byId = Object.fromEntries(en.map((metric) => [metric.id, metric]));
  assert.ok(byId.niveau.blurb.includes('The grid shows a MEAN per cell instead'), byId.niveau.blurb);
  assert.ok(byId.pauvrete.blurb.includes('counted in HOUSEHOLDS, not in people'), byId.pauvrete.blurb);
  assert.ok(byId.gini.blurb.includes('Does not exist on the grid'), byId.gini.blurb);
  // The drift guard: the exported table is the catalog's own French.
  for (const metric of TERRITORY_METRICS) {
    assert.equal(metric.label, metricWords('fr')[metric.id].label, `${metric.id} drifted`);
  }
  assert.equal(withLocale('en', () => territoryLevel('DEP')).label, 'Departments');
  assert.equal(withLocale('en', () => territoryLevel('REG')).short, 'REG.');
  assert.equal(withLocale('fr', () => territoryLevel('REG')).short, 'RÉG.');
});

test('a carroyage chip keeps the operator’s choice across the threshold, in English', (t) => {
  useTestLocale('en', t);
  // The id is a share-link token and never moves with the language.
  assert.equal(resolveTerritoryMetric('pauvrete').id, 'pauvrete');
  assert.equal(resolveTerritoryMetric('social').id, 'niveau', 'no counterpart, so the default');
  const chips = territoryChips(resolveTerritoryMetric('pauvrete'));
  assert.deepEqual(chips.map((chip) => chip.id), TERRITORY_METRICS.map((metric) => metric.id));
  assert.equal(chips.filter((chip) => chip.active).length, 1);
  assertNoFrench(chips);
});

test('the stats line names the level and the scope in English', () => {
  const stats = withLocale('en', () => territoryStats(
    joinTerritories(rows(), ANCHORS, 'DEP').records, 'DEP',
  ));
  assert.equal(stats.levelLabel, 'Departments');
  assert.equal(stats.scope, 'Mainland France and La Réunion');
});
