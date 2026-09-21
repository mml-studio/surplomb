// The publish step's merge of the staging manifests (scripts/publish-landing-assets.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { galleryModuleData, hashedName, mergeManifests, rewriteReferences } from './publish-landing-assets.mjs';

test('each manifest contributes what it describes; the earliest directory wins', () => {
  const gallery = { generatedAt: 'g', capture: { capturedAt: '2026-09-20T10:00:00Z' },
    gallery: { 'view:01': { sources: [{ file: 'view-01-480-av1.mp4' }] } } };
  const hq = { generatedAt: 'h', capture: { desktop: { capturedAt: '2026-09-17T16:16:42Z' } },
    videos: { desktop: { sources: [{ file: 'hero-desktop-1920-av1.mp4' }] } } };
  const stills = { generatedAt: 's', videos: { desktop: { sources: [{ file: 'hero-desktop.mp4' }] } } };
  const merged = mergeManifests([gallery, hq, stills]);
  assert.equal(merged.videos.desktop.sources[0].file, 'hero-desktop-1920-av1.mp4');
  assert.equal(merged.capturedAt, '2026-09-17T16:16:42Z', 'the hero date is the hero manifest\'s');
  assert.equal(merged.galleryCapturedAt, '2026-09-20T10:00:00Z');
  assert.deepEqual(Object.keys(merged.gallery), ['view:01']);
});

test('the gallery module lists only published renditions, under hashed names', () => {
  const published = new Map([['view-01-480-av1.mp4', 'view-01-480-av1.0123abcd.mp4']]);
  const loops = galleryModuleData({
    'view:01': { aspect: 1.65, fps: 30, durationS: 6, sources: [
      { file: 'view-01-480-av1.mp4', mime: 'video/mp4; codecs="av01.0.04M.08"', codec: 'av1', width: 480, height: 290, bytes: 1, bitrateKbps: 2 },
      { file: 'view-01-480-h264.mp4', mime: 'video/mp4; codecs="avc1.64001E"', codec: 'h264', width: 480, height: 290, bytes: 1, bitrateKbps: 2 },
    ] },
    'view:02': { aspect: 1.65, fps: 30, durationS: 6, sources: [{ file: 'view-02-480-av1.mp4' }] },
  }, published);
  assert.deepEqual(Object.keys(loops), ['view:01'], 'a loop with nothing published is left out: its box keeps the still');
  assert.equal(loops['view:01'].renditions.length, 1);
  assert.equal(loops['view:01'].renditions[0].src, '/landing/view-01-480-av1.0123abcd.mp4');
});

test('a gallery loop\'s name is a reference the rewriter and the cache rule both accept', () => {
  const hashed = hashedName('view-01-960-av1.mp4', Buffer.from('x'));
  assert.match(hashed, /^view-01-960-av1\.[0-9a-f]{8}\.mp4$/);
  const { html, missing } = rewriteReferences('<img src="/landing/view-01-480.jpg">',
    new Map([['view-01-480.jpg', 'view-01-480.89abcdef.jpg']]));
  assert.equal(html, '<img src="/landing/view-01-480.89abcdef.jpg">');
  assert.deepEqual(missing, []);
});

test('the gallery module lists its boxes in order, whichever directory staged each', () => {
  const loop = (file) => ({ aspect: 1.65, fps: 30, durationS: 6, sources: [{ file, codec: 'av1', width: 480, height: 290 }] });
  const published = new Map([['view-04.mp4', 'view-04.0123abcd.mp4'], ['view-02.mp4', 'view-02.0123abcd.mp4'],
    ['voice.mp4', 'voice.0123abcd.mp4']]);
  const merged = mergeManifests([{ gallery: { 'view:04': loop('view-04.mp4') } },
    { gallery: { 'voice-response': loop('voice.mp4'), 'view:02': loop('view-02.mp4'), 'view:04': loop('x.mp4') } }]);
  assert.deepEqual(Object.keys(galleryModuleData(merged.gallery, published)), ['view:02', 'view:04', 'voice-response']);
});
