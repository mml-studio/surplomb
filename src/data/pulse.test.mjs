// The home page's live figures: what gets counted, and what is never shown.
//
// Run against the REAL bundled outlines, because the whole honesty of the
// « au-dessus de la France » label rests on them: a synthetic square would
// prove the arithmetic and nothing about Barcelona.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AIRCRAFT_POSITION_MAX_LAG_S,
  PULSE_CACHE_MS,
  PULSE_KEYS,
  PULSE_MAX_AGE_MS,
  PULSE_WHY,
  VESSEL_HEARD_WITHIN_MS,
  countAircraftOverFrance,
  countReportingStations,
  countTransitFleet,
  countVesselsInFrenchWaters,
  createFranceTerritory,
  finalizePulse,
} from './pulse.js';

const OUTLINES = JSON.parse(readFileSync(
  new URL('./local_data/france_departements/departements.geojson', import.meta.url),
  'utf8',
));
const territory = createFranceTerritory(OUTLINES);

const PLACES = {
  paris: [48.8566, 2.3522],
  lyon: [45.764, 4.8357],
  corte: [42.3061, 9.15],
  // The simplified outline cuts the Gulf of Ajaccio straight across, so the
  // town itself falls in the « sea » (franceDepartements.js, DEFAULT_COAST_SNAP_KM).
  ajaccio: [41.9192, 8.7386],
  geneva: [46.2044, 6.1432],
  brussels: [50.8503, 4.3517],
  barcelona: [41.3851, 2.1734],
  genoa: [44.4056, 8.9463],
  southampton: [50.9097, -1.4044],
  antwerp: [51.2194, 4.4025],
  // 10 km off Nice, in the Baie des Anges.
  offNice: [43.6, 7.3],
  // Mid-Channel, well past twelve miles from either coast.
  midChannel: [50.2, -1.5],
};

test('the server caches one counting pass for at least thirty seconds', () => {
  assert.ok(PULSE_CACHE_MS >= 30_000);
  assert.equal(PULSE_MAX_AGE_MS, 10 * 60_000);
  assert.deepEqual([...PULSE_KEYS], ['avions', 'navires', 'bus', 'meteo']);
});

test('the territory: land is the outlines, waters add twelve miles of sea', () => {
  assert.ok(territory, 'the bundled outlines index');
  for (const name of ['paris', 'lyon', 'corte']) {
    assert.equal(territory.onLand(...PLACES[name]), true, name);
    assert.equal(territory.inWaters(...PLACES[name]), true, name);
  }
  assert.equal(territory.inWaters(...PLACES.ajaccio), true, 'a port the outline cuts off is still in French water');
  for (const name of ['geneva', 'brussels', 'barcelona', 'genoa', 'southampton', 'antwerp', 'offNice', 'midChannel']) {
    assert.equal(territory.onLand(...PLACES[name]), false, `${name} is not French land`);
  }
  assert.equal(territory.inWaters(...PLACES.offNice), true, 'the Baie des Anges is French water');
  for (const name of ['barcelona', 'genoa', 'southampton', 'antwerp', 'midChannel', 'brussels']) {
    assert.equal(territory.inWaters(...PLACES[name]), false, `${name} is not French water`);
  }
  assert.equal(territory.onLand(Number.NaN, 2), false);
  assert.equal(territory.inWaters(48, undefined), false);
  assert.equal(createFranceTerritory({ features: [] }), null);
});

/** One OpenSky extended state vector: only the fields the count reads. */
function state({ lat, lon, onGround = false, positionAt, category = 0 }) {
  const s = new Array(18).fill(null);
  s[3] = positionAt;
  s[5] = lon;
  s[6] = lat;
  s[8] = onGround;
  s[17] = category;
  return s;
}

test('aircraft: airborne, positioned in the last minute, over French land', () => {
  const time = 1_789_819_838;
  const body = JSON.stringify({
    time,
    states: [
      state({ lat: PLACES.paris[0], lon: PLACES.paris[1], positionAt: time }),
      state({ lat: PLACES.lyon[0], lon: PLACES.lyon[1], positionAt: time - 5 }),
      // On the ground at Lyon: not « au-dessus ».
      state({ lat: PLACES.lyon[0], lon: PLACES.lyon[1], positionAt: time, onGround: true }),
      // A position OpenSky kept for twenty minutes says where it WAS.
      state({ lat: PLACES.paris[0], lon: PLACES.paris[1], positionAt: time - AIRCRAFT_POSITION_MAX_LAG_S - 1 }),
      state({ lat: PLACES.paris[0], lon: PLACES.paris[1], positionAt: null }),
      // A service vehicle is not an aircraft, whatever its flag says.
      state({ lat: PLACES.paris[0], lon: PLACES.paris[1], positionAt: time, category: 17 }),
      // Over Geneva and off Nice: outside the land count, by design.
      state({ lat: PLACES.geneva[0], lon: PLACES.geneva[1], positionAt: time }),
      state({ lat: PLACES.offNice[0], lon: PLACES.offNice[1], positionAt: time }),
      state({ lat: null, lon: null, positionAt: time }),
      'not a state',
    ],
  });
  assert.deepEqual(countAircraftOverFrance(body, territory), { value: 2, at: time * 1000 });
  // The parsed form reads the same.
  assert.deepEqual(countAircraftOverFrance(JSON.parse(body), territory), { value: 2, at: time * 1000 });
});

test('aircraft: an unreadable body or no territory is cold, not zero', () => {
  assert.deepEqual(countAircraftOverFrance('{not json', territory), { value: null, why: PULSE_WHY.cold });
  assert.deepEqual(countAircraftOverFrance('{"states":[]}', territory), { value: null, why: PULSE_WHY.cold });
  assert.deepEqual(countAircraftOverFrance('{"time":1,"states":[]}', null), { value: null, why: PULSE_WHY.cold });
  // An empty sky is a zero, which finalizePulse turns into a hidden figure.
  assert.deepEqual(countAircraftOverFrance('{"time":1,"states":[]}', territory), { value: 0, at: 1000 });
});

test('vessels: heard in the window, inside the twelve-mile line', () => {
  const now = 1_789_820_000_000;
  const rows = [
    { lat: 49.48, lon: 0.1, _updatedAt: now - 1_000 }, // Le Havre roads
    { lat: PLACES.offNice[0], lon: PLACES.offNice[1], _updatedAt: now - 60_000 },
    { lat: 48.85, lon: 2.35, _updatedAt: now - 2_000 }, // a barge on the Seine
    // The AISStream box is a rectangle: these are in it, and not French.
    { lat: PLACES.barcelona[0], lon: PLACES.barcelona[1], _updatedAt: now },
    { lat: PLACES.genoa[0], lon: PLACES.genoa[1], _updatedAt: now },
    { lat: PLACES.antwerp[0], lon: PLACES.antwerp[1], _updatedAt: now },
    { lat: PLACES.southampton[0], lon: PLACES.southampton[1], _updatedAt: now },
    // French water, but last heard eleven minutes ago.
    { lat: 49.48, lon: 0.1, _updatedAt: now - 11 * 60_000 },
    // Nine and a half: inside the window NOW, outside it by the time a pass
    // counted now has been served for a minute.
    { lat: 49.48, lon: 0.1, _updatedAt: now - 570_000 },
  ];
  assert.deepEqual(
    countVesselsInFrenchWaters(rows, territory, { now, live: true }),
    { value: 3, at: now - 1_000 },
  );
});

test('vessels: every hull counted is still inside the window when the cached pass is served', () => {
  assert.equal(VESSEL_HEARD_WITHIN_MS + PULSE_CACHE_MS, PULSE_MAX_AGE_MS);
});

test('vessels: a feed that is not live counts nothing, whatever the map holds', () => {
  const now = 1_789_820_000_000;
  const rows = [{ lat: 49.48, lon: 0.1, _updatedAt: now }];
  assert.deepEqual(countVesselsInFrenchWaters(rows, territory, { now, live: false }), { value: null, why: PULSE_WHY.off });
  assert.deepEqual(countVesselsInFrenchWaters([], territory, { now, live: true }), { value: null, why: PULSE_WHY.empty });
  assert.deepEqual(countVesselsInFrenchWaters(rows, null, { now, live: true }), { value: null, why: PULSE_WHY.cold });
});

test('buses: two cities heard out of the national index is not « la France »', () => {
  const now = 1_789_820_000_000;
  const feeds = [{ id: 'tbm' }, { id: 'star' }, { id: 'tcl' }];
  const cache = new Map([
    ['tbm', { at: now - 5_000, vehicles: [{ tripId: 'tbm-trip-1' }, { tripId: 'tbm-trip-2' }], error: null }],
    ['star', { at: now - 5_000, vehicles: [{ tripId: 'star-trip-1' }], error: null }],
  ]);
  assert.deepEqual(
    countTransitFleet(feeds, cache, { now }),
    { value: null, why: PULSE_WHY.partial, heard: 2, of: 3 },
  );
  // A network whose last fetch failed was not heard, even with stale fixes kept.
  cache.set('tcl', { at: now - 5_000, vehicles: [{ tripId: 'tcl-trip-1' }], error: 'timeout' });
  assert.equal(countTransitFleet(feeds, cache, { now }).why, PULSE_WHY.partial);
  // Nor is one heard eleven minutes ago.
  cache.set('tcl', { at: now - 11 * 60_000, vehicles: [{ tripId: 'tcl-trip-1' }], error: null });
  assert.equal(countTransitFleet(feeds, cache, { now }).why, PULSE_WHY.partial);
  assert.deepEqual(countTransitFleet([], cache, { now }), { value: null, why: PULSE_WHY.cold });
  assert.deepEqual(countTransitFleet(feeds, null, { now }), { value: null, why: PULSE_WHY.cold });
});

test('buses: the whole index heard counts each run once, and dates the sum by its oldest network', () => {
  const now = 1_789_820_000_000;
  const louviers = { lat: 49.2150, lon: 1.1650 };
  const feeds = [{ id: 'normandie' }, { id: 'semo' }, { id: 'tisseo' }];
  const cache = new Map([
    ['normandie', {
      at: now - 120_000,
      vehicles: [
        // Also in the Seine-Eure feed, on the same coordinates: one bus.
        { tripId: 'semo-000123', ...louviers },
        { tripId: 'nomad-000456', lat: 49.44, lon: 1.10 },
        // A run without a usable trip id cannot be matched, so it counts alone.
        { tripId: null, lat: 49.18, lon: -0.37 },
        // A position the feed has been republishing for an hour.
        { tripId: 'nomad-000789', lat: 49.0, lon: 1.0, timestampMs: now - 3_600_000 },
      ],
      error: null,
    }],
    ['semo', { at: now - 30_000, vehicles: [{ tripId: 'semo-000123', lat: 49.2151, lon: 1.1651 }], error: null }],
    // The same generic trip id 600 km away is another network's bus.
    ['tisseo', { at: now - 30_000, vehicles: [{ tripId: 'nomad-000456', lat: 43.6, lon: 1.44 }], error: null }],
  ]);
  assert.deepEqual(countTransitFleet(feeds, cache, { now }), { value: 4, at: now - 120_000 });
});

test('weather stations: the ones that spoke in the newest round', () => {
  const snapshot = {
    newest: '2026-09-18T21:00:00Z',
    observations: {
      '07149': { at: '2026-09-18T21:00:00Z' },
      '07150': { at: '2026-09-18T21:00:00Z' },
      '07480': { at: '2026-09-18T18:00:00Z' },
    },
  };
  assert.deepEqual(countReportingStations(snapshot), { value: 2, at: Date.parse('2026-09-18T21:00:00Z') });
  assert.deepEqual(countReportingStations(null), { value: null, why: PULSE_WHY.cold });
  assert.deepEqual(countReportingStations({ newest: null, observations: {} }), { value: null, why: PULSE_WHY.cold });
});

test('the answer: only positive integers younger than ten minutes get through', () => {
  const now = Date.parse('2026-09-19T12:10:00Z');
  const pulse = finalizePulse({
    avions: { value: 454, at: now - 30_000 },
    navires: { value: 1925, at: now - PULSE_MAX_AGE_MS - 1 },
    bus: { value: null, why: PULSE_WHY.partial, heard: 2, of: 143 },
    meteo: { value: 0, at: now },
  }, { now });
  assert.deepEqual(pulse, {
    at: '2026-09-19T12:10:00.000Z',
    countedAt: '2026-09-19T12:10:00.000Z',
    maxAgeMs: PULSE_MAX_AGE_MS,
    avions: { value: 454, at: '2026-09-19T12:09:30.000Z' },
    navires: null,
    bus: null,
    meteo: null,
    why: { navires: PULSE_WHY.stale, bus: PULSE_WHY.partial, meteo: PULSE_WHY.empty },
  });
});

test('the answer: the synoptic archive the server holds today is never « en ce moment »', () => {
  // Measured 2026-09-19 on the hosted server: newest SYNOP round 2026-09-08
  // 21:00Z. Consolidated daily, it is 11 to 35 hours old at best.
  const now = Date.parse('2026-09-19T12:10:00Z');
  const meteo = countReportingStations({
    newest: '2026-09-18T21:00:00Z',
    observations: { '07149': { at: '2026-09-18T21:00:00Z' } },
  });
  assert.equal(finalizePulse({ meteo }, { now }).meteo, null);
});

test('the answer: a fraction, a string, a clock in the future or nothing at all never pass', () => {
  const now = Date.parse('2026-09-19T12:10:00Z');
  const pulse = finalizePulse({
    avions: { value: 12.5, at: now },
    navires: { value: '1925', at: now },
    bus: { value: 40, at: now + 5 * 60_000 },
  }, { now });
  for (const key of PULSE_KEYS) assert.equal(pulse[key], null, key);
  assert.deepEqual(pulse.why, { avions: 'cold', navires: 'cold', bus: 'stale', meteo: 'cold' });
  assert.deepEqual(Object.keys(finalizePulse(undefined, { now })).sort(),
    ['at', 'avions', 'bus', 'countedAt', 'maxAgeMs', 'meteo', 'navires', 'why']);
});

test('the answer: the age rule is applied when SERVING, not when counting', () => {
  // A pass counted 50 s ago, served now: a figure that was 9 min 30 s old at
  // the count is 10 min 20 s old at the answer, and does not get through.
  const now = Date.parse('2026-09-19T12:10:00Z');
  const countedAt = now - 50_000;
  const readings = { navires: { value: 1925, at: countedAt - 570_000 } };
  const pulse = finalizePulse(readings, { now, countedAt });
  assert.equal(pulse.navires, null);
  assert.equal(pulse.why.navires, PULSE_WHY.stale);
  assert.equal(pulse.countedAt, '2026-09-19T12:09:10.000Z');
  assert.ok(finalizePulse(readings, { now: countedAt, countedAt }).navires, 'the same reading was fresh at the count');
});
