// The 3D buildings layer in English: the selection card, the usage legend and
// the status line, through the real module.
//
// The card is where the RNB pivot becomes visible and where it can most easily
// start lying — a guessed identity, an inherited address, a volume seated on a
// surface nobody surveyed — so each of those sentences is pinned in English,
// with the French beside it to prove one loaded layer answers in both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  _bdtopoRowControlsForTest,
  _bdtopoStatsForTest,
  _setBdtopoStateForTest,
  bdtopoLabel,
  createBdtopoSelectedOverlayEntry,
  rnbPivotLines,
} from './bdtopoBuildings.js';
import { BDTOPO_USAGE_TIERS, bdtopoTierLabel } from './bdtopoBuildingsFeed.js';
import { rnbStatusLabel } from './rnbPivot.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const RECORD = {
  id: 'r1',
  position: { x: 1, y: 2, z: 3 },
  label: 'Residential',
  heightM: 18.4,
  dwellings: 12,
  basis: 'published',
  gapM: -2.4,
  props: {
    usage_1: 'Résidentiel',
    usage_2: 'Commercial et services',
    nombre_d_etages: 7,
    altitude_minimale_sol: 34.5,
    altitude_maximale_toit: 52.1,
    methode_d_acquisition_altimetrique: 'Interpolation',
    precision_altimetrique: 2.5,
  },
  rnb: ['2NPB8CCYQ237'],
};

const PIVOT = {
  rnbId: '2NPB8CCYQ237',
  status: 'demolished',
  statusLabel: 'démoli',
  addresses: [{ label: '12 Rue Vieille 69002 Lyon' }, { label: '14 Rue Vieille 69002 Lyon' }],
  plots: [{ id: '69385000AK0022', coverRatio: 0.99 }, { id: '69385000AK0023', coverRatio: 0.01 }],
};

/** Place names the register publishes and no catalog translates. */
const DATA_NAMES = ['Rue Vieille', 'Lyon', 'Interpolation', 'interpolation'];

test('a building is named by its use, or by what it is in particular', () => {
  assert.equal(withLocale('en', () => bdtopoLabel({ usage_1: 'Résidentiel' })), 'Residential');
  assert.equal(withLocale('fr', () => bdtopoLabel({ usage_1: 'Résidentiel' })), 'Résidentiel');
  assert.equal(withLocale('en', () => bdtopoLabel({ nature: 'Eglise' })), 'Church');
  assert.equal(withLocale('en', () => bdtopoLabel({})), 'Building');
  assert.equal(withLocale('fr', () => bdtopoLabel({})), 'Bâtiment');
  // A value IGN adds to its nomenclature tomorrow is shown as it came.
  assert.equal(withLocale('en', () => bdtopoLabel({ nature: 'Gare maritime' })), 'Gare maritime');
});

test('the identity block reads in English, guess and inheritance included', () => {
  const lines = withLocale('en', () => rnbPivotLines({ rnb: [] }, {
    rnbId: 'SEX7DQ1X5KDX',
    status: 'constructed',
    distanceM: 6.4,
    addresses: [{ label: '12 Rue Vieille 69002 Lyon' }],
    plots: [{ id: '69385000AK0022', coverRatio: 1 }],
  }));
  assert.equal(lines[0], 'RNB SEX7DQ1X5KDX — nearest 6.4 m away, not published on this footprint');
  assert.equal(lines.at(-1),
    'Address and parcel inherited from that matched building, not from this footprint');
  assert.equal(withLocale('en', () => rnbPivotLines({ rnb: ['A', 'B', 'C'] }))[0],
    'RNB A · B · C — 3 buildings for one footprint');
  const several = withLocale('en', () => rnbPivotLines({ rnb: ['X'] }, PIVOT));
  assert.deepEqual(several, [
    'RNB X',
    'RNB status: demolished',
    '12 Rue Vieille 69002 Lyon · +1 more BAN address',
    '2 parcels · 69385000AK0022 (99% of the footprint)',
    // The pivot's id is not the tile's, so the closing caveat is owed.
    'Address and parcel inherited from that matched building, not from this footprint',
  ]);
  assertNoFrench(several, { allow: DATA_NAMES });
});

test('the same identity block in French, byte for byte what the card printed before', () => {
  const fr = withLocale('fr', () => rnbPivotLines({ rnb: ['X'] }, PIVOT));
  assert.deepEqual(fr, [
    'RNB X',
    'Statut RNB : démoli',
    '12 Rue Vieille 69002 Lyon · +1 autre adresse BAN',
    '2 parcelles · 69385000AK0022 (99 % de l\'emprise)',
    'Adresse et parcelle héritées de ce bâtiment rapproché, non de l\'emprise',
  ]);
  assert.equal(withLocale('fr', () => rnbStatusLabel('demolished')), 'démoli');
  assert.equal(withLocale('en', () => rnbStatusLabel('demolished')), 'demolished');
  assert.equal(withLocale('en', () => rnbStatusLabel('somethingNew')), 'somethingNew');
});

test('the selection card: height, dwellings, altitudes and how the volume is seated', () => {
  const en = withLocale('en', () => createBdtopoSelectedOverlayEntry(RECORD, PIVOT));
  assert.deepEqual(en.details.slice(0, 7), [
    'Height 18.4 m · 7 floors',
    '12 dwellings on record',
    'Secondary use Commercial and services',
    'Ground 34.5 m → roof 52.1 m NGF',
    'Seated on both of its IGN altitudes',
    'Rendered ground 2.4 m below the IGN altitude · base extended by as much',
    'Altimetry interpolation, ±2.5 m',
  ]);
  assertNoFrench(en.details, { allow: DATA_NAMES });

  const fr = withLocale('fr', () => createBdtopoSelectedOverlayEntry(RECORD, PIVOT));
  assert.deepEqual(fr.details.slice(0, 7), [
    'Hauteur 18.4 m · 7 étages',
    '12 logements déclarés',
    'Usage secondaire Commercial et services',
    'Sol 34.5 m → toit 52.1 m NGF',
    'Posé sur ses deux altitudes IGN',
    'Sol rendu 2.4 m sous l\'altitude IGN · base prolongée d\'autant',
    'Altimétrie interpolation, ±2.5 m',
  ]);
});

test('a volume with nothing published says so rather than leaving a blank', () => {
  const bare = withLocale('en', () => createBdtopoSelectedOverlayEntry({
    id: 'r2', position: { x: 0, y: 0, z: 0 }, label: 'Building', heightM: null,
    basis: 'default', props: {},
  }));
  assert.ok(bare.details.includes('Height not published'));
  assert.ok(bare.details.includes('Height unknown: 6 m by default'));
  assert.ok(bare.details.includes('Altimetry not filled in by IGN'));
});

test('the usage legend carries the six bands in the page’s language', () => {
  _setBdtopoStateForTest({
    viewer: {},
    payload: {
      count: 3,
      tiers: BDTOPO_USAGE_TIERS.map((tier) => ({
        id: tier.id, color: tier.color, count: 1, label: tier.label, blurb: tier.blurb,
      })),
    },
  });
  try {
    const en = withLocale('en', () => _bdtopoRowControlsForTest());
    assert.deepEqual(en.legend.map((entry) => entry.label), [
      'Residential', 'Commercial and services', 'Industrial',
      'Agricultural', 'Sports, religious, outbuilding', 'Undifferentiated',
    ]);
    assert.match(en.legend[0].blurb, /^Housing\. The dwelling count/);
    assertNoFrench(en.legend.map((entry) => `${entry.label} ${entry.blurb}`));
    const fr = withLocale('fr', () => _bdtopoRowControlsForTest());
    assert.equal(fr.legend[0].label, 'Résidentiel');
    assert.equal(fr.legend.at(-1).label, 'Indifférencié');
    assert.equal(withLocale('en', () => bdtopoTierLabel('civic')), 'Sports, religious, outbuilding');
  } finally {
    _setBdtopoStateForTest({ viewer: null, enabled: false, payload: null });
  }
});

test('the status line says, in English, when the drawing was capped', () => {
  _setBdtopoStateForTest({
    viewer: {},
    payload: { count: 20_000, saturated: true, missingTiles: 0, requestedTiles: 64 },
  });
  try {
    const en = withLocale('en', () => _bdtopoStatsForTest());
    assert.equal(en.coverage, 'Drawing cap reached');
    assert.match(en.loadingLabel, /^Drawing cap reached \(14,000 volumes\) — /);
    assert.match(en.loadingLabel, /Zoom in to see the rest\.$/);
    assertNoFrench([en.coverage, en.loadingLabel]);
    const fr = withLocale('fr', () => _bdtopoStatsForTest());
    assert.equal(fr.coverage, 'Plafond de tracé atteint');
    assert.match(fr.loadingLabel, /^Plafond de tracé atteint \(14\s000 volumes\)/);
  } finally {
    _setBdtopoStateForTest({ viewer: null, enabled: false, payload: null });
  }
});

test('refused tiles are counted in English, and Google 3D says why the layer is hidden', () => {
  _setBdtopoStateForTest({
    viewer: {},
    payload: { count: 10, missingTiles: 2, requestedTiles: 64 },
  });
  try {
    assert.equal(withLocale('en', () => _bdtopoStatsForTest()).loadingLabel,
      '2 BD TOPO tiles refused out of 64 — buildings incomplete, trying again');
    assert.equal(withLocale('fr', () => _bdtopoStatsForTest()).loadingLabel,
      '2 tuiles BD TOPO refusées sur 64 — bâti incomplet, nouvelle tentative');
  } finally {
    _setBdtopoStateForTest({ viewer: null, enabled: false, payload: null });
  }
  _setBdtopoStateForTest({ viewer: {}, payload: { count: 0 }, photoreal: true });
  try {
    assert.equal(withLocale('en', () => _bdtopoStatsForTest()).loadingLabel,
      'Hidden: Google 3D already draws these buildings');
  } finally {
    _setBdtopoStateForTest({ viewer: null, enabled: false, payload: null, photoreal: false });
  }
});
