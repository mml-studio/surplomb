// The electricity-mix layer in English: the map label over a région, the
// label riding a border arrow, the two legend rows, and the figures the HUD
// reads. Everything is computed from the SAME captured éCO2mix payload the
// French test uses, so the two languages are two readings of one fact.
//
// The feed is deliberately not translated: éCO2mix's own French labels travel
// in the payload as data, and this file proves the browser labels each entry
// by its key instead (`nucleaire` → Nuclear, `angleterre` → England).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  balanceWords,
  borderLabelText,
  buildBorderArcs,
  buildRegionRecords,
  energyPrismLegend,
  filiereLabel,
  formatMegawatts,
  marketLabel,
  mapAnalystRecord,
  regionLabelText,
  summarizeNational,
} from './franceEnergy.js';
import { projectEco2mix } from './eco2mixFeed.js';
import { parseDepartements } from './meteoFranceVigilance.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const BUNDLED = JSON.parse(readFileSync(
  new URL('./local_data/france_departements/departements.geojson', import.meta.url),
  'utf8',
));
const PAYLOAD = projectEco2mix({
  national: JSON.parse(readFileSync(
    new URL('./fixtures/eco2mix-national-tr-sample.json', import.meta.url), 'utf8',
  )),
  regional: JSON.parse(readFileSync(
    new URL('./fixtures/eco2mix-regional-tr-sample.json', import.meta.url), 'utf8',
  )),
}, 'test');

const DEPARTEMENTS = parseDepartements(BUNDLED);
const RECORDS = buildRegionRecords(PAYLOAD, DEPARTEMENTS);
const byCode = (code) => RECORDS.find((record) => record.code === code);

// Région and country names are proper nouns: they stay as published.
const PLACES = ['Île-de-France', 'Auvergne-Rhône-Alpes', "Provence-Alpes-Côte d'Azur",
  'Bourgogne-Franche-Comté', 'Centre-Val de Loire', 'Grand Est', 'Pays de la Loire',
  'Nouvelle-Aquitaine', 'Occitanie', 'Bretagne', 'Normandie', 'Hauts-de-France', 'Corse'];

test('a région says which way its power flows, in English', () => {
  const labels = withLocale('en', () => RECORDS.map((record) => regionLabelText(record)));
  assertNoFrench(labels, { allow: PLACES });
  const idf = withLocale('en', () => regionLabelText(byCode('11')));
  assert.equal(idf, 'Île-de-France · IMPORTS 6,478 MW');
  const aura = withLocale('en', () => regionLabelText(byCode('84')));
  assert.equal(aura, 'Auvergne-Rhône-Alpes · EXPORTS 7,781 MW');
  // The same records, a moment later, in French: byte for byte what they were.
  assert.equal(withLocale('fr', () => regionLabelText(byCode('11'))),
    'Île-de-France · IMPORTE 6 478 MW');
});

test('a région with no published balance says so rather than guessing zero', () => {
  const unpublished = { name: 'Corse', balance: null };
  assert.equal(withLocale('en', () => regionLabelText(unpublished)),
    'Corse · BALANCE NOT PUBLISHED');
  assert.equal(withLocale('fr', () => regionLabelText(unpublished)),
    'Corse · SOLDE NON PUBLIÉ');
});

test('the border arrows name their market and their direction', () => {
  const arcs = buildBorderArcs(PAYLOAD.national.exchanges, new Map());
  const labels = withLocale('en', () => arcs.map((arc) => borderLabelText(arc)));
  assertNoFrench(labels);
  assert.ok(labels.includes('2,537 MW exported to Italy'), labels.join(' | '));
  assert.ok(labels.some((text) => /Germany \+ Belgium$/.test(text)), labels.join(' | '));
  // English has no participle to agree: one megawatt reads like two thousand.
  const single = { mw: -1, importing: false, key: 'suisse', label: 'Suisse' };
  assert.equal(withLocale('en', () => borderLabelText(single)), '1 MW exported to Switzerland');
  assert.equal(withLocale('fr', () => borderLabelText(single)), '1 MW exporté vers Suisse');
  const inbound = { mw: 750, importing: true, key: 'suisse', label: 'Suisse' };
  assert.equal(withLocale('en', () => borderLabelText(inbound)), '750 MW imported from Switzerland');
  assert.equal(withLocale('fr', () => borderLabelText(inbound)), '750 MW importés depuis Suisse');
});

test('a market the feed names but this build does not know keeps the published name', () => {
  assert.equal(withLocale('en', () => marketLabel('luxembourg', 'Luxembourg')), 'Luxembourg');
  assert.equal(withLocale('en', () => marketLabel('espagne', 'Espagne')), 'Spain');
});

test('the legend keeps its two rows, and both make the French claim', () => {
  const legend = withLocale('en', () => energyPrismLegend(RECORDS));
  assertNoFrench(legend);
  assert.deepEqual(legend.map((row) => row.label),
    ['Net exporter — exports', 'Net importer — imports']);
  assert.equal(legend[0].blurb, 'Generates more than it consumes');
  assert.equal(legend[1].blurb, 'Consumes more than it generates');
  assert.ok(legend[0].count > 0 && legend[1].count > 0);
  // The counts are the same two numbers in both languages.
  const french = withLocale('fr', () => energyPrismLegend(RECORDS));
  assert.deepEqual(legend.map((row) => row.count), french.map((row) => row.count));
  assert.equal(french[0].label, 'Excédentaire — exporte');
});

test('the generation types are named from their key, not from the feed’s French', () => {
  const national = summarizeNational(PAYLOAD.national);
  assert.equal(national.topFiliere.label, 'Nucléaire', 'the payload still carries RTE’s label');
  assert.equal(withLocale('en', () => filiereLabel(national.topFiliere)), 'Nuclear');
  assert.equal(withLocale('fr', () => filiereLabel(national.topFiliere)), 'Nucléaire');
  const mix = withLocale('en', () => PAYLOAD.national.mix.map((entry) => filiereLabel(entry)));
  assertNoFrench(mix);
  // A filière added upstream after this build still prints something.
  assert.equal(withLocale('en', () => filiereLabel({ key: 'geothermie', label: 'Géothermie' })),
    'Géothermie');
});

test('the balance palette answers in both languages from one key', () => {
  assert.deepEqual(withLocale('en', () => balanceWords('exporter')), {
    verb: 'EXPORTS', label: 'Net exporter', blurb: 'Generates more than it consumes',
  });
  assert.equal(withLocale('en', () => balanceWords('balanced').label), 'Balanced');
  assert.equal(withLocale('fr', () => balanceWords('importer').verb), 'IMPORTE');
});

test('megawatts group the English way, and absence still reads as absence', () => {
  assert.equal(withLocale('en', () => formatMegawatts(6478)), '6,478 MW');
  assert.equal(withLocale('en', () => formatMegawatts(-6478)), '6,478 MW');
  assert.equal(withLocale('en', () => formatMegawatts(null)), '— MW');
  assert.equal(withLocale('fr', () => formatMegawatts(1_234_567)), '1 234 567 MW');
});

test('an analyst record names its top generation type in English', () => {
  const record = withLocale('en', () => mapAnalystRecord(byCode('84')));
  assert.equal(record.name, 'Auvergne-Rhône-Alpes');
  assertNoFrench({ topFiliere: record.topFiliere, balance: record.balance }, { allow: PLACES });
  assert.equal(record.balance, 'exporter', 'the class key stays a key');
});
