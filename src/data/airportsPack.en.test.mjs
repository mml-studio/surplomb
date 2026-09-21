// Airports, aircraft, vessels and buoys in English — the four keys and the
// two cards of the sky-and-sea layers, which share their vocabulary.
//
// Three things are pinned because they are claims, not captions. An airport
// tier says whether a ticket can be bought there, not how big the field is.
// The amber row of the flight key marks a transponder's registered ALLOCATION
// BLOCK and refuses to name a mission. And `Type not declared` is worded
// identically for an aircraft and for a ship: one phrase for one idea.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AIRPORT_DISPLAY_FLOORS,
  AIRPORT_TIERS,
  airportCardDetails,
  runwaySurfaceLabel,
  airportTypeLabel,
} from './airportsPack.js';
import { CLASS_LEGEND_LABELS } from './aircraftClass.js';
import { VESSEL_FAMILY_LABELS } from './vesselLabels.js';
import { SEA_STATE_BANDS, seaStateBandLabel, seaStateNames } from './marineBuoys.js';
import flightMessages from './flights.i18n.js';
import militaryMessages from './militaryFlights.i18n.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

// Field, city and country names are data, and so is an IGN `usage` value.
const DATA = ['Charles de Gaulle', 'Roissy-en-France', 'Paris', 'adsb.lol'];

test('the three airport tiers say whether a ticket can be bought', () => {
  const tiers = withLocale('en', () => AIRPORT_TIERS.map(({ key, label, blurb }) => ({ key, label, blurb })));
  assertNoFrench(tiers, { allow: DATA });
  assert.deepEqual(tiers.map((tier) => tier.label), [
    'Scheduled-service airport', 'Airport without scheduled service', 'Airfield & flying club',
  ]);
  assert.equal(tiers[0].blurb, 'Serves at least one scheduled route — you can buy a ticket there.');
  assert.match(tiers[2].blurb, /France only in this pack\.$/);
  assert.equal(withLocale('fr', () => AIRPORT_TIERS[0].label), 'Aéroport de ligne');
});

test('the three display floors, and the buckets a card names', () => {
  const floors = withLocale('en', () => AIRPORT_DISPLAY_FLOORS.map(({ id, label, title }) => ({ id, label, title })));
  assertNoFrench(floors);
  assert.deepEqual(floors, [
    { id: 'all', label: 'ALL', title: 'Every field in the pack' },
    { id: 'airports', label: 'AIRPORTS', title: 'Hide airfields and flying clubs' },
    { id: 'airlines', label: 'SCHEDULED', title: 'Keep only fields served by a scheduled route' },
  ]);
  assert.equal(withLocale('en', () => airportTypeLabel('large_airport')), 'Large airport');
  assert.equal(withLocale('en', () => airportTypeLabel('seaplane_base')), 'Seaplane base');
  assert.equal(withLocale('fr', () => airportTypeLabel('seaplane_base')), 'Hydrobase');
  // A type the pack never writes is dropped rather than echoed.
  assert.equal(withLocale('en', () => airportTypeLabel('spaceport')), '');
});

test('a surface family is stored in French and printed in the reader’s language', () => {
  assert.equal(withLocale('en', () => runwaySurfaceLabel('revêtue')), 'paved');
  assert.equal(withLocale('en', () => runwaySurfaceLabel('non revêtue')), 'unpaved');
  assert.equal(withLocale('en', () => runwaySurfaceLabel('eau')), 'water');
  assert.equal(withLocale('fr', () => runwaySurfaceLabel('revêtue')), 'revêtue');
  assert.equal(withLocale('en', () => runwaySurfaceLabel('')), '');
});

test('an airport card: identity, shape, ground, place, and the sky over it', () => {
  const source = {
    name: 'Paris Charles de Gaulle',
    icao: 'LFPG',
    iata: 'CDG',
    type: 'large_airport',
    scheduled: true,
    runways: { count: 5, longestM: 4215, surface: 'revêtue', lighted: true },
    footprint: { areaHa: 2820 },
    municipality: 'Roissy-en-France',
    country: 'France',
  };
  const lines = withLocale('en', () => airportCardDetails(source, { traffic: { inbound: 3, outbound: 2 } }));
  assertNoFrench(lines, { allow: DATA });
  assert.ok(lines.includes('LFPG · CDG · scheduled flights'));
  assert.ok(lines.includes('Large airport · runway 4,215 m paved'));
  assert.ok(lines.includes('IGN footprint 2,820 ha'));
  assert.ok(lines.some((line) => line === '3 inbound · 2 outbound'));
  // French, same field: the numbers keep their ordinary space.
  const fr = withLocale('fr', () => airportCardDetails(source, { traffic: { inbound: 3, outbound: 2 } }));
  assert.ok(fr.includes('Grand aéroport · piste 4 215 m revêtue'));
  assert.ok(fr.includes('emprise IGN 2 820 ha'));
});

test('one silhouette, one caption — and the air and sea layers agree on the unknown', () => {
  const classes = withLocale('en', () => ({ ...CLASS_LEGEND_LABELS }));
  assertNoFrench(classes);
  assert.equal(classes.airliner, 'Narrow-body jet');
  assert.equal(classes.widebody, 'Wide-body jet');
  assert.equal(classes.bizjet, 'Business jet');
  // Performance, never mission.
  assert.equal(classes.fastjet, 'High-performance jet');
  assert.doesNotMatch(classes.fastjet, /fighter|combat|military/i);
  // The shared phrase.
  assert.equal(classes.unknown, withLocale('en', () => VESSEL_FAMILY_LABELS.unknown));
  assert.equal(
    withLocale('fr', () => CLASS_LEGEND_LABELS.unknown),
    withLocale('fr', () => VESSEL_FAMILY_LABELS.unknown),
  );
  assert.equal(withLocale('fr', () => CLASS_LEGEND_LABELS.airliner), 'Jet monocouloir');
});

test('the flight key speaks plain words and still reads no mission into a block', () => {
  const m = withLocale('en', () => flightMessages());
  assertNoFrench(m, { allow: DATA });
  // Plain words, one line each: the ICAO block and the dead reckoning read as
  // jargon, and their two-line blurbs went with them (2026-09-21).
  assert.equal(m.militaryBlock.label, 'Military aircraft');
  assert.equal(m.militaryBlock.blurb, undefined);
  assert.equal(m.tracked.label, 'Tracked contact');
  assert.equal(m.coasting.label, 'Signal lost, estimated position');
  assert.equal(m.coasting.blurb, undefined);
  assert.equal(withLocale('fr', () => flightMessages().militaryBlock.label), 'Avion militaire');
  assert.equal(withLocale('fr', () => flightMessages().coasting.label), 'Signal perdu, position estimée');
  assert.equal(m.coverage.regional(250), '250 NM regional circle');
  assert.equal(m.coverage.worldwide, 'worldwide coverage');
  // The military layer says the same two things, word for word.
  const military = withLocale('en', () => militaryMessages());
  assert.equal(military.tracked.blurb, m.tracked.blurb);
  assert.equal(military.coasting.label, m.coasting.label);
  assert.equal(military.unknownBlurb, 'Type not declared by adsb.lol — the silhouette is a stand-in.');
});

test('the vessel families keep "left blank" apart from "not heard yet"', () => {
  const families = withLocale('en', () => ({ ...VESSEL_FAMILY_LABELS }));
  assertNoFrench(families);
  assert.equal(families.tanker, 'Tanker / chemical carrier');
  assert.equal(families.hsc, 'High-speed craft');
  assert.equal(families.unavailable, 'Type left blank on board');
  assert.equal(families.silent, 'Identity not received yet');
  assert.notEqual(families.unavailable, families.silent);
  assert.equal(withLocale('fr', () => VESSEL_FAMILY_LABELS.silent), 'Identité pas encore reçue');
});

test('the nine sea states are the WMO’s own names in each language', () => {
  const names = withLocale('en', () => seaStateNames());
  assertNoFrench(names);
  assert.deepEqual([...names], SEA_STATE_BANDS.map((band) => band.label));
  assert.equal(withLocale('en', () => seaStateBandLabel(0)), 'Calm · ≤ 0.1 m');
  assert.equal(withLocale('en', () => seaStateBandLabel(4)), 'Rough · 2.5 – 4 m');
  assert.equal(withLocale('en', () => seaStateBandLabel(8)), 'Phenomenal · > 14 m');
  assert.equal(withLocale('fr', () => seaStateBandLabel(4)), 'Forte · 2,5 – 4 m');
});
