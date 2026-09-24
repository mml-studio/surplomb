import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PEB_AIRPORT_NAMES,
  cleanAirportName,
  focusedPebAirport,
  pebAirportCamera,
  pebAirportCode,
  pebAirportLabel,
  pebAirportOptions,
  pebPlanUrl,
  readAirportPackNames,
  titleCaseRegisterName,
} from './pebAirports.js';

test('a pack name loses its generic word and its air-base number, and keeps the place', () => {
  assert.equal(cleanAirportName('Toulouse-Blagnac Airport'), 'Toulouse-Blagnac');
  assert.equal(cleanAirportName('Bastia-Poretta International airport'), 'Bastia-Poretta');
  assert.equal(cleanAirportName('Amiens Glisy Airfield'), 'Amiens Glisy');
  assert.equal(cleanAirportName('Toulouse-Francazal (BA 101) Air Base'), 'Toulouse-Francazal');
  assert.equal(cleanAirportName('Aérodrome de Muret - Lherm'), 'Muret – Lherm');
  assert.equal(cleanAirportName("Aérodrome d'Andernos"), 'Andernos');
  assert.equal(cleanAirportName('Courchevel Altiport'), 'Courchevel');
  assert.equal(cleanAirportName(''), null);
  assert.equal(cleanAirportName(null), null);
});

test('the register name is the last resort, title-cased', () => {
  assert.equal(titleCaseRegisterName('LA ROCHELLE'), 'La Rochelle');
  assert.equal(titleCaseRegisterName('ST-CHRISTOL'), 'St-Christol');
  assert.equal(titleCaseRegisterName("AIRE SUR L'ADOUR"), "Aire Sur L'Adour");
  assert.equal(titleCaseRegisterName('  '), null);
});

test('the label: the table first, then the pack, then the register, then the code', () => {
  assert.equal(pebAirportLabel({ oaci: 'LFPG', name: 'P. CH. DE-GAULLE', airportName: 'Charles de Gaulle International Airport' }),
    'Paris-Charles-de-Gaulle');
  assert.equal(pebAirportLabel({ oaci: 'LFBO', name: 'T. BLAGNAC', airportName: 'Toulouse-Blagnac Airport' }),
    'Toulouse-Blagnac');
  assert.equal(pebAirportLabel({ oaci: 'LFZZ', name: 'VILLE' }), 'Ville');
  assert.equal(pebAirportLabel({ oaci: 'LFZZ' }), 'LFZZ');
  // Every entry of the table is a proper noun, never an empty string.
  for (const [code, name] of Object.entries(PEB_AIRPORT_NAMES)) {
    assert.match(code, /^[A-Z]{4}$/);
    assert.ok(name.trim().length > 2, code);
  }
});

test('the code a passenger reads: IATA, or the ICAO code when the field has none', () => {
  assert.equal(pebAirportCode({ oaci: 'LFPG', iata: 'CDG' }), 'CDG');
  assert.equal(pebAirportCode({ oaci: 'LFPN', iata: null }), 'LFPN');
  assert.equal(pebAirportCode({ oaci: 'LFPN', iata: '0' }), 'LFPN');
  assert.equal(pebAirportCode({}), null);
});

test('the pack is read for the codes asked, and for every coded field when none are', () => {
  const text = [
    '{"type":"Feature","properties":{"name":"Paris-Orly Airport","icao":"LFPO","iata":"ORY"}}',
    '{"type":"Feature","properties":{"name":"Chavenay-Villepreux Airfield","icao":"LFPX"}}',
    '{"type":"Feature","properties":{"name":"No code"}}',
    '{broken "icao":"LFZZ"',
  ].join('\n');
  assert.deepEqual([...readAirportPackNames(text, ['LFPO']).entries()], [
    ['LFPO', { airportName: 'Paris-Orly Airport', iata: 'ORY' }],
  ]);
  assert.deepEqual([...readAirportPackNames(text).keys()], ['LFPO', 'LFPX']);
  assert.equal(readAirportPackNames(text).get('LFPX').iata, null);
  assert.equal(readAirportPackNames(null).size, 0);
});

test('the shipped pack names the register’s big airports', () => {
  const text = fs.readFileSync(new URL('./local_data/airports/airports.geojsonl', import.meta.url), 'utf8');
  const names = readAirportPackNames(text, ['LFPG', 'LFPO', 'LFLL', 'LFMN']);
  assert.equal(names.size, 4);
  assert.equal(names.get('LFPO').iata, 'ORY');
});

test('the menu lines are the register, deduplicated, placed, and in alphabetical order', () => {
  const options = pebAirportOptions([
    { oaci: 'LFPO', airportName: 'Paris-Orly Airport', iata: 'ORY', lat: 48.7, lon: 2.4 },
    { oaci: 'LFBO', airportName: 'Toulouse-Blagnac Airport', iata: 'TLS', lat: 43.6, lon: 1.4 },
    { oaci: 'LFBD', airportName: 'Bordeaux–Mérignac Airport', iata: 'BOD', lat: 44.8, lon: -0.7 },
    { oaci: 'LFPO', airportName: 'Duplicate', lat: 48.7, lon: 2.4 },
    { oaci: 'LFXX', airportName: 'Unplaced Airport' },
  ]);
  assert.deepEqual(options.map((option) => option.value), ['LFBD', 'LFPO', 'LFBO']);
  assert.deepEqual(options[1], { value: 'LFPO', label: 'Paris-Orly', code: 'ORY' });
});

test('the view is about the pick while its plan is drawn, else the airport nearest the centre', () => {
  const drawn = [
    { oaci: 'LFPG', lat: 49.01, lon: 2.55 },
    { oaci: 'LFPB', lat: 48.97, lon: 2.44 },
  ];
  assert.equal(focusedPebAirport(drawn, { lat: 48.96, lon: 2.43 }), 'LFPB');
  assert.equal(focusedPebAirport(drawn, { lat: 49.02, lon: 2.56 }), 'LFPG');
  assert.equal(focusedPebAirport(drawn, { lat: 48.96, lon: 2.43 }, 'lfpg'), 'LFPG', 'the pick holds');
  assert.equal(focusedPebAirport(drawn, { lat: 48.96, lon: 2.43 }, 'LFPO'), 'LFPB', 'a pick not drawn does not');
  assert.equal(focusedPebAirport([{ oaci: 'LFPN' }], null), 'LFPN');
  assert.equal(focusedPebAirport([], { lat: 0, lon: 0 }), null);
});

test('a picked airport is framed from the south, above the point-scan ceiling', () => {
  const big = pebAirportCamera({ lat: 49, lon: 2.5, iata: 'CDG' });
  const small = pebAirportCamera({ lat: 49, lon: 2.5, iata: null });
  assert.equal(big.height, 22_000);
  assert.equal(small.height, 14_000);
  for (const view of [big, small]) {
    assert.ok(view.height > 12_000, 'over 12 km the noise layer draws the whole plan');
    assert.ok(view.lat < 49, 'south of the field, looking north');
    assert.equal(view.pitchDeg, -50);
    assert.equal(view.lon, 2.5);
  }
  assert.equal(pebAirportCamera({ lat: null, lon: 2 }), null);
});

test('the plan link is https: the register’s host is upgraded, any other http is dropped', () => {
  assert.equal(
    pebPlanUrl('http://piece-jointe-carto.developpement-durable.gouv.fr/NAT003/PEB/PEB_LFPG_03_04_2007.pdf'),
    'https://piece-jointe-carto.developpement-durable.gouv.fr/NAT003/PEB/PEB_LFPG_03_04_2007.pdf',
  );
  assert.equal(pebPlanUrl('https://example.org/a.pdf'), 'https://example.org/a.pdf');
  assert.equal(pebPlanUrl('http://example.org/a.pdf'), null);
  assert.equal(pebPlanUrl('javascript:alert(1)'), null);
  assert.equal(pebPlanUrl(null), null);
});
