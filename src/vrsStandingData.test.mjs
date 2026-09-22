import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  VRS_REFRESH_MS,
  buildModelNames,
  buildStandingIndex,
  createFlightInfoMiddleware,
  createStandingDataStore,
  csvRows,
  indexFromTarball,
  lookupAircraftType,
  lookupRoute,
  normalizeCallsign,
  splitCsvLine,
  tarEntries,
} from './vrsStandingData.js';

// ── A tarball shaped like GitHub's ─────────────────────────────────────────

function header(name, size, type = '0') {
  const block = Buffer.alloc(512);
  block.write(name.slice(0, 100), 0);
  block.write('0000644\0', 100);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  block.write(type, 156);
  block.write('ustar', 257); // magic, NUL-terminated by the zeroed block
  block.write('00', 263);
  return block;
}

function padded(data) {
  return Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

function tarFile(name, content) {
  const data = Buffer.from(content);
  if (name.length <= 100) return Buffer.concat([header(name, data.length), padded(data)]);
  // A long path travels in a pax `x` record ahead of the file, as GitHub does.
  const body = ` path=${name}\n`;
  let record = `${body.length + 2}${body}`;
  record = `${body.length + String(record.length).length}${body}`;
  const pax = Buffer.from(record);
  return Buffer.concat([header('PaxHeader', pax.length, 'x'), padded(pax), header('x', data.length), padded(data)]);
}

function tarball(files) {
  const commit = Buffer.from('52 comment=0123456789abcdef0123456789abcdef01234567\n');
  const parts = [header('pax_global_header', commit.length, 'g'), padded(commit)];
  for (const [name, content] of Object.entries(files)) parts.push(tarFile(name, content));
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts));
}

const ROOT = 'standing-data-main';
const FILES = {
  [`${ROOT}/LICENSE`]: 'CC0 1.0 Universal',
  [`${ROOT}/routes/schema-01/A/AFR-1.csv`]: '\uFEFFCallsign,Code,Number,AirlineCode,AirportCodes\n'
    + 'AFR1,AFR,1,AFR,LFPG-KJFK\nAFR1234,AFR,1234,AFR,LFPG-LHBP\n',
  [`${ROOT}/routes/schema-01/E/EZY-all.csv`]: 'Callsign,Code,Number,AirlineCode,AirportCodes\n'
    + 'EZY1,EZY,1,EZY,EHAM-EGKK\nEZY12AB,EZY,12AB,EZY,LSGG-EGGW\n'
    // Three airports: two legs flown under one number.
    + 'EZY8801,EZY,8801,EZY,LFPG-LSGG-LEBL\n'
    // An airport the table does not know: the route cannot be drawn.
    + 'EZY9999,EZY,9999,EZY,LFPG-ZZZZ\n',
  // A long path, to make the pax record carry it.
  [`${ROOT}/airports/schema-01/L/${'deep/'.repeat(20)}LF.csv`]: 'Code,Name,ICAO,IATA,Location,CountryISO2,Latitude,Longitude,AltitudeFeet\n'
    + 'LFPG,Charles de Gaulle International Airport,LFPG,CDG,Paris,FR,49.012798,2.55,392\n',
  [`${ROOT}/airports/schema-01/other.csv`]: 'Code,Name,ICAO,IATA,Location,CountryISO2,Latitude,Longitude,AltitudeFeet\n'
    + 'LHBP,Budapest Liszt Ferenc International Airport,LHBP,BUD,Budapest,HU,47.42976,19.261093,495\n'
    + 'KJFK,John F Kennedy International Airport,KJFK,JFK,New York,US,40.639801,-73.7789,13\n'
    + 'EHAM,Amsterdam Airport Schiphol,EHAM,AMS,Amsterdam,NL,52.308601,4.76389,-11\n'
    + 'EGKK,London Gatwick Airport,EGKK,LGW,London,GB,51.148102,-0.190278,202\n'
    + 'LSGG,Geneva Cointrin International Airport,LSGG,GVA,Geneva,CH,46.238098,6.10895,1411\n'
    + 'EGGW,London Luton Airport,EGGW,LTN,London,GB,51.874699,-0.368333,526\n'
    + 'LEBL,"Barcelona International Airport, El Prat",LEBL,BCN,,ES,41.2971,2.07846,12\n'
    + 'XXXX,Unused Field,XXXX,,Nowhere,FR,45,2,0\n',
  [`${ROOT}/airlines/schema-01/airlines.csv`]: '\uFEFFCode,Name,ICAO,IATA,PositioningFlightPattern,CharterFlightPattern\n'
    + 'AFR,Air France,AFR,AF,,\nEZY,easyJet,EZY,U2,9\\d\\d\\d,\nEJU,easyJet Europe,EJU,EC,,\n'
    + 'DS1,Shared IATA one,DSA,DS,,\nDS2,Shared IATA two,DSB,DS,,\n',
  [`${ROOT}/model-type/schema-01/A.csv`]: 'ICAO,Manufacturer,Model,Engines,EngineTypeCode,EnginePlacementCode,SpeciesCode,WakeTurbulenceCode,IsActive\n'
    + 'A20N,Airbus,A-320neo,2,J,,L,M,1\nA20N,Airbus,ACJ-320neo,2,J,,L,M,1\nA20N,Airbus,A320neo,2,J,,L,M,0\n'
    + 'AT76,ATR,ATR P-72,2,T,,L,M,1\nAT76,ATR,ATR-72-600,2,T,,L,M,1\n',
  [`${ROOT}/model-type/schema-01/C.csv`]: 'ICAO,Manufacturer,Model,Engines,EngineTypeCode,EnginePlacementCode,SpeciesCode,WakeTurbulenceCode,IsActive\n'
    + 'C172,Aviones Colombia,172,1,P,,L,L,1\nC172,Cessna,172,1,P,,L,L,1\nC172,Cessna,172 Skyhawk,1,P,,L,L,1\n'
    + 'C172,Reims,F172,1,P,,L,L,1\n',
  [`${ROOT}/model-type/schema-01/-.csv`]: 'ICAO,Manufacturer,Model,Engines,EngineTypeCode,EnginePlacementCode,SpeciesCode,WakeTurbulenceCode,IsActive\n'
    + '-GND,,Ground Vehicle,0,,,,,1\n',
  [`${ROOT}/aircraft/schema-01/4/40/407.csv`]: 'ICAO,Registration,ModelICAO,Manufacturer,Model,ManufacturerAndModel,IsPrivateOperator,Operator,AirlineCode,SerialNumber,YearBuilt\n'
    + '407046,G-WYDN,EC45,Airbus Helicopters,H145,Airbus Helicopters H145,0,UK HEMS,HLE,20084,2016\n'
    + '407047,G-ATRA,AT76,ATR,72-600,ATR 72-600,0,Example,,1,2019\n'
    + '407048,G-ATRB,AT76,ATR,72-600,ATR 72-600,0,Example,,2,2019\n',
};

const GZ = tarball(FILES);
const INDEX = indexFromTarball(GZ);

// ── Parsing ────────────────────────────────────────────────────────────────

test('the tar reader walks a GitHub tarball: pax paths, the global header skipped', () => {
  const names = [...tarEntries(zlib.gunzipSync(GZ))].map((entry) => entry.name);
  assert.equal(names.length, Object.keys(FILES).length);
  assert.ok(names.includes(`${ROOT}/airports/schema-01/L/${'deep/'.repeat(20)}LF.csv`), 'long path read from pax');
  assert.ok(!names.some((name) => name.includes('pax_global_header')));
});

test('CSV cells: optional quotes, doubled quotes, BOM and header dropped', () => {
  assert.deepEqual(splitCsvLine('a,"b, c",d'), ['a', 'b, c', 'd']);
  assert.deepEqual(splitCsvLine('"say ""hi""",x'), ['say "hi"', 'x']);
  assert.deepEqual(csvRows('\uFEFFh1,h2\r\n1,2\r\n\r\n3,4'), [['1', '2'], ['3', '4']]);
});

test('callsigns are normalised the way VRS stores them', () => {
  const iata = new Map([['U2', 'EZY']]);
  assert.equal(normalizeCallsign('AFR1234'), 'AFR1234');
  assert.equal(normalizeCallsign(' ezy0001 '), 'EZY1');
  assert.equal(normalizeCallsign('EZY0000'), 'EZY0');
  assert.equal(normalizeCallsign('EZY00AB'), 'EZY0AB');
  assert.equal(normalizeCallsign('U21234', iata), 'EZY1234');
  assert.equal(normalizeCallsign('F-GABC'), null, 'a tail is not a flight number');
  assert.equal(normalizeCallsign('AFR12345'), null, 'five digits is not a flight number');
  assert.equal(normalizeCallsign('AFR1ABC'), null);
});

// ── Lookups ────────────────────────────────────────────────────────────────

test('a route answers in the shape the flights layer reads, IATA code first', () => {
  const route = lookupRoute(INDEX, 'AFR1234');
  assert.deepEqual(route, {
    airline: 'Air France',
    origin: { code: 'CDG', icao: 'LFPG', iata: 'CDG', name: 'Paris', lat: 49.012798, lon: 2.55 },
    destination: { code: 'BUD', icao: 'LHBP', iata: 'BUD', name: 'Budapest', lat: 47.42976, lon: 19.261093 },
    stops: 2,
  });
  assert.equal(lookupRoute(INDEX, 'EZY0001').destination.code, 'LGW', 'leading zeros stripped before the search');
  assert.equal(lookupRoute(INDEX, 'EZY12AB').origin.code, 'GVA');
  assert.equal(lookupRoute(INDEX, 'AFR9'), null);
  assert.equal(lookupRoute(INDEX, 'ZZZ1'), null);
  assert.equal(lookupRoute(null, 'AFR1234'), null);
});

test('an airport the table does not know makes the route unanswerable, not half-drawn', () => {
  assert.equal(lookupRoute(INDEX, 'EZY9999'), null);
});

test('a multi-stop route answers the leg the aircraft is on when the page says where it is', () => {
  const whole = lookupRoute(INDEX, 'EZY8801');
  assert.equal(`${whole.origin.code}-${whole.destination.code}`, 'CDG-BCN');
  assert.equal(whole.stops, 3);
  // Over Lyon, between Paris and Geneva: the first leg.
  const first = lookupRoute(INDEX, 'EZY8801', { latDeg: 46.5, lonDeg: 4.6, altitudeM: 10000, verticalRateMps: 0 });
  assert.equal(`${first.origin.code}-${first.destination.code}`, 'CDG-GVA');
  // Over Perpignan, between Geneva and Barcelona: the second.
  const second = lookupRoute(INDEX, 'EZY8801', { latDeg: 42.7, lonDeg: 2.9, altitudeM: 9000, verticalRateMps: -5 });
  assert.equal(`${second.origin.code}-${second.destination.code}`, 'GVA-BCN');
  // A town-less airport keeps its own name.
  assert.equal(second.destination.name, 'Barcelona International Airport, El Prat');
});

test('only airports some route names are kept in memory', () => {
  assert.ok(INDEX.airports.has('LFPG'));
  assert.ok(!INDEX.airports.has('XXXX'));
});

test('an IATA code shared by two airlines is never swapped', () => {
  assert.equal(INDEX.iataToIcao.get('AF'), 'AFR');
  assert.equal(INDEX.iataToIcao.has('DS'), false);
});

test('a designator is named once: closest to its airframes, else the maker with most rows', () => {
  assert.equal(INDEX.modelNames.get('A20N'), 'Airbus A320neo', 'ICAO hyphen dropped for Airbus');
  // The airframes say "ATR 72-600", so the P-72 row (first alphabetically) loses.
  assert.equal(INDEX.modelNames.get('AT76'), 'ATR-72-600');
  // No airframes: Cessna has the most rows, and its first active one wins.
  assert.equal(INDEX.modelNames.get('C172'), 'Cessna 172');
  assert.equal(INDEX.modelNames.has('-GND'), false, 'fake codes are not types');
  assert.equal(buildModelNames([['B738', 'Boeing', '737-800', '2', 'J', '', 'L', 'M', '1']]).get('B738'), 'Boeing 737-800');
});

test('a type answer: the airframe when the hex is on file, the feed designator otherwise', () => {
  assert.deepEqual(lookupAircraftType(INDEX, '407046'), {
    typeCode: 'EC45', typeName: 'Airbus Helicopters H145', registration: 'G-WYDN',
  });
  assert.deepEqual(lookupAircraftType(INDEX, '3c6444', 'a20n'), {
    typeCode: 'A20N', typeName: 'Airbus A320neo', registration: null,
  });
  assert.deepEqual(lookupAircraftType(INDEX, '3c6444', 'ZZZZ'), { typeCode: 'ZZZZ', typeName: null, registration: null });
  assert.equal(lookupAircraftType(INDEX, '3c6444'), null);
  assert.equal(lookupAircraftType(INDEX, '3c6444', 'not a code'), null);
});

test('an archive without routes is refused rather than indexed empty', () => {
  assert.throws(() => indexFromTarball(tarball({ [`${ROOT}/LICENSE`]: 'CC0' })), /no routes/);
  assert.equal(buildStandingIndex([]).routeCount, 0);
});

// ── The server's copy ──────────────────────────────────────────────────────

function fakeFetch(bodies) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    const next = bodies.length > 1 ? bodies.shift() : bodies[0];
    if (next instanceof Error) throw next;
    if (typeof next === 'number') return new Response('nope', { status: next });
    return new Response(next, { status: 200, headers: { 'content-length': String(next.length) } });
  };
  impl.calls = calls;
  return impl;
}

async function tempCache() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vrs-'));
  return { root, cacheDir: path.join(root, 'vrs-standing-data') };
}

const quiet = { info() {}, warn() {} };

test('first use downloads once, writes the copy, and a restart reads it without a request', async () => {
  const { root, cacheDir } = await tempCache();
  try {
    const fetchImpl = fakeFetch([GZ]);
    let clock = 1_000_000;
    const store = createStandingDataStore({ cacheDir, fetchImpl, now: () => clock, log: quiet });
    const [a, b] = await Promise.all([store.ready(), store.ready()]);
    assert.equal(a, b, 'concurrent first calls share one load');
    assert.equal(fetchImpl.calls.length, 1);
    assert.ok((await stat(path.join(cacheDir, 'standing-data.tar.gz'))).size > 0);
    assert.equal(JSON.parse(await readFile(path.join(cacheDir, 'standing-data.json'), 'utf8')).fetchedAt, clock);

    clock += 3600_000;
    const restarted = createStandingDataStore({ cacheDir, fetchImpl, now: () => clock, log: quiet });
    assert.equal(lookupRoute(await restarted.ready(), 'AFR1234').destination.code, 'BUD');
    assert.equal(fetchImpl.calls.length, 1, 'a copy under a day old is not fetched again');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a day later the copy refreshes in the background, and a bad download keeps the good copy', async () => {
  const { root, cacheDir } = await tempCache();
  try {
    let clock = 5_000_000;
    const fetchImpl = fakeFetch([GZ, Buffer.from('not a tarball')]);
    const store = createStandingDataStore({ cacheDir, fetchImpl, now: () => clock, log: quiet });
    const first = await store.ready();
    clock += VRS_REFRESH_MS + 1;
    assert.equal(await store.ready(), first, 'the request is answered from the copy in hand');
    await store.settled();
    assert.equal(fetchImpl.calls.length, 2);
    assert.equal(store.current(), first, 'the corrupt download replaced nothing');
    assert.match(store.status().error, /incorrect header|unexpected end|invalid/i);
    assert.ok((await readFile(path.join(cacheDir, 'standing-data.tar.gz'))).equals(GZ));
    // A failed refresh is not retried on every request.
    await store.ready();
    assert.equal(fetchImpl.calls.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('no copy and no network: null, then no new attempt for an hour', async () => {
  const { root, cacheDir } = await tempCache();
  try {
    let clock = 9_000_000;
    const fetchImpl = fakeFetch([new Error('offline')]);
    const store = createStandingDataStore({ cacheDir, fetchImpl, now: () => clock, log: quiet });
    assert.equal(await store.ready(), null);
    assert.equal(await store.ready(), null);
    assert.equal(fetchImpl.calls.length, 1);
    clock += 3600_001;
    assert.equal(await store.ready(), null);
    assert.equal(fetchImpl.calls.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the adsbdb cache it replaced is deleted on first load', async () => {
  const { root, cacheDir } = await tempCache();
  try {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'adsbdb.json'), '{"routes":{},"aircraft":{}}');
    const store = createStandingDataStore({ cacheDir, fetchImpl: fakeFetch([GZ]), log: quiet });
    await store.ready();
    await assert.rejects(stat(path.join(root, 'adsbdb.json')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ── The endpoint ───────────────────────────────────────────────────────────

function call(handler, url) {
  return new Promise((resolve) => {
    const headers = new Map();
    const res = {
      statusCode: 200,
      setHeader(name, value) { headers.set(name.toLowerCase(), value); },
      writeHead(status, values = {}) {
        this.statusCode = status;
        for (const [name, value] of Object.entries(values)) headers.set(name.toLowerCase(), value);
      },
      end(payload) { resolve({ status: this.statusCode, headers, body: JSON.parse(payload) }); },
    };
    handler({ method: 'GET', url, headers: {} }, res);
  });
}

test('the endpoint answers routes and types in the shapes the page has always read', async () => {
  const store = { ready: async () => INDEX };
  const handler = createFlightInfoMiddleware({ store });
  const route = await call(handler, '/route/AFR1234');
  assert.equal(route.status, 200);
  assert.equal(route.body.found, true);
  assert.equal(route.body.airline, 'Air France');
  assert.equal(route.body.origin.code, 'CDG');
  assert.equal(route.headers.get('x-flight-info-source'), 'vrs-standing-data');
  const leg = await call(handler, '/route/EZY8801?lat=42.7&lon=2.9&alt=9000&vr=-5');
  assert.equal(leg.body.origin.code, 'GVA');
  assert.deepEqual((await call(handler, '/route/ZZZ1')).body, { found: false });
  const type = await call(handler, '/type/3C6444?t=A20N');
  assert.deepEqual(type.body, { found: true, typeCode: 'A20N', typeName: 'Airbus A320neo', registration: null });
  assert.deepEqual((await call(handler, '/type/3c6444')).body, { found: false });
  assert.equal((await call(handler, '/route/AF%20R1')).status, 400);
  assert.equal((await call(handler, '/type/xyz')).status, 400);
  assert.equal((await call(handler, '/other')).status, 404);
});

test('without a copy the endpoint says 503, so the page asks again later instead of caching a miss', async () => {
  const handler = createFlightInfoMiddleware({ store: { ready: async () => null } });
  const answer = await call(handler, '/route/AFR1234');
  assert.equal(answer.status, 503);
  assert.equal(answer.headers.get('retry-after'), '600');
  assert.equal(answer.headers.get('cache-control'), 'no-store');
});
