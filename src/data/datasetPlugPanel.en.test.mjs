// What the plug box says, in English.
//
// The panel needs a DOM and the unit runner has none — `qa:datasets` drives
// the real one and `datasetPlugPanelLayout.test.mjs` reads the markup out of
// the source. What is pinned here is the wording itself: the button that acts
// as the mode indicator, and every sentence the status line can print, read
// through the catalog exactly as the panel reads it.
import test from 'node:test';
import assert from 'node:assert/strict';

import messages from './datasetPlugPanel.i18n.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const en = () => withLocale('en', () => messages());

test('the field’s two intents stay two short, unmistakable words', () => {
  const m = en();
  assert.equal(m.search, 'SEARCH');
  assert.equal(m.analyse, 'ANALYZE');
  assert.equal(m.plug, 'PLUG IN');
  assert.equal(m.open, 'PLUG IN A DATASET');
  // The whole mode indicator is the button label: the two must not collide.
  assert.notEqual(m.search[0], m.analyse[0]);
  assert.equal(messages().search, 'CHERCHER');
  assert.equal(messages().analyse, 'ANALYSER');
});

test('the status line narrates the plug, including what it cannot promise', () => {
  const m = en().status;
  assert.equal(m.searching, 'Searching data.gouv.fr…');
  assert.equal(m.nothingPublished('defibrillators'), 'No dataset published on “defibrillators”.');
  assert.equal(m.chooseOne(42), '42 datasets found — here are the ones that draw. Pick one.');
  assert.equal(m.noneUsable(42, 5),
    '42 datasets found, none of the first 5 is usable — narrow the subject, or paste an address.');
  assert.equal(m.draftReady, 'Draft ready — check it, then PLUG IN.');
  assert.equal(m.drawn('Defibrillators', '888 features, whole dataset', ''),
    '“Defibrillators” — 888 features, whole dataset.');
  assert.equal(m.nothingHere('Defibrillators', ''),
    '“Defibrillators” plugged in, but nothing here — move or zoom the view.');
  assert.equal(m.sourceFailed('Defibrillators', 'source unreachable'),
    '“Defibrillators” plugged in, but the source failed: source unreachable');
  assert.equal(m.notPersisted, ' — storage refused: it will not survive this tab.');
});

test('the draft form and the facts under it are English', () => {
  const m = en();
  assert.deepEqual(
    [m.draft.name, m.draft.resource, m.draft.position],
    ['Name', 'Resource', 'Position'],
  );
  assert.deepEqual(
    [m.facts.publisher, m.facts.licence, m.facts.rows, m.facts.columns],
    ['Publisher', 'License', 'Rows', 'Columns'],
  );
  assert.equal(m.facts.loadedForView, ' · loaded for the view');
  assert.equal(m.exportTitle, 'Copy the manifest (to drop into datasets/)');
  assert.equal(m.unplugTitle, 'Unplug');
});

test('a byte size reads in English units', () => {
  const m = en().bytes;
  assert.equal(m.megabytes('161'), '161 MB');
  assert.equal(m.kilobytes('48'), '48 kB');
  assert.equal(messages().bytes.megabytes('161'), '161 Mo');
});

test('nothing the box can print is still French', () => {
  const m = en();
  assertNoFrench({
    ...m,
    // The functions are rendered above with real arguments; only the plain
    // strings are swept here.
    status: Object.fromEntries(Object.entries(m.status).filter(([, v]) => typeof v === 'string')),
    shortlist: {},
    bytes: {},
    facts: Object.fromEntries(Object.entries(m.facts).filter(([, v]) => typeof v === 'string')),
  });
});
