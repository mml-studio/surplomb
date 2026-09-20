// What the ARCEP feed publishes, and why none of it is translated here.
//
// `arcepFeed.js` runs inside the `/api/arcep-fr` proxy, in Node, where there
// is no locale by design; nothing in the browser bundle imports it. What it
// writes into a payload are the register's own words, and the Address X-ray
// relabels them BY KEY — `ARCEP_TECHNOLOGIES` in `adresseRadiographie.i18n.js`.
// This file pins that join, because a renamed key would silently fall back to
// printing French on an English page.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ARCEP_SPEED_CLASSES, ARCEP_TECHNOLOGIES, projectArcep } from './arcepFeed.js';
import { ARCEP_TECHNOLOGIES as ARCEP_TECHNOLOGY_LABELS } from './adresseRadiographie.i18n.js';
import { labelFor } from '../i18n/messages.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('every technology the payload can carry has an English label', () => {
  const keys = ARCEP_TECHNOLOGIES.map((technology) => technology.key);
  const english = withLocale('en', () => keys.map((key) => labelFor(ARCEP_TECHNOLOGY_LABELS, key)));
  for (const [index, label] of english.entries()) {
    assert.notEqual(label, keys[index], `no English for ${keys[index]}`);
  }
  assertNoFrench(english);
  // The French side is the register's own wording, byte for byte.
  for (const technology of ARCEP_TECHNOLOGIES) {
    assert.equal(labelFor(ARCEP_TECHNOLOGY_LABELS, technology.key), technology.label);
  }
});

test('the “no offer” bucket the feed appends is named too', () => {
  // It is not a technology: it is the premises the register places under none.
  const payload = projectArcep({
    code: '69123',
    best: { nbr: 1000, nbr_elig_8: 900, elig_ftth: 900 },
  });
  const unserved = payload.technologies.find((row) => row.key === 'aucune');
  assert.equal(unserved.label, 'aucune offre à 8 Mbit/s');
  assert.equal(withLocale('en', () => labelFor(ARCEP_TECHNOLOGY_LABELS, 'aucune')),
    'no offer at 8 Mbit/s');
});

test('the speed classes stay the register’s thresholds, in both languages', () => {
  // `1 Gbit/s ou plus` is a threshold written with a unit, and the unit is the
  // same word in English; only the sheet that prints it decides the wording.
  assert.deepEqual(ARCEP_SPEED_CLASSES.map((speed) => speed.key),
    ['gigabit', 'thd100', 'thd30', 'bhd8', 'hd3']);
});
