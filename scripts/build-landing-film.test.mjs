// The film encode's pure rules (scripts/build-landing-film.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX_ASPECT, boxCrop, CAP_BYTES, CODECS_BY_WIDTH, filmFor, GOP, openingTime, referenceFilter } from './build-landing-film.mjs';

test('a 16:9 film is cropped to the box\'s 1.65, centred, full height, even-sized', () => {
  const crop = boxCrop({ width: 1920, height: 1080 }, BOX_ASPECT);
  assert.deepEqual(crop, { x: 70, y: 0, width: 1782, height: 1080 });
  assert.ok(Math.abs(crop.width / crop.height - 1.65) < 0.005);
});

test('a film taller than the box keeps its width and loses its top and bottom', () => {
  const crop = boxCrop({ width: 1440, height: 1080 }, BOX_ASPECT);
  assert.equal(crop.width, 1440);
  assert.equal(crop.height % 2, 0);
  assert.equal(crop.y, (1080 - crop.height) / 2);
});

test('every width in AV1 and in HEVC for Safari without AV1, H.264 at the smallest only', () => {
  for (const [width, codecs] of Object.entries(CODECS_BY_WIDTH)) {
    assert.ok(CAP_BYTES[width] > 0, width);
    assert.deepEqual(codecs.slice(0, 2), ['av1', 'hevc'], width);
  }
  const widths = Object.keys(CODECS_BY_WIDTH).map(Number);
  assert.deepEqual(widths.filter((w) => CODECS_BY_WIDTH[w].includes('h264')), [Math.min(...widths)]);
  assert.ok(GOP <= 150, 'a seek decodes at most ~5 s of film');
});

test('a film takes the names its view\'s still and loop already had', () => {
  const { key, stem, view } = filmFor('04');
  assert.deepEqual({ key, stem, view }, { key: 'view:04', stem: 'view-04', view: '04' });
  assert.equal(filmFor('01').stem, 'view-01');
  for (const bad of ['4', '07', '00', 'view-04']) assert.throws(() => filmFor(bad), bad);
});

test('a film turned round begins at its start frame and wraps to its opening, without a dropped frame', () => {
  const crop = { x: 70, y: 0, width: 1782, height: 1080 };
  assert.match(referenceFilter({ crop, width: 480, startFrame: 0 }), /^\[0:v\]crop=1782:1080:70:0,scale=480:-2/);
  const turned = referenceFilter({ crop, width: 960, startFrame: 90 });
  assert.match(turned, /\[tail\]trim=start_frame=90,setpts=PTS-STARTPTS\[late\]/);
  assert.match(turned, /\[head\]trim=end_frame=90,setpts=PTS-STARTPTS\[early\]/);
  assert.match(turned, /\[late\]\[early\]concat=n=2:v=1:a=0,crop=1782:1080:70:0,scale=960:-2/,
    'the late part first, and the crop applies to both');
});

test('a film turned round by --start says where its story now begins in the file', () => {
  // The power-grid film: 14.67 s at 30 fps, turned to begin at 3.0 s.
  assert.equal(openingTime({ durationS: 14.67, fps: 30, startFrame: 90 }), 11.67);
  assert.equal(openingTime({ durationS: 28.97, fps: 30, startFrame: 0 }), 0, 'Roissy was not turned');
});
