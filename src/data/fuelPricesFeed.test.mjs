// src/data/fuelPricesFeed.test.mjs
// The join and the bands behind the `fuel-prices-fr` layer, and the route
// that serves them. The export rows below copy the shape of the live feed as
// read on 2026-11-23 (`prix-des-carburants-en-france-flux-instantane-v2`):
// coordinates as strings × 100 000, prices as numbers, timestamps in Paris
// wall time with a `+00:00` suffix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  FUEL_FR_BAND_KEYS,
  FUEL_FR_ROW,
  feedCoordinate,
  fuelBand,
  fuelDropCents,
  fuelPayload,
  fuelStationProps,
  joinFuelStations,
  normalizeFuelPrice,
  parseParisWallClock,
} from './fuelPricesFeed.js';
import { createFuelPricesService, parisDay } from './fuelPricesServer.js';

const NOW = Date.UTC(2026, 10, 23, 8, 20, 55); // 2026-11-23 09:20:55 in Paris

const reference = {
  version: 1,
  builtAt: '2026-11-23T08:00:00Z',
  window: { start: '2026-10-24', end: '2026-10-30', minValidDays: 5, maxAgeDays: 30 },
  brands: ['TotalEnergies', 'E.Leclerc'],
  brandGroups: ['Pétrolier', 'Grande surface'],
  stations: {
    56580001: [1, 2.329, 2.149, 0],
    21320007: [0, 1.95, null, 1],
  },
};

const row = (overrides = {}) => ({
  id: 56580001,
  latitude: '4806100',
  longitude: '-269000',
  cp: '56580',
  ville: 'Bréhan',
  adresse: '16 rue chateaubriand',
  pop: 'R',
  gazole_prix: 2.109,
  gazole_maj: '2026-11-23T09:10:01+00:00',
  e10_prix: null,
  e10_maj: null,
  ...overrides,
});

test('feed timestamps are Paris wall time whatever offset they print', () => {
  // 09:10:01 in Paris in November is 08:10:01 UTC — not 09:10:01 UTC, which
  // would be fifty minutes after the moment the feed was read.
  assert.equal(parseParisWallClock('2026-11-23T09:10:01+00:00'), Date.UTC(2026, 10, 23, 8, 10, 1));
  assert.equal(parseParisWallClock('2026-07-01 12:00:00'), Date.UTC(2026, 6, 1, 10, 0, 0));
  assert.equal(parseParisWallClock(''), null);
  assert.equal(parseParisWallClock(null), null);
});

test('prices: thousandths are divided, implausible values refused', () => {
  assert.equal(normalizeFuelPrice(2.109), 2.109);
  assert.equal(normalizeFuelPrice('1789'), 1.789);
  assert.equal(normalizeFuelPrice('1,859'), 1.859);
  assert.equal(normalizeFuelPrice(0.2), null);
  assert.equal(normalizeFuelPrice(9.99), null);
  assert.equal(normalizeFuelPrice(null), null);
});

test('coordinates are degrees × 100 000', () => {
  assert.equal(feedCoordinate('4806100'), 48.061);
  assert.equal(feedCoordinate('-269000'), -2.69);
  assert.equal(feedCoordinate(''), null);
});

test('the drop is positive when the price came down, and the bands follow the announced 12–18 c', () => {
  assert.equal(fuelDropCents(2.109, 2.329), 22);
  assert.equal(fuelDropCents(2.0, 1.99), -1);
  assert.equal(fuelDropCents(null, 2), null);
  assert.equal(fuelBand(22), 'forte');
  assert.equal(fuelBand(18), 'forte');
  assert.equal(fuelBand(12), 'annoncee');
  assert.equal(fuelBand(11.9), 'partielle');
  assert.equal(fuelBand(1), 'partielle');
  assert.equal(fuelBand(0.9), 'aucune');
  assert.equal(fuelBand(-4), 'aucune');
  assert.equal(fuelBand(null), 'inconnue');
  assert.deepEqual(FUEL_FR_BAND_KEYS, ['forte', 'annoncee', 'partielle', 'aucune', 'inconnue']);
});

test('the join keeps every station, and says why a band is unknown', () => {
  const records = [
    row(),
    row({ id: 21320007, latitude: '4730983', longitude: '450131', gazole_prix: 1.9, gazole_maj: '2026-09-01T08:00:00+00:00' }),
    row({ id: 75000001, latitude: '4885000', longitude: '235000', pop: 'A' }),
    row({ id: 99999999, latitude: '', longitude: '' }),
    row(), // a duplicate id is drawn once
  ];
  const { rows, counts, latestAt } = joinFuelStations(records, reference, { now: NOW });
  assert.equal(rows.length, 3);
  assert.equal(counts.stations, 3);
  assert.equal(counts.noCoordinate, 1);
  assert.equal(counts.gazoleStale, 1, 'a price declared 83 days ago is not a current price');
  assert.equal(counts.gazoleBefore, 2);
  assert.equal(counts.branded, 2);
  assert.deepEqual(counts.bands, { forte: 1, annoncee: 0, partielle: 0, aucune: 0, inconnue: 2 });
  assert.equal(latestAt, Date.UTC(2026, 10, 23, 8, 10, 1));

  const [brehan, stale, motorway] = rows;
  assert.equal(brehan[FUEL_FR_ROW.id], '56580001');
  assert.equal(brehan[FUEL_FR_ROW.brand], 1);
  assert.equal(brehan[FUEL_FR_ROW.gazoleBefore], 2.329);
  assert.equal(stale[FUEL_FR_ROW.gazole], null);
  assert.equal(stale[FUEL_FR_ROW.access], 1);
  assert.equal(motorway[FUEL_FR_ROW.motorway], 1);
  assert.equal(motorway[FUEL_FR_ROW.brand], -1);
});

test('a payload row becomes the properties the card reads', () => {
  const joined = joinFuelStations([row()], reference, { now: NOW });
  const payload = fuelPayload(joined, reference, { fetchedAt: NOW });
  assert.deepEqual(payload.columns, Object.keys(FUEL_FR_ROW));
  const props = fuelStationProps(payload.stations[0], payload);
  assert.equal(props.brand, 'E.Leclerc');
  assert.equal(props.group, 'Grande surface');
  assert.equal(props.dropCents, 22);
  assert.equal(props.band, 'forte');
  assert.equal(props.e10DropCents, null);
  assert.equal(props.motorway, false);
});

test('without a reference pack every station is drawn, as unknown', () => {
  const { counts } = joinFuelStations([row()], null, { now: NOW });
  assert.equal(counts.stations, 1);
  assert.equal(counts.bands.inconnue, 1);
});

function tempRoot(withReference = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'fuel-fr-'));
  if (withReference) {
    const dir = path.join(root, 'src', 'data', 'local_data', 'fuel_fr');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'reference.json'), JSON.stringify(reference));
  }
  return root;
}

const manyRecords = () => Array.from({ length: 5_000 }, (_, index) => row({ id: 10_000_000 + index }));

test('the route caches for ten minutes, archives once a day, and serves stale on failure', async () => {
  const root = tempRoot();
  let clock = NOW;
  let calls = 0;
  let fail = false;
  const fetchImpl = async () => {
    calls += 1;
    if (fail) throw new Error('boom');
    return { ok: true, status: 200, json: async () => manyRecords() };
  };
  const service = createFuelPricesService({ fetchImpl, root, now: () => clock, log: () => {} });

  const first = await service.stations();
  assert.equal(first.source, 'MISS');
  assert.equal(first.payload.stations.length, 5_000);
  assert.equal(first.payload.stale, false);

  clock += 5 * 60_000;
  assert.equal((await service.stations()).source, 'HIT');
  assert.equal(calls, 1);

  // The copies are written in the background; give them a turn.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const archive = path.join(root, '.gev-cache', 'archive', 'fuel-fr');
  assert.deepEqual(readdirSync(archive), [`${parisDay(NOW)}.json.gz`]);
  assert.ok(existsSync(path.join(root, '.gev-cache', 'fuel-fr', 'latest.json.gz')));

  clock += 20 * 60_000;
  fail = true;
  const stale = await service.stations();
  assert.equal(stale.source, 'STALE');
  assert.equal(stale.payload.stale, true);
  assert.equal(service.status().lastError.message, 'boom');
});

test('a short answer is a failed upstream, not a quiet day', async () => {
  const root = tempRoot();
  const service = createFuelPricesService({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [row()] }),
    root,
    now: () => NOW,
    log: () => {},
  });
  await assert.rejects(service.stations(), /answered 1 rows/);
});
