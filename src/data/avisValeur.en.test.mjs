// The property valuation in both languages, on the captured Paris 13e
// register: the card, the key, the chips, the four refusals and the voice
// subject. The layer publishes three different answers from that one fixture —
// a value, a range only, and nothing at all — and each of them has to make the
// SAME claim in English as in French, caveat for caveat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupMutations, parseDvfCsv } from './dvfFeed.js';
import { projectAvisValeur } from './avisValeurFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import {
  AVIS_BAND_CLASSES,
  avisChips,
  avisLegendDisclosure,
  avisLegendEntries,
  avisLegendMethod,
  avisRefusalText,
  avisSubjectCard,
  avisVoiceSummary,
  avisYearsLabel,
} from './avisValeur.js';

const PARIS_FIXTURE = new URL('./fixtures/dvf-75113-avis-250m-sample.csv', import.meta.url);
const PARIS_POINT = Object.freeze({ lon: 2.3735, lat: 48.83 });
const PARIS = Object.freeze({ code: '75113', name: 'Paris 13e Arrondissement' });
const mutations = groupMutations(parseDvfCsv(readFileSync(PARIS_FIXTURE, 'utf8')));

function answerFor(subject, extra = {}) {
  return {
    ...projectAvisValeur({
      mutations,
      subject: { ...PARIS_POINT, ...subject },
      commune: PARIS,
      years: [2025, 2024],
    }),
    ...extra,
  };
}

const ANSWERED = answerFor({ type: 'Appartement', surfaceM2: 60 });
const WITHHELD = answerFor({ type: 'Appartement', surfaceM2: 150 });
const REFUSED = answerFor({ type: 'Maison', surfaceM2: 100 });

/** Place names and register words that stay French inside English. */
const KEEP = ['Paris 13e Arrondissement', 'Bas-Rhin', 'Haut-Rhin', 'Moselle', 'Mayotte',
  'livre foncier', 'fichier immobilier'];

test('the subject is a surface and a type, in each language’s own order', () => {
  const en = withLocale('en', () => avisSubjectCard(ANSWERED));
  assertNoFrench(en, { allow: KEEP });
  assert.equal(en.title, '60 m² apartment — valuation');
  assert.equal(withLocale('fr', () => avisSubjectCard(ANSWERED).title),
    'Appartement de 60 m² — estimation');
});

test('the card keeps every caveat the French makes', () => {
  const { details } = withLocale('en', () => avisSubjectCard(ANSWERED));
  assertNoFrench(details, { allow: KEEP });
  const perM2 = details.find((line) => /^range /.test(line));
  const euros = details.find((line) => /^that is /.test(line));
  // The claim "half the comparable sales" may only be made about the €/m².
  // In English the symbol leads the amount, so the unit reads `€7,703/m²`.
  assert.ok(perM2.includes('/m²'), perM2);
  assert.ok(perM2.endsWith('half of the comparable sales'), perM2);
  assert.ok(euros.includes('scaled to the subject’s 60 m²'), euros);
  assert.ok(euros.endsWith('not prices anyone paid'), euros);
  for (const line of details) {
    if (/half of the comparable sales/.test(line)) assert.ok(line.includes('/m²'), line);
  }
  assert.match(details.find((line) => /^median of|median of /.test(line)) ?? details[1],
    /median of \d+ comparable sales/);
  assert.equal(details.at(-1),
    'Surplomb valuation from DVF comparables — not a regulated valuation report');
  // A line that carried the card separator would arrive on screen in halves.
  for (const line of details) assert.equal(line.includes(' · '), false, line);
});

test('the rung and the editions read in English on the card', () => {
  const { details } = withLocale('en', () => avisSubjectCard(ANSWERED));
  const measured = details.find((line) => line.startsWith('measured on '));
  assert.match(measured, /^measured on \d+ m, ±20% on surface, editions 2024 (and|to) 2025$/);
  const fr = withLocale('fr', () => avisSubjectCard(ANSWERED)).details
    .find((line) => line.startsWith('mesuré sur '));
  assert.match(fr, /^mesuré sur \d+ m, ±20 % de surface, éditions 2024 et 2025$/);
});

test('an interval that is only a range says so, and says why', () => {
  const en = withLocale('en', () => avisRefusalText(WITHHELD));
  assertNoFrench(en, { allow: KEEP });
  assert.match(en, /^Range only: over \d+ comparable sales/);
  assert.match(en, /interquartile spread|more than 20% away from the middle/);
  assert.match(withLocale('fr', () => avisRefusalText(WITHHELD)), /^Fourchette seulement : sur /);
});

test('the four silences are four different English sentences', () => {
  const notCovered = withLocale('en', () => avisRefusalText({
    estimate: { basis: 'none', reason: 'register-does-not-cover' },
  }));
  assertNoFrench(notCovered, { allow: KEEP });
  assert.match(notCovered, /^The DVF register does not cover this department/);
  assert.match(notCovered, /livre foncier/);
  const none = withLocale('en', () => avisRefusalText(REFUSED));
  assertNoFrench(none, { allow: KEEP });
  assert.match(none, /^No comparable sale in these editions, up to the whole municipality: /);
  assert.match(none, /fewer than 5 sales of a 100 m² house/);
  const unexplained = withLocale('en', () => avisRefusalText({
    estimate: { basis: 'none', reason: 'something-new' },
  }));
  assert.equal(unexplained, 'Valuation withheld, with no published reason — this state should '
    + 'not exist.');
  // And the French of the same four is untouched — including the article the
  // module has always printed wrong in front of « maison ».
  assert.match(withLocale('fr', () => avisRefusalText(REFUSED)),
    /moins de 5 ventes d’un maison de 100 m²/);
});

test('the key heads with the answer, and keeps the dispersion warning', () => {
  const entries = withLocale('en', () => avisLegendEntries(ANSWERED));
  assertNoFrench(entries, { allow: KEEP });
  assert.match(entries[0].label, /^60 m² apartment — €/);
  assert.match(entries[0].blurb, /^Median of \d+ comparable sales at €/);
  assert.match(entries[0].blurb, /not the number of dwellings in the neighborhood\.$/);
  assert.equal(entries[0].channel, 'What it is worth');
  const band = entries.find((entry) => /^range /.test(entry.label));
  assert.match(band.blurb, /it is not an error bar that shrinks as data piles up/);
  assert.match(band.blurb, /At those prices a 60 m² apartment would be worth €/);
  // The three painted classes, and the caption that says which population.
  const classes = entries.filter((entry) => entry.channel === 'The sales that say so');
  assert.deepEqual(classes.map((entry) => entry.label),
    ['below the range', 'inside the range', 'above the range']);
  assert.deepEqual(withLocale('fr', () => AVIS_BAND_CLASSES.map((klass) => klass.label)),
    ['sous la fourchette', 'dans la fourchette', 'au-dessus de la fourchette']);
});

test('the coverage sentence keeps its measured numbers in English typography', () => {
  const entries = withLocale('en', () => avisLegendEntries(ANSWERED));
  const middle = entries.find((entry) => /^middle known to /.test(entry.label));
  if (middle) {
    assertNoFrench(middle, { allow: KEEP });
    assert.match(middle.blurb, /measured at 91\.9–92\.8% on four real municipalities\.$/);
  }
  const fr = withLocale('fr', () => avisLegendEntries(ANSWERED))
    .find((entry) => /^milieu connu à /.test(entry.label));
  if (fr) assert.match(fr.blurb, /mesuré à 91,9–92,8 % sur quatre communes réelles\.$/);
});

test('the method line and the A5 line answer in English', () => {
  const method = withLocale('en', () => avisLegendMethod(ANSWERED));
  assertNoFrench(method, { allow: KEEP });
  assert.match(method, /^Surplomb valuation on DVF comparables · \d+ m, ±20% on surface/);
  const disclosure = withLocale('en', () => avisLegendDisclosure({
    ...ANSWERED,
    truncated: true,
    served: 120,
    excluded: { vefa: 3, zeroPrice: 1, unplaced: 2, otherType: 8, notPriceable: 4 },
    unavailableYears: [2025],
  }, { pinned: true }));
  assertNoFrench(disclosure, { allow: KEEP });
  assert.match(disclosure, /^Dropped: 3 off-plan \(VEFA\), 1 at one euro, 2 with no coordinate, /);
  assert.match(disclosure, /8 of the other dwelling type, 4 with no usable €\/m²/);
  assert.match(disclosure, /comparables drawn out of \d+ kept — the statistics cover them all/);
  assert.match(disclosure, /vintage\(s\) 2025 not downloaded — those editions EXIST/);
  assert.match(disclosure, /the chosen point does NOT travel in the share link/);
  assert.match(withLocale('fr', () => avisLegendDisclosure({ ...ANSWERED, truncated: true, served: 120 })),
    /comparables dessinées sur \d+ retenues/);
});

test('the chips name the subject they choose', () => {
  const chips = withLocale('en', () => avisChips({ surface: '60' }, { comparableCount: 42, pinned: true }));
  assertNoFrench(chips.map(({ label, title }) => ({ label, title })), { allow: KEEP });
  assert.deepEqual(chips.map((chip) => chip.label), ['30 m²', '60 m²', '100 m²', '150 m²',
    'Follow the camera']);
  assert.equal(chips[1].title, '60 m² subject — chooses the comparables’ surface band, not just '
    + 'the multiplier — 42 comparables kept');
  assert.match(chips.at(-1).title, /^Release the chosen point and value again under the camera/);
  assert.equal(withLocale('fr', () => avisChips({ surface: '60' }, { pinned: true })).at(-1).label,
    'Suivre la caméra');
});

test('the editions and the voice subject switch with the page', () => {
  assert.equal(withLocale('en', () => avisYearsLabel([2024, 2025])), 'editions 2024 and 2025');
  assert.equal(withLocale('fr', () => avisYearsLabel([2024, 2025])), 'éditions 2024 et 2025');
  const voice = withLocale('en', () => avisVoiceSummary({
    dormant: false, basis: 'comparables', subjectType: 'Maison', subjectSurfaceM2: 100,
  }));
  assert.equal(voice.subject, 'valuation of a 100 m² house');
  assert.equal(withLocale('fr', () => avisVoiceSummary({
    dormant: false, basis: 'comparables', subjectType: 'Maison', subjectSurfaceM2: 100,
  })).subject, 'estimation d’un bien de type Maison de 100 m²');
  assert.equal(withLocale('en', () => avisVoiceSummary({ dormant: false })).subject,
    'property valuation');
});
