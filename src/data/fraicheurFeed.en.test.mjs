// Cool islands (Paris) in English — the three registers and the trees, read
// through the real projection of the real captured rows. Their French stays
// pinned by fraicheurFeed.test.mjs, fraicheurTrees.test.mjs and
// fraicheurParis.test.mjs, untouched.
//
// The property that runs through the French file runs through this one: an
// absence must never be presentable as a measurement, and “we do not know”
// must never read as “no”. Paris publishes four different spellings of
// nothing, and each one has to keep its own English sentence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  equipmentCardLines,
  formatAreaM2,
  formatShare,
  fountainCardLines,
  fraicheurDayName,
  fraicheurFountainLabel,
  fraicheurLoadingLabel,
  parisClock,
  projectFraicheurRefuges,
  scheduleIsReadable,
  spaceCardLines,
  summarizeFraicheurRefuges,
} from './fraicheurFeed.js';
import { fraicheurTreeLabel, treeCardLines } from './fraicheurTrees.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const norm = (value) => String(value).replace(/[\s ]+/g, ' ');

const NOW = Date.parse('2026-09-02T12:00:00Z'); // 14:00 in Paris, a Wednesday.
const PACK = projectFraicheurRefuges({
  spaces: read('fraicheur-espaces-verts-sample.json'),
  equipment: read('fraicheur-equipements-sample.json'),
  fountains: read('fraicheur-fontaines-sample.json'),
  now: NOW,
});
const CLOCK = parisClock(NOW);
const spaceNamed = (fragment) => PACK.spaces.find((row) => (row.name || '').includes(fragment));

/** Proper nouns and published values the detector must accept. */
const ALLOW = ['Eau de Paris', 'Ville de Paris', 'Paris', 'dispo', 'Eteint'];

useTestLocale('en');

test('an expired timetable carries its window on the same line, in English', () => {
  const space = spaceNamed('SQUARE D’ANVERS') || spaceNamed('ANVERS');
  assert.ok(space, 'the fixture must carry SQUARE D’ANVERS');
  const text = norm(spaceCardLines(space, CLOCK, NOW).details.join(' | '));
  assert.match(text, /the period has expired/);
  // The window itself is the register's own sentence, printed as published.
  assert.match(text, /du 01\/05\/26 au 31\/08\/26/);
  // Both vegetation numbers, never one and never an average.
  assert.match(text, /Canopy over 8 m/);
  assert.match(text, /“tall vegetation”/);
  assert.match(text, /a different figure, not a correction/);
});

test('a heatwave space with no measured canopy still says both things at once', () => {
  const hot = PACK.spaces.find((row) => row.canicule === true && row.canopy === 0);
  assert.ok(hot, 'the fixture must carry a heatwave space with zero canopy');
  const text = norm(spaceCardLines(hot, CLOCK, NOW).details.join(' | '));
  assert.match(text, /Heatwave opening declared/);
  assert.match(text, /0% canopy measured here/);
});

test('an unmeasured canopy is never printed as zero', () => {
  const unknown = PACK.spaces.find((row) => row.canopy === null);
  assert.ok(unknown, 'the fixture must carry a space with no published index');
  const text = norm(spaceCardLines(unknown, CLOCK, NOW).details.join(' | '));
  assert.match(text, /Canopy over 8 m not measured in the 2024 survey/);
  assert.equal(/0% of the ground/.test(text), false, 'an absent measurement is never a 0%');
});

test('“we do not know the hours” is never “closed”', () => {
  const silent = PACK.equipment.find(
    (row) => !scheduleIsReadable(row.schedule) && row.open24 !== true,
  );
  assert.ok(silent, 'the fixture must carry a site with no readable hours');
  const text = norm(equipmentCardLines(silent, CLOCK, NOW).details.join(' | '));
  assert.match(text, /No weekly timetable published/);
  assert.equal(/Closed now/.test(text), false);

  const mister = PACK.equipment.find((row) => row.status === 'Eteint');
  assert.ok(mister, 'the fixture must carry a mister with a published status');
  // The status VALUE is the register's own word, printed as published.
  assert.match(
    norm(equipmentCardLines(mister, CLOCK, NOW).details.join(' | ')),
    /Published status: Eteint/,
  );
});

test('a fountain outage past its own end date says so, and credits Eau de Paris', () => {
  const stale = PACK.fountains.find(
    (row) => row.available === false && row.to && Date.parse(row.to) < NOW,
  );
  assert.ok(stale, 'the fixture must carry an outage whose end date has passed');
  const text = norm(fountainCardLines(stale, NOW).details.join(' | '));
  assert.match(text, /the published end of the outage has already passed/);
  assert.match(text, /Source: Eau de Paris/);
  const live = PACK.fountains.find(
    (row) => row.available === false && row.to && Date.parse(row.to) > NOW,
  );
  assert.ok(live);
  assert.match(norm(fountainCardLines(live, NOW).details.join(' | ')), /Out of service/);
});

test('the truncated fountain codes are mapped in both languages, never printed raw', () => {
  assert.equal(fraicheurFountainLabel('FONTNE_WALLACE'), 'Wallace fountain');
  assert.equal(fraicheurFountainLabel('FTNE_POING_EAU'), '“Poing d’eau” fountain');
  assert.equal(fraicheurFountainLabel('FONTAINE_ALBIEN'), 'Albian aquifer well');
  assert.equal(withLocale('fr', () => fraicheurFountainLabel('FONTNE_WALLACE')), 'Fontaine Wallace');
  // A code nobody has worded is printed as published, never blanked.
  assert.equal(fraicheurFountainLabel('FTNE_INCONNUE'), 'FTNE_INCONNUE');
  for (const fountain of PACK.fountains) {
    assert.equal(/_/.test(fountainCardLines(fountain, NOW).title), false,
      `${fountain.kind} reached a card raw`);
  }
});

test('the row line names Paris time as Paris time, whoever is reading', () => {
  const summary = summarizeFraicheurRefuges(PACK, { now: NOW });
  const line = fraicheurLoadingLabel({ status: 'ready', summary, drawn: 44 });
  assert.match(line, /open at \d\d h \d\d \(Paris time\)/);
  assert.match(line, /44 objects drawn/);
  assert.equal(fraicheurLoadingLabel({ status: 'loading' }), 'reading the three Paris registers…');
  assert.equal(
    fraicheurLoadingLabel({ status: 'off-coverage' }),
    'Outside Paris — this layer only describes the Ville de Paris and its two woods',
  );
  assertNoFrench(line, { allow: ALLOW });
});

test('the days of the week come from the locale, not from the column names', () => {
  assert.equal(fraicheurDayName(0), 'Monday');
  assert.equal(fraicheurDayName(6), 'Sunday');
  assert.equal(withLocale('fr', () => fraicheurDayName(0)), 'lundi');
});

test('numbers follow the reader’s typography', () => {
  assert.equal(formatShare(0.319), '31.9%');
  assert.equal(formatAreaM2(4231), '4,231 m²');
  assert.equal(formatAreaM2(42310), '4.23 ha');
  assert.equal(withLocale('fr', () => formatShare(0.319)), '31,9 %');
  assert.equal(withLocale('fr', () => norm(formatAreaM2(4231))), '4 231 m²');
});

test('a tree whose height the register never measured says exactly that', () => {
  const card = treeCardLines({
    name: 'Platane', height: null, girth: 0, remarquable: null, idbase: 2002197,
  });
  const text = norm(card.details.join(' | '));
  assert.match(text, /Height not measured \(the register publishes 0\)/);
  assert.match(text, /Girth not measured \(the register publishes 0\)/);
  assert.match(text, /Heritage status not recorded/);
  assert.equal(treeCardLines({}).title, 'Tree (species not published)');
});

test('the corrupt development stage is named as corrupt in English too', () => {
  const card = treeCardLines({ stage: 'Jeune (arbre)Adulte', domain: 'DFPE', height: 9 });
  const text = norm(card.details.join(' | '));
  assert.match(text, /Stage unreadable \(two values run together in the register\)/);
  assert.equal(/Young \|/.test(text), false, 'never mapped to one of the two states');
  assert.match(text, /Daycare \(DFPE\)/);
});

test('the tree status line agrees with its own count', () => {
  assert.equal(fraicheurTreeLabel({ status: 'ready', drawn: 1 }), '1 tree drawn');
  assert.equal(fraicheurTreeLabel({ status: 'ready', drawn: 4812 }), '4,812 trees drawn');
  assert.equal(fraicheurTreeLabel({ status: 'off' }), 'Trees hidden — press TREES to load them');
  assert.equal(fraicheurTreeLabel({ status: 'empty' }), 'No tree on record in this view');
  assert.equal(
    withLocale('fr', () => norm(fraicheurTreeLabel({ status: 'ready', drawn: 4812 }))),
    '4 812 arbres tracés',
  );
});
