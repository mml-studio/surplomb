import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIMELAPSE_FRAME_MS,
  TIMELAPSE_HOLD_LAST_MS,
  TIMELAPSE_MIN_FRAMES,
  createCctvTimelapsePlayer,
  formatTimelapseClock,
  normalizeTimelapseManifest,
  timelapseFrameDelay,
  timelapseManifestUrl,
} from './cctvTimelapsePlayer.js';

const T0 = Date.UTC(2026, 8, 23, 8, 26, 0); // 10:26 in Paris

function frames(count, { start = T0, stepMs = 60_000, id = 'lyon-cwl9018' } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const t = start + i * stepMs;
    return { t, url: `/api/cctv/timelapse/${id}/${t}.jpg` };
  });
}

/** Manual clock: timers fire only when the test says so. */
function fakeTimers() {
  let seq = 0;
  const pending = new Map();
  return {
    setTimer(fn, ms) {
      seq += 1;
      pending.set(seq, { fn, ms });
      return seq;
    },
    clearTimer(handle) { pending.delete(handle); },
    /** Fires every timer currently pending whose delay is `ms` (or all). */
    fire(ms) {
      const due = [...pending.entries()].filter(([, timer]) => ms === undefined || timer.ms === ms);
      for (const [handle, timer] of due) {
        pending.delete(handle);
        timer.fn();
      }
      return due.length;
    },
    delays() { return [...pending.values()].map((timer) => timer.ms).sort((a, b) => a - b); },
  };
}

function fakeCanvas() {
  const drawn = [];
  return {
    width: 0,
    height: 0,
    drawn,
    getContext() { return { drawImage: (img) => drawn.push(img.url) }; },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
async function settleAll() {
  for (let i = 0; i < 10; i += 1) await settle();
}

function harness({ manifest, status = 200, reducedMotion = false, visible = () => true, failUrls = new Set() } = {}) {
  const timers = fakeTimers();
  const canvas = fakeCanvas();
  const states = [];
  const requests = [];
  let body = manifest;
  const player = createCctvTimelapsePlayer({
    canvas,
    reducedMotion,
    isVisible: visible,
    onChange: (state) => states.push(state),
    fetchJson: async (url) => {
      requests.push(url);
      return { ok: status === 200, status, json: async () => body };
    },
    loadImage: async (url) => (failUrls.has(url) ? null : { url, naturalWidth: 640, naturalHeight: 360 }),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return {
    player, timers, canvas, states, requests,
    setManifest(next) { body = next; },
    last: () => states[states.length - 1],
  };
}

test('manifest URL encodes the camera id', () => {
  assert.equal(timelapseManifestUrl('lyon-cwl9018'), '/api/cctv/timelapse/lyon-cwl9018');
  assert.equal(timelapseManifestUrl('a/b'), '/api/cctv/timelapse/a%2Fb');
});

test('a manifest is sorted, de-duplicated, and pinned to the recorder path', () => {
  const [a, b, c] = frames(3);
  const parsed = normalizeTimelapseManifest({
    recording: true,
    intervalMs: 60000,
    windowMs: 3600000,
    frames: [c, a, b, a, { t: 5, url: 'https://evil.example/x.jpg' }, { t: 'x', url: a.url }, null],
  });
  assert.deepEqual(parsed.frames.map((f) => f.t), [a.t, b.t, c.t]);
  assert.equal(parsed.from, a.t);
  assert.equal(parsed.to, c.t);
  assert.equal(parsed.recording, true);
  assert.equal(parsed.intervalMs, 60000);
  assert.equal(normalizeTimelapseManifest(null), null);
  assert.equal(normalizeTimelapseManifest({ frames: 'no' }), null);
  assert.deepEqual(normalizeTimelapseManifest({ frames: [] }).frames, []);
});

test('clock times read in the reader’s language and zone', () => {
  assert.equal(formatTimelapseClock(T0, { locale: 'fr', timeZone: 'Europe/Paris' }), '10:26');
  assert.equal(formatTimelapseClock(T0, { locale: 'fr', timeZone: 'UTC' }), '08:26');
  assert.match(formatTimelapseClock(T0, { locale: 'en', timeZone: 'Europe/Paris' }), /^10:26\s?AM$/);
  assert.equal(formatTimelapseClock(NaN), '--:--');
});

test('every frame gets an eighth of a second, the newest one a pause', () => {
  assert.equal(timelapseFrameDelay(0, 60), TIMELAPSE_FRAME_MS);
  assert.equal(timelapseFrameDelay(58, 60), TIMELAPSE_FRAME_MS);
  assert.equal(timelapseFrameDelay(59, 60), TIMELAPSE_HOLD_LAST_MS);
  assert.ok(TIMELAPSE_HOLD_LAST_MS > TIMELAPSE_FRAME_MS * 4, 'the pause must read as a pause');
});

test('a camera without a recording never asks the server', async () => {
  const h = harness({ manifest: { frames: frames(10) } });
  h.player.setCamera('osm-n1', { capable: false });
  await settleAll();
  assert.equal(h.requests.length, 0);
  assert.equal(h.player.getState().status, 'off');
});

test('a 404 turns the player off for that camera', async () => {
  const h = harness({ manifest: { error: 'x' }, status: 404 });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  assert.equal(h.player.getState().status, 'off');
  assert.deepEqual(h.timers.delays(), [], 'no refresh is scheduled for a camera with no recording');
});

test('too few frames and no recording promises nothing', async () => {
  const h = harness({ manifest: { recording: false, frames: frames(2) } });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  assert.equal(h.player.getState().status, 'off');
  assert.deepEqual(h.timers.delays(), []);
});

test('a camera that publishes no usable picture gets no promise, and is asked again', async () => {
  const h = harness({ manifest: { recording: true, lastOutcome: 'placeholder', frames: [] } });
  h.player.setCamera('lyon-cwl7033');
  await settleAll();
  assert.equal(h.player.getState().status, 'off');
  assert.deepEqual(h.timers.delays(), [60_000]);
  h.setManifest({ recording: true, lastOutcome: 'stored', frames: frames(1) });
  h.timers.fire(60_000);
  await settleAll();
  assert.equal(h.player.getState().status, 'building', 'a camera that came back builds its hour');
  assert.equal(normalizeTimelapseManifest({ frames: [], lastOutcome: 'duplicate' }).publishing, true);
});

test('too few frames reads as building, then plays once the hour fills', async () => {
  const h = harness({ manifest: { recording: true, frames: frames(TIMELAPSE_MIN_FRAMES - 1) } });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  let state = h.player.getState();
  assert.equal(state.status, 'building');
  assert.equal(state.recorded, TIMELAPSE_MIN_FRAMES - 1);
  assert.equal(state.recording, true);
  assert.equal(h.canvas.drawn.length, 0, 'nothing is drawn over the live frame yet');

  h.setManifest({ recording: true, frames: frames(TIMELAPSE_MIN_FRAMES + 3) });
  h.timers.fire(60_000);
  await settleAll();
  state = h.player.getState();
  assert.equal(state.status, 'ready');
  assert.equal(state.playing, true);
  assert.equal(state.count, TIMELAPSE_MIN_FRAMES + 3);
  assert.equal(state.index, 0, 'the loop opens on the oldest frame');
  assert.equal(state.from, T0);
  assert.equal(state.to, T0 + (TIMELAPSE_MIN_FRAMES + 2) * 60_000);
});

test('the loop advances frame by frame, holds the newest, and starts over', async () => {
  const h = harness({ manifest: { frames: frames(6) } });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(h.timers.fire(TIMELAPSE_FRAME_MS), 1);
    assert.equal(h.player.getState().index, i);
  }
  assert.ok(h.timers.delays().includes(TIMELAPSE_HOLD_LAST_MS), 'the newest frame is held');
  h.timers.fire(TIMELAPSE_HOLD_LAST_MS);
  assert.equal(h.player.getState().index, 0);
  assert.equal(h.canvas.width, 640);
  assert.equal(h.canvas.height, 360);
  assert.ok(h.canvas.drawn.length >= 7);
});

test('a frame that fails to load drops out of the loop instead of stopping it', async () => {
  const list = frames(7);
  const h = harness({ manifest: { frames: list }, failUrls: new Set([list[2].url]) });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  const state = h.player.getState();
  assert.equal(state.status, 'ready');
  assert.equal(state.count, 6);
  assert.equal(state.recorded, 7);
});

test('pause, seek and play', async () => {
  const h = harness({ manifest: { frames: frames(8) } });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  h.player.pause();
  assert.equal(h.player.getState().playing, false);
  assert.deepEqual(h.timers.delays().filter((ms) => ms < 60_000), [], 'a paused loop keeps no frame timer');
  h.player.seek(5);
  assert.equal(h.player.getState().index, 5);
  assert.equal(h.player.getState().frameTime, T0 + 5 * 60_000);
  h.player.seek(99);
  assert.equal(h.player.getState().index, 7, 'seek clamps to the newest frame');
  h.player.play();
  assert.equal(h.player.getState().index, 0, 'play from the newest frame starts the hour over');
  assert.equal(h.player.getState().playing, true);
});

test('reduced motion opens paused on the newest frame', async () => {
  const h = harness({ manifest: { frames: frames(8) }, reducedMotion: true });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  const state = h.player.getState();
  assert.equal(state.status, 'ready');
  assert.equal(state.playing, false);
  assert.equal(state.index, 7);
  assert.equal(h.canvas.drawn.length, 1);
});

test('a folded panel draws and fetches nothing, then resumes', async () => {
  let visible = true;
  const h = harness({ manifest: { frames: frames(6) }, visible: () => visible });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  const drawnBefore = h.canvas.drawn.length;
  const requestsBefore = h.requests.length;
  visible = false;
  h.timers.fire(TIMELAPSE_FRAME_MS);
  h.timers.fire(60_000);
  await settleAll();
  assert.equal(h.canvas.drawn.length, drawnBefore);
  assert.equal(h.requests.length, requestsBefore);
  visible = true;
  h.timers.fire(1000);
  assert.equal(h.canvas.drawn.length, drawnBefore + 1);
});

test('a refresh appends the new minute and keeps the frame on screen', async () => {
  const h = harness({ manifest: { frames: frames(6) } });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  h.player.seek(3);
  const shown = h.player.getState().frameTime;
  h.setManifest({ frames: frames(6, { start: T0 + 60_000 }) });
  h.timers.fire(60_000);
  await settleAll();
  const state = h.player.getState();
  assert.equal(state.count, 6);
  assert.equal(state.frameTime, shown);
  assert.equal(state.to, T0 + 6 * 60_000);
  assert.equal(state.from, T0 + 60_000, 'the oldest minute aged out');
});

test('switching camera drops the old loop before the new manifest lands', async () => {
  const h = harness({ manifest: { frames: frames(6) } });
  h.player.setCamera('lyon-cwl9018');
  await settleAll();
  h.player.setCamera('lyon-cwl3005');
  const state = h.player.getState();
  assert.equal(state.cameraId, 'lyon-cwl3005');
  assert.equal(state.count, 0);
  assert.notEqual(state.status, 'ready');
  h.player.setCamera(null);
  assert.equal(h.player.getState().status, 'off');
  assert.deepEqual(h.timers.delays(), []);
});
