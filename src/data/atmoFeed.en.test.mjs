// The ATMO projection publishes French, because a server has no locale.
// What this pins is the SEAM: every label it publishes is keyed, and the
// browser's own tables (adresseRadiographie.i18n.js) answer for the same keys
// in both languages. A drift between the two would show as an English card
// silently falling back to French.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATMO_POLLUTANTS, ATMO_SCALE, ATMO_SOURCE, atmoBand } from './atmoFeed.js';
import {
  ATMO_BANDS,
  ATMO_POLLUTANTS as ATMO_POLLUTANT_WORDS,
} from './adresseRadiographie.i18n.js';
import { assertNoFrench } from '../i18n/testing.js';

test('every band the server publishes is worded in both languages, by code', () => {
  for (const band of ATMO_SCALE) {
    assert.equal(ATMO_BANDS('fr')[band.code], band.label, `band ${band.code} drifted`);
    const english = ATMO_BANDS('en')[band.code];
    assert.ok(english && english !== String(band.code), `band ${band.code} has no English`);
  }
  assert.deepEqual(
    ATMO_SCALE.map((band) => ATMO_BANDS('en')[band.code]),
    ['Good', 'Fair', 'Degraded', 'Poor', 'Very poor', 'Extremely poor'],
  );
  assertNoFrench(ATMO_SCALE.map((band) => ATMO_BANDS('en')[band.code]));
});

test('every sub-index the server publishes is worded in both languages, by key', () => {
  for (const pollutant of ATMO_POLLUTANTS) {
    assert.equal(
      ATMO_POLLUTANT_WORDS('fr')[pollutant.key],
      pollutant.label,
      `pollutant ${pollutant.key} drifted`,
    );
  }
  assert.deepEqual(
    ATMO_POLLUTANTS.map((pollutant) => ATMO_POLLUTANT_WORDS('en')[pollutant.key]),
    [
      'nitrogen dioxide', 'ozone', 'PM10 particulates',
      'PM2.5 particulates', 'sulfur dioxide',
    ],
  );
});

test('the projection still publishes the French label beside the code', () => {
  // The contract the browser reads: `band.code` is the key, `band.label` the
  // publisher's own word. Dropping the label would break `fiche.html` before
  // it was migrated, and translating it on the server would be a guess about
  // a reader the server cannot see.
  assert.deepEqual(atmoBand(3), { code: 3, label: 'Dégradé', colour: '#F0E641' });
  assert.equal(atmoBand(7), null);
});

test('the ODbL attribution is reproduced word for word, in both languages', () => {
  assert.equal(ATMO_SOURCE, 'Indice ATMO — Atmo France et les AASQA régionales');
});
