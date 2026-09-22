// What Mobile antennas (ANFR) says, in English — as plainly as the French.
//
// The refusals survive the simplification and are checked here: a multiple of
// the legal limit is not a health verdict, a measurement taken before the
// current antennas says so, and a planned antenna is never called a
// transmitter. Nothing on the English card promises a speed, a coverage or a
// verdict either.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  anfrEditionLabel,
  anfrExposureLine,
  anfrMastLegend,
  anfrNetworksLine,
  anfrPlacementLine,
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

test('the card is five short lines, in English', () => {
  const raw = en(() => buildAnfrSelectionLabel({ support: support(449714), detail: DETAIL }, PACK));
  assert.deepEqual(raw.split('\n').map(norm), [
    '5G antenna · 4 operators',
    'Orange, SFR, Bouygues, Free',
    'Networks: 5G, 4G, 3G, 2G',
    'On a roof, 65 m up · Paris 6e',
    'Waves measured 40 m away in 2009, before the current antennas: too weak to measure',
    'Source: ANFR, August 27, 2026',
  ]);
  // The three questions this register cannot answer stay unanswered.
  assert.doesNotMatch(norm(raw), /\bspeed\b|Mb\/s|covered|harmless|safe|no risk/i);
  assertNoFrench(raw.split('\n'), { allow: ['Paris 6e'] });
});

test('a planned antenna says so, and never as 5G', () => {
  const planned = en(() => buildAnfrSelectionLabel({ support: support(278838) }, PACK)).split('\n').map(norm);
  assert.equal(planned[0], 'Planned antenna · 2 operators');
  assert.equal(planned[2], 'Planned: 4G, 3G, 2G — not installed yet');
  assert.equal(en(() => anfrNetworksLine(support(506104))), 'Networks: 4G, 3G, 2G · 5G planned');
  // A re-filing still takes no word.
  assert.equal(en(() => anfrNetworksLine(support(449714))), 'Networks: 5G, 4G, 3G, 2G');
});

test('an underground support says there is no mast, instead of leaving a hole', () => {
  const zero = norm(en(() => buildAnfrSelectionLabel({ support: support(325857) }, PACK)));
  assert.match(zero, /Underground, no mast/);
  assert.doesNotMatch(zero, / 0 m/);
});

test('the placement line says what the antenna stands on', () => {
  assert.equal(en(() => anfrPlacementLine('Immeuble', 35)), 'On a roof, 35 m up');
  assert.equal(en(() => anfrPlacementLine('Pylône autostable', 42)), 'Pylon, 42 m tall');
  assert.equal(en(() => anfrPlacementLine('Mobilier urbain', 6)), 'Street furniture, 6 m');
  assert.equal(en(() => anfrPlacementLine(null, null)), 'Support type not published');
  // French is untouched.
  assert.equal(anfrPlacementLine('Immeuble', 35), 'Sur un toit, à 35 m de haut');
});

test('the waves line keeps its refusals in English', () => {
  const line = en(() => anfrExposureLine(DETAIL));
  assert.equal(norm(line), 'Waves measured 40 m away in 2009, before the current antennas: too weak to measure');
  assert.doesNotMatch(line, /safe|harmless|no risk/i);
  // And the multiple, on a report that did publish a global value.
  const ratio = en(() => anfrExposureLine({
    exposure: {
      within: 1,
      nearest: { metres: 120 },
      report: { measuredOn: '2025-04-02', globalVoltsPerM: 0.86, lowestLimitVoltsPerM: 28, conforming: true },
    },
  }));
  assert.equal(ratio, 'Waves measured 120 m away in 2025: 33 times below the legal limit');
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

  const card = en(() => buildAnfrMeshLabel({ tuple: [48.8, 2.3, 4, 4], lookupPending: true }));
  assert.equal(card, '5G antenna · 4 operators\nLoading…');
});

test('the mast legend still owes the reader its three absences, in English', () => {
  const rows = en(() => anfrMastLegend({
    mastRegime: true, regime: 'supports', mastsUnpublished: 4, mastsClipped: 9, sectors: 3,
  }));
  assert.deepEqual(rows.map((row) => row.label),
    ['Underground, no mast', 'Masts not drawn: too many here', 'Direction of the antennas']);
  assert.equal(rows[2].blurb, 'Line length is indicative only.');
  assertNoFrench(rows.map((row) => [row.label, row.blurb].filter(Boolean)));
});
