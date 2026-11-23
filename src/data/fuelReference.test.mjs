// src/data/fuelReference.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BRANDS,
  BRAND_GROUP_OF,
  BRAND_GROUPS,
  REFERENCE_WINDOW,
  createStationSplitter,
  dailyPrices,
  dayDiff,
  isMetropolitanPostcode,
  isPriceInBounds,
  matchBrandIndex,
  normalizeBrandText,
  parisLocalStamp,
  parseStationBlock,
  parseStationRefs,
  pickStationBrand,
  priceToMillis,
  referencePrice,
  resolveBrand,
  windowDays,
  windowMean,
} from './fuelReference.js';

const brandOf = (tags) => {
  const { brandIndex } = resolveBrand(tags);
  return brandIndex == null ? null : BRANDS[brandIndex];
};

/** One Gazole declaration per listed day, all at noon. */
const gazole = (entries) => entries.map(([date, value]) => ({
  fuelId: '1', fuel: 'Gazole', maj: `${date}T12:00:00`, value,
}));

// ── Parsing ───────────────────────────────────────────────────────────────

const BLOCK = `<pdv id="1000001" latitude="4620138" longitude="519829" cp="01000" pop="R">
  <adresse>596 AVENUE DE TREVOUX</adresse>
  <ville>SAINT-DENIS-L&#xE8;S-BOURG</ville>
  <prix nom="Gazole" id="1" maj="2026-01-02T00:39:00" valeur="1.638"/>
  <prix nom="E10" id="5" maj="2026-01-02T00:39:00" valeur="1789"/>
  <prix/>
  <rupture id="2" nom="SP95" debut="2026-07-07T14:37:55" fin="" type="temporaire"/>
  <rupture/>
  <fermeture/>
</pdv>`;

test('parseStationBlock reads the station, its prices and its ruptures', () => {
  const station = parseStationBlock(BLOCK);
  assert.equal(station.id, '1000001');
  assert.equal(station.cp, '01000');
  assert.equal(station.pop, 'R');
  assert.equal(station.lat, 46.20138);
  assert.equal(station.lon, 5.19829);
  assert.deepEqual(station.prices, [
    { fuelId: '1', fuel: 'Gazole', maj: '2026-01-02T00:39:00', value: '1.638' },
    { fuelId: '5', fuel: 'E10', maj: '2026-01-02T00:39:00', value: '1789' },
  ]);
  assert.deepEqual(station.ruptures, [
    { fuelId: '2', fuel: 'SP95', debut: '2026-07-07T14:37:55', fin: '', type: 'temporaire' },
  ]);
});

test('parseStationBlock tolerates empty coordinates and rejects a block with no id', () => {
  const station = parseStationBlock('<pdv id="52160005" latitude="" longitude="" cp="97429" pop="A"></pdv>');
  assert.equal(station.lat, null);
  assert.equal(station.lon, null);
  assert.deepEqual(station.prices, []);
  assert.equal(parseStationBlock('<pdv cp="01000"></pdv>'), null);
  assert.equal(parseStationBlock('no station here'), null);
});

test('createStationSplitter yields every block once, whatever the chunk boundaries', () => {
  const text = `<?xml version="1.0"?><pdv_liste>\n${BLOCK}\n${BLOCK.replace('1000001', '1000002')}\n</pdv_liste>`;
  for (const size of [1, 3, 7, 64, text.length]) {
    const ids = [];
    const splitter = createStationSplitter((block) => ids.push(parseStationBlock(block).id));
    for (let offset = 0; offset < text.length; offset += size) splitter.push(text.slice(offset, offset + size));
    assert.deepEqual(ids, ['1000001', '1000002'], `chunk size ${size}`);
    assert.equal(splitter.end().includes('<pdv '), false);
  }
});

// ── Prices and dates ──────────────────────────────────────────────────────

test('priceToMillis reads euros and thousandths', () => {
  assert.equal(priceToMillis('1.789'), 1789);
  assert.equal(priceToMillis('1789'), 1789);
  assert.equal(priceToMillis('2'), 2000);
  assert.equal(priceToMillis('1.6'), 1600);
  assert.equal(priceToMillis(''), null);
  assert.equal(priceToMillis('abc'), null);
});

test('isPriceInBounds keeps 1.00–4.00 €/L, bounds included', () => {
  assert.equal(isPriceInBounds(1000), true);
  assert.equal(isPriceInBounds(4000), true);
  assert.equal(isPriceInBounds(999), false);
  assert.equal(isPriceInBounds(4001), false);
  assert.equal(isPriceInBounds(null), false);
});

test('parisLocalStamp keeps naive stamps and converts zoned ones to Paris time', () => {
  assert.equal(parisLocalStamp('2026-10-30T23:59:59'), '2026-10-30T23:59:59');
  assert.equal(parisLocalStamp('2026-10-30 08:00:00'), '2026-10-30T08:00:00');
  // 30 Oct 2026 is winter time (UTC+1): 23:30 UTC is already the 31st in Paris.
  assert.equal(parisLocalStamp('2026-10-30T23:30:00Z'), '2026-10-31T00:30:00');
  // 24 Oct 2026 is still summer time (UTC+2).
  assert.equal(parisLocalStamp('2026-10-24T21:59:00+00:00'), '2026-10-24T23:59:00');
  assert.equal(parisLocalStamp('yesterday'), null);
});

test('windowDays and dayDiff count calendar days across the DST change', () => {
  assert.deepEqual(windowDays(REFERENCE_WINDOW.start, REFERENCE_WINDOW.end), [
    '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30',
  ]);
  assert.equal(dayDiff('2026-09-30', '2026-10-30'), 30);
  assert.equal(dayDiff('2026-10-30', '2026-10-24'), -6);
});

test('dailyPrices carries the last declaration forward, up to 30 days old', () => {
  const days = ['2026-10-24', '2026-10-25', '2026-10-26'];
  const declarations = [
    { stamp: '2026-09-24T08:00:00', millis: 2000 },
    { stamp: '2026-10-25T23:59:59', millis: 2100 },
  ];
  // 24 Oct: declared 30 days earlier — still valid. 25 Oct: a declaration at
  // 23:59:59 that day counts for that day.
  assert.deepEqual(dailyPrices(declarations, days, 30), [2000, 2100, 2100]);
  // 31 days old is missing.
  assert.deepEqual(dailyPrices([{ stamp: '2026-09-23T08:00:00', millis: 2000 }], days, 30), [null, null, null]);
  // Nothing declared yet.
  assert.deepEqual(dailyPrices([{ stamp: '2026-10-26T00:00:00', millis: 2000 }], days, 30), [null, null, 2000]);
});

test('windowMean needs 5 valid days and rounds to 3 decimals', () => {
  assert.equal(windowMean([2000, 2001, 2001, 2001, 2001, null, null], 5), 2.001);
  assert.equal(windowMean([2000, 2001, 2001, 2001, null, null, null], 5), null);
  // (2000 × 3 + 2001 × 3) / 6 = 2000.5 → half up.
  assert.equal(windowMean([2000, 2000, 2000, 2001, 2001, 2001], 5), 2.001);
  assert.equal(windowMean([], 0), null);
});

test('referencePrice applies the whole rule on one station', () => {
  const prices = [
    ...gazole([
      ['2026-10-20', '2.300'],
      ['2026-10-26', '2.400'],
      ['2026-10-31', '1.900'], // after the window: ignored
    ]),
    { fuelId: '5', fuel: 'E10', maj: '2026-10-25T12:00:00', value: '9.999' },
  ];
  // 24, 25 → 2.300; 26…30 → 2.400. (2 × 2300 + 5 × 2400) / 7 = 2371.43.
  assert.deepEqual(referencePrice(prices, '1'), { price: 2.371, validDays: 7, outOfBounds: 0, unparseable: 0 });
});

test('referencePrice ignores an out-of-bounds declaration and keeps the previous one', () => {
  const prices = gazole([
    ['2026-10-20', '2.300'],
    ['2026-10-27', '0.230'],
    ['2026-10-28', '23000'], // thousandths fix → 23.000 €, out of bounds
  ]);
  assert.deepEqual(referencePrice(prices, '1'), { price: 2.3, validDays: 7, outOfBounds: 2, unparseable: 0 });
});

test('referencePrice returns null with fewer than 5 valid days', () => {
  // First declaration on the 27th: only 4 valid days.
  assert.equal(referencePrice(gazole([['2026-10-27', '2.300']]), '1').price, null);
  // Declared 31 days before the 26th, then nothing until the 28th: 24, 25 valid,
  // 26, 27 stale, 28, 29, 30 valid → 5.
  const stale = gazole([['2026-09-25', '2.000'], ['2026-10-28', '2.100']]);
  assert.deepEqual(referencePrice(stale, '1'), { price: 2.06, validDays: 5, outOfBounds: 0, unparseable: 0 });
});

test('referencePrice takes the later line of the file when two declarations share a stamp', () => {
  const prices = gazole([['2026-10-20', '2.300'], ['2026-10-20', '2.350']]);
  assert.equal(referencePrice(prices, '1').price, 2.35);
});

test('isMetropolitanPostcode keeps metropolitan France and Corsica only', () => {
  for (const cp of ['01000', '20000', '20290', '75001', '95000']) assert.equal(isMetropolitanPostcode(cp), true, cp);
  for (const cp of ['97420', '97429', '98800', '99999', '00100', '', '7500']) assert.equal(isMetropolitanPostcode(cp), false, cp);
});

// ── Brands ────────────────────────────────────────────────────────────────

test('normalizeBrandText strips accents and punctuation', () => {
  assert.equal(normalizeBrandText('E.Leclerc'), 'e leclerc');
  assert.equal(normalizeBrandText('Intermarché  SUPER'), 'intermarche super');
  assert.equal(normalizeBrandText('Système U'), 'systeme u');
  assert.equal(normalizeBrandText(' V-Gas! '), 'v gas');
  assert.equal(normalizeBrandText(undefined), '');
});

test('brand table: groups and order', () => {
  assert.equal(BRANDS.length, BRAND_GROUP_OF.length);
  for (const group of BRAND_GROUP_OF) assert.ok(BRAND_GROUPS.includes(group), group);
  assert.equal(BRANDS[0], 'TotalEnergies');
  assert.equal(BRANDS.at(-1), 'Autres réseaux');
});

test('matchBrandIndex recognizes each network', () => {
  const cases = {
    totalenergies: 'TotalEnergies', 'total access': 'TotalEnergies', 'elan': 'TotalEnergies',
    'esso express': 'Esso', bp: 'BP', shell: 'Shell', agip: 'Eni', eni: 'Eni',
    avia: 'Avia', dyneff: 'Dyneff', vito: 'Vito',
    'carrefour market': 'Carrefour', 'e leclerc': 'E.Leclerc', 'intermarche super': 'Intermarché',
    ecomarche: 'Intermarché', itm: 'Intermarché', 'les mousquetaires': 'Intermarché', netto: 'Netto',
    'super u': 'Système U', 'hyper u': 'Système U', 'systeme u': 'Système U', 'station u': 'Système U',
    'marche u': 'Système U', 'u express': 'Système U', u: 'Système U', 'les magasins u': 'Système U',
    'cooperative u': 'Système U',
    'auchan supermarche': 'Auchan', 'geant casino': 'Casino', geant: 'Casino', cora: 'Cora',
    'leader price': 'Leader Price', match: 'Match', colruyt: 'Colruyt', spar: 'Spar',
    'dats 24': 'Autres réseaux', as24: 'Autres réseaux', 'as 24': 'Autres réseaux', gulf: 'Autres réseaux',
    rompetrol: 'Autres réseaux', bi1: 'Autres réseaux', 'v gas': 'Autres réseaux', q8: 'Autres réseaux',
  };
  for (const [text, expected] of Object.entries(cases)) {
    assert.equal(BRANDS[matchBrandIndex(text)], expected, text);
  }
  for (const text of ['', 'station service', 'garage du centre', 'totale', 'utilitaires', 'superette']) {
    assert.equal(matchBrandIndex(text), -1, text);
  }
  // "station u" must not swallow "Station Utile": that is the Utile network.
  assert.equal(BRANDS[matchBrandIndex('station utile')], 'Autres réseaux');
});

test('resolveBrand tests brand, then name, then operator', () => {
  assert.equal(brandOf({ brand: 'Total', name: 'Carrefour Market' }), 'TotalEnergies');
  assert.equal(brandOf({ brand: 'Inconnue', name: 'Carrefour Market', operator: 'Shell' }), 'Carrefour');
  assert.equal(brandOf({ name: 'Station du village', operator: 'SAS Intermarché' }), 'Intermarché');
  assert.equal(brandOf({ name: 'Garage Martin' }), null);
  assert.equal(brandOf(undefined), null);
  assert.deepEqual(resolveBrand({ operator: 'Esso SAF' }), { brandIndex: BRANDS.indexOf('Esso'), field: 'operator', access: false });
});

test('resolveBrand flags TotalEnergies Access stations only', () => {
  assert.equal(resolveBrand({ brand: 'TotalEnergies', name: 'TotalEnergies Access Lyon' }).access, true);
  assert.equal(resolveBrand({ brand: 'Total Access' }).access, true);
  assert.equal(resolveBrand({ brand: 'TotalEnergies', name: 'Relais des Lacs' }).access, false);
  assert.equal(resolveBrand({ brand: 'Esso', name: 'Access' }).access, false);
  assert.equal(resolveBrand({ brand: 'TotalEnergies', operator: 'Access SARL' }).access, false);
});

test('parseStationRefs splits on semicolons', () => {
  assert.deepEqual(parseStationRefs('1000001'), ['1000001']);
  assert.deepEqual(parseStationRefs(' 1000001 ; 1000002;'), ['1000001', '1000002']);
  assert.deepEqual(parseStationRefs(undefined), []);
});

test('pickStationBrand is independent of element order and reports conflicts', () => {
  const node = { type: 'node', id: 9, tags: { name: 'Station' } };
  const way = { type: 'way', id: 1, tags: { brand: 'Shell' } };
  const relation = { type: 'relation', id: 5, tags: { brand: 'BP' } };
  const pick = pickStationBrand([way, node, relation]);
  // n9 (no brand) → r5 (BP) → w1 (Shell): BP wins, and Shell disagrees.
  assert.equal(BRANDS[pick.brandIndex], 'BP');
  assert.equal(pick.conflict, true);
  assert.equal(pick.osmId, 'r5');
  assert.deepEqual(pickStationBrand([relation, way, node]), pick);
  assert.deepEqual(pickStationBrand([node]), { brandIndex: null, access: false, conflict: false, osmId: null });
});
