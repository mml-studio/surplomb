// The SSMSI's recorded-crime bases in English: the eighteen indicators, the
// units they are counted in, the four states a cell can be in, and the four
// rules the publisher wrote.
//
// The recurring property is the one the whole file is built on: THE CATEGORY
// IS DATA. The join key stays the register's own French label, and only its
// display is translated — so an English card says "Home burglary" while the
// CSV still finds its indicator.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DELINQUANCE_CELL_LABELS,
  DELINQUANCE_INDICATORS,
  DELINQUANCE_TOTAL_INDICATOR,
  DELINQUANCE_TOTAL_SLUG,
  delinquanceCaveatLine,
  delinquanceCountNoun,
  delinquanceDocumentationTitle,
  delinquanceIndicatorLabel,
  delinquanceIndicatorNote,
  delinquanceIndicatorShort,
  delinquanceRateUnit,
  delinquanceRule,
  delinquanceUnitLabel,
  indicatorForLabel,
} from './delinquanceFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('the join key is untouched: the register’s own labels still resolve', () => {
  // In English as in French — the table is data and the lookup is by the CSV's
  // own words. Retyping one of them is an empty map.
  for (const entry of DELINQUANCE_INDICATORS) {
    assert.equal(withLocale('en', () => indicatorForLabel(entry.label))?.slug, entry.slug);
  }
  assert.equal(withLocale('en', () => indicatorForLabel('Home burglary')), null);
});

test('every indicator has an English name, long and short', () => {
  const slugs = [...DELINQUANCE_INDICATORS.map((entry) => entry.slug), DELINQUANCE_TOTAL_SLUG];
  const long = withLocale('en', () => slugs.map(delinquanceIndicatorLabel));
  const short = withLocale('en', () => slugs.map(delinquanceIndicatorShort));
  assertNoFrench(long);
  assertNoFrench(short);
  assert.equal(new Set(long).size, long.length, 'two indicators share one English name');
  assert.equal(withLocale('en', () => delinquanceIndicatorLabel('cambriolages')), 'Home burglary');
  assert.equal(withLocale('en', () => delinquanceIndicatorShort('cambriolages')), 'Burglary');
  assert.equal(withLocale('en', () => delinquanceIndicatorShort('escroqueries')), 'Fraud');
  assert.equal(withLocale('en', () => delinquanceIndicatorLabel('degradations')),
    'Criminal damage and destruction');
  assert.equal(withLocale('en', () => delinquanceIndicatorLabel(DELINQUANCE_TOTAL_SLUG)),
    'All indicators — computed total');
  // A slug this build has never met prints as itself, never as nothing.
  assert.equal(withLocale('en', () => delinquanceIndicatorLabel('nope')), 'nope');
});

test('the French labels are still what a French card prints, byte for byte', () => {
  for (const entry of DELINQUANCE_INDICATORS) {
    assert.equal(delinquanceIndicatorLabel(entry.slug), entry.label);
    assert.equal(delinquanceIndicatorShort(entry.slug), entry.short);
  }
  assert.equal(delinquanceIndicatorLabel(DELINQUANCE_TOTAL_SLUG), DELINQUANCE_TOTAL_INDICATOR.label);
});

test('the five units are five English nouns, and a suspect is not a convict', () => {
  const nouns = withLocale('en', () => [
    delinquanceCountNoun('escroqueries', 2597),
    delinquanceCountNoun('cambriolages', 843),
    delinquanceCountNoun('vols-vehicules', 512),
    delinquanceCountNoun('usage-stupefiants', 1204),
    delinquanceCountNoun('vols-sans-violence', 12),
  ]);
  assert.deepEqual(nouns,
    ['victims', 'offenses', 'vehicles', 'named suspects', 'victims interviewed']);
  assertNoFrench(nouns);
  // Singular at 1, and the register's own fallback word for an unknown unit.
  assert.equal(withLocale('en', () => delinquanceCountNoun('escroqueries', 1)), 'victim');
  assert.equal(withLocale('en', () => delinquanceCountNoun('nope', 3)), 'recorded facts');
  assert.equal(withLocale('en', () => delinquanceCountNoun(null, 1)), 'recorded fact');
});

test('the denominator is named, and it is not the same for burglary', () => {
  assert.equal(withLocale('en', () => delinquanceRateUnit('cambriolages')), '1,000 dwellings');
  assert.equal(withLocale('en', () => delinquanceRateUnit('homicides')), '1,000 residents');
  assert.equal(withLocale('en', () => delinquanceRateUnit('nope')), '1,000 residents');
  assert.equal(withLocale('en', () => delinquanceRateUnit(DELINQUANCE_TOTAL_SLUG)),
    '1,000 residents');
});

test('the unit a chip title names is the register’s, and the total says it mixes', () => {
  assert.equal(withLocale('en', () => delinquanceUnitLabel('cambriolages')), 'offenses');
  assert.equal(withLocale('en', () => delinquanceUnitLabel('usage-stupefiants')), 'named suspects');
  assert.equal(withLocale('en', () => delinquanceUnitLabel(DELINQUANCE_TOTAL_SLUG)),
    'Victims, offenses, vehicles and named suspects combined');
  assert.equal(withLocale('en', () => delinquanceUnitLabel('nope')), null);
});

test('the four cell states are four English sentences, none of them a value', () => {
  const labels = withLocale('en', () => ({ ...DELINQUANCE_CELL_LABELS }));
  assert.deepEqual(labels, {
    published: 'Published value',
    zero: 'No fact recorded',
    suppressed: 'Not released — statistical confidentiality',
    missing: 'Absent from this edition',
  });
  assertNoFrench(labels);
  assert.equal(new Set(Object.values(labels)).size, 4);
  // And the same object, read again, answers in French — the getters resolve
  // when they are read, never when the module loaded.
  assert.equal(DELINQUANCE_CELL_LABELS.suppressed, 'Non diffusé — secret statistique');
});

test('the four rules are translated inside their own quotation marks', () => {
  const rules = withLocale('en',
    () => ['suppression', 'zero', 'complement', 'plainte'].map(delinquanceRule));
  assertNoFrench(rules);
  for (const rule of rules) assert.match(rule, /^“.*”$/s);
  // The suppression rule's three numbers survive: 5 facts, 3 years.
  assert.match(rules[0], /more than 5 facts were recorded over 3 successive years/);
  // And the reporting rule's two, which are the damning pair.
  assert.match(rules[3], /only 12% of victims of sexual violence outside the household/);
  assert.match(rules[3], /against 74% of burglary victims/);
  // In French, the extraction from the PDF, character for character.
  assert.match(delinquanceRule('suppression'), /^« Les données diffusées sont limitées/);
});

test('the citation keeps the document’s own title so it can be found', () => {
  const en = withLocale('en', () => delinquanceDocumentationTitle());
  assert.match(en, /bases statistiques de la délinquance enregistrée/);
  assert.match(en, /SSMSI, July 2026$/);
  assert.match(delinquanceDocumentationTitle(), /SSMSI, juillet 2026$/);
});

test('the per-indicator notes keep their claim at both lengths, in English', () => {
  const long = withLocale('en', () => delinquanceIndicatorNote('escroqueries'));
  const short = withLocale('en', () => delinquanceIndicatorNote('escroqueries', { short: true }));
  assertNoFrench([long, short]);
  assert.match(long, /PLACE OF RESIDENCE/);
  assert.match(long, /where the reported victims live/);
  assert.match(short, /at the victim’s home, not where it happened/);
  assert.ok(short.length <= 60, `the compact line is ${short.length} characters`);

  assert.match(withLocale('en', () => delinquanceIndicatorNote('cambriolages')),
    /per 1,000 DWELLINGS and not per 1,000 residents/);
  assert.match(withLocale('en', () => delinquanceIndicatorNote('usage-stupefiants')),
    /counted only once per spatial unit/);
  // An indicator with nothing to warn about gets no filler line.
  assert.equal(withLocale('en', () => delinquanceIndicatorNote('vols-armes')), null);
});

test('every compact English caveat fits the card’s 60-character budget', () => {
  const keys = ['enregistree', 'misEnCause', 'plainte', 'suppression', 'documentation',
    'totalAuthorship', 'totalUnits', 'totalAfd'];
  const lines = withLocale('en', () => keys.map(delinquanceCaveatLine));
  assertNoFrench(lines);
  for (const line of lines) assert.ok(line.length <= 60, `"${line}" is ${line.length} characters`);
  // The load-bearing token of each long form survives the compression.
  assert.match(lines[0], /RECORDED crime/);
  assert.match(lines[1], /named suspects/);
  assert.match(lines[2], /12% to 74%/);
  assert.match(lines[3], /not zero, not “few”/);
  assert.match(lines[5], /COMPUTED by Surplomb, not published by the SSMSI/);
  // And every compact English note is short enough too.
  for (const slug of ['escroqueries', 'cambriolages', 'usage-stupefiants',
    'usage-stupefiants-afd', 'homicides']) {
    const note = withLocale('en', () => delinquanceIndicatorNote(slug, { short: true }));
    assert.ok(note.length <= 60, `"${note}" is ${note.length} characters`);
  }
});
