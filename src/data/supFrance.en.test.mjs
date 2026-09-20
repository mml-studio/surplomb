// Higher education in English: the site cards, the departmental prism key,
// and the row line — on the same rollup shape the French tests use.
//
// The one thing that must not soften: this layer draws a HEIGHT that is an
// absolute count on a base whose area is not neutralized, and it says so
// twice — once in the shared prism blurb, which it truncates because the
// promise there is not one this layer keeps, and once per department in
// students per 1,000 km². Both survive the translation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import {
  SUP_PRISM_SCALE,
  buildSupDepartementLabel,
  buildSupLoadingLabel,
  buildSupSelectionLabel,
  createSupDepartementOverlayEntry,
  supKindLabel,
  supPrismScale,
} from './supFrance.js';
import { SUP_KINDS, SUP_KIND_LABELS, supCycleShortLabel, supPlacementLabel } from './supFeed.js';
import { SUP_CYCLE_WORDS, SUP_KIND_WORDS, SUP_PLACEMENT_WORDS } from './supFeed.i18n.js';

/** A Sorbonne-shaped site: eleven addresses, one establishment. */
const SITE = {
  name: 'Sorbonne Université',
  commune: 'Paris 5e',
  deptName: 'Paris',
  category: 'Universités',
  kind: 'universite',
  sector: 'public',
  students: 12_000,
  etabStudents: 15_192,
  siteIndex: 3,
  siteCount: 11,
  unsited: 1_240,
  cycles: { licence: 6_000, master: 4_120, doctorat: 1_880 },
  placement: 'offer',
  uai: '0751717J',
};

const DEPARTEMENT = {
  code: '91',
  name: 'Essonne',
  students: 104_000,
  sites: 96,
  etabs: 58,
  advancedShare: 46.0,
  public: 120,
  prive: 64,
  per1000Km2: 18_400,
  cycles: { licence: 40_000, master: 50_000, doctorat: 14_000 },
};

/** Place and organization names the register publishes, relayed as they came. */
const PUBLISHED = [
  'Sorbonne Université', 'Paris', 'Paris 5e', 'Universités', 'Essonne', 'Lozère',
];

test('a site card answers in English, and the register’s own category is kept', (t) => {
  useTestLocale('en', t);
  const card = buildSupSelectionLabel({ site: SITE, rentree: '2024' }).split('\n');
  assert.equal(card[0], 'Sorbonne Université');
  // `categorie_etablissement` is the register's published value: data.
  assert.equal(card[1], 'Universités · public');
  assert.equal(card[2], '12,000 students on this site — 2024 intake');
  assert.equal(card[3], 'Bachelor’s 6,000 · Master’s 4,120 · Doctorate 1,880');
  assert.equal(card[4], 'Site 3 of 11 — 15,192 students in total');
  assert.equal(card[5], '1,240 students with no located site in this register');
  // A borrowed coordinate is something the map did, not something the register
  // said, and the card is the only place that can say so.
  assert.ok(card.includes('⚠ Position taken from the Parcoursup map'), card.join(' | '));
  assert.ok(card.includes('UAI 0751717J'), card.join(' | '));
  assertNoFrench(card, { allow: PUBLISHED });
});

test('the same card in French does not move', () => {
  const card = withLocale('fr', () => buildSupSelectionLabel({ site: SITE, rentree: '2024' }));
  // `toLocaleString('fr-FR')` separates thousands with U+202F.
  const norm = (value) => value.replace(/[\s\u00a0\u202f]+/g, ' ');
  assert.ok(norm(card).includes('12 000 étudiants sur ce site — rentrée 2024'), card);
  assert.ok(card.includes('Licence 6'), card);
  assert.ok(card.includes('⚠ Position reprise de la cartographie Parcoursup'), card);
});

test('a department card spells out both prism channels in English', (t) => {
  useTestLocale('en', t);
  const card = buildSupDepartementLabel(DEPARTEMENT).split('\n');
  assert.equal(card[0], 'Essonne');
  assert.equal(card[1], '104,000 students');
  assert.equal(card[2], '58 institutions on 96 sites');
  assert.equal(card[3], '46.0% of students at year 4 and beyond — the prism’s color');
  // The prism's own blind spot, on the prism's own card.
  assert.ok(card.includes('18,400 students per 1,000 km² — the height does not correct for it'),
    card.join(' | '));
  assertNoFrench(card, { allow: PUBLISHED });
});

test('the two absences are said out loud, not printed as a zero', (t) => {
  useTestLocale('en', t);
  const card = buildSupDepartementLabel({ code: '48', name: 'Lozère', etabs: 0, sites: 0 }).split('\n');
  assert.ok(card.includes('Enrolment not published for this department'), card.join(' | '));
  assert.ok(card.includes('Share at year 4 and beyond cannot be computed here: no cycle reported'),
    card.join(' | '));
  const ambient = createSupDepartementOverlayEntry({ code: '48', name: 'Lozère' }, null);
  assert.equal(ambient.title, 'Lozère · not published');
});

test('the prism scale is named in the reader’s language and measures the same', () => {
  const en = withLocale('en', () => supPrismScale());
  const fr = withLocale('fr', () => supPrismScale());
  assert.equal(fr, SUP_PRISM_SCALE, 'French reuses the constant the drawing measures from');
  assert.equal(en.heightLabel, 'students');
  assert.equal(en.ratioLabel, 'share of students at year 4 and beyond');
  assert.deepEqual(en.ratioClassLabels, ['≤ 5%', '5 – 10%', '10 – 20%', '20 – 30%', '30 – 40%', '> 40%']);
  // The geometry has no language: same domain, same breaks, same colours.
  assert.equal(en.domainMax, fr.domainMax);
  assert.deepEqual([...en.ratioBreaks], [...fr.ratioBreaks]);
  assert.deepEqual([...en.ratioColors], [...fr.ratioColors]);
  // And it is built once per locale.
  assert.equal(withLocale('en', () => supPrismScale()), en);
});

test('the row line answers in English in both regimes', (t) => {
  useTestLocale('en', t);
  assert.equal(buildSupLoadingLabel({ regime: 'national', loading: true }),
    'reading the national register...');
  assert.equal(buildSupLoadingLabel({
    regime: 'national',
    loading: false,
    status: 'ready',
    national: { studentsAssigned: 2_886_000, painted: 96, unassigned: 64 },
  }), '2,886,000 students across 96 departments · 64 sites outside mainland France, not mapped');
  assert.equal(buildSupLoadingLabel({
    regime: 'sites', loading: false, status: 'ready', inView: 0,
  }), 'no higher-education institution in this view');
  assert.equal(buildSupLoadingLabel({
    regime: 'sites', loading: false, status: 'ready', inView: 243, count: 240, students: 104_000,
  }), '240 sites · 104,000 students · 3 not drawn');
});

test('the seven bands, three cycles and two placements answer in English', () => {
  for (const kind of SUP_KINDS) {
    const label = withLocale('en', () => supKindLabel(kind));
    assert.ok(label, kind);
    assertNoFrench(label, { allow: ['BTS', 'CPGE'], message: `band ${kind}` });
    // The drift guard: the French table is the catalog's own French.
    assert.equal(SUP_KIND_LABELS[kind], SUP_KIND_WORDS('fr')[kind], `band ${kind} drifted`);
  }
  assert.equal(withLocale('en', () => supKindLabel('universite')), 'University');
  // A band this build does not know is the catch-all, in both languages.
  assert.equal(withLocale('en', () => supKindLabel('nope')), 'Other specialized schools');
  for (const cycle of ['licence', 'master', 'doctorat']) {
    assertNoFrench(SUP_CYCLE_WORDS('en')[cycle], { message: `cycle ${cycle}` });
    assertNoFrench(withLocale('en', () => supCycleShortLabel(cycle)), { message: `short ${cycle}` });
  }
  for (const placement of ['register', 'offer']) {
    assertNoFrench(SUP_PLACEMENT_WORDS('en')[placement], {
      allow: ['Parcoursup'], message: `placement ${placement}`,
    });
  }
  assert.equal(withLocale('en', () => supPlacementLabel('register')),
    'Position published by the register');
});
