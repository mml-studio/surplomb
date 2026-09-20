// What Military sites says, in both languages.
//
// The layer was half-translated: its status lines came from upstream in
// English and its four-class key was written here in French, so a French page
// read two languages and an English one read two as well. Both halves are now
// bilingual, and what this file pins is the half that carries the argument —
// the key, which exists to say what an OSM tag does NOT prove.
import test from 'node:test';
import assert from 'node:assert/strict';

import { installationKeyNote, installationLegend, installationSourceLabel } from './militaryInstallations.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const record = (klass) => ({ id: `${klass}-1`, class: klass, latitude: 43, longitude: 6 });
const en = (fn) => withLocale('en', fn);

test('every row of the key names its tag and what the tag does not prove', () => {
  const legend = en(() => installationLegend(
    ['airfield', 'naval_base', 'range', 'military_land'].map(record),
  ));
  assert.deepEqual(legend.map((row) => row.label),
    ['Air base', 'Naval base', 'Firing range', 'Military land']);
  assert.match(legend[0].blurb,
    /The layer says the ground is mapped, never that it is active nor what stands on it\./);
  // The catch-all still says outright that a grey dot means almost nothing.
  assert.match(legend[3].blurb, /39 of the 44 objects in the Toulon roadstead/);
  assert.match(legend[3].blurb, /A grey dot therefore says almost nothing about what it marks/);
  // OSM tag names are the register's keys and are never translated.
  assert.match(legend[2].blurb, /military=range/);
  assertNoFrench(legend.map((row) => [row.label, row.blurb]), { allow: ['Toulon'] });
});

test('the French key is untouched, tag for tag', () => {
  const legend = installationLegend(['airfield', 'military_land'].map(record));
  assert.deepEqual(legend.map((row) => row.label), ['Base aérienne', 'Terrain militaire']);
  assert.match(legend[1].blurb, /C’est le fourre-tout de la couche/);
});

test('the note says what is NOT on screen, in English', () => {
  const note = en(() => installationKeyNote({
    drawn: 400, inView: 912, fromPack: 120, packRetrievedAt: '2026-08-14',
  }));
  assert.match(note, /^400 marks out of 912 in view — the named classes /);
  assert.match(note, /\(air base, naval base, firing range\) come before the catch-all/);
  assert.match(note, /120 come from the bundled France pack, an OSM survey of 2026-08-14/);
  assert.match(note, /Zoom in to query OpenStreetMap live and get the footprints\./);
  assertNoFrench(note);
  assert.equal(en(() => installationKeyNote({ drawn: 10, inView: 10, fromPack: 0 })), '');
});

test('a record with no source named says so in the reader’s language', () => {
  assert.equal(en(() => installationSourceLabel({ sources: [] })), 'Unknown mapped source');
  assert.equal(installationSourceLabel({ sources: [] }), 'Source cartographique inconnue');
  // A named source is the source's own name and does not move.
  assert.equal(en(() => installationSourceLabel({ sources: [{ name: 'OpenStreetMap' }] })), 'OpenStreetMap');
});
