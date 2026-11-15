// scripts/lib/permitArchiveRescrub.test.mjs
// The one-off pass that rewrites the archive files nothing touches any more,
// against an archive written here. Every name below is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rescrubPermitArchive } from './permitArchiveRescrub.mjs';
import { SIRAP_ROW_FIELDS } from '../../src/data/sirapFeed.js';

const cellsOf = (row) => SIRAP_ROW_FIELDS.map((field) => row[field] ?? null);

test('a dry run says what would change and writes nothing; --write cleans, merges, and is idempotent', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'permit-archive-rescrub-'));
  try {
    const dir = path.join(root, 'sirap');
    await fsp.mkdir(dir, { recursive: true });
    const posted = {
      numeroAds: 'PC 001 001 26 00001', type: 'PC', dateDepot: '2026-10-02',
      demandeur: 'SCI EXEMPLE - M. FICTIF Paul', descriptionTravaux: 'Garage chez Jean TESTEUR',
    };
    const document = {
      schema: 1, instance: 'siea', insee: '01001', firstDay: '2026-10-03', lastDay: '2026-11-15', days: 43,
      rows: [{ board: '01001', cells: cellsOf(posted), first: '2026-10-03', last: '2026-11-15' }],
    };
    const file = path.join(dir, '01001.json');
    await fsp.writeFile(file, JSON.stringify(document));
    await fsp.writeFile(path.join(dir, '01002.json'), '{"schema":1,'); // unreadable: left alone
    await fsp.writeFile(path.join(dir, 'sweep.json'), '{"day":"2026-11-15"}');

    const dry = await rescrubPermitArchive(root);
    assert.deepEqual(dry.sirap, { files: 1, changed: 1, restored: 1, merged: 0, skipped: 1 });
    assert.equal(await fsp.readFile(file, 'utf8'), JSON.stringify(document));

    const wet = await rescrubPermitArchive(root, { write: true });
    assert.equal(wet.sirap.changed, 1);
    const written = JSON.parse(await fsp.readFile(file, 'utf8'));
    const text = JSON.stringify(written);
    assert.ok(!text.includes('FICTIF') && !text.includes('TESTEUR'), text);
    assert.equal(written.rows[0].cells[SIRAP_ROW_FIELDS.indexOf('demandeur')], 'SCI EXEMPLE');
    assert.equal(written.rows[0].first, '2026-10-03');
    assert.equal(written.days, 43);
    assert.equal(await fsp.readFile(path.join(dir, '01002.json'), 'utf8'), '{"schema":1,');

    const again = await rescrubPermitArchive(root, { write: true });
    assert.equal(again.sirap.changed, 0);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
