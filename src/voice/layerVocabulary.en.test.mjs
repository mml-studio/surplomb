// The mic's vocabulary in English — and the promise that it stays bilingual.
//
// Two different things are being asserted here, and confusing them is how this
// module breaks. What the voice READS BACK follows the page: an English reader
// must hear "Health & emergency services", not « Santé & secours ». What the
// voice ACCEPTS follows nobody: French and English phrasings resolve in either
// language, because the page's locale says which words are printed, never
// which words the person at the microphone will use.
import assert from 'node:assert/strict';
import test from 'node:test';

import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import {
  describeVoiceLayers,
  normalizeVocabularyKey,
  resolveVoiceLayerId,
  suggestVoiceLayers,
} from './layerVocabulary.js';

/** Layers whose two labels differ, so a language mix-up cannot pass unseen. */
const BOTH_WAYS = [
  ['medecins-fr', 'médecins', 'doctors', 'Santé & secours', 'Health & emergency services'],
  ['schools-fr', 'écoles', 'schools', 'Enseignement', 'Schools'],
  ['flights', 'vols en direct', 'live flights', 'Vols en direct', 'Live flights'],
  ['irve-fr', 'bornes de recharge', 'charge points', 'Bornes de recharge', 'EV charging stations'],
  ['petite-enfance-fr', 'crèches', 'childcare', 'Accueil du jeune enfant', 'Early childcare'],
];

test('every layer answers to its French AND its English name, in either locale', () => {
  for (const locale of ['fr', 'en']) {
    withLocale(locale, () => {
      for (const [id, spokenFr, spokenEn, labelFr, labelEn] of BOTH_WAYS) {
        assert.equal(resolveVoiceLayerId(spokenFr), id, `${spokenFr} in ${locale}`);
        assert.equal(resolveVoiceLayerId(spokenEn), id, `${spokenEn} in ${locale}`);
        // The panel labels of BOTH languages, because a reader reads one of
        // them out loud and a model transcribes whichever it heard.
        assert.equal(resolveVoiceLayerId(labelFr), id, `${labelFr} in ${locale}`);
        assert.equal(resolveVoiceLayerId(labelEn), id, `${labelEn} in ${locale}`);
      }
    });
  }
});

test('an accent-blind, case-blind key is what makes the two tables meet', () => {
  assert.equal(normalizeVocabularyKey('Médecins'), 'medecins');
  assert.equal(resolveVoiceLayerId('MEDECINS'), 'medecins-fr');
  assert.equal(resolveVoiceLayerId('Show me the DOCTORS'), null, 'a sentence is not a name');
});

test('the registry reads back in English on an English page', (t) => {
  useTestLocale('en', t);
  const rows = describeVoiceLayers();
  assert.ok(rows.length > 40, `expected the whole registry, got ${rows.length}`);
  const doctors = rows.find((row) => row.id === 'medecins-fr');
  assert.equal(doctors.label, 'Health & emergency services');
  assert.equal(doctors.group, 'BUILDINGS & LAND');
  const flights = rows.find((row) => row.id === 'flights');
  assert.equal(flights.label, 'Live flights');
  assert.equal(flights.group, 'SKY & SEA');
  // Nothing the model will say aloud may be French. Proper nouns are named
  // rather than waved through: they are the source's own name in both
  // languages, and the layer would be unidentifiable without them.
  assertNoFrench(rows.map((row) => ({ label: row.label, group: row.group })), {
    allow: ['Géorisques', 'Vigicrues', "Hub'Eau", 'Filosofi', 'Sitadel', 'DVF', 'IDFM', 'Météo'],
  });
});

test('the same registry reads back in French on a French page', () => {
  const rows = describeVoiceLayers();
  assert.equal(rows.find((row) => row.id === 'medecins-fr').label, 'Santé & secours');
  assert.equal(rows.find((row) => row.id === 'flights').group, 'CIEL & MER');
});

test('a near miss suggests layers named in the reader’s language', (t) => {
  useTestLocale('en', t);
  // The French word still finds the layer — what changes is how it is offered.
  const suggestions = suggestVoiceLayers('ecoles');
  assert.ok(suggestions.length, 'the closest layers should still be found from a French word');
  assert.equal(suggestions[0].id, 'schools-fr');
  assert.equal(suggestions[0].label, 'Schools');
});

test('the index does not freeze the first locale it was asked about', () => {
  // Built once and cached, so a session that starts in one language and is
  // asked about in another must not answer with the first one's labels. The
  // cache holds the MATCHING table, which has no language; the labels are read
  // per row, per call.
  const first = withLocale('en', () => describeVoiceLayers({ query: 'doctors' })[0].label);
  const second = withLocale('fr', () => describeVoiceLayers({ query: 'doctors' })[0].label);
  assert.equal(first, 'Health & emergency services');
  assert.equal(second, 'Santé & secours');
});
