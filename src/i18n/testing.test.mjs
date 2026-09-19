import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLocale, getLocaleOverride } from './locale.js';
import { assertNoFrench, useTestLocale, withLocale } from './testing.js';

test('useTestLocale forces the locale and hands back its undo', () => {
  assert.equal(getLocale(), 'fr');
  const restore = useTestLocale('en');
  assert.equal(getLocale(), 'en');
  restore();
  assert.equal(getLocale(), 'fr');
  assert.equal(getLocaleOverride(), null);
});

test('given a test context, it restores after the test by itself', async (t) => {
  await t.test('inner', (inner) => {
    useTestLocale('en', inner);
    assert.equal(getLocale(), 'en');
  });
  assert.equal(getLocale(), 'fr');
});

test('withLocale restores on return, on throw and on rejection', async () => {
  assert.equal(withLocale('en', () => getLocale()), 'en');
  assert.equal(getLocale(), 'fr');
  assert.throws(() => withLocale('en', () => { throw new Error('boom'); }), /boom/);
  assert.equal(getLocale(), 'fr');
  assert.equal(await withLocale('en', async () => getLocale()), 'en');
  assert.equal(getLocale(), 'fr');
  await assert.rejects(withLocale('en', async () => { throw new Error('late'); }), /late/);
  assert.equal(getLocale(), 'fr');
  // Nested: the inner restore returns to the outer override, not to French.
  withLocale('en', () => {
    withLocale('fr', () => assert.equal(getLocale(), 'fr'));
    assert.equal(getLocale(), 'en');
  });
});

test('assertNoFrench passes English and names every French piece it finds', () => {
  assert.doesNotThrow(() => assertNoFrench('Replay the 10 days in 24 s — 91.3% of €3,200/m²'));
  assert.doesNotThrow(() => assertNoFrench('Risks (Géorisques) in Île-de-France, from Météo-France'));
  assert.doesNotThrow(() => assertNoFrench('Pléiades Neo (Legion) · VHR2', { allow: ['Pléiades Neo'] }));
  assert.throws(() => assertNoFrench('Rejouer les 10 jours'), (error) => {
    assert.equal(error.name, 'AssertionError');
    assert.match(error.message, /word “les”/);
    assert.match(error.message, /word “jours”/);
    return true;
  });
  assert.throws(() => assertNoFrench('5,6 s'), /decimal comma/);
  assert.throws(() => assertNoFrench('91,3 %'), /space before %/);
});

test('assertNoFrench walks objects and arrays, and says where', () => {
  const controls = {
    chips: [{ id: 'play', label: '↺ Replay', title: 'Replay the 10 days' }],
    legend: [{ label: 'hotspot', blurb: 'La puissance radiative' }],
  };
  assert.throws(() => assertNoFrench(controls), /legend\[0\]\.blurb: word “La”/);
  assert.doesNotThrow(() => assertNoFrench({ chips: controls.chips }));
});
