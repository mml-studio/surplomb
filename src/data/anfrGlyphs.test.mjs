import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANFR_HOLLOW_TRIANGLE_LEGEND_GLYPH,
  ANFR_SELECTED_SCALE,
  ANFR_TRIANGLE_LEGEND_GLYPH,
  anfrGlyphScale,
  anfrMastGlyph,
  anfrSelectedGlyph,
} from './anfrGlyphs.js';
import { anfrPointSize } from './anfrFrance.js';

test('a mast grows with its operators, and the selection is bigger than any mast', () => {
  const sizes = [1, 2, 3, 4, 5].map((operators) => anfrGlyphScale(anfrPointSize(operators)));
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] > sizes[i - 1], String(sizes));
  assert.ok(ANFR_SELECTED_SCALE > sizes.at(-1));
});

test('without a canvas there is no image, and the layer draws a bare billboard', () => {
  assert.equal(anfrMastGlyph({ band: '5g', color: '#ffb238' }), null);
  assert.equal(anfrSelectedGlyph(), null);
});

test('the key swatches are the map triangle, filled or hollow, as masks', () => {
  for (const glyph of [ANFR_TRIANGLE_LEGEND_GLYPH, ANFR_HOLLOW_TRIANGLE_LEGEND_GLYPH]) {
    assert.match(glyph, /^data:image\/svg\+xml,/);
    // `manager.js` drops the glyph into `url("…")`: a double quote would end it.
    assert.equal(decodeURIComponent(glyph).includes('"'), false);
  }
  assert.match(decodeURIComponent(ANFR_HOLLOW_TRIANGLE_LEGEND_GLYPH), /fill='none'/);
});
