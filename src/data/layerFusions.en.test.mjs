// The chip strip in English: one chip per layer, its tooltip, and the two
// tables the panel reads them through.
//
// A chip is a CONTROL read at 10 px, so the English is as short as the French;
// the tooltip is where the claim and the hedge are, and those are translated
// in full.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYER_FUSIONS,
  fusionCompanionsFor,
  fusionMemberChipFor,
  fusionPrimaryChipFor,
} from './layerFusions.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

/** Publishers and datasets an English tooltip keeps as published. */
const KEEP = ['Sitadel', 'Bison Futé', 'Traficolor', 'Météo-France', 'ODRÉ', 'Hub’Eau', "Hub'Eau",
  'Île-de-France', 'métropole', 'TeleGeography', 'ANFR', 'RTE', 'BTS'];

test('every chip and every tooltip has an English form', () => {
  const strip = withLocale('en', () => LAYER_FUSIONS.flatMap((fusion) => [
    { chip: fusion.primaryChip, title: '' },
    ...fusion.companions.map((companion) => ({ chip: companion.chip, title: companion.title })),
  ]));
  for (const entry of strip) {
    if (entry.chip !== undefined) assert.equal(typeof entry.chip, 'string');
  }
  assertNoFrench(strip.map((entry) => entry.chip).filter(Boolean), { allow: KEEP });
  assertNoFrench(strip.map((entry) => entry.title).filter(Boolean), { allow: KEEP });
});

test('the chips a reader presses read the same way in English', () => {
  const chips = withLocale('en', () => fusionCompanionsFor('traffic').map((entry) => entry.chip));
  assert.deepEqual(chips, ['Network status', 'Events', 'Counts · Paris']);
  assert.equal(withLocale('en', () => fusionPrimaryChipFor('local-datacenters').chip), 'Data centers');
  assert.equal(withLocale('en', () => fusionMemberChipFor('flights', 'military')), 'Military');
  assert.equal(withLocale('en', () => fusionMemberChipFor('flights', 'flights')), 'Civil');
  // French, unchanged.
  assert.deepEqual(fusionCompanionsFor('traffic').map((entry) => entry.chip),
    ['État du réseau', 'Événements', 'Comptages · Paris']);
  assert.equal(fusionMemberChipFor('flights', 'flights'), 'Civils');
});

test('a tooltip keeps its claim, its number and its hedge', () => {
  const title = (rowId, id) => withLocale('en', () => fusionCompanionsFor(rowId)
    .find((companion) => companion.id === id).title);
  assert.equal(title('traffic', 'comptages-fr'),
    'Paris traffic counts — a COUNT of vehicles, not congestion');
  assert.equal(title('transit-fr', 'idfm-network'),
    'Stops, lines and hourly frequency across Île-de-France — 37,956 stops');
  assert.equal(title('edf-power-plants', 'fr-hydro-plants'),
    'The ODRÉ register — the whole French hydro fleet, plus 592 plants mapped outside France');
  assert.equal(title('local-firms', 'gironde-megafire-2026'),
    'The July 2026 megafire — reconstructed day by day, with no FIRMS key');
});
