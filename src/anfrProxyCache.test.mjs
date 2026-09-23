// The ANFR proxy's answers as a browser receives them: compressed, kept, and
// revalidated for nothing when the register has not changed.
//
// Before, `/api/anfr-fr/mesh` went out `no-store` and uncompressed — 1.67 MB
// from the origin on every page load for a register republished weekly — and
// the city view's `/supports` boxes likewise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';

import { anfrAnswer, anfrBoxFrom, anfrEtagMatches, anfrMeshAnswer, sendAnfrAnswer } from '../vite.config.js';
import { anfrCellBlockBox } from './data/anfrSupportCells.js';

/** The response surface `sendAnfrAnswer` writes to. */
function response() {
  const res = {
    status: null,
    headers: null,
    body: undefined,
    headersSent: false,
    writeHead(status, headers) { res.status = status; res.headers = headers; res.headersSent = true; },
    end(body) { res.body = body; },
  };
  return res;
}

const MESH = { mesh: Array.from({ length: 400 }, (_, i) => [48 + i / 1000, 2 + i / 1000, 4, 4]), count: 400 };
const CORE = { ...MESH, stale: false };
/** A register build as the proxy keeps it: its clock, and the mesh with its build time. */
const build = (at, builtInMs, mesh = MESH) => ({ at, payload: { mesh: { ...mesh, builtInMs } } });

test('the validator stands for the masts, not for the clock of the build that served them', () => {
  const six = anfrMeshAnswer(build(1_000, 17), false);
  const twelve = anfrMeshAnswer(build(2_000, 23), false);
  assert.equal(six.etag, twelve.etag, 'a rebuild of the same edition revalidates for nothing');
  assert.match(six.etag, /^W\/"[\w-]+"$/, 'weak: the body is gzipped for one client and not another');
  assert.notEqual(anfrMeshAnswer(build(1_000, 17, { ...MESH, count: 401 }), false).etag, six.etag);
  assert.deepEqual(JSON.parse(six.raw), { ...MESH, stale: false, fetchedAt: 1_000, builtInMs: 17 });
});

test('a stale answer and the fresh one after it are two answers, so the recovery is not a 304', () => {
  const stale = anfrMeshAnswer(build(1_000, 17), true);
  const fresh = anfrMeshAnswer(build(1_000, 17), false);
  assert.notEqual(stale.etag, fresh.etag);
  assert.equal(stale.stale, true);
  assert.equal(fresh.stale, false);
});

test('an answer is kept six hours, gzipped for a client that takes gzip', async () => {
  const answer = anfrAnswer(CORE, { fetchedAt: 1_000 });
  const res = response();
  await sendAnfrAnswer({ headers: { 'accept-encoding': 'gzip, deflate, br' } }, res, answer, { 'X-ANFR-FR': 'HIT' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['Cache-Control'], 'private, max-age=21600');
  assert.equal(res.headers.Vary, 'Accept-Encoding');
  assert.equal(res.headers['Content-Encoding'], 'gzip');
  assert.equal(res.headers['X-ANFR-FR'], 'HIT');
  assert.equal(Number(res.headers['Content-Length']), res.body.length);
  assert.ok(res.body.length < answer.raw.length / 3);
  assert.deepEqual(gunzipSync(res.body), answer.raw);

  const plain = response();
  await sendAnfrAnswer({ headers: {} }, plain, answer);
  assert.equal(plain.headers['Content-Encoding'], undefined);
  assert.deepEqual(plain.body, answer.raw);
});

test('a stale answer is kept five minutes, so the next refresh can replace it', async () => {
  const res = response();
  await sendAnfrAnswer({ headers: {} }, res, anfrAnswer({ ...CORE, stale: true }, { fetchedAt: 1_000 }));
  assert.equal(res.headers['Cache-Control'], 'private, max-age=300');
});

test('a browser holding the answer gets a 304 and no body', async () => {
  const answer = anfrAnswer(CORE, { fetchedAt: 1_000 });
  for (const header of [answer.etag, answer.etag.slice(2), `W/"other", ${answer.etag}`, '*']) {
    const res = response();
    await sendAnfrAnswer({ headers: { 'if-none-match': header, 'accept-encoding': 'gzip' } }, res, answer);
    assert.equal(res.status, 304, header);
    assert.equal(res.body, undefined);
    assert.equal(res.headers.ETag, answer.etag);
  }
  assert.equal(anfrEtagMatches('W/"other"', answer.etag), false);
  assert.equal(anfrEtagMatches(undefined, answer.etag), false);
});

test('a small answer goes out as is: gzip would make it bigger', async () => {
  const res = response();
  await sendAnfrAnswer({ headers: { 'accept-encoding': 'gzip' } }, res, anfrAnswer({ supports: [], stale: false }, { fetchedAt: 1 }));
  assert.equal(res.headers['Content-Encoding'], undefined);
});

test('the proxy takes a box of exactly its ceiling, as the city view’s grid asks for it', () => {
  const box = anfrCellBlockBox({ r0: 1934, r1: 1947, c0: 80, c1: 93 }); // 14 × 14 cells
  assert.equal(Number(box.north) - Number(box.south) > 0.35, true, 'floating point puts it a hair over');
  const url = new URL(`http://x/supports?${new URLSearchParams(box)}`);
  assert.deepEqual(anfrBoxFrom(url), { south: 48.35, west: 2, north: 48.7, east: 2.35 });
  const wider = new URL('http://x/supports?south=48.35&west=2&north=48.71&east=2.35');
  assert.equal(anfrBoxFrom(wider), null, 'and nothing wider');
});
