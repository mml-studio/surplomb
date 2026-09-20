// The property sales (DVF) layer in both languages, through the real module
// and the real captured register: the key, the note above it, the A5 line
// under it, one sale's card, and the cell regime two kilometres up.
//
// Everything a reader sees is read at CALL time, so the same loaded layer
// answers in whichever language the page is in — the property the catalog
// design rests on (src/i18n/messages.js). Each test therefore asks for both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupMutations, parseDvfCsv, selectNearbySales } from './dvfFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import { clearAllBuildingThemes, getActiveBuildingTheme } from './buildingTheme.js';
import {
  DVF_TYPE_FILTERS,
  _dvfSetThemePayloadForTest,
  dvfCellCard,
  dvfCellDisclosure,
  dvfCellLegendNote,
  dvfCellReference,
  dvfLegendDisclosure,
  dvfLegendEntries,
  dvfLegendNote,
  dvfReference,
  dvfSaleCard,
  dvfVoiceSummary,
  dvfYearsLabel,
} from './dvfSales.js';

const CSV = readFileSync(new URL('./fixtures/dvf-75113-2024-sample.csv', import.meta.url), 'utf8');
const MUTATIONS = groupMutations(parseDvfCsv(CSV));
const AVENUE_DE_FRANCE = { lon: 2.3760, lat: 48.8300 };

/** Place names the register published; they stay French inside English. */
const PLACES = ['Paris 13e Arrondissement', 'Lyon 6e', 'Lyon 3e'];

function payload(radiusM = 300, years = [2024]) {
  const { sales, summary } = selectNearbySales(MUTATIONS, AVENUE_DE_FRANCE, radiusM);
  return {
    commune: { code: '75113', name: 'Paris' }, years, sales, summary,
  };
}

const PAYLOAD = payload();
const REFERENCE = withLocale('en', () => dvfReference(PAYLOAD));

test('the key names its five classes in €/m² at the commune median', () => {
  const entries = withLocale('en', () => dvfLegendEntries(dvfReference(PAYLOAD)));
  assertNoFrench(entries, { allow: PLACES });
  assert.deepEqual(entries.map((entry) => entry.label), [
    '€11,195/m² and over',
    '€9,404 to €11,195/m²',
    '€8,508 to €9,404/m²',
    '€6,717 to €8,508/m²',
    'less than €6,717/m²',
    'no price per m²',
  ]);
  // The tooltip leads with the class's DEFINITION, which is the frozen ratio.
  assert.equal(entries[0].blurb,
    '+25% and over — At least a quarter above the municipality’s median.');
  assert.match(entries.at(-1).blurb, /^A sale that bought something other than one dwelling/);
});

test('the same key in French, byte for byte what it printed before', () => {
  const entries = withLocale('fr', () => dvfLegendEntries(dvfReference(PAYLOAD)));
  assert.deepEqual(entries.map((entry) => entry.label), [
    '11 195 €/m² et plus',
    '9 404 à 11 195 €/m²',
    '8 508 à 9 404 €/m²',
    '6 717 à 8 508 €/m²',
    'moins de 6 717 €/m²',
    'sans prix au m²',
  ]);
  assert.equal(entries[0].blurb,
    '+25 % et plus — Au moins un quart au-dessus du médian de la commune.');
});

test('the denominator is named above the classes, in both languages', () => {
  const en = withLocale('en', () => dvfLegendNote(dvfReference(PAYLOAD), { parcels: 3 }));
  assertNoFrench(en, { allow: PLACES });
  assert.equal(en, 'Paris 13e Arrondissement median €8,956/m² · edition 2024 · '
    + 'classes frozen at ±5% and ±25% of this median · tinted ground = the plot that was sold');
  assert.equal(withLocale('fr', () => dvfLegendNote(dvfReference(PAYLOAD), { parcels: 3 })),
    'Médian de Paris 13e Arrondissement 8 956 €/m² · édition 2024 · '
    + 'classes gelées à ±5 % et ±25 % de ce médian · sol teinté = la parcelle vendue');
});

test('a reference the payload could not carry says which silence it is', () => {
  assert.equal(withLocale('en', () => dvfReference({}).label),
    'Denominator unavailable: nothing to compare against');
  const noMedian = { summary: { reference: { name: 'Ustaritz', medianPrixM2: null } } };
  assert.equal(withLocale('en', () => dvfReference(noMedian).label),
    'No median for Ustaritz: nothing to compare against');
  assert.equal(withLocale('fr', () => dvfReference(noMedian).label),
    'Aucun médian pour Ustaritz : rien à rapporter');
});

test('the editions read as editions in English', () => {
  assert.equal(withLocale('en', () => dvfYearsLabel([2024])), 'edition 2024');
  assert.equal(withLocale('en', () => dvfYearsLabel([2021, 2022, 2023])), 'editions 2021 to 2023');
  assert.equal(withLocale('en', () => dvfYearsLabel([2021, 2024])), 'editions 2021, 2024');
  assert.equal(withLocale('fr', () => dvfYearsLabel([2021, 2022])), 'éditions 2021 à 2022');
});

test('the A5 line declares the reach, the clipping and the sales nobody can draw', () => {
  const en = withLocale('en', () => dvfLegendDisclosure(
    REFERENCE, { truncated: true, count: 412 }, 400,
    { filter: 'Maison', hidden: 12, parcels: [] },
  ));
  assertNoFrench(en, { allow: PLACES });
  assert.equal(en, 'Parcels unavailable for this municipality: the sales are drawn, the ground '
    + 'they bought is not · “Houses” filter: 12 other sales not drawn, which the reference '
    + 'median counts all the same · 300 m radius · capped at 400 of 412, the nearest ones · '
    + '1 sale with no published coordinate, counted in the median and impossible to draw.');
  const fr = withLocale('fr', () => dvfLegendDisclosure(
    REFERENCE, { truncated: true, count: 412 }, 400,
    { filter: 'Maison', hidden: 12, parcels: [] },
  ));
  assert.match(fr, /^Parcelles indisponibles pour cette commune/);
  assert.match(fr, /filtre « Maisons » : 12 autre\(s\) mutation\(s\)/);
  assert.match(fr, /rayon 300 m · écrêté à 400 sur 412, les plus proches/);
});

test('the three chips say what they filter, in English', () => {
  const chips = withLocale('en', () => DVF_TYPE_FILTERS.map(
    ({ id, label, title }) => ({ id, label, title }),
  ));
  // The ids are data and stay French; only the words a reader sees are checked.
  assertNoFrench(chips.map(({ label, title }) => ({ label, title })));
  // The ids are the register's own values and do NOT move with the language.
  assert.deepEqual(chips.map((chip) => chip.id), ['tous', 'Appartement', 'Maison']);
  assert.deepEqual(chips.map((chip) => chip.label), ['All', 'Apartments', 'Houses']);
  assert.equal(chips[2].title, 'Only the sales that carry a house — their price carries the '
    + 'land, which is not factored out');
  assert.deepEqual(withLocale('fr', () => DVF_TYPE_FILTERS.map((chip) => chip.label)),
    ['Toutes', 'Appart.', 'Maisons']);
});

test('a sale card names its type from the register, and its ratio from the commune', () => {
  const sale = {
    date: '2024-03-12',
    nature: 'Vente',
    valeur: 245_000,
    types: ['Appartement', 'Dépendance'],
    prixM2: 9_054,
    dwellingSurface: 27,
    distanceM: 64,
  };
  const en = withLocale('en', () => dvfSaleCard(sale, REFERENCE));
  assertNoFrench(en, { allow: PLACES });
  assert.equal(en, '2024-03-12 · Sale · €245,000 · Apartment + Outbuilding · €9,054/m² · '
    + '1.01 × the median of Paris 13e Arrondissement (€8,956/m²) · 27 m² · 64 m');
  assert.equal(withLocale('fr', () => dvfSaleCard(sale, REFERENCE)),
    '2024-03-12 · Vente · 245 000 € · Appartement + Dépendance · 9 054 €/m² · '
    + '1,01 × le médian de Paris 13e Arrondissement (8 956 €/m²) · 27 m² · 64 m');
});

test('a sale the register cannot price says WHY, in English', () => {
  const block = {
    date: '2024-07-02', nature: 'Vente', valeur: 32_000_000, types: ['Appartement'],
    prixM2: null, dwellingCount: 179,
  };
  const en = withLocale('en', () => dvfSaleCard(block, REFERENCE));
  assertNoFrench(en, { allow: PLACES });
  assert.match(en, /179 dwellings — no comparable €\/m²/);
  const swap = { date: '2024-01-09', nature: 'Echange', valeur: 2_295, types: [], prixM2: null };
  assert.match(withLocale('en', () => dvfSaleCard(swap, REFERENCE)),
    /· Swap · €2,295 · type not published · no comparable €\/m²/);
});

test('the theme that paints the volumes carries its ramp and its reach in English', () => {
  _dvfSetThemePayloadForTest(PAYLOAD);
  const theme = withLocale('en', () => {
    const active = getActiveBuildingTheme();
    return {
      label: active.label,
      unknownLabel: active.unknownLabel,
      legendNote: active.legendNote,
      legend: active.legend.map((entry) => entry.label),
    };
  });
  // `label`, `unknownLabel` and `legendNote` are computed when the theme is
  // PUBLISHED, so they carry the language the page had then — French here,
  // because the layer was seeded outside `withLocale`. What matters is that
  // they are strings the Bâti 3D row can print; the English of each is pinned
  // below through a publication made in English.
  assert.ok(theme.label.length > 0);
  _dvfSetThemePayloadForTest(null, false);
  const english = withLocale('en', () => {
    _dvfSetThemePayloadForTest(PAYLOAD);
    const active = getActiveBuildingTheme();
    return { label: active.label, unknownLabel: active.unknownLabel, note: active.legendNote };
  });
  assertNoFrench(english, { allow: PLACES });
  assert.equal(english.label, 'Property sales, DVF (€/m²)');
  assert.equal(english.unknownLabel, 'outside the 300 m radius, or no sale');
  assert.match(english.note, /^Paris 13e Arrondissement median €8,956\/m²/);
  _dvfSetThemePayloadForTest(null, false);
  clearAllBuildingThemes();
});

/* ── the cell regime, two kilometres up ─────────────────────────────────── */

const CELLS = {
  years: [2024, 2025],
  box: { south: 45.77, west: 4.84, north: 45.79, east: 4.86 },
  communes: [{ code: '69386', name: 'Lyon 6e' }, { code: '69383', name: 'Lyon 3e' }],
  communesProbed: 9,
  unavailableYears: [2025],
  cells: [],
  summary: {
    cellM: 150,
    count: 1_324,
    pricedCount: 901,
    references: [
      { code: '69386', name: 'Lyon 6e', medianPrixM2: 5_500, count: 2_661, comparableCount: 1_808 },
      { code: '69383', name: 'Lyon 3e', medianPrixM2: 4_660, count: 5_417, comparableCount: 3_500 },
    ],
  },
};

test('the cell key names every denominator, and what the disc size means', () => {
  const en = withLocale('en', () => dvfCellLegendNote(CELLS));
  assertNoFrench(en, { allow: PLACES });
  assert.equal(en, 'Compared with each municipality’s median: Lyon 6e €5,500/m² · '
    + 'Lyon 3e €4,660/m² · editions 2024 to 2025 · classes frozen at ±5% and ±25% of this '
    + 'median · disc size = number of sales');
  assert.match(withLocale('fr', () => dvfCellLegendNote(CELLS)),
    /^Rapporté au médian de chaque commune : Lyon 6e 5 500 €\/m²/);
  assert.equal(withLocale('en', () => dvfCellReference({ summary: {} }).label),
    'No municipal median: nothing to compare against');
});

test('the cell A5 line names the box, the grid and what the probe can miss', () => {
  const en = withLocale('en', () => dvfCellDisclosure(CELLS));
  assertNoFrench(en, { allow: PLACES });
  assert.equal(en, 'View aggregated over 2.2 km a side, cells of 150 m · 1,324 sales in the box, '
    + '901 with a €/m² · 2 municipalities identified by 9 probes: a municipality no probe '
    + 'landed in does not contribute · vintage not downloaded: 2025 · drop below 600 m to '
    + 'get each sale back, and its parcel.');
  const fr = withLocale('fr', () => dvfCellDisclosure(CELLS));
  assert.match(fr, /^Vue agrégée sur 2,2 km de côté, cellules de 150 m · 1 324 ventes/);
  assert.match(fr, /descendre sous 600 m pour retrouver chaque vente et sa parcelle\.$/);
});

test('a cell card says what the disc is a median OF', () => {
  const cell = {
    key: '69386:1', count: 14, pricedCount: 9, medianPrixM2: 5_458, medianRatio: 0.99,
    communeCode: '69386', years: [2023, 2024],
  };
  const en = withLocale('en', () => dvfCellCard(cell, CELLS));
  assertNoFrench(en, { allow: PLACES });
  assert.equal(en, '14 sales in this cell · 9 with a usable €/m² · median €5,458/m² · '
    + 'against €5,500/m² for Lyon 6e · −5% to +5% — at the median · vintages 2023, 2024 · '
    + 'drop below 600 m to see the sales one by one');
  assert.match(withLocale('fr', () => dvfCellCard(cell, CELLS)),
    /^14 ventes dans cette cellule · 9 avec un €\/m² exploitable · médian 5 458 €\/m²/);
  const unpriced = { ...cell, count: 1, pricedCount: 0, medianPrixM2: null, medianRatio: null };
  assert.match(withLocale('en', () => dvfCellCard(unpriced, CELLS)),
    /^1 sale in this cell · 0 with a usable €\/m² · against/);
  assert.match(withLocale('en', () => dvfCellCard(unpriced, CELLS)), /no median: nothing is painted/);
});

test('what the voice is handed is named in the reader’s language', () => {
  const en = withLocale('en', () => dvfVoiceSummary({
    dormant: false, salesFound: 102, count: 102, comparableCount: 41,
  }));
  assert.equal(en.subject, 'property sales published in the DVF register');
  assert.equal(withLocale('fr', () => dvfVoiceSummary({ dormant: false, salesFound: 1 })).subject,
    'ventes immobilières publiées au registre DVF');
});
