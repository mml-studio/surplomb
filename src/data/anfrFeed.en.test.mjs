// The two ANFR tables a reader meets, in English.
//
// The feed itself stays French and dependency-free: it runs in the
// `/api/anfr-fr` proxy, in Node, and what it writes into a payload are the
// register's own `statut` values. These are how the browser reads one back
// out — and the middle status is the whole reason the table exists.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ANFR_BANDS, ANFR_SOURCE, ANFR_STATUSES } from './anfrFeed.js';
import { ANFR_BAND_LABELS, ANFR_STATUS_LABELS } from './anfrFeed.i18n.js';
import { labelFor } from '../i18n/messages.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('each of the three statuses has an English that keeps its warning', () => {
  const english = withLocale('en', () => ANFR_STATUSES.map((statut) => labelFor(ANFR_STATUS_LABELS, statut)));
  assert.deepEqual(english, [
    'In service',
    'Technically operational — switched on, not declared in service',
    'Approved project — authorized, not built',
  ]);
  assertNoFrench(english);
  // The French is the register's value plus its gloss, unchanged.
  assert.equal(labelFor(ANFR_STATUS_LABELS, 'En service'), 'En service');
});

test('the five rungs keep their claim, which is what the ladder is for', () => {
  const english = withLocale('en', () => ANFR_BANDS.map((band) => labelFor(ANFR_BAND_LABELS, band)));
  assert.deepEqual(english, [
    'Approved project — nothing transmits',
    '2G only',
    '3G at best',
    '4G at best',
    '5G in service',
  ]);
  // “at best” is not “in service”: the ladder is ordered lowest claim first.
  assert.notEqual(english[3], english[4]);
  assertNoFrench(english);
});

test('the payload’s attribution stays the register’s own name', () => {
  assert.equal(withLocale('en', () => ANFR_SOURCE), ANFR_SOURCE);
  assert.match(ANFR_SOURCE, /Agence nationale des fréquences/);
});
