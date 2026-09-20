// What Mobile antennas (ANFR) claims, in English.
//
// The four refusals the French card makes are the layer, and every one is
// checked here: a ratio is not a health verdict, a CEM report measures a PLACE
// and not a mast, an absent band is not a band measured at zero, and a ray's
// length is a drawing convention rather than a range. Nothing anywhere on the
// English card promises a speed, a coverage or a verdict either.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  anfrAzimuthLines,
  anfrCardinal,
  anfrEditionLabel,
  anfrExposureLines,
  anfrFiveGBandLabel,
  anfrMastLegend,
  anfrPlacementLine,
  anfrPlanLine,
  anfrShortBand,
  anfrShortMonth,
  buildAnfrLoadingLabel,
  buildAnfrMeshLabel,
  buildAnfrSelectionLabel,
} from './anfrFrance.js';
import {
  ANFR_HAUT,
  ANFR_ID,
  ANFR_LAT,
  ANFR_LIVE,
  ANFR_LON,
  ANFR_NAT,
  ANFR_OPS,
  ANFR_PLAN,
  ANFR_SVC,
  ANFR_SYS,
  anfrCsvColumns,
  anfrDecodeMask,
  parseAnfrNatureTable,
  projectAnfrSupports,
  projectCartoradioAntennas,
  projectCartoradioExposure,
  projectCartoradioSupport,
  readAnfrCsvRow,
} from './anfrFeed.js';
import { ANFR_STATUS_LABELS } from './anfrFeed.i18n.js';
import { labelFor } from '../i18n/messages.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const anfrStatusLabel = (statut) => labelFor(ANFR_STATUS_LABELS, statut);

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const norm = (value) => String(value).replace(/[\s ]+/g, ' ');

const OBSERVATOIRE = read('anfr-observatoire-sample.json');
const NATURE = read('anfr-nature-sample.json');
const CARTORADIO = read('anfr-cartoradio-sample.json');

const LINES = OBSERVATOIRE.csv.split('\n');
const COLUMNS = anfrCsvColumns(LINES[0]);
const ROWS = LINES.slice(1).filter(Boolean).map((line) => readAnfrCsvRow(line, COLUMNS));
const FOLD = projectAnfrSupports({
  rows: ROWS, natures: parseAnfrNatureTable(NATURE.text), edition: OBSERVATOIRE.edition,
});
const SUPPORTS = FOLD.supports.map((row) => ({
  id: row[ANFR_ID],
  lat: row[ANFR_LAT],
  lon: row[ANFR_LON],
  svc: row[ANFR_SVC],
  live: row[ANFR_LIVE],
  plan: row[ANFR_PLAN],
  operators: anfrDecodeMask(row[ANFR_OPS], FOLD.operators),
  systems: anfrDecodeMask(row[ANFR_SYS], FOLD.systems),
  nature: FOLD.natures[String(row[ANFR_NAT])] || null,
  heightM: row[ANFR_HAUT],
}));
const PACK = { supports: SUPPORTS, edition: OBSERVATOIRE.edition };
const ANTENNAS = projectCartoradioAntennas(CARTORADIO.antennes.body);
const DETAIL = {
  supId: CARTORADIO.supId,
  site: projectCartoradioSupport(CARTORADIO.site.body),
  antennas: ANTENNAS,
  exposure: projectCartoradioExposure({
    mesures: CARTORADIO.mesures.body,
    report: CARTORADIO.mesure.body,
    lat: 48.85528,
    lon: 2.33167,
    newestService: ANTENNAS.newestService,
  }),
};
const support = (id) => SUPPORTS.find((row) => row.id === id);
const en = (fn) => withLocale('en', fn);

test('the card leads with what it is and closes with its provenance', () => {
  const raw = en(() => buildAnfrSelectionLabel({ support: support(449714), detail: DETAIL }, PACK));
  const lines = raw.split('\n').map(norm);
  assert.equal(lines[0], 'Mobile antenna · 4 operators · 5G');
  assert.match(lines.at(-1), /^ANFR no\. 449714 · register of August 27, 2026 · Licence Ouverte 2\.0$/);
  assert.match(norm(raw), /Roof of apartment building, 65 m/);
  assert.match(norm(raw), /5G 3\.5 GHz and 4G: all 4 operators · 3G and 2G: Orange and SFR/);
  // The three questions this register cannot answer stay unanswered.
  assert.doesNotMatch(norm(raw), /\bspeed\b|Mb\/s|covered|harmless|safe|no risk/i);
});

test('a mast that radiates nothing says so, and never as 5G', () => {
  const planned = norm(en(() => buildAnfrSelectionLabel({ support: support(278838) }, PACK)));
  assert.match(planned, /^Mobile antenna · \d+ operators? · nothing transmits/);
  assert.match(planned, /Nothing transmits at this position/);
  assert.match(en(() => anfrPlanLine(support(278838))),
    /^4G · 3G · 2G authorized here — nothing has been installed yet$/);
  assert.equal(en(() => anfrPlanLine(support(506104))), '5G also authorized — not installed yet');
  // A re-filing still takes no line.
  assert.equal(en(() => anfrPlanLine(support(449714))), null);
});

test('a heightless support explains the missing shaft instead of leaving a hole', () => {
  const zero = norm(en(() => buildAnfrSelectionLabel({ support: support(325857) }, PACK)));
  assert.match(zero, /Underground installation \(indoor gallery\) — no mast/);
  assert.match(zero, /No shaft drawn: 551 supports in the register publish no height/);
  assert.doesNotMatch(zero, / 0 m/);
});

test('the placement line keeps the preposition that tells a roof from a tower', () => {
  // The register's 38 natures are a closed vocabulary, so they are named
  // rather than quoted: “Roof of immeuble” is not English.
  assert.equal(en(() => anfrPlacementLine('Immeuble', 35)), 'Roof of apartment building, 35 m');
  assert.equal(en(() => anfrPlacementLine('Pylône autostable', 42)), 'Free-standing pylon, 42 m');
  assert.equal(en(() => anfrPlacementLine('Mobilier urbain', 6)), 'On street furniture, 6 m');
  // One the table has never seen falls through to the register's own French.
  assert.equal(en(() => anfrPlacementLine('Pylône martien', 12)), 'Pylône martien, 12 m');
  assert.equal(en(() => anfrPlacementLine(null, null)), 'Type and height not published');
  // French is untouched.
  assert.equal(anfrPlacementLine('Immeuble', 35), 'Toit d’immeuble, 35 m');
});

test('the exposure block keeps every one of its refusals', () => {
  const lines = en(() => anfrExposureLines(DETAIL));
  const joined = norm(lines.join('\n'));
  // The fixture's global reading is at the protocol's floor, so the card
  // gives the strongest band its real value rather than printing the zero.
  assert.match(joined, /Total field below the measurable threshold, 40 m away \(2009\)/);
  assert.match(joined, /peak: 1800 MHz at 0\.15 V\/m/);
  // The report measured a place, not this mast — and a band it never looked
  // at is not a band it measured at zero.
  assert.match(joined, /⚠ Measured at a neighbor’s, 2009 — .* never measured/);
  assert.doesNotMatch(joined, /safe|harmless|no risk/i);
  assertNoFrench(lines, { allow: ['Wi-Fi'] });

  // And the ratio, on a report that did publish a global value.
  const ratio = en(() => anfrExposureLines({
    exposure: {
      within: 1,
      nearest: { metres: 120 },
      report: {
        measuredOn: '2025-04-02',
        globalVoltsPerM: 0.86,
        lowestLimitVoltsPerM: 28,
        strongest: { band: 'TM 700 (Téléphonie Mobile en 700 MHz)', volts: 0.5 },
        conforming: true,
      },
    },
  }));
  assert.match(ratio[0], /^0\.86 V\/m at 120 m \(2025\) — 33× below the limit \(28 V\/m\), peak: 700 MHz$/);
});

test('the bearings say what was drawn and what could not be', () => {
  const lines = en(() => anfrAzimuthLines(DETAIL));
  const joined = norm(lines.join('\n'));
  assert.match(joined, /antennas, /);
  assert.match(joined, /directions?/);
  assert.match(joined, /m above ground/);
  assertNoFrench(lines);
});

test('the compass, the 5G rung and the band names read as English', () => {
  assert.equal(en(() => anfrCardinal(-90)), 'W');
  assert.equal(en(() => anfrCardinal(225)), 'SW');
  assert.equal(anfrCardinal(-90), 'O');
  assert.equal(en(() => anfrFiveGBandLabel(3500)), 'high-band');
  assert.equal(en(() => anfrFiveGBandLabel(700)), 'low-band');
  assert.equal(en(() => anfrShortBand('TM 700 (Téléphonie Mobile en 700 MHz)')), '700 MHz');
  assert.equal(en(() => anfrShortMonth(null)), 'date unknown');
  assert.equal(en(() => anfrEditionLabel('2026-08-27')), 'August 27, 2026');
  assert.equal(anfrEditionLabel('2026-08-27'), '27 août 2026');
});

test('the three ANFR statuses keep the distinction that gets misread', () => {
  assert.equal(en(() => anfrStatusLabel('Techniquement opérationnel')),
    'Technically operational — switched on, not declared in service');
  assert.equal(en(() => anfrStatusLabel('Projet approuvé')),
    'Approved project — authorized, not built');
  assert.equal(en(() => anfrStatusLabel('En service')), 'In service');
  assert.equal(anfrStatusLabel('En service'), 'En service');
});

test('the row label and the mesh card say which regime they are in', () => {
  const mesh = norm(en(() => buildAnfrLoadingLabel({
    regime: 'maillage',
    status: 'ready',
    loading: false,
    count: 6,
    inView: 15,
    national: { count: 15, plannedUpgrades: 3 },
    pick: { thinned: true },
  })));
  assert.match(mesh, /6 points for 15 supports in view/);
  assert.match(mesh, /15 in France/);
  assert.match(mesh, /3 extension projects visible only when zoomed in/);
  assert.equal(en(() => buildAnfrLoadingLabel({ regime: 'supports', status: 'ready', loading: false, count: 0 })),
    'no ANFR support in this view');
  assert.equal(en(() => buildAnfrLoadingLabel({ loading: true })), 'reading the ANFR register...');

  const card = norm(en(() => buildAnfrMeshLabel(
    { tuple: [48.8, 2.3, 4, 4], lookupPending: true }, PACK,
  )));
  assert.match(card, /^Mobile antenna/);
  assert.match(card, /Looking the mast up in the register…/);
  assert.match(card, /Move closer for the mast’s card/);
  assert.match(card, /Overview — one point per cell · register of August 27, 2026/);
});

test('the mast legend still owes the reader its three absences, in English', () => {
  const rows = en(() => anfrMastLegend({
    mastRegime: true, regime: 'supports', mastsUnpublished: 4, mastsClipped: 9, sectors: 3,
  }));
  assert.deepEqual(rows.map((row) => row.label),
    ['No mast — height not published', 'Shafts cut off', 'Bearings of the selected support']);
  assert.match(rows[0].blurb, /551 concerned are underground or in a tunnel/);
  assert.match(rows[2].blurb, /The length is a drawing convention, not a range/);
  assertNoFrench(rows.map((row) => [row.label, row.blurb]));
});
