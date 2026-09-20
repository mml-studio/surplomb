// The Public cameras key, in both languages.
//
// The layer came from upstream English-only, so what it needed was FRENCH.
// The distinction it draws is its one honest claim — a solid cone is a
// published bearing, a dashed one is a placeholder — and neither language may
// blur it, because drawing the two alike would turn a guess into a
// measurement.
import test from 'node:test';
import assert from 'node:assert/strict';

import messages from './cctv.i18n.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('both rows exist in both languages and stay two different claims', () => {
  const en = withLocale('en', () => messages());
  assert.equal(en.mapped.label, 'Direction mapped');
  assert.equal(en.unmapped.label, 'Direction not mapped');
  assert.match(en.mapped.blurb, /^Solid cone — the bearing comes from the source’s own direction tag\.$/);
  assert.match(en.unmapped.blurb, /the azimuth drawn is a placeholder\.$/);
  assertNoFrench([en.mapped.label, en.mapped.blurb, en.unmapped.label, en.unmapped.blurb]);

  const fr = messages();
  assert.equal(fr.mapped.label, 'Direction relevée');
  assert.equal(fr.unmapped.label, 'Direction non relevée');
  assert.match(fr.mapped.blurb, /^Cône plein —/);
  assert.match(fr.unmapped.blurb, /^Cône pointillé —/);
  // Solid and dashed must not collapse into one row in either language.
  assert.notEqual(fr.mapped.label, fr.unmapped.label);
  assert.notEqual(en.mapped.label, en.unmapped.label);
});
