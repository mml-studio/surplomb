// How a permit was placed on a parcel that has since been divided, in English.
//
// The wording is a claim about CONFIDENCE — "only lot built on since" is an
// inference, "lot identified by its number" is a record — so the card must
// say which in the reader's language. The server that computes it has none:
// `ADS_LINEAGE_BASIS` keeps publishing French, and the browser labels the key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADS_LINEAGE_BASIS, adsLineageBasisLabel } from './cadastreLineage.js';
import messages from './cadastreLineage.i18n.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('each basis has an English label, and the ranks are untouched', () => {
  const en = withLocale('en', () => Object.keys(ADS_LINEAGE_BASIS).map(adsLineageBasisLabel));
  assert.deepEqual(en, [
    'footprint divided since',
    'only lot after the division',
    'only lot built on since',
    'lot identified by its number',
  ]);
  assertNoFrench(en);
  assert.ok(ADS_LINEAGE_BASIS.numbered.rank > ADS_LINEAGE_BASIS.built.rank);
  // A basis the feed invents tomorrow is shown as it came, not as a blank.
  assert.equal(withLocale('en', () => adsLineageBasisLabel('sibling')), 'sibling');
});

test('the payload keeps the French label, because the server has no locale', () => {
  // `adsFeed.js` writes `lineage.basisLabel` on the server; these bytes are
  // what it has always written, and what the catalog's French must stay.
  assert.deepEqual(Object.fromEntries(
    Object.entries(ADS_LINEAGE_BASIS).map(([key, entry]) => [key, entry.label]),
  ), {
    parent: 'emprise divisée depuis',
    sole: 'lot unique après division',
    built: 'seul lot construit depuis',
    numbered: 'lot identifié par son numéro',
  });
  for (const [key, entry] of Object.entries(ADS_LINEAGE_BASIS)) {
    assert.equal(entry.label, messages('fr')[key], `${key} drifted from the catalog`);
  }
});
