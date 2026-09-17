// Which file of the hero loop a screen plays (src/vitrine/renditions.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseRendition, neededVideoWidth, probeRenditions } from './renditions.js';

const R = (codec, width, bytes = 1) => ({
  src: `/landing/hero-${width}-${codec}.mp4`,
  mime: `video/mp4; codecs="${codec}"`,
  codec,
  width,
  height: Math.round(width / 1.6),
  bytes,
});
const LADDER = [R('av1', 2880, 10), R('hevc', 2880, 14), R('av1', 1920, 5), R('hevc', 1920, 7), R('h264', 1920, 12)];

test('the need is counted in device pixels, and a tall box is covered by its height', () => {
  // Memel's MacBook: 1470×956 CSS at DPR 2, a 16:10 loop.
  assert.equal(neededVideoWidth({ boxWidth: 1470, boxHeight: 956, dpr: 2, videoAspect: 1.6 }), 3060);
  // A 1920×1080 monitor at DPR 1 is covered by width.
  assert.equal(neededVideoWidth({ boxWidth: 1920, boxHeight: 1080, dpr: 1, videoAspect: 1.6 }), 1920);
  // A phone hero is taller than the viewport: max(844, 100svh).
  assert.equal(neededVideoWidth({ boxWidth: 390, boxHeight: 844, dpr: 3, videoAspect: 1170 / 2532 }), 1170);
  assert.equal(neededVideoWidth({ boxWidth: 800, boxHeight: 400, dpr: 0.5, videoAspect: 1.6 }), 800, 'a DPR under 1 never shrinks the need');
});

test('a Retina laptop with hardware AV1 gets the 2880 AV1 file', () => {
  const probed = LADDER.map((r) => ({ ...r, smooth: true, powerEfficient: true }));
  assert.equal(chooseRendition(probed, 3060).src, '/landing/hero-2880-av1.mp4');
});

test('a 1080p monitor does not download the 2880 file', () => {
  const probed = LADDER.map((r) => ({ ...r, smooth: true, powerEfficient: true }));
  assert.equal(chooseRendition(probed, 1920).width, 1920);
  // 10 % of slack: 2100 px of need is still served by 1920.
  assert.equal(chooseRendition(probed, 2100).width, 1920);
  assert.equal(chooseRendition(probed, 2200).width, 2880);
});

test('hardware decoding beats a thriftier codec decoded in software', () => {
  // An M1 in Chrome: AV1 in software, HEVC in hardware.
  const probed = LADDER.map((r) => ({ ...r, smooth: true, powerEfficient: r.codec !== 'av1' }));
  assert.equal(chooseRendition(probed, 3060).src, '/landing/hero-2880-hevc.mp4');
});

test('a definition that would stutter steps down instead', () => {
  // An old laptop: nothing at 2880 decodes smoothly.
  const probed = LADDER.map((r) => ({ ...r, smooth: r.width === 1920, powerEfficient: r.codec === 'h264' }));
  assert.equal(chooseRendition(probed, 3060).src, '/landing/hero-1920-h264.mp4');
  // Nothing smooth anywhere: the smallest, rather than nothing.
  const none = LADDER.map((r) => ({ ...r, smooth: false, powerEfficient: false }));
  assert.equal(chooseRendition(none, 3060).width, 1920);
  assert.equal(chooseRendition([], 3060), null);
});

test('probing keeps what plays, and what decodes', async () => {
  const canPlayType = (mime) => (mime.includes('hevc') ? '' : 'probably');
  const calls = [];
  const mediaCapabilities = {
    async decodingInfo(query) {
      calls.push(query);
      if (query.video.contentType.includes('av1') && query.video.width > 2000) return { supported: true, smooth: false, powerEfficient: false };
      return { supported: true, smooth: true, powerEfficient: true };
    },
  };
  const probed = await probeRenditions(LADDER, { canPlayType, mediaCapabilities });
  assert.deepEqual(probed.map((r) => `${r.codec}-${r.width}`), ['av1-2880', 'av1-1920', 'h264-1920']);
  assert.equal(probed[0].smooth, false);
  assert.equal(calls[0].type, 'file');
  assert.equal(calls[0].video.framerate, 30);
  assert.equal(chooseRendition(probed, 3060).src, '/landing/hero-1920-av1.mp4');
});

test('without Media Capabilities, only H.264 is assumed to be hardware', async () => {
  const probed = await probeRenditions(LADDER, { canPlayType: () => 'maybe', mediaCapabilities: null });
  assert.ok(probed.every((r) => r.smooth));
  assert.deepEqual(probed.filter((r) => r.powerEfficient).map((r) => r.codec), ['h264']);
  // A refused query is not a verdict.
  const throwing = { decodingInfo: async () => { throw new TypeError('bad contentType'); } };
  assert.equal((await probeRenditions([R('av1', 1920)], { canPlayType: () => 'probably', mediaCapabilities: throwing })).length, 1);
  // An unsupported answer drops the file.
  const refusing = { decodingInfo: async () => ({ supported: false }) };
  assert.equal((await probeRenditions([R('av1', 1920)], { canPlayType: () => 'probably', mediaCapabilities: refusing })).length, 0);
});
