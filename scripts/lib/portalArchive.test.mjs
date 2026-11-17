// scripts/lib/portalArchive.test.mjs
// The nightly read of the open-data portals, against canned answers: one
// commune at a time where a portal can be asked so, whole and split where it
// cannot, ArcGIS paged, a failed reading asked once more, a partial one not
// recorded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LOCAL_ADS_PORTALS } from '../../src/data/adsFeed.js';
import { PORTAL_ROWS, archivedPortalRecords } from '../../src/data/portalArchive.js';
import { createCartdsArchiveStore } from './cartdsArchive.mjs';
import {
  monthsBefore,
  portalSweepDue,
  portalArcgisUrl,
  portalExportUrl,
  readPortalRecords,
  sweepPortalArchive,
  ARCGIS_PAGE,
} from './portalArchive.mjs';

const portal = (key) => LOCAL_ADS_PORTALS.find((p) => p.key === key);

/** An `http` whose answers are chosen by URL; every URL asked is recorded. */
function cannedHttp(answer) {
  const asked = [];
  return {
    asked,
    fetch: async (url) => {
      asked.push(url);
      const body = answer(url, asked.length);
      if (body === null) return null;
      return { ok: true, body };
    },
    text: async (response) => JSON.stringify(response.body),
  };
}

async function tempStore() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'portal-archive-'));
  return createCartdsArchiveStore(dir, { warn() {} }, PORTAL_ROWS);
}

test('monthsBefore steps back calendar months, clamped to the month end', () => {
  assert.equal(monthsBefore('2026-11-17', 36), '2023-11-17');
  assert.equal(monthsBefore('2026-03-31', 1), '2026-02-28');
});

test('an export asks by commune, with the window and the certificats left out', () => {
  const url = new URL(portalExportUrl(portal('bordeaux'), { insee: '33063', since: '2023-11-17' }));
  const where = url.searchParams.get('where');
  assert.match(where, /insee = "33063"/);
  assert.match(where, /date_depot >= date'2023-11-17'/);
  assert.match(where, /type != "CU"/);
  assert.equal(url.searchParams.get('limit'), '-1');
  const nantes = new URL(portalExportUrl(portal('nantes'), { insee: '44109' }));
  assert.equal(nantes.searchParams.get('where'), 'code_insee_commune = 44109');
  const paris = new URL(portalExportUrl(portal('paris')));
  assert.equal(paris.searchParams.get('where'), null, 'the whole file');
  assert.match(paris.searchParams.get('select'), /programme/);
});

test('an ArcGIS layer is read page after page, its dates as Paris days', async () => {
  const full = Array.from({ length: ARCGIS_PAGE }, (_, i) => ({ properties: { NOM_DOSSIER: `PC 029 019 26 ${i}`, DATE_DEPOT: 1766098800000 }, geometry: null }));
  const http = cannedHttp((url) => {
    const offset = Number(new URL(url).searchParams.get('resultOffset'));
    return { type: 'FeatureCollection', features: offset === 0 ? full : full.slice(0, 5) };
  });
  const records = await readPortalRecords(portal('brest'), http);
  assert.equal(records.length, ARCGIS_PAGE + 5);
  assert.equal(http.asked.length, 2);
  assert.equal(records[0].DATE_DEPOT, '2025-12-19');
  assert.match(portalArcgisUrl(portal('brest'), { offset: 4000 }), /resultOffset=4000/);
});

test('an ArcGIS reading that breaks off is no reading', async () => {
  const full = Array.from({ length: ARCGIS_PAGE }, () => ({ properties: {}, geometry: null }));
  const http = cannedHttp((url) => (new URL(url).searchParams.get('resultOffset') === '0' ? { type: 'FeatureCollection', features: full } : { error: { code: 500 } }));
  assert.equal(await readPortalRecords(portal('brest'), http), null);
});

test('the sweep writes one file per municipality, retries once, and names what failed', async () => {
  const store = await tempStore();
  const nantes = { ...portal('nantes'), communes: Object.freeze(['44109', '44143', '44190']) };
  let tries44143 = 0;
  const http = cannedHttp((url) => {
    const where = new URL(url).searchParams.get('where') ?? '';
    if (where.includes('44109')) return [{ numero_de_dossier: 'PC1', code_insee_commune: 44109, demandeur: 'M. Paul MARTIN' }];
    if (where.includes('44143')) { tries44143 += 1; return tries44143 === 1 ? null : []; }
    return null;
  });
  const slept = [];
  const summary = await sweepPortalArchive({
    portals: [nantes], store, http, day: '2026-11-17', pauseMs: 1, retryPauseMs: 5,
    sleep: async (ms) => { slept.push(ms); }, log: {},
  });
  assert.equal(summary.read, 2, 'the empty commune is read and written');
  assert.deepEqual(summary.failed, ['44190']);
  assert.equal(summary.records, 1);
  assert.ok(slept.includes(5), 'the failed reading was asked again');
  const { archive } = await store.load({ key: 'nantes' }, '44109');
  const [kept] = archivedPortalRecords(archive);
  assert.equal(kept.record.demandeur, null, 'a person never reaches the disk');
  const empty = await store.load({ key: 'nantes' }, '44143');
  assert.equal(empty.archive.days, 1);
});

test('a whole file is split by municipality', async () => {
  const store = await tempStore();
  const http = cannedHttp(() => ({
    type: 'FeatureCollection',
    features: [
      { properties: { NOM_DOSSIER: 'PC 029 019 26 00001' }, geometry: null },
      { properties: { NOM_DOSSIER: 'PC 029 075 26 00002' }, geometry: null },
    ],
  }));
  const summary = await sweepPortalArchive({
    portals: [portal('brest')], store, http, day: '2026-11-17', pauseMs: 0, retryPauseMs: 0, log: {},
  });
  assert.equal(summary.failed.length, 0);
  assert.equal(summary.read, portal('brest').communes.length + 1, 'every file written, Guipavas too');
  const guipavas = await store.load({ key: 'brest' }, '29075');
  assert.equal(guipavas.archive.rows.length, 1);
});

test('the portals are swept once a day, from 11:00 Paris', () => {
  const morning = new Date('2026-11-17T09:30:00Z'); // 10:30 Paris
  const noon = new Date('2026-11-17T10:30:00Z'); // 11:30 Paris
  assert.equal(portalSweepDue(null, morning), false);
  assert.equal(portalSweepDue(null, noon), true);
  assert.equal(portalSweepDue({ day: '2026-11-16' }, noon), true);
  assert.equal(portalSweepDue({ day: '2026-11-17' }, noon), false);
});
