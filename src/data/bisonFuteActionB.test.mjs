// src/data/bisonFuteActionB.test.mjs
// Pins the Action b stream reader: how a directory of one-situation messages
// is replayed into a current state, how that state merges with the open DIR
// snapshot, and how the poller treats the shared national access point.
//
// The messages are SYNTHETIC, built below on the shape of the real ones (one
// DATEX II SituationPublication per file, one situation per message). Captured
// Action b data does not go into this public repository: the licence covers
// dynamic data until the event ends, and a fixture would outlive every event
// in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_B_AUTH_BACKOFF_MS,
  ACTION_B_LICENCE,
  ACTION_B_RESYNC_AFTER_MS,
  countRoadEvents,
  createActionBPoller,
  createActionBStore,
  isNewerSituation,
  mergeRoadEventFeeds,
  parseActionBListing,
} from './bisonFuteActionB.js';

const NOW = Date.parse('2026-09-21T10:00:00+02:00');
const HOUR = 3_600_000;

/**
 * One Action b message, shaped like the real ones.
 * @param {object} options
 */
function message({
  id = '260921-000001',
  version = 1,
  versionTime = '2026-09-21T09:00:00.000+02:00',
  source = 'ASF',
  type = 'MaintenanceWorks',
  start = '2026-09-21T08:00:00.000+02:00',
  end = '2026-09-21T18:00:00.000+02:00',
  ended = false,
  lat = 45.1,
  lon = 4.8,
} = {}) {
  const management = ended
    ? '<management><lifeCycleManagement><end>true</end></lifeCycleManagement></management>'
    : '';
  const endTag = end ? `<overallEndTime>${end}</overallEndTime>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>`
    + `<d2LogicalModel xmlns="http://datex2.eu/schema/2/2_0" modelBaseVersion="2">`
    + `<payloadPublication xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="SituationPublication" lang="fr">`
    + `<publicationTime>${versionTime}</publicationTime>`
    + `<publicationCreator><country>fr</country><nationalIdentifier>Tipi</nationalIdentifier></publicationCreator>`
    + `<situation id="${id}" version="${version}"><overallSeverity>medium</overallSeverity>`
    + `<situationVersionTime>${versionTime}</situationVersionTime>`
    + `<situationRecord xsi:type="${type}" id="${id}-1" version="${version}">`
    + `<situationRecordVersionTime>${versionTime}</situationRecordVersionTime>`
    + `<probabilityOfOccurrence>certain</probabilityOfOccurrence>`
    + `<source><sourceIdentification>${source}</sourceIdentification></source>`
    + `<validity><validityStatus>definedByValidityTimeSpec</validityStatus><validityTimeSpecification>`
    + `<overallStartTime>${start}</overallStartTime>${endTag}</validityTimeSpecification></validity>`
    + management
    + `<groupOfLocations xsi:type="Point"><tpegPointLocation><point><pointCoordinates>`
    + `<latitude>${lat}</latitude><longitude>${lon}</longitude></pointCoordinates></point></tpegPointLocation></groupOfLocations>`
    + `</situationRecord></situation></payloadPublication></d2LogicalModel></soap:Body></soap:Envelope>`;
}

/** An Apache index listing the given sequence numbers. */
function listing(seqs) {
  const rows = seqs.map((seq) => `<tr><td><a href="${seq}.xml">${seq}.xml</a></td><td align="right">2026-09-21 10:00  </td></tr>`);
  return `<html><body><table><tr><td><a href="/publication/">Parent Directory</a></td></tr>${rows.join('')}</table></body></html>`;
}

// ---------------------------------------------------------------------------
// The directory index
// ---------------------------------------------------------------------------

test('the index lists message files oldest first, once each, and nothing else', () => {
  const html = `${listing([4867664, 4867662, 4867663])}<a href="4867662.xml">again</a>`
    + '<a href="?C=M;O=A">sort</a><a href="date.txt">date</a>';
  assert.deepEqual(parseActionBListing(html).map((file) => file.seq), [4867662, 4867663, 4867664]);
  assert.equal(parseActionBListing(html)[0].name, '4867662.xml');
  assert.deepEqual(parseActionBListing(''), []);
  assert.deepEqual(parseActionBListing(null), []);
});

// ---------------------------------------------------------------------------
// Replaying the stream
// ---------------------------------------------------------------------------

test('a situation is replayed to its newest version, and tagged with its licence', () => {
  const store = createActionBStore();
  assert.deepEqual(store.ingest(message({ version: 1 }), { seq: 10, nowMs: NOW }),
    { added: 1, updated: 0, ended: 0, ignored: 0 });
  store.ingest(message({ version: 2, versionTime: '2026-09-21T09:30:00.000+02:00', type: 'Accident' }), { seq: 11, nowMs: NOW });
  const [event] = store.snapshot(NOW);
  assert.equal(store.size, 1);
  assert.equal(event.version, 2);
  assert.equal(event.category, 'accident');
  assert.equal(event.operator, 'ASF');
  assert.equal(event.licence, ACTION_B_LICENCE);
  assert.equal(store.state.lastSeq, 11);
});

test('an ended situation is deleted, and an older copy cannot bring it back', () => {
  const store = createActionBStore();
  store.ingest(message({ version: 1 }), { seq: 1, nowMs: NOW });
  store.ingest(message({ version: 2, ended: true }), { seq: 2, nowMs: NOW });
  assert.equal(store.size, 0);
  assert.equal(store.tombstone('260921-000001').version, 2);
  // Replayed out of order: version 1 again, after the end.
  assert.equal(store.ingest(message({ version: 1 }), { seq: 3, nowMs: NOW }).ignored, 1);
  assert.equal(store.snapshot(NOW).length, 0);
  // A genuinely newer version after the end is the operator reopening it.
  store.ingest(message({ version: 3 }), { seq: 4, nowMs: NOW });
  assert.equal(store.snapshot(NOW).length, 1);
  assert.equal(store.tombstone('260921-000001'), null);
});

test('a situation past its window leaves the map without waiting for an end message', () => {
  const store = createActionBStore();
  store.ingest(message({ end: '2026-09-21T11:00:00.000+02:00' }), { nowMs: NOW });
  assert.equal(store.snapshot(NOW).length, 1);
  assert.equal(store.snapshot(NOW + 2 * HOUR).length, 0);
  assert.ok(store.tombstone('260921-000001'), 'expired situations are tombstoned too');
});

test('a message already past its window is never stored', () => {
  const store = createActionBStore();
  const tally = store.ingest(message({ end: '2026-09-21T09:30:00.000+02:00' }), { nowMs: NOW });
  assert.equal(tally.ended, 1);
  assert.equal(store.size, 0);
});

test('planned becomes active at its start, without a new message', () => {
  const store = createActionBStore();
  store.ingest(message({ start: '2026-09-21T21:00:00.000+02:00', end: '2026-09-22T06:00:00.000+02:00' }), { nowMs: NOW });
  assert.equal(store.snapshot(NOW)[0].state, 'planned');
  assert.equal(store.snapshot(Date.parse('2026-09-21T22:00:00+02:00'))[0].state, 'active');
});

test('tombstones are forgotten after their TTL', () => {
  const store = createActionBStore({ tombstoneTtlMs: HOUR });
  store.ingest(message({ ended: true }), { nowMs: NOW });
  store.snapshot(NOW + 30 * 60_000);
  assert.ok(store.tombstone('260921-000001'));
  store.snapshot(NOW + 2 * HOUR);
  assert.equal(store.tombstone('260921-000001'), null);
});

test('what is persisted is live situations and tombstones, and it round-trips', () => {
  const store = createActionBStore();
  store.ingest(message({ id: '260921-000001' }), { seq: 5, nowMs: NOW });
  store.ingest(message({ id: '260921-000002', ended: true }), { seq: 6, nowMs: NOW });
  store.state.lastPollAt = NOW;
  store.state.synced = true;
  const saved = JSON.parse(JSON.stringify(store.toJSON()));
  assert.deepEqual(saved.events.map((event) => event.id), ['260921-000001']);
  assert.equal(saved.tombstones.length, 1);

  const restored = createActionBStore();
  assert.equal(restored.load(saved), true);
  assert.equal(restored.size, 1);
  assert.equal(restored.state.lastSeq, 6);
  assert.equal(restored.state.synced, true);
  assert.ok(restored.tombstone('260921-000002'));
  assert.equal(restored.load({ v: 99 }), false, 'an unknown format is refused, not half-read');
  assert.equal(restored.size, 0);
});

// ---------------------------------------------------------------------------
// Merging with the open snapshot
// ---------------------------------------------------------------------------

test('the later version of a situation wins, whichever feed it came from', () => {
  const open = [
    { id: 'A', version: 1, updated: 1, state: 'active' },
    { id: 'B', version: 3, updated: 3, state: 'active' },
  ];
  const stream = [
    { id: 'A', version: 2, updated: 2, state: 'active', licence: ACTION_B_LICENCE },
    { id: 'B', version: 2, updated: 2, state: 'active', licence: ACTION_B_LICENCE },
    { id: 'C', version: 1, updated: 5, state: 'active', licence: ACTION_B_LICENCE },
  ];
  const merged = mergeRoadEventFeeds(open, stream);
  assert.deepEqual(merged.map((event) => event.id), ['C', 'B', 'A']);
  assert.equal(merged.find((event) => event.id === 'A').licence, ACTION_B_LICENCE);
  assert.equal(merged.find((event) => event.id === 'B').licence, undefined);
});

test('a situation the stream ended stays ended while the hourly snapshot catches up', () => {
  const open = [{ id: 'A', version: 1, updated: 1, state: 'active' }];
  const tombs = { A: { version: 2, updated: 2 } };
  const merged = mergeRoadEventFeeds(open, [], (id) => tombs[id] || null);
  assert.equal(merged[0].state, 'ended');
  const newer = mergeRoadEventFeeds([{ id: 'A', version: 3, updated: 3, state: 'active' }], [], (id) => tombs[id] || null);
  assert.equal(newer[0].state, 'active');
});

test('counts are recomputed over the merged list, with the Action b share', () => {
  const counts = countRoadEvents([
    { state: 'active', geometry: { kind: 'point' }, licence: ACTION_B_LICENCE, safety: true },
    { state: 'planned', geometry: { kind: 'segment', shaped: 'carriageway' } },
    { state: 'ended', geometry: { kind: 'segment' } },
  ]);
  assert.deepEqual(counts, {
    situations: 3, points: 1, segments: 2, shaped: 1,
    active: 1, planned: 1, ended: 1, safety: 1, actionB: 1,
  });
});

test('version compares before time', () => {
  assert.equal(isNewerSituation({ version: 2, updated: 1 }, { version: 1, updated: 9 }), true);
  assert.equal(isNewerSituation({ version: 1, updated: 9 }, { version: 1, updated: 1 }), true);
  assert.equal(isNewerSituation({ version: 1, updated: 1 }, { version: 1, updated: 1 }), false);
});

// ---------------------------------------------------------------------------
// The poller
// ---------------------------------------------------------------------------

const BASE = 'https://tipi.example/ACTION-B/';

/** A fake origin: a directory of files, a request log, and switchable status. */
function fakeOrigin(files) {
  const origin = { files: new Map(Object.entries(files)), requests: [], status: 200 };
  origin.fetch = async (url, init) => {
    origin.requests.push({ url, auth: init?.headers?.Authorization, encoding: init?.headers?.['Accept-Encoding'] });
    if (origin.status !== 200) return new Response('', { status: origin.status });
    if (url === BASE) return new Response(listing([...origin.files.keys()].map(Number)));
    const name = url.slice(BASE.length).replace('.xml', '');
    const body = origin.files.get(name);
    return body === undefined ? new Response('', { status: 404 }) : new Response(body);
  };
  return origin;
}

function makePoller(origin, { clock = { t: NOW }, credentials = { user: 'u', password: 'p' } } = {}) {
  const store = createActionBStore();
  const sleeps = [];
  const poller = createActionBPoller({
    store,
    baseUrl: BASE,
    credentials: () => credentials,
    fetchImpl: origin.fetch,
    sleep: async (ms) => { sleeps.push(ms); },
    now: () => clock.t,
    spacingMs: 500,
    log: { log() {}, warn() {} },
  });
  return { store, poller, sleeps, clock };
}

test('a poll reads the index, then each file once, one at a time, with Basic auth and gzip', async () => {
  const origin = fakeOrigin({
    101: message({ id: '260921-000001' }),
    102: message({ id: '260921-000002', source: 'APRR' }),
  });
  const { store, poller, sleeps } = makePoller(origin);
  const result = await poller.pollOnce();
  assert.equal(result.files, 2);
  assert.deepEqual(origin.requests.map((request) => request.url), [BASE, `${BASE}101.xml`, `${BASE}102.xml`]);
  assert.ok(origin.requests.every((request) => request.auth === `Basic ${btoa('u:p')}`));
  assert.ok(origin.requests.every((request) => request.encoding === 'gzip'));
  assert.deepEqual(sleeps, [500], 'one pause between two files, none before the first');
  assert.equal(store.state.synced, true);
  assert.equal(store.state.lastPollAt, NOW);
  assert.equal(store.snapshot(NOW).length, 2);

  // The next poll downloads only what is new.
  origin.files.set('103', message({ id: '260921-000001', version: 2, ended: true }));
  origin.requests.length = 0;
  await poller.pollOnce();
  assert.deepEqual(origin.requests.map((request) => request.url), [BASE, `${BASE}103.xml`]);
  assert.deepEqual(store.snapshot(NOW).map((event) => event.id), ['260921-000002']);
});

test('a file that rotated out between the index and its download is skipped', async () => {
  const origin = fakeOrigin({ 201: message() });
  const realFetch = origin.fetch;
  origin.fetch = async (url, init) => (url === BASE
    ? new Response(listing([200, 201]))
    : realFetch(url, init));
  const { store, poller } = makePoller(origin);
  await poller.pollOnce();
  assert.equal(store.state.lastSeq, 201);
  assert.equal(store.size, 1);
});

test('without credentials the poller makes no request at all', async () => {
  const origin = fakeOrigin({ 1: message() });
  const { poller } = makePoller(origin, { credentials: null });
  assert.deepEqual(await poller.pollOnce(), { files: 0, skipped: true });
  assert.equal(origin.requests.length, 0);
});

test('a rejected login backs off for an hour instead of retrying every poll', async () => {
  const origin = fakeOrigin({ 1: message() });
  origin.status = 401;
  const clock = { t: NOW };
  const { poller, store } = makePoller(origin, { clock });
  await poller.pollOnce();
  assert.match(poller.status.lastError, /login rejected/);
  assert.equal(store.state.synced, false);
  const before = origin.requests.length;
  clock.t += 30 * 60_000;
  assert.equal((await poller.pollOnce()).skipped, true);
  assert.equal(origin.requests.length, before, 'no request inside the back-off');
  origin.status = 200;
  clock.t += ACTION_B_AUTH_BACKOFF_MS;
  await poller.pollOnce();
  assert.equal(store.state.synced, true);
  assert.equal(poller.status.lastError, null);
});

test('a store left unpolled longer than the window allows is replayed from scratch', async () => {
  const origin = fakeOrigin({ 301: message({ id: '260921-000009', end: '2026-09-23T18:00:00.000+02:00' }) });
  const clock = { t: NOW };
  const { store, poller } = makePoller(origin, { clock });
  // A stale store from a previous process: it holds a situation whose END
  // message may already have rotated out of the directory.
  store.ingest(message({ id: '260921-000001', end: '2026-09-22T18:00:00.000+02:00' }), { seq: 300, nowMs: NOW });
  store.state.lastPollAt = NOW;
  store.state.synced = true;
  clock.t = NOW + ACTION_B_RESYNC_AFTER_MS + 60_000;
  await poller.pollOnce();
  assert.deepEqual(store.snapshot(clock.t).map((event) => event.id), ['260921-000009']);
});

test('a failed poll keeps what was already served', async () => {
  const origin = fakeOrigin({ 1: message() });
  const { store, poller } = makePoller(origin);
  await poller.pollOnce();
  origin.status = 503;
  await poller.pollOnce();
  assert.match(poller.status.lastError, /HTTP 503/);
  assert.equal(store.state.synced, true);
  assert.equal(store.size, 1);
});

test('an unreadable message is skipped, not retried at every poll', async () => {
  const origin = fakeOrigin({ 401: '<not-xml', 402: message({ id: '260921-000004' }) });
  const warnings = [];
  const store = createActionBStore();
  const poller = createActionBPoller({
    store,
    baseUrl: BASE,
    credentials: () => ({ user: 'u', password: 'p' }),
    fetchImpl: origin.fetch,
    sleep: async () => {},
    now: () => NOW,
    log: { log() {}, warn: (line) => warnings.push(line) },
  });
  await poller.pollOnce();
  assert.equal(store.state.lastSeq, 402);
  assert.equal(store.size, 1);
  origin.requests.length = 0;
  await poller.pollOnce();
  assert.deepEqual(origin.requests.map((request) => request.url), [BASE]);
});
