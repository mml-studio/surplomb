// The film encode's pure rules (scripts/build-landing-film.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX_ASPECT, boxCrop, CAP_BYTES, FILM, GOP } from './build-landing-film.mjs';

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
  for (const [width, codecs] of Object.entries(FILM.codecsByWidth)) {
    assert.ok(CAP_BYTES[width] > 0, width);
    assert.deepEqual(codecs.slice(0, 2), ['av1', 'hevc'], width);
  }
  const widths = Object.keys(FILM.codecsByWidth).map(Number);
  assert.deepEqual(widths.filter((w) => FILM.codecsByWidth[w].includes('h264')), [Math.min(...widths)]);
  assert.equal(FILM.stem, 'view-01', 'the names the gallery\'s still and loop already had');
  assert.ok(GOP <= 150, 'a seek decodes at most ~5 s of film');
});
