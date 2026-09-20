// The Cool islands key and chips in English. Their French stays pinned by
// fraicheurParis.test.mjs, untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FRAICHEUR_FOUNTAIN_STATES,
  FRAICHEUR_REGISTERS,
  FRAICHEUR_REGISTER_SPECS,
  _clearFraicheurSelectionForTest,
  _fraicheurRowControlsForTest,
  _setFraicheurStateForTest,
  buildFraicheurSelectionLabel,
  fraicheurDetectLabel,
} from './fraicheurParis.js';
import { projectFraicheurRefuges } from './fraicheurFeed.js';
import { projectFraicheurTrees } from './fraicheurTrees.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const norm = (value) => String(value).replace(/[\s ]+/g, ' ');

const AFTERNOON = Date.parse('2026-09-02T12:00:00Z');
const PACK = projectFraicheurRefuges({
  spaces: read('fraicheur-espaces-verts-sample.json'),
  equipment: read('fraicheur-equipements-sample.json'),
  fountains: read('fraicheur-fontaines-sample.json'),
  now: AFTERNOON,
});
const TREES = projectFraicheurTrees({
  features: read('fraicheur-arbres-sample.json'),
  totalInBox: 18,
  box: { south: 48.816, west: 2.346, north: 48.836, east: 2.366 },
});

function recordingHost() {
  return {
    setEntries: () => {},
    clearSource: () => {},
    setVisible: () => {},
  };
}

/** Proper nouns and published values the detector must accept. */
const ALLOW = ['Ville de Paris', 'Eau de Paris', 'Paris', 'ODbL',
  'Direction des Espaces Verts', 'dispo',
  // The two the English keeps on purpose: a sport with no English name, and
  // the register's own name for a family of sites.
  'pétanque', 'Découverte'];

useTestLocale('en');

test('the five register chips read in English and still carry their params', () => {
  _setFraicheurStateForTest({
    payload: PACK, trees: TREES, overlayHost: recordingHost(), now: AFTERNOON,
  });
  const { chips } = _fraicheurRowControlsForTest();
  assert.deepEqual(chips.map((chip) => chip.label),
    ['PARKS', 'REFUGES', 'FOUNTAINS', 'TREES', 'HERITAGE']);
  for (const chip of chips) {
    const [[key, value]] = Object.entries(chip.params);
    assert.ok(FRAICHEUR_REGISTERS.includes(key));
    assert.equal(value, !chip.active, 'a chip toggles its own register');
    assert.ok(chip.title.length > 0);
  }
  assertNoFrench(chips.map((chip) => `${chip.label} ${chip.title}`), { allow: ALLOW });
  _clearFraicheurSelectionForTest();
});

test('the key still leads with the heatwave asymmetry, and keeps its four numbers', () => {
  _setFraicheurStateForTest({
    payload: PACK, trees: TREES, overlayHost: recordingHost(), now: AFTERNOON,
  });
  const { legend, note } = _fraicheurRowControlsForTest();
  assert.equal(legend[0].label, 'Open during a heatwave');
  const blurb = norm(legend[0].blurb);
  const canicule24 = PACK.spaces.filter((s) => s.canicule === true && s.open24 === true).length;
  assert.match(blurb, new RegExp(`of which ${canicule24} are open around the clock`));
  assert.match(blurb, /NO canopy measured above 8 m/);
  // The two medians keep the decimal point the glossary fixes.
  assert.match(blurb, /0\.0280 against 0\.3197/);
  assert.ok(legend.some((row) => row.label === 'Shaded park'));
  assertNoFrench(legend.map((row) => `${row.label} — ${row.blurb ?? ''}`), { allow: ALLOW });
  if (note) assertNoFrench(note, { allow: ALLOW });
  _clearFraicheurSelectionForTest();
});

test('the three fountain states are named, and “not published” is not “no”', () => {
  assert.deepEqual(FRAICHEUR_FOUNTAIN_STATES.map((state) => state.label),
    ['Fountain in service', 'Fountain out of service', 'Availability not published']);
  assert.match(FRAICHEUR_FOUNTAIN_STATES[2].blurb, /the field is text, not a boolean/);
  assert.deepEqual(
    withLocale('fr', () => FRAICHEUR_FOUNTAIN_STATES.map((state) => state.label)),
    ['Fontaine en service', 'Fontaine hors service', 'Disponibilité non publiée'],
  );
});

test('a card footer credits the right publisher and names the clock as Paris’s', () => {
  const space = PACK.spaces.find((row) => row.name);
  const card = norm(buildFraicheurSelectionLabel(
    { kind: 'space', row: space },
    PACK,
  ));
  assert.match(card, /Paris time: \w+ \d\d h \d\d/);
  assert.match(card, /Ville de Paris — ODbL · canopy: 2024 survey/);

  const fountain = PACK.fountains[0];
  assert.match(
    norm(buildFraicheurSelectionLabel({ kind: 'fountain', row: fountain }, PACK)),
    /Eau de Paris — ODbL/,
  );
});

test('an unnamed object falls back to a name in the reader’s language', () => {
  assert.equal(fraicheurDetectLabel({ kind: 'space', row: {} }), 'Cool green space');
  assert.equal(fraicheurDetectLabel({ kind: 'fountain', row: {} }), 'Drinking fountain');
  assert.equal(fraicheurDetectLabel({ kind: 'remarkable', row: {} }), 'Heritage tree');
  assert.equal(
    withLocale('fr', () => fraicheurDetectLabel({ kind: 'space', row: {} })),
    'Espace vert frais',
  );
});

test('the chip label is read when it is drawn, never when the module loads', () => {
  // A `{...catalog()}` spread on this table would freeze all five chips in
  // whichever language happened to import the layer first.
  assert.equal(FRAICHEUR_REGISTER_SPECS.trees.chip, 'TREES');
  assert.equal(withLocale('fr', () => FRAICHEUR_REGISTER_SPECS.trees.chip), 'ARBRES');
  assert.equal(FRAICHEUR_REGISTER_SPECS.trees.kind, 'tree', 'the record key is not a word');
});
