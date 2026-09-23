import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CCTV_TIMELAPSE_FRAME_CACHE_CONTROL,
  cctvTimelapseOptionsFromEnv,
  cctvTimelapseResponse,
  createCctvTimelapseRecorder,
  createSharpFrameEncoder,
  installCctvTimelapseRecorder,
  isSafeTimelapseCameraId,
  isTimelapseCapableSource,
  parseCctvTimelapsePath,
  timelapseIntervalMs,
} from './cctvTimelapse.js';

/*
 * Every fixture is synthetic: the "frames" are a few bytes shaped like a JPEG
 * (SOI … EOI) so the truncation check has something to judge, and the fake
 * encoder is deterministic, like the real one. Nothing touches the network.
 */

const T0 = Date.parse('2026-09-23T10:26:00+02:00');
const MINUTE = 60_000;
const FRAME_ORIGIN = 'https://download.data.grandlyon.com/files/rdata/pvo_patrimoine_voirie.pvocameracriter/';
const silent = { log() {}, warn() {} };

const tempRoots = [];
after(() => {
  for (const dir of tempRoots) fs.rmSync(dir, { recursive: true, force: true });
});

function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cctv-timelapse-'));
  tempRoots.push(dir);
  return dir;
}

/** A minimal JPEG-shaped body: SOI, the label, EOI (or no EOI when truncated). */
function jpeg(label, { truncated = false } = {}) {
  const parts = [Buffer.from([0xFF, 0xD8]), Buffer.from(String(label))];
  if (!truncated) parts.push(Buffer.from([0xFF, 0xD9]));
  return Buffer.concat(parts);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** One Grand Lyon-shaped catalog row that opts into recording. */
function lyon(code, overrides = {}) {
  const url = `${FRAME_ORIGIN}${code.toUpperCase()}.JPG`;
  return {
    id: `lyon-${code.toLowerCase()}`,
    timelapse: true,
    feedType: 'image',
    url,
    snapshotUrl: url,
    upstreamCadenceMs: MINUTE,
    ...overrides,
  };
}

function fakeTimers() {
  const pending = new Set();
  return {
    pending,
    setTimeout(fn, ms) {
      const handle = { fn, ms, unrefed: false, unref() { this.unrefed = true; return this; } };
      pending.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      pending.delete(handle);
    },
  };
}

/**
 * A recorder over a temp dir, a mutable clock and a fake upstream. By default
 * every fetch returns a new frame (its label is the camera and the clock).
 */
function harness({
  sources = [lyon('CWL9018')],
  frame = (id, clock) => jpeg(`${id}@${clock}`),
  rootDir = tempRoot(),
  mode = 'always',
  encodeFrame = async (buffer) => Buffer.concat([Buffer.from('ENC:'), buffer]),
  ...options
} = {}) {
  const state = { clock: T0, calls: [], sources };
  const timers = options.timers || fakeTimers();
  const recorder = createCctvTimelapseRecorder({
    rootDir,
    listSources: async () => state.sources,
    fetchFrame: async (url, source) => {
      state.calls.push(source.id);
      const body = frame(source.id, state.clock, url);
      return body ? { ok: true, body, contentType: 'image/jpeg' } : null;
    },
    encodeFrame,
    now: () => state.clock,
    mode,
    log: silent,
    timers,
    ...options,
  });
  return {
    recorder,
    rootDir,
    timers,
    state,
    advance(ms) { state.clock += ms; },
    files(id) {
      try {
        return fs.readdirSync(path.join(rootDir, id)).sort();
      } catch {
        return [];
      }
    },
  };
}

// ── Which cameras ────────────────────────────────────────────────────────────

test('only rows that opt in, with a fetchable URL and a directory-safe id, are recorded', async () => {
  const h = harness({
    sources: [
      lyon('CWL9018'),
      { id: 'austin-1', feedType: 'image', snapshotUrl: 'https://cctv.austinmobility.io/image/1.jpg' },
      lyon('CWFTP', { url: 'ftp://example.org/x.jpg', snapshotUrl: '' }),
      lyon('CWUP', { id: 'Lyon-CWUP' }),
      lyon('CWSTR', { timelapse: 'true' }),
    ],
  });
  await h.recorder.tick();

  assert.deepEqual(h.state.calls, ['lyon-cwl9018']);
  assert.deepEqual(h.files('lyon-cwl9018'), [`${T0}.jpg`]);
  const stored = fs.readFileSync(path.join(h.rootDir, 'lyon-cwl9018', `${T0}.jpg`));
  assert.ok(stored.subarray(0, 4).equals(Buffer.from('ENC:')), 'only the ENCODED frame is written');
});

test('capability is the row opt-in, not the provider', () => {
  assert.equal(isTimelapseCapableSource(lyon('CWL9018')), true);
  assert.equal(isTimelapseCapableSource({ ...lyon('CWL9018'), timelapse: undefined }), false);
  assert.equal(isTimelapseCapableSource({ ...lyon('CWL9018'), snapshotUrl: '', url: '' }), false);
  assert.equal(isTimelapseCapableSource(null), false);
});

// ── What is never stored ─────────────────────────────────────────────────────

test('placeholder, truncated, re-read, failed and unencodable frames are skipped', async () => {
  const placeholder = jpeg('Image indisponible');
  const repeated = jpeg('the same frame, published once');
  const h = harness({
    sources: ['CWPH', 'CWTRUNC', 'CWSAME', 'CWDOWN', 'CWBAD'].map((code) => lyon(code)),
    placeholderDigests: [sha256(placeholder)],
    frame: (id, clock) => ({
      'lyon-cwph': placeholder,
      'lyon-cwtrunc': jpeg(`cut ${clock}`, { truncated: true }),
      'lyon-cwsame': repeated,
      'lyon-cwdown': null,
      'lyon-cwbad': jpeg(`BAD ${clock}`),
    })[id],
    encodeFrame: async (buffer) => (buffer.includes('BAD') ? null : Buffer.concat([Buffer.from('ENC:'), buffer])),
  });

  await h.recorder.tick();
  h.advance(MINUTE);
  await h.recorder.tick();

  assert.equal(h.state.calls.length, 10, 'every camera is still polled');
  assert.deepEqual(h.files('lyon-cwsame').length, 1, 'a re-read of the same frame is stored once');
  for (const id of ['lyon-cwph', 'lyon-cwtrunc', 'lyon-cwdown', 'lyon-cwbad']) {
    assert.deepEqual(h.files(id), [], `${id} must store nothing`);
  }
  assert.deepEqual(h.recorder.stats().counts, {
    stored: 1, placeholder: 2, truncated: 2, duplicate: 1, failed: 2, encode: 2, oversize: 0,
  });
  // The manifest says why, so the panel does not promise a timelapse that
  // will never come (src/cctvTimelapsePlayer.js).
  assert.equal(h.recorder.manifest('lyon-cwph').lastOutcome, 'placeholder');
  assert.equal(h.recorder.manifest('lyon-cwtrunc').lastOutcome, 'truncated');
  assert.equal(h.recorder.manifest('lyon-cwdown').lastOutcome, 'failed');
  assert.equal(h.recorder.manifest('lyon-cwsame').lastOutcome, 'duplicate');
});

test('a fetch that throws is a failed frame, not a failed tick', async () => {
  const h = harness({
    sources: [lyon('CWBOOM'), lyon('CWOK')],
    frame: (id, clock) => {
      if (id === 'lyon-cwboom') throw new Error('socket hang up');
      return jpeg(`${id}@${clock}`);
    },
  });
  await h.recorder.tick();
  assert.equal(h.files('lyon-cwok').length, 1);
  assert.equal(h.recorder.stats().counts.failed, 1);
});

// ── The window ───────────────────────────────────────────────────────────────

test('frames older than the window leave the manifest, and the disk one poll later', async () => {
  const h = harness({ windowMs: 10 * MINUTE });
  for (let i = 0; i < 15; i += 1) {
    await h.recorder.tick();
    h.advance(MINUTE);
  }
  h.advance(-MINUTE); // back to the last tick's clock

  const manifest = h.recorder.manifest('lyon-cwl9018');
  assert.equal(manifest.frames.length, 11, 'minutes 4..14 inclusive');
  assert.equal(manifest.from, T0 + 4 * MINUTE);
  assert.equal(manifest.to, T0 + 14 * MINUTE);
  // One poll of margin on disk, so the left edge is never a hole.
  assert.deepEqual(h.files('lyon-cwl9018'), Array.from({ length: 12 }, (_, k) => `${T0 + (k + 3) * MINUTE}.jpg`));
});

test('a per-camera cap bounds the frames even inside the window', async () => {
  // Recorder interval 2 min → cap ceil(60/2)*2 = 60; the camera declares 30 s.
  const h = harness({ intervalMs: 2 * MINUTE, sources: [lyon('CWFAST', { upstreamCadenceMs: 30_000 })] });
  for (let i = 0; i < 70; i += 1) {
    await h.recorder.tick();
    h.advance(30_000);
  }
  assert.equal(h.files('lyon-cwfast').length, 60);
  assert.equal(h.recorder.stats().frames, 60);
});

test('a camera that leaves the catalog keeps its past until it expires, then its directory goes', async () => {
  const h = harness({ windowMs: 10 * MINUTE, sources: [lyon('CWSTAY'), lyon('CWGONE')] });
  await h.recorder.tick();
  h.state.sources = [lyon('CWSTAY')];
  h.advance(MINUTE);
  await h.recorder.tick();
  assert.equal(h.recorder.manifest('lyon-cwgone').frames.length, 1, 'a stale catalog must not erase a recording');

  h.advance(20 * MINUTE);
  await h.recorder.tick();
  assert.equal(fs.existsSync(path.join(h.rootDir, 'lyon-cwgone')), false);
  assert.equal(fs.existsSync(path.join(h.rootDir, 'lyon-cwstay')), true);
});

test('an unreadable catalog drops nobody, and a directory swept by hand is recreated', async () => {
  const h = harness({ windowMs: 10 * MINUTE });
  await h.recorder.tick();
  const catalog = h.state.sources;

  h.state.sources = 'not a catalog';
  h.advance(20 * MINUTE);
  await h.recorder.tick();
  // The frame expired, but nothing says the camera left: its directory stays.
  assert.equal(fs.existsSync(path.join(h.rootDir, 'lyon-cwl9018')), true);

  h.state.sources = catalog;
  fs.rmSync(path.join(h.rootDir, 'lyon-cwl9018'), { recursive: true });
  h.advance(MINUTE);
  await h.recorder.tick();
  assert.equal(h.files('lyon-cwl9018').length, 1);
});

// ── Restarts ─────────────────────────────────────────────────────────────────

test('a restart rebuilds the index from disk and sweeps only what it wrote', async () => {
  const rootDir = tempRoot();
  const first = harness({ rootDir, frame: (id, clock) => jpeg(`frame ${clock}`) });
  for (let i = 0; i < 3; i += 1) {
    await first.recorder.tick();
    first.advance(MINUTE);
  }
  first.recorder.stop();

  const dir = path.join(rootDir, 'lyon-cwl9018');
  fs.writeFileSync(path.join(dir, `${T0 - 3 * 60 * MINUTE}.jpg`), 'expired');
  fs.writeFileSync(path.join(dir, `.${T0}.jpg.4242.abc123.tmp`), 'half-written');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not ours');
  fs.mkdirSync(path.join(rootDir, 'Not A Camera'));
  fs.writeFileSync(path.join(rootDir, 'Not A Camera', `${T0}.jpg`), 'not ours either');

  // Same bytes upstream as the last stored frame: after the restart there is
  // no source hash in memory, and the stored frame's own hash must catch it.
  const lastLabel = `frame ${T0 + 2 * MINUTE}`;
  const second = harness({ rootDir, frame: () => jpeg(lastLabel) });
  second.state.clock = T0 + 3 * MINUTE;
  await second.recorder.start();

  const manifest = second.recorder.manifest('lyon-cwl9018');
  assert.deepEqual(manifest.frames.map((frame) => frame.t), [T0, T0 + MINUTE, T0 + 2 * MINUTE]);
  assert.equal(fs.existsSync(path.join(dir, `${T0 - 3 * 60 * MINUTE}.jpg`)), false, 'expired frame deleted');
  assert.equal(fs.existsSync(path.join(dir, `.${T0}.jpg.4242.abc123.tmp`)), false, 'own temp file swept');
  assert.equal(fs.existsSync(path.join(dir, 'notes.txt')), true, 'a file it did not write is left alone');
  assert.equal(fs.existsSync(path.join(rootDir, 'Not A Camera', `${T0}.jpg`)), true);

  await second.recorder.tick();
  assert.equal(second.recorder.stats().counts.duplicate, 1);
  assert.equal(second.recorder.manifest('lyon-cwl9018').frames.length, 3);
  second.recorder.stop();
});

// ── Modes ────────────────────────────────────────────────────────────────────

test('on-demand records only after interest, and stops once the warm window passes', async () => {
  const h = harness({ mode: 'on-demand', warmMs: 30 * MINUTE });

  await h.recorder.tick();
  assert.equal(h.state.calls.length, 0, 'nobody looked: nothing fetched');
  assert.equal(h.recorder.manifest('lyon-cwl9018').recording, false);

  h.recorder.noteInterest();
  await h.recorder.tick();
  assert.equal(h.state.calls.length, 1);
  assert.equal(h.recorder.manifest('lyon-cwl9018').recording, true);

  h.advance(29 * MINUTE);
  await h.recorder.tick();
  assert.equal(h.state.calls.length, 2, 'still warm');

  h.advance(2 * MINUTE);
  await h.recorder.tick();
  assert.equal(h.state.calls.length, 2, 'cold again: nothing fetched');
  const manifest = h.recorder.manifest('lyon-cwl9018');
  assert.equal(manifest.recording, false);
  assert.equal(manifest.frames.length, 2, 'what was recorded stays until it ages out');
});

test('on-demand interest on a running recorder records at once, not a minute later', async () => {
  const h = harness({ mode: 'on-demand' });
  await h.recorder.start();
  assert.equal(h.state.calls.length, 0);
  h.recorder.noteInterest();
  await h.recorder.tick(); // joins the tick the interest started
  assert.equal(h.state.calls.length, 1);
  h.recorder.stop();
});

test('off never fetches, never touches the disk and advertises nothing', async () => {
  const parent = tempRoot();
  const rootDir = path.join(parent, 'never-created');
  const h = harness({ mode: 'off', rootDir });
  await h.recorder.start();
  h.recorder.noteInterest();
  await h.recorder.tick();

  assert.equal(h.state.calls.length, 0);
  assert.equal(fs.existsSync(rootDir), false);
  assert.equal(h.recorder.isCapable(lyon('CWL9018')), false);
  assert.equal(h.timers.pending.size, 0);
});

// ── The manifest ─────────────────────────────────────────────────────────────

test('the manifest lists the window oldest first, with frame URLs', async () => {
  const h = harness();
  await h.recorder.tick();
  h.advance(MINUTE);
  await h.recorder.tick();

  assert.deepEqual(h.recorder.manifest('lyon-cwl9018'), {
    id: 'lyon-cwl9018',
    recording: true,
    mode: 'always',
    windowMs: 60 * MINUTE,
    intervalMs: MINUTE,
    from: T0,
    to: T0 + MINUTE,
    lastOutcome: 'stored',
    frames: [
      { t: T0, url: `/api/cctv/timelapse/lyon-cwl9018/${T0}.jpg` },
      { t: T0 + MINUTE, url: `/api/cctv/timelapse/lyon-cwl9018/${T0 + MINUTE}.jpg` },
    ],
  });

  const empty = h.recorder.manifest('lyon-unknown');
  assert.deepEqual(empty.frames, []);
  assert.equal(empty.lastOutcome, null);
  assert.equal(empty.from, null);
  assert.equal(empty.to, null);
});

// ── Paths ────────────────────────────────────────────────────────────────────

test('camera ids and frame paths cannot leave the recorder directory', async () => {
  for (const id of ['lyon-cwl9018', 'lyon-cw2l8114', 'a.b_c-d']) {
    assert.equal(isSafeTimelapseCameraId(id), true, id);
  }
  for (const id of ['', '.', '..', '.hidden', '../etc', 'a/b', 'a\\b', 'Lyon-CWL9018', 'a b', 'x'.repeat(97), null, 42]) {
    assert.equal(isSafeTimelapseCameraId(id), false, String(id));
  }

  assert.equal(parseCctvTimelapsePath('/sources'), null);
  assert.equal(parseCctvTimelapsePath('/timelapse'), null);
  assert.deepEqual(parseCctvTimelapsePath('/timelapse/lyon-cwl9018'), { kind: 'manifest', id: 'lyon-cwl9018' });
  assert.deepEqual(parseCctvTimelapsePath('/timelapse/lyon-cwl9018/'), { kind: 'manifest', id: 'lyon-cwl9018' });
  assert.deepEqual(
    parseCctvTimelapsePath(`/timelapse/lyon-cwl9018/${T0}.jpg`),
    { kind: 'frame', id: 'lyon-cwl9018', t: T0 },
  );
  for (const bad of [
    '/timelapse/',
    '/timelapse/..%2F..%2Fetc/1.jpg',
    '/timelapse/%2e%2e/1.jpg',
    '/timelapse/lyon-a%2Fb',
    '/timelapse/%E0%A4%A/1.jpg',
    '/timelapse/lyon-a/12a.jpg',
    '/timelapse/lyon-a/-1.jpg',
    '/timelapse/lyon-a/1.png',
    '/timelapse/lyon-a/1.jpg/x',
    '/timelapse/lyon-a/99999999999999999.jpg',
  ]) {
    assert.deepEqual(parseCctvTimelapsePath(bad), { kind: 'invalid' }, bad);
  }

  const h = harness();
  await h.recorder.tick();
  // On disk but never indexed: not served.
  fs.writeFileSync(path.join(h.rootDir, 'lyon-cwl9018', `${T0 + 5}.jpg`), 'planted');
  assert.equal(h.recorder.frameFile('lyon-cwl9018', T0 + 5), null);
  assert.equal(await h.recorder.readFrame('lyon-cwl9018', T0 + 5), null);
  assert.equal(h.recorder.frameFile('../lyon-cwl9018', T0), null);
  assert.equal(h.recorder.frameFile('lyon-cwl9018', T0), path.join(h.rootDir, 'lyon-cwl9018', `${T0}.jpg`));
});

// ── HTTP ─────────────────────────────────────────────────────────────────────

test('routes: the manifest is no-store JSON and counts as interest; frames are immutable JPEG', async () => {
  const camera = lyon('CWL9018');
  const h = harness({ mode: 'on-demand' });
  h.recorder.noteInterest();
  await h.recorder.tick();
  h.advance(10_000);

  const manifest = await cctvTimelapseResponse(parseCctvTimelapsePath('/timelapse/lyon-cwl9018'), {
    recorder: h.recorder,
    source: camera,
  });
  assert.equal(manifest.status, 200);
  assert.equal(manifest.headers['Content-Type'], 'application/json');
  assert.equal(manifest.headers['Cache-Control'], 'no-store');
  const body = JSON.parse(manifest.body);
  assert.equal(body.frames.length, 1);
  assert.equal(h.recorder.stats().lastInterestAt, T0 + 10_000, 'asking for a timelapse keeps the recorder warm');

  const frame = await cctvTimelapseResponse(parseCctvTimelapsePath(body.frames[0].url.replace('/api/cctv', '')), {
    recorder: h.recorder,
  });
  assert.equal(frame.status, 200);
  assert.equal(frame.headers['Content-Type'], 'image/jpeg');
  assert.equal(frame.headers['Cache-Control'], CCTV_TIMELAPSE_FRAME_CACHE_CONTROL);
  assert.equal(frame.headers['Cache-Control'], 'public, max-age=86400, immutable');
  assert.equal(frame.headers['Content-Length'], String(frame.body.length));
  assert.ok(frame.body.equals(fs.readFileSync(path.join(h.rootDir, 'lyon-cwl9018', `${T0}.jpg`))));

  const missing = await cctvTimelapseResponse(parseCctvTimelapsePath(`/timelapse/lyon-cwl9018/${T0 + 1}.jpg`), {
    recorder: h.recorder,
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers['Cache-Control'], 'no-store', 'a miss must not be cached as if it were final');
});

test('routes: an unknown or incapable camera has no timelapse', async () => {
  const h = harness();
  const route = parseCctvTimelapsePath('/timelapse/lyon-cwl9018');
  const refusals = [
    { recorder: h.recorder, source: null },
    { recorder: h.recorder, source: { ...lyon('CWL9018'), timelapse: undefined } },
    { recorder: h.recorder, source: lyon('CWOTHER') }, // row for a different id
    { recorder: null, source: lyon('CWL9018') },
  ];
  for (const context of refusals) {
    const answer = await cctvTimelapseResponse(route, context);
    assert.equal(answer.status, 404);
    assert.equal(answer.headers['Cache-Control'], 'no-store');
    assert.deepEqual(JSON.parse(answer.body), { error: 'No timelapse for this camera', timelapse: false });
  }
  const invalid = await cctvTimelapseResponse(parseCctvTimelapsePath('/timelapse/../x'), { recorder: h.recorder });
  assert.equal(invalid.status, 404);
});

// ── Scheduling ───────────────────────────────────────────────────────────────

test('ticks never overlap and fetch at most three cameras at once', async () => {
  let inFlight = 0;
  let peak = 0;
  const releases = [];
  const rootDir = tempRoot();
  const calls = [];
  const sources = ['A', 'B', 'C', 'D', 'E', 'F'].map((code) => lyon(`CW${code}`));
  const recorder = createCctvTimelapseRecorder({
    rootDir,
    listSources: async () => sources,
    fetchFrame: (url, source) => new Promise((resolve) => {
      calls.push(source.id);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      releases.push(() => {
        inFlight -= 1;
        resolve({ ok: true, body: jpeg(source.id) });
      });
    }),
    encodeFrame: async (buffer) => buffer,
    now: () => T0,
    mode: 'always',
    log: silent,
    timers: fakeTimers(),
  });

  const first = recorder.tick();
  const second = recorder.tick();
  assert.equal(first, second, 'a tick asked for during a tick joins it');
  for (let turn = 0; turn < 10_000 && (calls.length < sources.length || releases.length); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    releases.splice(0).forEach((release) => release());
  }
  await first;
  assert.equal(calls.length, 6);
  assert.equal(peak, 3);
});

test('the scheduler is unref\'d, keeps a fixed rate, and stop clears it', async () => {
  const timers = fakeTimers();
  const h = harness({
    timers,
    // Each fetch takes 3 s of clock: the next tick must still start 60 s after this one did.
    frame: (id, clock) => {
      h.advance(3_000);
      return jpeg(`${id}@${clock}`);
    },
  });
  await h.recorder.start();
  assert.equal(timers.pending.size, 1);
  const [warmup] = timers.pending;
  assert.equal(warmup.ms, 5_000);
  assert.equal(warmup.unrefed, true);

  timers.pending.delete(warmup);
  warmup.fn();
  await h.recorder.tick(); // joins the scheduled tick
  assert.equal(timers.pending.size, 1);
  const [next] = timers.pending;
  assert.equal(next.ms, MINUTE - 3_000);
  assert.equal(next.unrefed, true);

  h.recorder.stop();
  assert.equal(timers.pending.size, 0);
  assert.equal(h.recorder.isCapable(lyon('CWL9018')), false, 'a stopped recorder advertises nothing');
});

test('a newer recorder for the same directory stops the previous one', async () => {
  const rootDir = tempRoot();
  const older = harness({ rootDir });
  const newer = harness({ rootDir });
  await older.recorder.start();
  installCctvTimelapseRecorder(older.recorder);
  installCctvTimelapseRecorder(newer.recorder);
  assert.equal(older.timers.pending.size, 0, 'the old scheduler is cleared');
  assert.equal(older.recorder.isCapable(lyon('CWL9018')), false);
  assert.equal(newer.recorder.isCapable(lyon('CWL9018')), true);
  newer.recorder.stop();
});

// ── Configuration ────────────────────────────────────────────────────────────

test('the environment switches parse and clamp', () => {
  assert.deepEqual(cctvTimelapseOptionsFromEnv({}), { mode: 'on-demand', windowMs: 60 * MINUTE, warmMs: 180 * MINUTE });
  assert.equal(cctvTimelapseOptionsFromEnv({ CCTV_TIMELAPSE: ' ALWAYS ' }).mode, 'always');
  assert.equal(cctvTimelapseOptionsFromEnv({ CCTV_TIMELAPSE: 'off' }).mode, 'off');
  assert.equal(cctvTimelapseOptionsFromEnv({ CCTV_TIMELAPSE: 'on-demand' }).mode, 'on-demand');
  assert.equal(cctvTimelapseOptionsFromEnv({ CCTV_TIMELAPSE: 'yes please' }).mode, 'on-demand');
  assert.equal(cctvTimelapseOptionsFromEnv({ CCTV_TIMELAPSE_WINDOW_MIN: '1' }).windowMs, 5 * MINUTE);
  assert.equal(cctvTimelapseOptionsFromEnv({ CCTV_TIMELAPSE_WINDOW_MIN: '9999' }).windowMs, 360 * MINUTE);
  assert.equal(cctvTimelapseOptionsFromEnv({ CCTV_TIMELAPSE_WINDOW_MIN: 'an hour' }).windowMs, 60 * MINUTE);
  assert.equal(cctvTimelapseOptionsFromEnv({ CCTV_TIMELAPSE_WARM_MIN: '30' }).warmMs, 30 * MINUTE);
});

test('the poll interval follows the publisher, never faster than 30 s', () => {
  assert.equal(timelapseIntervalMs({ upstreamCadenceMs: MINUTE }), MINUTE);
  assert.equal(timelapseIntervalMs({ upstreamCadenceMs: 2 * MINUTE }), 2 * MINUTE);
  assert.equal(timelapseIntervalMs({ upstreamCadenceMs: 10_000 }), 30_000);
  assert.equal(timelapseIntervalMs({ upstreamCadenceMs: null }), MINUTE);
  assert.equal(timelapseIntervalMs({}, 90_000), 90_000);
});

// ── The encoder ──────────────────────────────────────────────────────────────

test('an encoder that cannot load switches recording off, with one warning', async () => {
  const warnings = [];
  const log = { log() {}, warn: (message) => warnings.push(message) };
  const encoder = createSharpFrameEncoder({ log, importSharp: async () => { throw new Error('no native binary'); } });
  assert.equal(await encoder.ready(), false);
  assert.equal(await encoder.ready(), false);
  assert.equal(await encoder.encode(jpeg('x')), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /stays off/);

  const h = harness({ encodeFrame: encoder.encode, encoderReady: encoder.ready });
  await h.recorder.tick();
  assert.equal(h.state.calls.length, 0, 'no frame is fetched for an encoder that is not there');
  assert.equal(h.recorder.isCapable(lyon('CWL9018')), false);
  assert.equal(h.recorder.stats().encoder, 'unavailable');
});

test('the sharp encoder shrinks a 1920x1080 frame to 640 px and never enlarges', async (t) => {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    t.skip('sharp is not installed');
    return;
  }
  const encoder = createSharpFrameEncoder({ log: silent });
  assert.equal(await encoder.ready(), true);

  const full = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r: 90, g: 110, b: 130 } } })
    .jpeg({ quality: 90 })
    .toBuffer();
  const shrunk = await encoder.encode(full);
  const meta = await sharp(shrunk).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, 640);
  assert.equal(meta.height, 360);

  const small = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#445566' } }).jpeg().toBuffer();
  const kept = await sharp(await encoder.encode(small)).metadata();
  assert.equal(kept.width, 320);
});
