// The doctors' proxy against real files on disk: where it reads the names
// from, what it does without them, and how fast an objection takes effect.
//
// Every name here is invented; the fixtures are two or three sites wide.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { createMedecinsMiddleware } from '../../vite.config.js';

const SITES = [
  [48.8601, 2.3801, 0, '75111', '75011', 'Paris', '1 RUE A', '', 'liberal', [['01', 2]], 2, ''],
  [48.8602, 2.3802, 0, '75111', '75011', 'Paris', '2 RUE B', '', 'liberal', [['15', 1]], 1, ''],
  [45.7640, 4.8357, 0, '69381', '69001', 'Lyon', '3 RUE C', '', 'centre-de-sante', [['01', 3]], 0, ''],
];
const NAMES = [
  [['MARTINEZ CLAIRE', 'F', '01', '1', ''], ['DUPONTEL JEAN', 'M', '01', '1', '']],
  [['ROUSSELIN ANNE', 'F', '15', '3', '3']],
  [],
];

function packDocument(sites, namesText) {
  const doc = {
    generated: '2026-09-22',
    source: { ps: { modified: '2026-09-21T00:00:00+00:00' } },
    sources: ['test'],
    stats: {},
    precision: ['numero', 'voie', 'lieu-dit', 'commune'],
    specialites: { '01': 'Médecin généraliste', 15: 'Ophtalmologiste' },
    secteurs: {},
    optionsTarifaires: {},
    departements: {},
    apl: null,
    nonLocalisees: [],
    etablissements: [],
    sites,
  };
  if (namesText !== undefined) {
    doc.praticiens = {
      lignes: namesText.split('\n').filter(Boolean).length,
      sha256: createHash('sha256').update(namesText).digest('hex'),
    };
  }
  return doc;
}

const namesText = (names = NAMES) => `${names.map((line) => JSON.stringify(line)).join('\n')}\n`;

async function writePair(dir, { names = NAMES, declare = true, gzip = true, sites = SITES } = {}) {
  await fsp.mkdir(dir, { recursive: true });
  const text = names ? namesText(names) : '';
  const pack = `${JSON.stringify(packDocument(sites, declare ? text : undefined))}\n`;
  const put = (file, body) => (gzip
    ? fsp.writeFile(path.join(dir, `${file}.gz`), zlib.gzipSync(body))
    : fsp.writeFile(path.join(dir, file), body));
  // The pack first, like the build.
  await put('medecins.json', pack);
  if (names) await put('praticiens.jsonl', text);
}

async function fixture(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'medecins-proxy-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return {
    root,
    runtimeDir: path.join(root, 'runtime'),
    repoDir: path.join(root, 'repo'),
    suppressPath: path.join(root, 'suppress.txt'),
  };
}

function handlerFor(dirs, options = {}) {
  const quiet = { log() {}, warn() {} };
  return createMedecinsMiddleware({ ...dirs, rateLimiter: () => true, log: quiet, ...options });
}

async function get(handler, url) {
  return new Promise((resolve, reject) => {
    const res = {
      headersSent: false,
      status: 0,
      headers: {},
      writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
      end(body) {
        try {
          const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '');
          resolve({ status: this.status, headers: this.headers, body: text ? JSON.parse(text) : null });
        } catch (error) { reject(error); }
      },
    };
    handler({ method: 'GET', url, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res).catch(reject);
  });
}

const namesAt = async (handler, index) => {
  const { body: sites } = await get(handler, '/sites?south=45&west=2&north=45.6&east=2.6');
  const packId = sites?.packId ?? (await get(handler, '/status')).body.packId;
  return get(handler, `/praticiens?index=${index}&pack=${packId}`);
};

test('a clone with only the repository pack draws everything and says the names are unavailable', async (t) => {
  const dirs = await fixture(t);
  await writePair(dirs.repoDir, { names: null, declare: false });
  const handler = handlerFor(dirs);

  const status = await get(handler, '/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.origin, 'repository');
  assert.deepEqual(status.body.names, { available: false, reason: 'absent' });

  const national = await get(handler, '/national');
  assert.equal(national.status, 200);
  assert.equal(national.body.packId, status.body.packId);

  const sites = await get(handler, '/sites?south=48.8&west=2.3&north=48.9&east=2.4');
  assert.equal(sites.body.count, 2);

  const card = await get(handler, `/praticiens?index=0&pack=${status.body.packId}`);
  assert.equal(card.status, 200);
  assert.equal(card.body.names, false);
  assert.deepEqual(card.body.praticiens, []);
});

test('the deployment build wins over the repository pack, and serves its names', async (t) => {
  const dirs = await fixture(t);
  await writePair(dirs.repoDir, { names: null, declare: false, sites: SITES.slice(0, 1) });
  await writePair(dirs.runtimeDir);
  const handler = handlerFor(dirs);

  const { body: status } = await get(handler, '/status');
  assert.equal(status.origin, 'runtime');
  assert.deepEqual(status.names, { available: true, reason: null });
  assert.equal(status.practitionerLines, 3);

  const card = await get(handler, `/praticiens?index=0&pack=${status.packId}`);
  assert.equal(card.body.names, true);
  assert.deepEqual(card.body.praticiens.map((entry) => entry[0]), ['MARTINEZ CLAIRE', 'DUPONTEL JEAN']);
  assert.equal(card.headers['Cache-Control'], 'no-store', 'a cached answer would outlive an objection');
});

test('an index from another pack, or from no pack, is refused rather than answered', async (t) => {
  const dirs = await fixture(t);
  await writePair(dirs.runtimeDir);
  const handler = handlerFor(dirs);
  const { body: status } = await get(handler, '/status');

  const stale = await get(handler, '/praticiens?index=0&pack=000000000000');
  assert.equal(stale.status, 409);
  assert.equal(stale.body.packId, status.packId, 'the refusal says which pack to re-read');
  assert.equal((await get(handler, '/praticiens?index=0')).status, 409);
});

test('an objection is honoured on the very next request, without a restart', async (t) => {
  const dirs = await fixture(t);
  await writePair(dirs.runtimeDir);
  const handler = handlerFor(dirs);

  assert.equal((await namesAt(handler, 0)).body.praticiens.length, 2);
  await fsp.writeFile(dirs.suppressPath, '# objection, 2026-09-22\nJean Dupontel\n');
  const after = await namesAt(handler, 0);
  assert.deepEqual(after.body.praticiens.map((entry) => entry[0]), ['MARTINEZ CLAIRE']);

  // Scoped to another postal code, the second entry leaves Paris alone.
  await fsp.writeFile(dirs.suppressPath, 'Jean Dupontel\nMARTINEZ CLAIRE ; 69\n');
  assert.deepEqual((await namesAt(handler, 0)).body.praticiens.map((entry) => entry[0]), ['MARTINEZ CLAIRE']);
  assert.equal((await get(handler, '/status')).body.suppressionEntries, 2);
});

test('a suppression list that cannot be read hides every name', async (t) => {
  const dirs = await fixture(t);
  await writePair(dirs.runtimeDir);
  // A directory where the file should be: stat works, reading fails.
  await fsp.mkdir(dirs.suppressPath);
  const handler = handlerFor(dirs);
  const card = await namesAt(handler, 1);
  assert.equal(card.status, 200);
  assert.equal(card.body.names, false);
  assert.deepEqual(card.body.praticiens, []);
});

test('a names file from another build is not attached to this pack', async (t) => {
  const dirs = await fixture(t);
  await writePair(dirs.runtimeDir);
  // Same line count, different content: only the declared digest can tell.
  const other = NAMES.map((line) => line.map((entry) => ['SOMEONE ELSE', ...entry.slice(1)]));
  await fsp.writeFile(path.join(dirs.runtimeDir, 'praticiens.jsonl.gz'), zlib.gzipSync(namesText(other)));
  const handler = handlerFor(dirs);

  const { body: status } = await get(handler, '/status');
  assert.deepEqual(status.names, { available: false, reason: 'digest' });
  const sites = await get(handler, '/sites?south=48.8&west=2.3&north=48.9&east=2.4');
  assert.equal(sites.body.count, 2, 'the layer still draws without its names');
});

test('a weekly rebuild is picked up, and the moment between its two renames keeps the old pair', async (t) => {
  const dirs = await fixture(t);
  await writePair(dirs.runtimeDir);
  const handler = handlerFor(dirs, { recheckMs: 0 });
  const before = (await get(handler, '/status')).body;
  assert.equal(before.names.available, true);

  // The rebuild renames its pack into place first: a new pack whose declared
  // digest does not match the names file still on disk.
  const renamed = NAMES.map((line) => line.map((entry) => [`${entry[0]} NEW`, ...entry.slice(1)]));
  const newText = namesText(renamed);
  await fsp.writeFile(
    path.join(dirs.runtimeDir, 'medecins.json.gz'),
    zlib.gzipSync(`${JSON.stringify({ ...packDocument(SITES, newText), generated: '2026-09-29T04:00' })}\n`),
  );
  await get(handler, '/status'); // triggers the reload
  await handler.settled();
  const between = (await get(handler, '/status')).body;
  assert.equal(between.packId, before.packId, 'a half-renamed rebuild must not replace a working pair');
  assert.equal(between.names.available, true);

  // Then the names file lands, and the next check swaps both at once.
  await fsp.writeFile(path.join(dirs.runtimeDir, 'praticiens.jsonl.gz'), zlib.gzipSync(newText));
  await get(handler, '/status');
  await handler.settled();
  const after = (await get(handler, '/status')).body;
  assert.notEqual(after.packId, before.packId);
  assert.equal(after.names.available, true);
  const card = await get(handler, `/praticiens?index=1&pack=${after.packId}`);
  assert.deepEqual(card.body.praticiens.map((entry) => entry[0]), ['ROUSSELIN ANNE NEW']);
});

test('no pack anywhere is a 503, not a crash', async (t) => {
  const dirs = await fixture(t);
  const handler = handlerFor(dirs);
  const status = await get(handler, '/status');
  assert.equal(status.status, 503);
  assert.match(status.body.error, /medecins-fr pack unavailable/);
});
