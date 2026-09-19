import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_LEAF_KEYS,
  defineMessages,
  inAllLocales,
  isCatalog,
  isMessageLeaf,
  labelFor,
  messageLeaves,
} from './messages.js';
import { useTestLocale } from './testing.js';

const catalog = defineMessages({
  replay: { fr: '↺ Rejouer', en: '↺ Replay', note: 'A button.' },
  dayOf: { fr: (day, days) => `jour ${day} sur ${days}`, en: (day, days) => `day ${day} of ${days}`, sample: [4, 10] },
  frenchOnly: { fr: 'seulement en français' },
  legend: {
    fronts: { fr: 'front de feu actif', en: 'active fire front' },
    deeper: { flames: { fr: 'flammes', en: 'flames' } },
  },
  months: { fr: ['janv.', 'févr.'], en: ['Jan', 'Feb'] },
});

test('a catalog resolves to the current locale, read at call time', (t) => {
  assert.equal(catalog().replay, '↺ Rejouer', 'French by default');
  assert.equal(catalog().dayOf(4, 10), 'jour 4 sur 10');
  useTestLocale('en', t);
  assert.equal(catalog().replay, '↺ Replay');
  assert.equal(catalog().dayOf(4, 10), 'day 4 of 10');
  assert.equal(catalog().legend.fronts, 'active fire front');
  assert.equal(catalog().legend.deeper.flames, 'flames');
  assert.deepEqual(catalog().months, ['Jan', 'Feb']);
});

test('an explicit locale wins, and each locale is resolved once', () => {
  assert.equal(catalog('en').replay, '↺ Replay');
  assert.equal(catalog('en-GB').replay, '↺ Replay');
  assert.equal(catalog('de').replay, '↺ Rejouer', 'unsupported → French');
  assert.equal(catalog('en'), catalog('en'), 'cached');
  assert.ok(Object.isFrozen(catalog('en')) && Object.isFrozen(catalog('en').legend));
});

test('a missing translation falls back to French rather than to nothing', () => {
  assert.equal(catalog('en').frenchOnly, 'seulement en français');
});

test('catalogs are recognisable, and so are leaves', () => {
  assert.equal(isCatalog(catalog), true);
  assert.equal(isCatalog(() => {}), false);
  assert.equal(isCatalog({ definition: {} }), false);
  assert.equal(isMessageLeaf({ fr: 'x' }), true);
  assert.equal(isMessageLeaf({ fronts: { fr: 'x' } }), false);
  assert.equal(isMessageLeaf(['fr']), false);
  assert.deepEqual(MESSAGE_LEAF_KEYS, ['fr', 'en', 'note', 'sample', 'keep']);
  assert.equal(catalog.definition.replay.note, 'A button.');
});

test('labelFor translates a data value and shows an unknown one as it came', (t) => {
  const TYPE_LOCAL = defineMessages({
    Appartement: { fr: 'Appartement', en: 'Apartment' },
    Maison: { fr: 'Maison', en: 'House' },
    'Local industriel. commercial ou assimilé': { fr: 'Local industriel, commercial ou assimilé', en: 'Commercial or industrial premises' },
  });
  assert.equal(labelFor(TYPE_LOCAL, 'Maison'), 'Maison');
  useTestLocale('en', t);
  assert.equal(labelFor(TYPE_LOCAL, 'Maison'), 'House');
  assert.equal(labelFor(TYPE_LOCAL, 'Local industriel. commercial ou assimilé'), 'Commercial or industrial premises');
  assert.equal(labelFor(TYPE_LOCAL, 'Dépendance'), 'Dépendance', 'unknown → raw');
  assert.equal(labelFor(TYPE_LOCAL, null), '');
  assert.equal(labelFor(TYPE_LOCAL, 42), '42');
  assert.equal(labelFor(TYPE_LOCAL, '__proto__'), '__proto__', 'no prototype leak');
  assert.equal(labelFor(TYPE_LOCAL, 'toString'), 'toString');
  assert.equal(labelFor(TYPE_LOCAL, 'Maison', { locale: 'fr' }), 'Maison');
});

test('inAllLocales gives every language of one message, for code that must recognise it', () => {
  assert.deepEqual(inAllLocales(catalog, 'replay'), ['↺ Rejouer', '↺ Replay']);
  assert.deepEqual(inAllLocales(catalog, 'dayOf', 4, 10), ['jour 4 sur 10', 'day 4 of 10']);
  assert.deepEqual(inAllLocales(catalog, 'legend.deeper.flames'), ['flammes', 'flames']);
  assert.deepEqual(inAllLocales(catalog, 'frenchOnly'), ['seulement en français'], 'duplicates dropped');
  assert.deepEqual(inAllLocales(catalog, 'missing'), []);
});

test('messageLeaves walks nested groups with dotted paths', () => {
  assert.deepEqual(
    messageLeaves(catalog.definition).map(({ path }) => path),
    ['replay', 'dayOf', 'frenchOnly', 'legend.fronts', 'legend.deeper.flames', 'months'],
  );
});
