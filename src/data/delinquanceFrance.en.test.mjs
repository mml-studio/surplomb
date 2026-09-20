// The Recorded crime layer in English, over the real SSMSI fixtures.
//
// THIS IS NOT A MAP OF CRIME, and the English has to say so as often as the
// French does. The three tests that matter here are the three states: a
// published rate, a deliberate published zero, and a cell the register
// WITHHELD — which is not zero, not bounded above, and not knowable. Half of
// this map is the third one, and an English reader who cannot tell it from a
// low value is being shown a defamation machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildDelinquanceCommuneLabel,
  buildDelinquanceCommuneRecords,
  buildDelinquanceDepartementLabel,
  buildDelinquanceLoadingLabel,
  createDelinquanceDepartementOverlayEntry,
  delinquanceBinLabels,
  delinquanceCaveat,
  delinquanceTotalValueLine,
  delinquanceValueLine,
  formatDelinquanceCount,
  formatDelinquanceRate,
  _clearDelinquanceSelectionForTest,
  _delinquanceRowControlsForTest,
  _setDelinquanceStateForTest,
} from './delinquanceFrance.js';
import {
  CELL_PUBLISHED,
  CELL_SUPPRESSED,
  DELINQUANCE_COMMUNE_CELL_SLUGS,
  DELINQUANCE_COMMUNE_SLUGS,
  DELINQUANCE_TOTAL_SLUG,
  createCommuneFold,
  joinCommuneCells,
  parseSsmsiCsv,
  projectCommuneContours,
  projectDelinquanceDepartements,
  selectDelinquanceChips,
} from './delinquanceFeed.js';
import { delinquanceRateBins } from './delinquanceDepartements.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');
const readJson = (name) => JSON.parse(read(name));

/** Corsican and Parisian place names ride through an English card. */
const NAMES = ['Poggio-Mezzana', 'Haute-Corse', 'Corse', 'Paris', 'Bastia'];

const COMMUNE_LINES = read('./fixtures/ssmsi-communes-sample.csv').split('\n').filter(Boolean);
const SINK = createCommuneFold({ year: '2025' });
for (const line of COMMUNE_LINES) SINK.push(line);
const FOLD = SINK.finish();

const DEP_PACK = projectDelinquanceDepartements({
  rows: parseSsmsiCsv(read('./fixtures/ssmsi-departements-sample.csv')),
});

function packFor(departement, geojsonName) {
  const contours = projectCommuneContours(readJson(geojsonName));
  const joined = joinCommuneCells({ contours: contours.communes, cells: FOLD.communes, departement });
  const thresholds = {};
  const means = {};
  for (const slug of DELINQUANCE_COMMUNE_CELL_SLUGS) {
    const slot = DELINQUANCE_COMMUNE_CELL_SLUGS.indexOf(slug);
    const rates = [];
    for (const [, entry] of FOLD.communes) {
      const cell = entry.cells[slot];
      if (cell && cell[0] === CELL_PUBLISHED && cell[2] > 0) rates.push(cell[2]);
    }
    thresholds[slug] = delinquanceRateBins(rates);
    means[slug] = FOLD.departementMeans[departement]?.[slug] || null;
  }
  return {
    departement, year: FOLD.year, communes: joined.communes, unshaped: joined.unshaped,
    thresholds, means,
  };
}

const PACK_2B = packFor('2B', './fixtures/geoapi-communes-2b-sample.json');

const records = (indicator) => buildDelinquanceCommuneRecords({
  packs: [PACK_2B], indicator,
}).records;

test.afterEach(() => { _clearDelinquanceSelectionForTest(); });

// --- The numbers ------------------------------------------------------------

test('English rates use a decimal point and keep their three significant digits', () => {
  // Homicide rates are of the order of 0.01 per 1,000, so the decimals move
  // with the magnitude in English exactly as they do in French.
  assert.equal(withLocale('en', () => formatDelinquanceRate(0.0078)), '0.008');
  assert.equal(withLocale('en', () => formatDelinquanceRate(6.22)), '6.22');
  assert.equal(withLocale('en', () => formatDelinquanceRate(48.71)), '48.7');
  // A withheld cell has no rate, and printing 0.000 is the one thing the
  // three-state model exists to prevent.
  assert.equal(withLocale('en', () => formatDelinquanceRate(null)), '—');
  assert.equal(withLocale('en', () => formatDelinquanceRate('')), '—');
  // A real published zero still formats as one, because that is a claim.
  assert.equal(withLocale('en', () => formatDelinquanceRate(0)), '0.000');
});

test('a count names what it counts, and the total refuses to call itself facts', () => {
  assert.equal(withLocale('en', () => formatDelinquanceCount('escroqueries', 2597)),
    '2,597 victims');
  assert.equal(withLocale('en', () => delinquanceValueLine('cambriolages', 843, 6.22)),
    '843 offenses, i.e. 6.22 per 1,000 dwellings');
  const total = withLocale('en', () => delinquanceTotalValueLine(3214, 48.71, 14));
  assert.equal(total, '3,214 combined (14 indicators), i.e. 48.7 per 1,000 res.');
  assert.equal(/facts/.test(total), false, 'the total may not call itself facts');
  assertNoFrench([total]);
});

test('the ramp labels carry the denominator, which is not the same for burglary', () => {
  const burglary = withLocale('en', () => delinquanceBinLabels([1.24, 2.88, 8.41], 'cambriolages'));
  // The decimals move with the magnitude, as in French: three below 1, two
  // below 10, one above.
  assert.deepEqual(burglary, [
    '0.000–1.24 / 1,000 dwellings',
    '1.24–2.88 / 1,000 dwellings',
    '2.88–8.41 / 1,000 dwellings',
    '> 8.41 / 1,000 dwellings',
  ]);
  assertNoFrench(burglary);
  assert.match(withLocale('en', () => delinquanceBinLabels([1], 'homicides'))[0],
    /1,000 residents$/);
});

// --- The caveat that rides on every card --------------------------------------

test('the compact English caveat says RECORDED, and every line fits the card', () => {
  const compact = withLocale('en', () => delinquanceCaveat('cambriolages'));
  assertNoFrench(compact);
  const lines = compact.split('\n');
  assert.match(lines[0], /^⚠ RECORDED crime — what was reported, not what happened$/);
  assert.match(lines[1], /^Per DWELLINGS — not comparable with the others$/);
  assert.match(lines.at(-1), /^Complaints filed: 12% to 74% by offense · SSMSI, July 2026$/);
  for (const line of lines) assert.ok(line.length <= 60, `"${line}" is ${line.length} chars`);
});

test('an indicator counted in suspects says so, and never says crime happened', () => {
  const copy = withLocale('en', () => delinquanceCaveat('usage-stupefiants'));
  assert.match(copy, /^⚠ RECORDED crime, counted in named suspects$/m);
  assert.match(copy, /^Suspects in solved cases — also measures police activity$/m);
});

test('a withheld cell adds the rule’s claim, compact, and its words in méthodo', () => {
  const compact = withLocale('en',
    () => delinquanceCaveat('cambriolages', { state: CELL_SUPPRESSED }));
  assert.match(compact, /^Released if > 5 facts 3 years running — not zero, not “few”$/m);
  // The false gloss this layer used to print may never come back in either
  // language: 4 735 of the 251 145 withheld 2025 cells published more than 5
  // facts in 2023 or 2024.
  assert.equal(/between 1 and 5/i.test(compact), false);

  const quoted = withLocale('en',
    () => delinquanceCaveat('cambriolages', { state: CELL_SUPPRESSED, methodo: true }));
  assertNoFrench(quoted, { allow: ['bases statistiques de la délinquance enregistrée'] });
  assert.match(quoted, /Release rule, quoted in full — “Published data is limited/);
  assert.match(quoted, /The criterion is about THREE YEARS/);
  assert.match(quoted, /4,735 cells withheld in 2025 had published more than 5 facts/);
  // And the citation keeps the document's own French title, so it is findable.
  assert.match(quoted, /bases statistiques de la délinquance enregistrée, SSMSI, July 2026$/);
});

test('the computed total’s three claims survive in English, at both lengths', () => {
  const compact = withLocale('en', () => delinquanceCaveat(DELINQUANCE_TOTAL_SLUG));
  assert.match(compact, /^⚠ Total COMPUTED by Surplomb, not published by the SSMSI$/m);
  assert.match(compact, /^Mixed units, rate recomputed on the population$/m);
  assert.match(compact, /^Drug use \(AFD\) not re-counted: already in its parent$/m);

  const quoted = withLocale('en',
    () => delinquanceCaveat(DELINQUANCE_TOTAL_SLUG, { methodo: true }));
  assert.match(quoted, /the sum of 14 municipal indicators \(16 at department level\)/);
  assert.match(quoted, /“Drug use \(AFD\)” is not counted twice/);
});

// --- The card of one commune ---------------------------------------------------

test('a withheld commune’s English card is unknown, never low and never zero', () => {
  const withheld = records('cambriolages').find((row) => row.code === '2B242');
  assert.equal(withheld.state, CELL_SUPPRESSED);
  const card = withLocale('en', () => buildDelinquanceCommuneLabel(withheld));
  assertNoFrench(card, { allow: NAMES });
  assert.match(card, /^Poggio-Mezzana$/m);
  assert.match(card, /^Not released — statistical confidentiality$/m);
  // The benchmark is the DEPARTMENT's average over its withheld municipalities,
  // and the label has to make that impossible to read as this one's value.
  assert.match(card, /^Benchmark: .* — dept\. average, not this municipality$/m);
  assert.match(card, /Released if > 5 facts 3 years running — not zero, not “few”/);
  assert.equal(/0\.000/.test(card), false, 'a withheld cell may never print a rate');

  const quoted = withLocale('en', () => buildDelinquanceCommuneLabel(withheld, { methodo: true }));
  assert.match(quoted,
    /^Benchmark: .* — “Mean value per 1,000 .*”, not this municipality’s value/m);
});

test('a published commune’s English card names the count, the noun and the rate', () => {
  const published = records('cambriolages').find((row) => row.state === CELL_PUBLISHED);
  assert.ok(published);
  const card = withLocale('en', () => buildDelinquanceCommuneLabel(published));
  assertNoFrench(card, { allow: NAMES });
  assert.match(card, /^Home burglary — 2025$/m);
  assert.match(card, /offenses, i\.e\. [\d.]+ per 1,000 dwellings$/m);
  assert.match(card, /residents · [\d,]+ dwellings$/m);
});

test('the computed total is a LOWER BOUND wherever the register withholds one', () => {
  const total = records(DELINQUANCE_TOTAL_SLUG)
    .find((row) => row.state === CELL_PUBLISHED && Number(row.cell?.[3]) > 0);
  assert.ok(total, 'the fixture must hold one published total with a withheld contributor');
  const card = withLocale('en', () => buildDelinquanceCommuneLabel(total));
  assertNoFrench(card, { allow: NAMES });
  assert.match(card, /^⚠ LOWER BOUND: \d+ of 14 indicators withheld here$/m);

  const quoted = withLocale('en', () => buildDelinquanceCommuneLabel(total, { methodo: true }));
  assert.match(quoted,
    /^⚠ LOWER BOUND: \d+ of the 14 indicators are withheld here, so they are NOT in this total/m);
  assert.match(quoted, /The real total is higher, by an unknown amount\./);
});

test('the other indicators are listed, and the ones outside the total are marked', () => {
  const total = records(DELINQUANCE_TOTAL_SLUG).find((row) => row.state === CELL_SUPPRESSED);
  assert.ok(total);
  const quoted = withLocale('en', () => buildDelinquanceCommuneLabel(total, { methodo: true }));
  // Every sibling the register withheld, named and crossed out.
  assert.match(quoted, /Burglary ✕ · Vehicle theft ✕/);

  // A contributor the computed total DROPS is marked, so a reader adding the
  // list up by hand can see why it does not reconcile. The Corsican fixture
  // publishes no AFD cell, so one is placed on a copy of the same record.
  const slot = DELINQUANCE_COMMUNE_SLUGS.indexOf('usage-stupefiants-afd');
  const cells = total.cells.slice();
  cells[slot] = [CELL_PUBLISHED, 3, 0.5];
  const marked = withLocale('en',
    () => buildDelinquanceCommuneLabel({ ...total, cells }, { methodo: true }));
  assert.match(marked, /Drug use \(AFD\) \(outside the total\) 3/);
});

// --- The card of one département -----------------------------------------------

test('a département card is an EXACT total, and says why', () => {
  const row = {
    code: '2B',
    name: 'Haute-Corse',
    state: CELL_PUBLISHED,
    count: 3214,
    rate: 48.71,
    pop: 65984,
    log: 44120,
    bin: 3,
  };
  const card = withLocale('en',
    () => buildDelinquanceDepartementLabel(row, { indicator: DELINQUANCE_TOTAL_SLUG, year: '2025' }));
  assertNoFrench(card, { allow: NAMES });
  assert.match(card, /^Haute-Corse$/m);
  assert.match(card, /^All indicators — computed total — 2025$/m);
  assert.match(card, /^3,214 combined \(16 indicators\), i\.e\. 48\.7 per 1,000 res\.$/m);
  assert.match(card, /^Exact total here: no statistical confidentiality at department level$/m);

  const quoted = withLocale('en', () => buildDelinquanceDepartementLabel(row, {
    indicator: DELINQUANCE_TOTAL_SLUG, year: '2025', methodo: true,
  }));
  assert.match(quoted, /48\.7 per 1,000 residents · 3,214 facts, victims and named suspects/);
  assert.match(quoted, /An exact total at this scale: the department base knows no statistical/);
});

test('the ambient label repeats the rate, and prints no number when there is none', () => {
  const measured = withLocale('en', () => createDelinquanceDepartementOverlayEntry(
    { code: '2B', name: 'Haute-Corse', state: CELL_PUBLISHED, rate: 6.22, bin: 2 }, null,
  ));
  assert.equal(measured.title, 'Haute-Corse · 6.22');
  const withheld = withLocale('en', () => createDelinquanceDepartementOverlayEntry(
    { code: '2B', name: 'Haute-Corse', state: CELL_SUPPRESSED, rate: null, bin: -1 }, null,
  ));
  assert.equal(withheld.title, 'Haute-Corse · —');
});

// --- The row --------------------------------------------------------------------

test('the chips are named in English and the method chip says what it does', () => {
  _setDelinquanceStateForTest({
    base: {
      departements: DEP_PACK.departements,
      years: DEP_PACK.years,
      chips: selectDelinquanceChips(FOLD.census),
      census: FOLD.census,
    },
    regime: 'communes',
    visibleDeps: ['2B'],
    packs: [['2B', PACK_2B]],
    indicator: 'cambriolages',
  });
  const row = withLocale('en', () => _delinquanceRowControlsForTest());
  // The chip IDS are share-link-shaped slugs (`tous`, `cambriolages`) and stay
  // data; only what a reader sees is checked.
  assertNoFrench(row.chips.map(({ label, title }) => ({ label, title })));
  assert.equal(row.chips[0].label, 'All');
  assert.match(row.chips[0].title,
    /^14 indicators combined — a total computed by Surplomb, not published by the SSMSI/);
  assert.match(row.chips[0].title, /a lower bound as soon as one cell is withheld$/);
  const method = row.chips.at(-1);
  assert.equal(method.label, 'Method');
  assert.equal(method.title, 'Quote the SSMSI rules in full on the cards');
  // And an indicator chip names its unit of count.
  const burglary = row.chips.find((chip) => chip.id === 'cambriolages');
  assert.equal(burglary.label, 'Burglary');
  assert.equal(burglary.title, 'Home burglary — unit of count: offenses');
});

test('the key carries the three states and the rules behind them', () => {
  _setDelinquanceStateForTest({
    base: {
      departements: DEP_PACK.departements,
      years: DEP_PACK.years,
      chips: selectDelinquanceChips(FOLD.census),
      census: FOLD.census,
    },
    regime: 'communes',
    visibleDeps: ['2B'],
    packs: [['2B', PACK_2B]],
    indicator: 'cambriolages',
  });
  const { legend } = withLocale('en', () => _delinquanceRowControlsForTest());
  assertNoFrench(legend);
  const labels = legend.map((entry) => entry.label);
  assert.ok(labels.some((label) => /^Published \(1,000 dwellings\)$/.test(label)));
  assert.ok(labels.some((label) => /^Not released — statistical confidentiality/.test(label)));
  const withheld = legend.find((entry) => /^Not released/.test(entry.label));
  assert.match(withheld.blurb, /^Not released, under statistical confidentiality\. “Published data/);
  assert.match(withheld.blurb, /NEITHER zero NOR necessarily a low value — it is unknown\.$/);
  const published = legend.find((entry) => /^Published \(/.test(entry.label));
  assert.match(published.blurb, /^Rate published by the SSMSI\. This is RECORDED crime/);
  assert.match(published.blurb, /only 12% of victims of sexual violence/);
});

// --- Loading -------------------------------------------------------------------

test('the loading line names what is being waited on', () => {
  const waits = withLocale('en', () => [
    buildDelinquanceLoadingLabel({ loading: true, base: null }),
    buildDelinquanceLoadingLabel({ loading: true, base: {}, regime: 'communes' }),
    buildDelinquanceLoadingLabel({ loading: true, base: {}, regime: 'departements' }),
    buildDelinquanceLoadingLabel({ loading: false, base: {} }),
  ]);
  assertNoFrench(waits.filter(Boolean));
  assert.deepEqual(waits, [
    'Loading the SSMSI department base…',
    'Loading the municipal outlines…',
    'Updating the department layer…',
    null,
  ]);
});

// --- Both languages, one loaded layer --------------------------------------------

test('one loaded module answers in either language, from the same record', () => {
  const withheld = records('cambriolages').find((row) => row.code === '2B242');
  const fr = buildDelinquanceCommuneLabel(withheld);
  const en = withLocale('en', () => buildDelinquanceCommuneLabel(withheld));
  assert.match(fr, /^Non diffusé — secret statistique$/m);
  assert.match(en, /^Not released — statistical confidentiality$/m);
  assert.match(fr, /ni zéro, ni « peu »/);
  assert.match(en, /not zero, not “few”/);
});
