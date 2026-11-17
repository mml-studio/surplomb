// src/data/portalArchive.test.mjs
// The open-data portals' archive: a record is kept once, as served, persons
// out; a record whose text changes is a second row; a stored row is filtered
// again on the way in; each record is filed under its own municipality.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_ADS_PORTALS } from './adsFeed.js';
import { emptyCartdsArchive, readCartdsArchive, recordCartdsBoards } from './cartdsArchive.js';
import {
  archivedPortalRecords,
  portalArchiveColumns,
  portalArchiveCommune,
  portalArchiveFiles,
  portalSweepColumn,
  recordArchiveKind,
  scrubPortalRecord,
  PORTAL_ARCHIVE,
  PORTAL_ARCHIVE_BOARD,
  PORTAL_ROWS,
} from './portalArchive.js';

const portal = (key) => LOCAL_ADS_PORTALS.find((p) => p.key === key);
const INSTANCE = { key: 'paris' };

test('every portal the layer reads has an archive plan', () => {
  for (const p of LOCAL_ADS_PORTALS) assert.ok(PORTAL_ARCHIVE[p.key], p.key);
});

test('scrubPortalRecord keeps a company, drops a person and the columns that only name people', () => {
  const kept = scrubPortalRecord({
    nom_dossier: 'DP 075 108 26 V0143',
    demandeur: 'Monsieur Jean DUPONT',
    objet: 'Ravalement chez M. DUPONT Jean',
    nom_demandeur: 'DUPONT',
    personne_phys_mor: 'P',
    resultat_recherche: true,
    surface: 12,
  });
  assert.equal(kept.nom_dossier, 'DP 075 108 26 V0143');
  assert.equal(kept.demandeur, null);
  assert.doesNotMatch(kept.objet, /DUPONT/);
  assert.equal('nom_demandeur' in kept, false);
  assert.equal('personne_phys_mor' in kept, false);
  assert.equal('resultat_recherche' in kept, false);
  assert.equal(kept.surface, 12);
  assert.equal(scrubPortalRecord({ demandeur: 'SCI LES PINS' }).demandeur, 'SCI LES PINS');
  assert.equal(scrubPortalRecord(null), null);
  assert.equal(scrubPortalRecord(['a']), null);
});

test('a record is one row whatever its key order; a changed record is a second row', () => {
  const day1 = recordCartdsBoards(emptyCartdsArchive(INSTANCE, '75056'), {
    [PORTAL_ARCHIVE_BOARD]: [{ b: 1, a: { y: 2, x: 1 } }, { STADE: 'Attente DOC', NOM_DOSSIER: 'PC 1' }],
  }, '2026-11-17', PORTAL_ROWS);
  assert.equal(day1.added, 2);
  const day2 = recordCartdsBoards(day1.archive, {
    [PORTAL_ARCHIVE_BOARD]: [{ a: { x: 1, y: 2 }, b: 1 }, { NOM_DOSSIER: 'PC 1', STADE: 'Accordé' }],
  }, '2026-11-18', PORTAL_ROWS);
  assert.equal(day2.added, 1, 'the reordered record is the same row');
  assert.equal(day2.seen, 1);
  const records = archivedPortalRecords(day2.archive);
  assert.equal(records.length, 3);
  const stages = records.filter((r) => r.record.NOM_DOSSIER === 'PC 1').map((r) => [r.record.STADE, r.first, r.last]);
  assert.deepEqual(stages, [['Attente DOC', '2026-11-17', '2026-11-17'], ['Accordé', '2026-11-18', '2026-11-18']]);
  assert.equal(day2.archive.days, 2);
});

test('a stored row that names a person is filtered again as it is read, and merges with tonight', () => {
  const stored = {
    schema: 1, instance: 'paris', insee: '75056', firstDay: '2026-11-01', lastDay: '2026-11-02', days: 2,
    rows: [{ board: PORTAL_ARCHIVE_BOARD, cells: ['{"demandeur":"M. Jean DUPONT","n":"PC 1"}'], first: '2026-11-01', last: '2026-11-02' }],
  };
  const { archive, restored } = readCartdsArchive(stored, INSTANCE, '75056', PORTAL_ROWS);
  assert.equal(restored, 1);
  assert.doesNotMatch(archive.rows[0].cells[0], /DUPONT/);
  const next = recordCartdsBoards(archive, { [PORTAL_ARCHIVE_BOARD]: [{ n: 'PC 1', demandeur: 'M. Jean DUPONT' }] }, '2026-11-03', PORTAL_ROWS);
  assert.equal(next.added, 0, 'the same dossier, not a new one');
  assert.equal(next.archive.rows[0].first, '2026-11-01');
});

test('recordArchiveKind accepts only its own boards', () => {
  const kind = recordArchiveKind(['acts', 'lists']);
  assert.equal(kind.board('acts'), true);
  assert.equal(kind.board('records'), false);
  assert.deepEqual(kind.scrub({ id: 'x', objet: 'PC 26 : Garage' }), ['{"id":"x","objet":"PC 26 : Garage"}']);
});

test('portalArchiveCommune files each record under its own municipality', () => {
  assert.deepEqual(portalArchiveCommune(portal('paris'), { commune: 8 }), { insee: '75056', placed: true });
  assert.deepEqual(portalArchiveCommune(portal('bordeaux'), { insee: '33318' }), { insee: '33318', placed: true });
  assert.deepEqual(portalArchiveCommune(portal('nantes'), { code_insee_commune: 44109 }), { insee: '44109', placed: true });
  assert.deepEqual(portalArchiveCommune(portal('brest'), { NOM_DOSSIER: 'PC 029 212 26 00040' }), { insee: '29212', placed: true });
  assert.deepEqual(portalArchiveCommune(portal('brest'), { NOM_DOSSIER: 'PC 029 075 26 00001' }), { insee: '29075', placed: true },
    'Guipavas is in the file though the layer reads it elsewhere');
  const lost = portalArchiveCommune(portal('brest'), { NOM_DOSSIER: '???' });
  assert.equal(lost.placed, false, 'unreadable, but kept under the portal');
  assert.equal(lost.insee, portal('brest').communes[0]);
});

test('the sweep asks by commune where it can, and asks for the extras', () => {
  assert.equal(portalSweepColumn(portal('paris')), null);
  assert.equal(portalSweepColumn(portal('brest')), null);
  assert.equal(portalSweepColumn(portal('bordeaux')), 'insee');
  assert.equal(portalSweepColumn(portal('nantes')), 'code_insee_commune');
  assert.deepEqual(portalArchiveFiles(portal('paris')), ['75056']);
  assert.ok(portalArchiveFiles(portal('brest')).includes('29075'));
  assert.ok(portalArchiveColumns(portal('brest')).includes('STADE'));
  assert.ok(!portalArchiveColumns(portal('dodu')).includes('nom_demandeur'));
});
