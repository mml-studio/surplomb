// The shared prism key in both languages.
//
// Four layers build a scale with this module and print its key; the words
// AROUND their variables are this file's, and they carry the two rules the
// mark rests on — the domain is frozen, and a big rural department makes a big
// volume for the same count, which is why the color and not the volume answers
// "compared with what?".
//
// The variable names themselves come from the calling layer, so the fixtures
// below pass English ones: this catalog must not translate another module's
// vocabulary, only frame it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import { createPrismScale, prismLegend, prismRatioClassLabel } from './choroplethPrism.js';

const CHARGE_POINTS = createPrismScale({
  id: 'irve-fr',
  domainMax: 10_539,
  heightLabel: 'charge points',
  heightUnit: 'charge points',
  ratioLabel: 'charge points per 1,000 km²',
  ratioBreaks: [50, 120, 300, 900, 3000],
  ratioColors: ['#2f1b52', '#4d2a86', '#7239b4', '#9b4fd0', '#c774e0', '#eba9ef'],
});

const STUDENTS = createPrismScale({
  id: 'sup-fr',
  domainMax: 400_000,
  mode: 'sqrt',
  heightLabel: 'students',
  heightUnit: 'students',
  ratioLabel: 'students per 1,000 residents',
  ratioBreaks: [20, 40, 80],
  ratioColors: ['#241452', '#4b2fae', '#8e73f0', '#bfaefa'],
});

const TALLY = {
  ratioCounts: [4, 9, 20, 30, 20, 13],
  noValue: 2,
  noRatio: 1,
  clipped: 1,
  zero: 3,
  drawn: 94,
};

test('the key frames the two channels in English', () => {
  const entries = withLocale('en', () => prismLegend(CHARGE_POINTS, TALLY));
  assertNoFrench(entries);
  assert.equal(entries[0].label, 'Height — charge points');
  assert.match(entries[0].blurb, /^Linear scale: twice as tall is worth twice as much\. /);
  assert.match(entries[0].blurb, /The tallest prism stands \d+ km for 10,539 charge points, a frozen bound\./);
  assert.match(entries[0].blurb, /it is the color, not the volume, that answers “compared with what\?”\.$/);
  const color = entries.find((entry) => /^Color — /.test(entry.label));
  assert.equal(color.label, 'Color — charge points per 1,000 km²');
  assert.match(color.blurb, /^A ratio, so a change of value/);
});

test('the same key in French, byte for byte what it printed before', () => {
  const entries = withLocale('fr', () => prismLegend(CHARGE_POINTS, TALLY));
  assert.equal(entries[0].label, 'Hauteur — charge points');
  assert.match(entries[0].blurb,
    /^Échelle linéaire : deux fois plus haut vaut deux fois plus\. Le plus haut prisme fait \d+ km pour 10 539 charge points, borne gelée\./);
  assert.match(entries[0].blurb, /« rapporté à quoi \? »\.$/);
  assert.equal(entries.find((entry) => /^Couleur — /.test(entry.label)).label,
    'Couleur — charge points per 1,000 km²');
});

test('a square-root scale says so, unprompted, in the reader’s language', () => {
  assert.match(withLocale('en', () => prismLegend(STUDENTS, TALLY))[0].blurb,
    /^Square-root scale: the domain is too spread out for a linear rule, so a prism twice as tall is worth four times as much\./);
  assert.match(withLocale('fr', () => prismLegend(STUDENTS, TALLY))[0].blurb,
    /^Échelle en racine carrée : /);
});

test('the three refusals are three different English sentences', () => {
  const entries = withLocale('en', () => prismLegend(CHARGE_POINTS, TALLY));
  const by = (label) => entries.find((entry) => entry.label === label);
  assertNoFrench(entries);
  assert.match(by('above the frozen domain').blurb,
    /^Value above 10,539 charge points: the prism is drawn at the maximum height/);
  assert.match(by('measured at zero').blurb, /Zero is a measurement: it is not drawn the way/);
  assert.match(by('charge points — not published').blurb,
    /^No prism: only the extent is drawn, in a grid pattern\./);
  assert.match(by('charge points per 1,000 km² — not published').blurb,
    /^The prism stands at its height but its body is striped/);
  // The same four rows in French, unchanged.
  const fr = withLocale('fr', () => prismLegend(CHARGE_POINTS, TALLY)).map((entry) => entry.label);
  assert.ok(fr.includes('au-dessus du domaine gelé'));
  assert.ok(fr.includes('mesuré à zéro'));
  assert.ok(fr.includes('charge points — non publié'));
});

test('a height tick and a class break are numbers, grouped by the language', () => {
  const en = withLocale('en', () => prismLegend(CHARGE_POINTS, TALLY))
    .filter((entry) => / charge points$/.test(entry.label) && entry.glyph);
  assert.ok(en.length >= 2, 'the ruler has ticks');
  assert.match(en[0].label, /^[\d,]+ charge points$/);
  assert.match(en[0].blurb, /^\d+ km tall\.$/);
  assert.equal(withLocale('en', () => prismRatioClassLabel(0, CHARGE_POINTS)), '≤ 50');
  assert.equal(withLocale('en', () => prismRatioClassLabel(5, CHARGE_POINTS)), '> 3,000');
  assert.equal(withLocale('fr', () => prismRatioClassLabel(5, CHARGE_POINTS)), '> 3 000');
  assert.equal(withLocale('en', () => prismRatioClassLabel(3, CHARGE_POINTS)), '300 – 900');
});
