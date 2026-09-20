// The first-visit card in English: what it says while it works, and what it
// says when the address was not found — through the module's own tables.
import test from 'node:test';
import assert from 'node:assert/strict';

import { FIRST_RUN_VARIANTS } from './firstRunVariants.js';
import messages from './firstRunVariants.i18n.js';
import experienceMessages from './firstRunExperience.i18n.js';
import optOutMessages from './firstRunOptOut.i18n.js';
import { assertNoFrench, useTestLocale } from './i18n/testing.js';

test('each B tile says in English what it is switching on', (t) => {
  useTestLocale('en', t);
  const tiles = FIRST_RUN_VARIANTS.B.tiles;
  assert.equal(tiles.sales.busyText, 'Switching on: what the neighbors paid…');
  assert.equal(tiles.permits.busyText, 'Switching on: what is going up…');
  assert.equal(tiles.live.busyText, 'Switching on: what is moving right now…');
  assert.equal(tiles.sales.phoneSubcopy, 'Property sales (DVF), 5 years');
  assertNoFrench([tiles.sales.busyText, tiles.permits.busyText, tiles.live.busyText, tiles.sales.phoneSubcopy]);
});

test('the answers to a search, and to a layer that would not start', (t) => {
  useTestLocale('en', t);
  const m = messages();
  assert.equal(m.searching('12 rue de Rivoli, Paris'), 'Searching for “12 rue de Rivoli, Paris”…');
  assert.equal(m.searching('Bordeaux'), 'Searching for “Bordeaux”…');
  assert.equal(m.notFound, 'Not found. Try a municipality, or a more precise address.');
  assert.equal(m.layersFailed(m.theseLayers), 'these layers could not be switched on. Try again, or look around yourself.');
  assert.equal(experienceMessages().busy, 'One moment…');
  assertNoFrench([m.notFound, m.searchFailed, m.layersFailed('dvf-sales'), experienceMessages().busy,
    m.searching('Bordeaux')]);
  assertNoFrench(optOutMessages());
});

test('the tiles are getters, so the card speaks the language of the page it is drawn on', () => {
  // Read in French AFTER the English test above: a table of constants built at
  // import would have frozen the first language it met.
  assert.equal(FIRST_RUN_VARIANTS.B.tiles.sales.busyText, 'Allumage : ce que les voisins ont payé…');
  assert.equal(messages('fr').notFound, 'Introuvable. Essayez une commune ou une adresse plus précise.');
});
