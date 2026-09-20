// The Enseignement layer in English: the three regimes' cards, the national
// key and the status line, read through the real module.
//
// The property under test is the same one the French tests pin, said in the
// other language: AN ABSENCE IS NEVER A ZERO. A school with no published roll
// must not read as a school with no pupils, a département the sweep could not
// prove must not read as a département with no school, and a density that
// could not be divided must not read as 0.0. Each of those has its own
// sentence in English, and this file pins all three.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSchoolSelectionLabel,
  buildSchoolsDepartementLabel,
  buildSchoolsLoadingLabel,
  buildSchoolsMeshLabel,
  buildSchoolsNationalLegend,
  createSchoolsDepartementOverlayEntry,
  schoolCalloutText,
  schoolLevelLabel,
  _clearSchoolsSelectionForTest,
  _schoolsRowControlsForTest,
  _setSchoolsStateForTest,
} from './schoolsFrance.js';
import { SCHOOL_LEVELS, schoolDisplayName, schoolPrecisionLabel } from './schoolsFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

/**
 * What the register publishes rides through an English card as published: the
 * establishment's name, its own `libelle_nature`, its street address and the
 * town. Translating any of them would be inventing a second French address.
 */
const NAMES = ['Orléans', 'Ecole primaire des Prés Verts', 'ECOLE DE NIVEAU ELEMENTAIRE',
  'Gironde', 'Lozère', 'Collège Jean Moulin', '5 rue Pierre Budin'];

const site = (over = {}) => ({
  id: '0450922H',
  uai: '0450922H',
  lat: 47.9,
  lon: 1.9,
  name: 'Ecole primaire des Prés Verts',
  level: 'ecole',
  nature: 'ECOLE DE NIVEAU ELEMENTAIRE',
  sector: 'public',
  enrolled: 214,
  commune: 'Orléans',
  address: '5 rue Pierre Budin',
  postal: '45000 ORLEANS',
  ep: null,
  precision: 'adresse',
  motherUai: null,
  services: { restauration: null, hebergement: null, ulis: null, segpa: null, apprentissage: null },
  ...over,
});

test.afterEach(() => { _clearSchoolsSelectionForTest(); });

// --- The vocabulary ---------------------------------------------------------

test('the five bands read as school levels, and the last two as what they are', () => {
  const labels = withLocale('en', () => SCHOOL_LEVELS.map((level) => schoolLevelLabel(level)));
  assert.deepEqual(labels, [
    'School', 'Middle school', 'High school', 'Adapted & special-needs',
    'Administration & guidance',
  ]);
  assertNoFrench(labels);
  // An unknown level still lands on the band that over-claims nothing.
  assert.equal(withLocale('en', () => schoolLevelLabel('inconnu')), 'Administration & guidance');
});

test('the geocoding ladder names the step that matters, and never guesses', () => {
  const steps = withLocale('en', () => [
    schoolPrecisionLabel('adresse'), schoolPrecisionLabel('rue'),
    schoolPrecisionLabel('commune'), schoolPrecisionLabel('inconnue'),
  ]);
  assert.deepEqual(steps,
    ['Exact address', 'Street', 'Center of the municipality', 'Accuracy not published']);
  assertNoFrench(steps);
});

test('a site with no published name is an establishment, not a school', () => {
  // The register also holds rectorats and CIO, so the fallback may not promote
  // an unnamed row to "school".
  assert.equal(withLocale('en', () => schoolDisplayName({})), 'Establishment');
  assert.equal(withLocale('en', () => schoolDisplayName({ level: 'college' })), 'Middle school');
  // A published name that already says its level keeps it, French and all.
  assert.equal(
    withLocale('en', () => schoolDisplayName({ name: 'Collège Jean Moulin', level: 'college' })),
    'Collège Jean Moulin',
  );
});

// --- The card of one school -------------------------------------------------

test('an English card states the roll, and states its absence louder', () => {
  const withRoll = withLocale('en', () => buildSchoolSelectionLabel({ site: site() }));
  assertNoFrench(withRoll, { allow: NAMES });
  assert.match(withRoll, /^Ecole primaire des Prés Verts\n/);
  assert.match(withRoll, /^ECOLE DE NIVEAU ELEMENTAIRE · public$/m);
  assert.match(withRoll, /^214 pupils — 2025 school year$/m);
  assert.match(withRoll, /^UAI 0450922H$/m);

  const noRoll = withLocale('en', () => buildSchoolSelectionLabel({
    site: site({ enrolled: null }),
  }));
  assert.match(noRoll, /^Roll not published for this UAI$/m);
  // The two must never blur: 8.3% of teaching establishments are in the second
  // state, and "0 pupils" is a different claim about a real school.
  assert.equal(/0 pupils/.test(noRoll), false);
});

test('a dot geocoded to the town says so, in English, with a warning sign', () => {
  const card = withLocale('en', () => buildSchoolSelectionLabel({
    site: site({ precision: 'commune' }),
  }));
  assert.match(card, /^⚠ Position: Center of the municipality$/m);
  const unknown = withLocale('en', () => buildSchoolSelectionLabel({
    site: site({ precision: 'inconnue' }),
  }));
  assert.match(unknown, /^Position: Accuracy not published$/m);
});

test('the services, the priority network and the shared address read in English', () => {
  const card = withLocale('en', () => buildSchoolSelectionLabel({
    site: site({
      ep: 'REP+',
      sector: 'prive',
      sharing: 2,
      motherUai: '0690123A',
      services: {
        restauration: true, hebergement: true, ulis: true, segpa: true, apprentissage: true,
      },
    }),
  }));
  assertNoFrench(card, { allow: NAMES });
  assert.match(card, /^ECOLE DE NIVEAU ELEMENTAIRE · private$/m);
  // REP+ is the register's own designation and is kept, glossed by the label.
  assert.match(card, /^Priority education network: REP\+$/m);
  assert.match(card, /^canteen · boarding · ULIS · SEGPA · apprenticeship$/m);
  assert.match(card, /^2 other UAIs registered at this position$/m);
  assert.match(card, /^Attached to UAI 0690123A$/m);
});

test('a single shared UAI is singular in English too', () => {
  const card = withLocale('en', () => buildSchoolSelectionLabel({ site: site({ sharing: 1 }) }));
  assert.match(card, /^1 other UAI registered at this position$/m);
});

// --- The card of a maillage dot ---------------------------------------------

test('an unresolved maillage dot admits it has no name yet', () => {
  const pending = withLocale('en', () => buildSchoolsMeshLabel({
    site: { level: 'college', enrolled: 412 }, resolving: true,
  }));
  assertNoFrench(pending);
  assert.equal(pending, ['Establishment', 'Middle school', '412 pupils — 2025 school year',
    'Real position, sampled — reading the name from the register…'].join('\n'));

  const failed = withLocale('en', () => buildSchoolsMeshLabel({
    site: { level: 'college', enrolled: null }, resolving: false,
  }));
  assert.match(failed, /^Real position, sampled — name not found in the register$/m);
  assert.match(failed, /^Roll not published for this UAI$/m);
});

test('a resolved maillage dot draws the exact regime’s own card', () => {
  const card = withLocale('en', () => buildSchoolsMeshLabel({ resolved: site() }));
  assert.match(card, /^Ecole primaire des Prés Verts\n/);
  assert.match(card, /^214 pupils — 2025 school year$/m);
});

// --- The card of one département --------------------------------------------

const depRow = (over = {}) => ({
  code: '33',
  name: 'Gironde',
  schools: 1416,
  pupils: 284510,
  public: 1102,
  prive: 314,
  ep: 87,
  areaKm2: 10079,
  per1000Km2: 140.5,
  ...over,
});

test('the département card prints the prism’s two channels, in English', () => {
  const card = withLocale('en', () => buildSchoolsDepartementLabel(depRow()));
  assertNoFrench(card, { allow: NAMES });
  assert.equal(card, [
    'Gironde',
    '1,416 establishments',
    '140.5 per 1,000 km² — the prism’s color',
    '284,510 pupils — 2025 school year',
    '1,102 public · 314 private',
    '87 in a priority education network',
  ].join('\n'));
});

test('the two absences of the département card are two different sentences', () => {
  // A zero the sweep PROVED.
  const zero = withLocale('en', () => buildSchoolsDepartementLabel(
    depRow({ schools: 0, pupils: 0, public: 0, prive: 0, ep: 0 }),
  ));
  assert.match(zero, /^No open, geolocated establishment$/m);

  // A zero the sweep could NOT prove: the export was short.
  const unproven = withLocale('en', () => buildSchoolsDepartementLabel(
    depRow({ schools: 0, pupils: 0, public: 0, prive: 0, ep: 0 }), { truncated: true },
  ));
  assert.match(unproven, /^Count not surveyed — the national sweep is incomplete$/m);
  assert.equal(/No open, geolocated establishment/.test(unproven), false);

  // A density that could not be divided is not a density of zero.
  const noArea = withLocale('en', () => buildSchoolsDepartementLabel(
    depRow({ per1000Km2: null, areaKm2: 0 }),
  ));
  assert.match(noArea, /^Density cannot be computed: the polygon’s area is unknown$/m);
  assert.equal(/0\.0 per 1,000/.test(noArea), false);
});

test('the ambient label repeats the prism, and names a count nobody measured', () => {
  const measured = withLocale('en', () => createSchoolsDepartementOverlayEntry(depRow(), null));
  assert.equal(measured.title, 'Gironde · 1,416');
  const unproven = withLocale('en', () => createSchoolsDepartementOverlayEntry(
    depRow({ code: '48', name: 'Lozère', schools: 0 }), null, { truncated: true },
  ));
  assert.equal(unproven.title, 'Lozère · not surveyed');
  assertNoFrench(unproven.title, { allow: NAMES });
});

// --- The national key --------------------------------------------------------

const national = (over = {}) => ({
  departements: [depRow(), depRow({ code: '59', name: 'Nord', schools: 2504, per1000Km2: 436.3 })],
  unassigned: 2762,
  snapped: 99,
  assigned: 65396,
  painted: 96,
  ...over,
});

test('the national key names the two variables and what it cannot carry', () => {
  const legend = withLocale('en', () => buildSchoolsNationalLegend(national()));
  assertNoFrench(legend, { allow: NAMES });
  const text = legend.map((row) => `${row.label}\n${row.blurb || ''}`).join('\n');
  // The caller's own name for each channel, inside the shared prism frame.
  assert.match(text, /Height — establishments per department/);
  assert.match(text, /Color — establishments per 1,000 km²/);
  const offshore = legend.at(-1);
  assert.equal(offshore.label, 'outside the polygons — no prism');
  assert.equal(offshore.count, 2762);
  assert.match(offshore.blurb, /^Open, geolocated establishments the bundled outlines cannot carry/);
  assert.match(offshore.blurb, /99 coastal establishments were attached to the nearest department/);
  assert.match(offshore.blurb, /a move the map made, not something the register said\.$/);
});

test('with nothing snapped, the coastal clause is absent rather than empty', () => {
  const legend = withLocale('en', () => buildSchoolsNationalLegend(national({ snapped: 0 })));
  const offshore = legend.at(-1);
  assert.match(offshore.blurb, /never in these 96 prisms\.$/);
});

// --- The row and the status line ---------------------------------------------

test('the maillage key says it is a sample, once, under the classes', () => {
  _setSchoolsStateForTest({
    regime: 'mesh',
    records: [{ id: 'a', site: { level: 'ecole' } }, { id: 'b', site: { level: 'lycee' } }],
  });
  const row = withLocale('en', () => _schoolsRowControlsForTest());
  assertNoFrench(row);
  assert.deepEqual(row.legend.map((entry) => entry.label), ['School', 'High school']);
  assert.equal(row.note, 'A sample of the view, not every establishment. '
    + 'Click a dot for its name and its social position index (IPS).');
});

test('the “other” band keeps the one gloss a label cannot carry', () => {
  _setSchoolsStateForTest({ regime: 'sites', records: [{ id: 'a', site: { level: 'autre' } }] });
  const row = withLocale('en', () => _schoolsRowControlsForTest());
  assert.equal(row.legend[0].label, 'Administration & guidance');
  assert.equal(row.legend[0].blurb,
    'Education authorities and guidance centers, not schools.');
  // And the levels that speak for themselves carry no prose at all.
  _setSchoolsStateForTest({ regime: 'sites', records: [{ id: 'a', site: { level: 'college' } }] });
  assert.equal(withLocale('en', () => _schoolsRowControlsForTest()).legend[0].blurb, undefined);
});

test('the status line names what each regime actually drew', () => {
  const thinned = withLocale('en', () => buildSchoolsLoadingLabel({
    regime: 'mesh', status: 'ready', loading: false,
    meshPick: { picked: new Array(1842), inBox: 12004, thinned: true },
  }));
  assert.equal(thinned, '1,842 drawn of 12,004 in the view — a spatial sample');

  const whole = withLocale('en', () => buildSchoolsLoadingLabel({
    regime: 'mesh', status: 'ready', loading: false,
    meshPick: { picked: new Array(640), inBox: 640, thinned: false },
  }));
  assert.equal(whole, '640 establishments in the view');

  const nationalLine = withLocale('en', () => buildSchoolsLoadingLabel({
    regime: 'national',
    status: 'ready',
    loading: false,
    national: {
      assigned: 65396, painted: 96, unassigned: 2762, truncated: true,
      ips: { eligible: 62857, valued: 40529, status: 'ok' },
    },
  }));
  assertNoFrench(nationalLine);
  assert.equal(nationalLine, '65,396 establishments over 96 departments as prisms · '
    + '2,762 outside mainland France, not mapped · '
    + 'the national survey was truncated upstream · '
    + 'IPS published for 40,529 of the 62,857 schools it covers');

  const sites = withLocale('en', () => buildSchoolsLoadingLabel({
    regime: 'sites', status: 'ready', loading: false, count: 1335,
    summary: { pupils: 284510, complete: false, ips: null },
  }));
  assert.equal(sites, '1,335 establishments · 284,510 pupils · the answer was capped upstream');
});

test('each regime names what it is waiting for, and an empty view says so', () => {
  const waits = withLocale('en', () => [
    buildSchoolsLoadingLabel({ regime: 'mesh', loading: true }),
    buildSchoolsLoadingLabel({ regime: 'national', loading: true }),
    buildSchoolsLoadingLabel({ regime: 'sites', loading: true }),
    buildSchoolsLoadingLabel({ regime: 'sites', loading: false, status: 'empty', count: 0 }),
  ]);
  assertNoFrench(waits);
  assert.deepEqual(waits, [
    'reading the national mesh...',
    'reading the national register...',
    'reading the register...',
    'no establishment in this view',
  ]);
});

// --- DETECT ------------------------------------------------------------------

test('a DETECT callout names the school, or says what the pack shipped', () => {
  assert.equal(withLocale('en', () => schoolCalloutText({ site: site() })),
    'Ecole primaire des Prés Verts');
  assert.equal(
    withLocale('en', () => schoolCalloutText({ site: { level: 'college', enrolled: 412 } })),
    'Middle school · 412 pupils',
  );
  assert.equal(withLocale('en', () => schoolCalloutText({ site: { level: 'lycee' } })),
    'High school');
});

// --- Both languages, one loaded layer ----------------------------------------

test('one loaded module answers in either language, from the same record', () => {
  const record = { site: site({ enrolled: null, precision: 'commune' }) };
  const fr = buildSchoolSelectionLabel(record);
  const en = withLocale('en', () => buildSchoolSelectionLabel(record));
  assert.match(fr, /^Effectif non publié pour cet UAI$/m);
  assert.match(en, /^Roll not published for this UAI$/m);
  assert.match(fr, /^⚠ Position : Centre de la commune$/m);
  assert.match(en, /^⚠ Position: Center of the municipality$/m);
});
