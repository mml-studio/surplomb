// The energy rating (DPE) layer in both languages: the card of a building,
// the seven-letter key, the coverage line the row prints, and — above 600 m —
// the share of energy-inefficient homes a cell carries.
//
// The layer's refusals are the part that must survive translation: it never
// averages letters, a cell is a SHARE of F and G and never a grade for the
// block, and the register is not the housing stock. Each of those is asserted
// in English here and in French beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import {
  DPE_POOR_CLASSES,
  dpeBuildingSummary,
  dpeCellCard,
  dpeCellLegendNote,
  dpeCellRowControls,
  dpeRowControls,
  dpeSiteCardDescription,
  dpeSiteTitle,
  dpeSummarize,
  dpeThemeLegend,
} from './dpeFrance.js';
import { dpeSitePlacementLine } from './dpeSites.js';

/** Street names the register published; they stay French inside English. */
const KEEP = ['93 rue du Chevaleret', 'rue du Chevaleret'];

const SITE = {
  address: '93 rue du Chevaleret',
  kind: 'building',
  distanceM: 57,
  points: [
    { etiquetteDpe: 'E', annualCostEur: 900 },
    { etiquetteDpe: 'E', annualCostEur: 700 },
    { etiquetteDpe: 'G', annualCostEur: 1_800 },
    { etiquetteDpe: null },
  ],
  summary: dpeBuildingSummary([
    { etiquetteDpe: 'E' }, { etiquetteDpe: 'E' }, { etiquetteDpe: 'G' }, { etiquetteDpe: null },
  ]),
  shape: { via: 'id', rnbId: 'Q3TWB1672WV4', areaM2: 143, parts: [] },
  parcel: { idu: '75113000BI0020', via: 'idu', contenanceM2: 261 },
};

test('a building card counts ratings, not dwellings, and names its ground', () => {
  const en = withLocale('en', () => dpeSiteCardDescription(SITE));
  assertNoFrench(en, { allow: KEEP });
  assert.equal(en, '4 ratings, from E to G, mostly E · 1 with no published label · '
    + '1 energy-inefficient home (F or G) · €900/yr estimated (median for the site) · '
    + 'footprint 143 m² on the ground · parcel 75113000BI0020 — 261 m² on the cadastre · '
    + 'building named by the rating itself (RNB id) · 57 m from the scan center');
  assert.equal(withLocale('en', () => dpeSiteTitle(SITE)), '93 rue du Chevaleret — 4 ratings');
  // The French is untouched, down to the acronym it counts with.
  assert.match(withLocale('fr', () => dpeSiteCardDescription(SITE)),
    /^4 DPE, de E à G, majorité E · 1 sans étiquette publiée · 1 passoire \(F ou G\)/);
  assert.equal(withLocale('fr', () => dpeSiteTitle(SITE)), '93 rue du Chevaleret — 4 DPE');
});

test('how a site was placed is four different sentences in English too', () => {
  const lines = withLocale('en', () => [
    dpeSitePlacementLine({ kind: 'building' }),
    dpeSitePlacementLine({ kind: 'address' }),
    dpeSitePlacementLine({ shape: { via: 'inside' } }),
    dpeSitePlacementLine({ shape: { via: 'closest', distanceM: 12.4 } }),
  ]);
  assertNoFrench(lines, { allow: KEEP });
  assert.deepEqual(lines, [
    'building named by the register, footprint not published',
    'BAN position — geocoded to the address, not to the building',
    'building found under the BAN point',
    'nearest building to the BAN point — 12 m, an inference',
  ]);
  assert.equal(withLocale('fr', () => dpeSitePlacementLine({ shape: { via: 'inside' } })),
    'bâtiment retrouvé sous le point BAN');
});

test('the volume disagreeing with the badge is said in English', () => {
  const en = withLocale('en', () => dpeSiteCardDescription(SITE, { grade: 'D' }, true));
  assertNoFrench(en, { allow: KEEP });
  assert.match(en, /3D buildings volume painted D/);
  assert.match(withLocale('en', () => dpeSiteCardDescription(
    { address: 'somewhere', points: [{ etiquetteDpe: 'G' }], summary: dpeBuildingSummary([{ etiquetteDpe: 'G' }]) },
    null, true,
  )), /outside the BD TOPO footprints loaded/);
});

test('the seven letters keep their bounds and their caveat', () => {
  const legend = withLocale('en', () => dpeRowControls({ distribution: { D: 3, F: 1 } }).legend);
  assertNoFrench(legend, { allow: KEEP });
  assert.deepEqual(legend.map((entry) => entry.label),
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'no label']);
  assert.equal(legend[3].blurb, '181 to 250 kWh/m²/yr — the published class is the worse of '
    + 'the two axes, energy and greenhouse gas.');
  assert.match(legend.at(-1).blurb, /^A rating present in the register with no usable label/);
  assert.match(withLocale('fr', () => dpeRowControls({}).legend)[3].blurb,
    /^181 à 250 kWh\/m²\/an — la classe publiée est la pire des deux axes/);
});

test('a volume painted from disagreeing ratings says so, singular and plural', () => {
  const values = [
    { grade: 'E', mixed: true }, { grade: 'E', mixed: true }, { grade: 'D', mixed: true },
  ];
  const en = withLocale('en', () => dpeThemeLegend(values));
  assertNoFrench(en, { allow: KEEP });
  assert.match(en.find((entry) => entry.label === 'E').blurb,
    / 2 buildings painted E are not unanimous: the ratings that differ keep their full-size badge on the roof\.$/);
  assert.match(en.find((entry) => entry.label === 'D').blurb,
    / 1 building painted D is not unanimous/);
  assert.match(withLocale('fr', () => dpeThemeLegend(values)).find((e) => e.label === 'E').blurb,
    /2 immeubles peints E ne sont pas unanimes/);
});

test('the coverage line says what was served, painted and outlined', () => {
  const entries = Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, etiquetteDpe: 'D' }));
  const en = withLocale('en', () => dpeSummarize({
    entries,
    total: 2_805,
    distribution: { D: 200 },
    siteCoverage: { sites: 10, outlined: 8, parcelled: 6 },
  }).coverage);
  assertNoFrench(en, { allow: KEEP });
  assert.equal(en, '200 ratings served out of 2,805 within 200 m (the nearest to the center) '
    + '· 10 addresses · 8 with a building footprint');
  assert.match(withLocale('fr', () => dpeSummarize({
    entries, total: 2_805, distribution: { D: 200 }, siteCoverage: { sites: 10, outlined: 8 },
  }).coverage), /^200 DPE servis sur 2 805 dans 200 m \(les plus proches du centre\)/);
});

/* ── the cell regime ───────────────────────────────────────────────────── */

const CELLS = {
  box: { south: 45.77, west: 4.84, north: 45.79, east: 4.86 },
  cells: [
    { key: 'a', total: 40, poor: 12, poorShare: 30 },
    { key: 'b', total: 4, poor: 0, poorShare: null },
  ],
  summary: { total: 44, cells: 2, poor: 12, poorShare: 27.3, tiles: 16, tilesMissing: 2 },
};

test('the cell key ranks shares of energy-inefficient homes, never a grade', () => {
  const { legend, legendNote } = withLocale('en', () => dpeCellRowControls(CELLS));
  assertNoFrench({ legend, legendNote }, { allow: KEEP });
  assert.deepEqual(legend.map((entry) => entry.label),
    ['25% and over', '15% to 25%', '5% to 15%', 'less than 5%', 'none', 'fewer than 8 ratings']);
  assert.match(legend[2].blurb, /^The band the national register falls in \(9\.75%\)/);
  assert.match(legend.at(-1).blurb, /^Too few ratings to publish a share: under 8/);
  assert.equal(legendNote, 'Share of energy-inefficient homes (F or G) · 9.75% in the national '
    + 'register · 27.3% here · a rating is compulsory on a sale or a new let: the register is '
    + 'not the housing stock · disc size = number of ratings');
  assert.deepEqual(withLocale('fr', () => DPE_POOR_CLASSES.map((klass) => klass.label)),
    ['25 % et plus', '15 à 25 %', '5 à 15 %', 'moins de 5 %', 'aucune']);
  assert.match(withLocale('fr', () => dpeCellLegendNote(CELLS)),
    /^Part de passoires \(F ou G\) · 9,75 % dans le registre national · 27,3 % ici/);
});

test('the cell A5 line and the cell card answer in English', () => {
  const note = withLocale('en', () => dpeCellRowControls(CELLS).note);
  assertNoFrench(note, { allow: KEEP });
  assert.equal(note, 'View aggregated over 2.2 km a side · 44 ratings in 2 cells · '
    + '2 tiles of 16 did not answer: this ground is empty for want of data, not for want of '
    + 'a rating · drop below 600 m to get each building back, its footprint and its labels.');
  const card = withLocale('en', () => dpeCellCard(CELLS.cells[0]));
  assertNoFrench(card, { allow: KEEP });
  assert.equal(card, '40 ratings in this cell · 12 energy-inefficient homes (F or G) — 30% · '
    + '25% and over · national register 9.75% · a share of F and G, never an average grade for '
    + 'the neighborhood · drop below 600 m for the labels building by building');
  assert.match(withLocale('en', () => dpeCellCard(CELLS.cells[1])),
    /^4 ratings in this cell · fewer than 8 ratings: no share published/);
  assert.match(withLocale('fr', () => dpeCellCard(CELLS.cells[0])),
    /^40 DPE dans cette cellule · 12 passoires \(F ou G\) — 30 % · 25 % et plus/);
});
