// Risks (Géorisques) in English, through the real projection of the real
// captured Paris 13e scan — the same payload georisques.test.mjs pins in
// French. What is asserted here is the answer an English reader gets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectGeorisques, icpeSiteName, radonClassLabel } from './georisquesFeed.js';
import { projectSingleCommuneContour } from './communeContours.js';
import {
  communeDescription,
  georisquesLegend,
  hazardLegendEntry,
} from './georisques.js';
import { RADON_CLASSES } from './georisquesFeed.i18n.js';
import { RADON_LABELS } from './adresseRadiographie.i18n.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const ORIGIN = { lon: 2.3760, lat: 48.8300 };
const CONTOUR = projectSingleCommuneContour(read('geoapi-commune-75113-contour.json'));

const PAYLOAD = projectGeorisques({
  report: read('georisques-rapport-sample.json'),
  icpe: read('georisques-icpe-sample.json'),
  radon: read('georisques-radon-sample.json'),
  contour: CONTOUR,
  inseeCode: '75113',
  origin: ORIGIN,
  radiusM: 1000,
});

/** Proper nouns the French detector must accept inside the English key. */
const ALLOW = ['Paris', 'Géorisques', 'Seveso', 'Bassussarry'];

useTestLocale('en');

test('the key names the municipality, the classes and every verdict in English', () => {
  const controls = georisquesLegend(PAYLOAD, { commune: 'Paris', radonClass: 1 });
  assert.equal(controls.legend[0].label, 'Municipality of Paris 13e Arrondissement');
  assert.match(controls.legend[0].blurb, /an administrative boundary, not the extent of a hazard/);
  assert.equal(
    controls.legendNote,
    'Géorisques — BRGM / MTE · Paris · radon class 1',
  );
  assert.equal(
    controls.note,
    'Géorisques publishes no geometry for these hazards: they are stated, not drawn.',
  );
  const classes = controls.legend.filter((entry) => entry.glyph).map((entry) => entry.label);
  assert.ok(classes.includes('Classified facility (ICPE)'), classes.join(' / '));
  assertNoFrench(controls.legend.map((entry) => `${entry.label} — ${entry.blurb ?? ''}`), {
    allow: ALLOW,
  });
});

test('a hazard line says which register refused to answer, and never reads it as “no”', () => {
  // "Risque non Connu" on the address and "Risque Existant - important" on the
  // commune: the register looked at the clay under this address and does not
  // know. An English key that printed "outside the zone" there would be the
  // one misreading this layer exists to prevent.
  const clay = [...PAYLOAD.naturalRisks, ...PAYLOAD.technologicalRisks]
    .find((entry) => entry.id === 'retraitGonflementArgile');
  const row = hazardLegendEntry(clay);
  assert.equal(row.label, 'Clay shrink-swell — not known · differs from the municipality');
  assert.equal(row.blurb, 'municipality: Risk present — major · at this address: Risk not known');

  // And the one the register declares clear at the address while the commune
  // is affected keeps its own line rather than being folded into the tail.
  const icpe = PAYLOAD.technologicalRisks.find((entry) => entry.id === 'icpe');
  assert.equal(
    icpe && hazardLegendEntry(icpe).label,
    'Classified industrial facilities (ICPE) — outside the zone · differs from the municipality',
  );
});

test('the tail line agrees with its own count, which French does not have to', () => {
  const one = georisquesLegend({
    naturalRisks: [{ id: 'avalanche', label: 'Avalanche', present: false }],
    technologicalRisks: [],
    icpe: [],
  });
  assert.equal(one.legend[0].label, '1 other hazard checked — outside the zone');
  const two = georisquesLegend({
    naturalRisks: [
      { id: 'avalanche', label: 'Avalanche', present: false },
      { id: 'cyclone', label: 'Vent violent', present: false },
    ],
    technologicalRisks: [],
    icpe: [],
  });
  assert.equal(two.legend[0].label, '2 other hazards checked — outside the zone');
});

test('a silent risk register says so in English too', () => {
  const controls = georisquesLegend({
    naturalRisks: [],
    technologicalRisks: [],
    icpe: [],
    available: { report: false, icpe: true, radon: true },
  });
  assert.equal(controls.legend[0].label, 'Hazards unavailable');
  assert.match(controls.legend[0].blurb, /which is not the same as absent/);
});

test('the outline card carries the same five claims, in English', () => {
  const text = communeDescription(PAYLOAD, CONTOUR);
  assert.match(text, /^Municipality of Paris 13e Arrondissement \(75113\)/);
  assert.match(text, /hazards on record for the municipality/);
  assert.match(text, /verdicts differ between the municipality and the scanned address/);
  assert.match(text, /outline simplified for display — this is not the cadastral boundary/);
  assert.match(text, /the highlight covers the municipality, not the exposed area/);
  assertNoFrench(text, { allow: ALLOW });
});

test('an establishment the register did not name says so in the reader’s language', () => {
  const unnamed = { name: 'Établissement sans raison sociale', named: false };
  assert.equal(icpeSiteName(unnamed), 'Establishment with no company name');
  assert.equal(
    withLocale('fr', () => icpeSiteName(unnamed)),
    'Établissement sans raison sociale',
  );
  // A named one is published as it came, in both languages.
  assert.equal(icpeSiteName({ name: 'DARTY', named: true }), 'DARTY');
});

test('the radon sentence is the one the Address X-ray already publishes', () => {
  // Two surfaces of one product read the same class from the same scan; two
  // wordings of class 2 would read as two different measurements.
  for (const locale of ['fr', 'en']) {
    for (const klass of [1, 2, 3]) {
      assert.equal(
        withLocale(locale, () => radonClassLabel(klass)),
        RADON_LABELS(locale)[klass],
        `radon class ${klass} drifted in ${locale}`,
      );
      assert.equal(RADON_CLASSES(locale)[klass], RADON_LABELS(locale)[klass]);
    }
  }
  assert.equal(radonClassLabel(9), null);
  assert.equal(radonClassLabel(null), null);
});

test('French is untouched by all of it', () => {
  const controls = withLocale('fr', () => georisquesLegend(PAYLOAD, { commune: 'Paris', radonClass: 1 }));
  assert.equal(controls.legend[0].label, 'Commune de Paris 13e Arrondissement');
  assert.equal(
    controls.legendNote,
    'Géorisques — BRGM / MTE · Paris · radon classe 1',
  );
  const clay = [...PAYLOAD.naturalRisks, ...PAYLOAD.technologicalRisks]
    .find((entry) => entry.id === 'retraitGonflementArgile');
  assert.equal(
    withLocale('fr', () => hazardLegendEntry(clay).label),
    'Retrait gonflement des argiles — non connu · diffère de la commune',
  );
});
