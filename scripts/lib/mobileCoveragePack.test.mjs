import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import {
  COVERAGE_CURRENT_FILE,
  COVERAGE_META_FILE,
  coverageMetaResponse,
  createCoverageTileHandler,
  parseCoverageTilePath,
  readCoverageMeta,
} from './mobileCoveragePack.mjs';
import { COVERAGE_FORMAT } from '../../src/data/mobileCoverage.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-pack-'));
  fs.writeFileSync(path.join(root, COVERAGE_CURRENT_FILE), '2026_T1\n');
  fs.mkdirSync(path.join(root, '2026_T1', '12', '2074'), { recursive: true });
  fs.writeFileSync(path.join(root, '2026_T1', COVERAGE_META_FILE), JSON.stringify({ format: COVERAGE_FORMAT, edition: '2026_T1' }));
  fs.writeFileSync(path.join(root, '2026_T1', '12', '2074', '1409.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return root;
}

/** Drive the connect handler with a fake request and a response that records what it got. */
function request(handler, url, method = 'GET') {
  return new Promise((resolve) => {
    const res = new PassThrough();
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.writeHead = (status, headers) => { res.status = status; res.headers = headers; };
    const finish = () => resolve({ status: res.status, headers: res.headers, body: Buffer.concat(chunks) });
    res.on('finish', finish);
    const end = res.end.bind(res);
    res.end = (...args) => { end(...args); };
    handler({ url, method }, res);
  });
}

test('the meta is read from the edition `current` names, and refused under another format', async () => {
  const root = fixture();
  try {
    const meta = await readCoverageMeta(root);
    assert.equal(meta.edition, '2026_T1');
    const ok = await coverageMetaResponse(root);
    assert.equal(ok.status, 200);
    fs.writeFileSync(path.join(root, '2026_T1', COVERAGE_META_FILE), JSON.stringify({ format: 'other/9', edition: '2026_T1' }));
    // A later write changes the mtime key only if the clock moved; force it.
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(root, '2026_T1', COVERAGE_META_FILE), later, later);
    assert.equal(await readCoverageMeta(root), null);
    const missing = await coverageMetaResponse(path.join(root, 'nowhere'));
    assert.equal(missing.status, 404);
    assert.match(missing.body.build, /build-mobile-coverage/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a tile path is four validated numbers and an edition, and nothing else reaches the disk', () => {
  assert.deepEqual(parseCoverageTilePath('/2026_T1/12/2074/1409.png'), { edition: '2026_T1', z: 12, x: 2074, y: 1409 });
  assert.equal(parseCoverageTilePath('/2026_T1/12/2074/../../../etc/passwd'), null);
  assert.equal(parseCoverageTilePath('/../2026_T1/12/1/1.png'), null);
  assert.equal(parseCoverageTilePath('/2026_T5/12/1/1.png'), null);
  assert.equal(parseCoverageTilePath('/2026_T1/12/1/1.jpg'), null);
});

test('a written tile is served immutable, an unwritten one is a cached 404', async () => {
  const root = fixture();
  try {
    const handler = createCoverageTileHandler(root);
    const hit = await request(handler, '/2026_T1/12/2074/1409.png');
    assert.equal(hit.status, 200);
    assert.equal(hit.headers['Content-Type'], 'image/png');
    assert.match(hit.headers['Cache-Control'], /immutable/);
    assert.equal(hit.body.length, 4);
    const miss = await request(handler, '/2026_T1/12/2075/1409.png');
    assert.equal(miss.status, 404);
    assert.match(miss.headers['Cache-Control'], /max-age=86400/);
    const bad = await request(handler, '/2026_T1/12/2074/..%2F..%2Fx.png');
    assert.equal(bad.status, 404);
    const post = await request(handler, '/2026_T1/12/2074/1409.png', 'POST');
    assert.equal(post.status, 405);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
