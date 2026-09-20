// Space missions and Satellites in both languages. Both layers arrived from
// the upstream project with English-only prose; their behaviour stays pinned
// by rocketLaunches.test.mjs and the satellites tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import rocketMessages from './rocketLaunches.i18n.js';
import satelliteMessages from './satellites.i18n.js';
import { assertNoFrench } from '../i18n/testing.js';

test('the mission panel reads in French without losing an English word', () => {
  const en = rocketMessages('en');
  const fr = rocketMessages('fr');
  // The shipped English is kept verbatim: this layer's panel is the upstream's.
  assert.equal(en.panel.header, 'SELECTED SPACE MISSION');
  assert.equal(en.panel.stagesSection, 'STAGE / RE-ENTRY / RECOVERY');
  assert.equal(en.replay.ascent, 'REPLAY ASCENT');
  assert.equal(en.roster.empty, 'NO MISSIONS AVAILABLE IN THE CURRENT 30-DAY WINDOW');
  assert.equal(en.world.projectedOrbit, 'PROJECTED ORBIT');

  // And every one of them now has a French that says the same thing.
  assert.equal(fr.panel.header, 'MISSION SPATIALE SÉLECTIONNÉE');
  assert.equal(fr.panel.stagesSection, 'ÉTAGE / RENTRÉE / RÉCUPÉRATION');
  assert.equal(fr.replay.ascent, 'REJOUER L’ASCENSION');
  assert.equal(fr.world.projectedOrbit, 'ORBITE PROJETÉE');
  assertNoFrench(Object.values(en.panel));
});

test('the satellite chip and the orbit row read in both languages', () => {
  const en = satelliteMessages('en');
  const fr = satelliteMessages('fr');
  // ISS and STARLINK are an abbreviation and a brand: one word each, both ways.
  assert.equal(en.iss, 'ISS');
  assert.equal(fr.iss, 'ISS');
  assert.equal(fr.chip.idle, 'STARLINK');
  assert.equal(fr.chip.loading, 'STARLINK ···');

  // The row that exists so a forward line is not read as a past track.
  assert.equal(en.orbit.label, 'Orbit ahead (prediction)');
  assert.equal(fr.orbit.label, 'Orbite à venir (prédiction)');
  assert.match(en.orbit.blurb, /propagated FORWARD/);
  assert.match(fr.orbit.blurb, /propagée EN AVANT/);
  assertNoFrench([en.orbit.label, en.orbit.blurb, en.chip.activeTitle], { allow: ['TLE'] });
});
