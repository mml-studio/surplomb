// The comparables dossier in English: the card an agent puts in front of a
// client, and the key the globe draws beside it.
//
// Three habits of this card are the product, and they are what is asserted:
//
//  1. the TWO SAMPLES STAY APART. A recorded sale is a price that was PAID, a
//     listing is a price being ASKED; they are never merged, and the gap
//     between them is labeled as other properties at other dates, never as a
//     negotiating margin.
//  2. EVERY BLOCKING REASON IS NAMED, not the first one found.
//  3. EVERY EXCLUSION IS COUNTED, with the reason in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';
import {
  COMPARABLE_KINDS,
  comparableLines,
  dossierLines,
  frenchDate,
  normaliseComparable,
  refusalWords,
} from './comparablesDossier.js';
import { COMPARABLE_REFUSALS } from './comparablesDossier.i18n.js';
import { comparablesLegend } from './comparablesLayer.js';

const SUBJECT = {
  label: '20 Place Bellecour', lat: 45.7578, lon: 4.8357, surface: 76, rooms: 3,
};

/**
 * A comparable as the dossier stores one.
 *
 * A SALE CARRIES THE REGISTER'S OWN `prixM2`, because the register only
 * publishes one when the mutation bought exactly one dwelling — a sale without
 * it is refused, which is the `lots` rule `ratioFor()` enforces.
 */
const comparable = (over) => normaliseComparable({
  kind: 'vente', price: 245_000, surface: 76, rooms: 3, lots: 1, prixM2: 3224,
  date: '2024-10-04', lat: 45.758, lon: 4.836, label: '3 rue de la Barre', ...over,
});
const listing = (over) => comparable({ kind: 'annonce', prixM2: null, lots: null, ...over });

const dossier = (comparables, subject = SUBJECT) => ({ subject, comparables });

/** Addresses and portals the agent typed: data, shown as typed. */
const TYPED = ['Place Bellecour', 'rue de la Barre'];

test('the dossier card answers in English, both samples kept apart', (t) => {
  useTestLocale('en', t);
  const lines = dossierLines(dossier([
    comparable({ id: 'a' }),
    comparable({ id: 'b', price: 300_000, surface: 90, prixM2: 3333 }),
    comparable({ id: 'c', price: 260_000, surface: 80, prixM2: 3250 }),
    listing({ id: 'd', price: 290_000, surface: 80 }),
    listing({ id: 'e', price: 310_000, surface: 82 }),
    listing({ id: 'f', price: 330_000, surface: 84 }),
  ]));
  assert.ok(lines[0].startsWith('Property studied — 20 Place Bellecour (76 m², 3 rooms)'), lines[0]);
  assert.ok(lines.some((line) => /^6 comparables shortlisted — 3 DVF sales, 3 listings entered$/.test(line)),
    lines.join(' | '));
  // The two medians are two lines, always in the same order: observed first.
  const sales = lines.findIndex((line) => line.startsWith('DVF sales — median'));
  const listings = lines.findIndex((line) => line.startsWith('Listings — median asking'));
  assert.ok(sales >= 0 && listings > sales, lines.join(' | '));
  assertNoFrench(lines, { allow: TYPED });
});

test('the asking-over-deed gap carries both sample sizes and refuses to be a margin', (t) => {
  useTestLocale('en', t);
  const lines = dossierLines(dossier([
    comparable({ id: 'a' }),
    comparable({ id: 'b', price: 300_000, surface: 90, prixM2: 3333 }),
    comparable({ id: 'c', price: 260_000, surface: 80, prixM2: 3250 }),
    listing({ id: 'd', price: 290_000, surface: 80 }),
    listing({ id: 'e', price: 310_000, surface: 82 }),
    listing({ id: 'f', price: 330_000, surface: 84 }),
  ]));
  const gap = lines.find((line) => line.startsWith('Asking-over-deed gap'));
  assert.ok(gap, lines.join(' | '));
  assert.ok(/3 listings against 3 sales$/.test(gap), gap);
  assert.ok(lines.includes('This is not a negotiating margin — these are other properties,'
    + ' at other dates, with no time adjustment applied'), lines.join(' | '));
});

test('every blocking reason is named in English, not just the first', (t) => {
  useTestLocale('en', t);
  const noSurface = dossierLines(dossier([comparable({ id: 'a' })], { label: 'X' }));
  const line = noSurface.find((entry) => entry.startsWith('No range — '));
  assert.ok(line, noSurface.join(' | '));
  assert.ok(line.includes('property area not entered'), line);
  assert.ok(line.includes('fewer than 3 comparables with a €/m²'), line);
  // A dossier with no property at all names that instead.
  const bare = dossierLines({ subject: null, comparables: [comparable({ id: 'a' })] });
  assert.ok(bare.includes('No property defined — place the property before shortlisting comparables'),
    bare.join(' | '));
});

test('every exclusion is counted, with its reason in English', (t) => {
  useTestLocale('en', t);
  const lines = dossierLines(dossier([
    comparable({ id: 'a' }),
    listing({ id: 'b', surface: null }),
    comparable({ id: 'c', lots: 3, prixM2: null }),
    listing({ id: 'd', price: 4_000_000, surface: 20 }),
  ]));
  const excluded = lines.find((line) => line.startsWith('Left out of the calculation — '));
  assert.ok(excluded, lines.join(' | '));
  assert.ok(/1 no area/.test(excluded), excluded);
  assert.ok(/1 multi-lot sale/.test(excluded), excluded);
  assert.ok(/outside the €300–50,000\/m² bounds/.test(excluded), excluded);
  assertNoFrench(lines, { allow: TYPED });
});

test('the four refusal reasons answer in English, and their keys never move', () => {
  assert.equal(withLocale('en', () => refusalWords('surface')), 'no area');
  assert.equal(withLocale('en', () => refusalWords('prix')), 'no price');
  assert.equal(withLocale('en', () => refusalWords('lots', 1)), 'multi-lot sale');
  assert.equal(withLocale('en', () => refusalWords('lots', 3)), 'multi-lot sales');
  assert.equal(withLocale('fr', () => refusalWords('lots', 3)), 'ventes de plusieurs lots');
  // A reason this build does not know is shown as it came.
  assert.equal(withLocale('en', () => refusalWords('nouveau')), 'nouveau');
  assert.deepEqual(Object.keys(COMPARABLE_REFUSALS.definition),
    ['surface', 'prix', 'lots', 'bornes']);
  // And the two kinds a stored dossier carries never move either.
  assert.deepEqual(COMPARABLE_KINDS, ['vente', 'annonce']);
});

test('one comparable’s own card answers in English, and dates it the glossary way', (t) => {
  useTestLocale('en', t);
  const card = comparableLines(comparable({ id: 'a' }), SUBJECT, {
    now: Date.parse('2025-09-04T00:00:00Z'),
  });
  assert.equal(card.title, '3 rue de la Barre');
  assert.equal(card.details[0], 'DVF sale — deed price, source DGFiP');
  assert.equal(card.details[1], '€245,000 — 76 m², 3 rooms');
  assert.equal(card.details[2], '€3,224/m²');
  assert.ok(card.details.some((line) => line.startsWith('Deed dated Oct 4, 2024 (11 months)')),
    card.details.join(' | '));
  assertNoFrench(card, { allow: TYPED });
});

test('a listing is never called a sale, and an undated one says so', (t) => {
  useTestLocale('en', t);
  const card = comparableLines(listing({ id: 'b', date: null }), SUBJECT);
  assert.equal(card.details[0], 'Listing entered — asking price, entered by the agent');
  assert.ok(card.details.includes('Undated — the age of this comparable is unknown'),
    card.details.join(' | '));
  // A row with no €/m² says which of the four reasons it is.
  const noRatio = comparableLines(listing({ id: 'c', surface: null }), SUBJECT);
  assert.ok(noRatio.details.includes('No €/m² — no area'), noRatio.details.join(' | '));
});

test('a date is numeric in French and spelled in English', () => {
  assert.equal(withLocale('fr', () => frenchDate('2024-10-04')), '04/10/2024');
  assert.equal(withLocale('en', () => frenchDate('2024-10-04')), 'Oct 4, 2024');
  assert.equal(frenchDate('nope'), null);
});

test('a row with no published address is named, never left blank', () => {
  const sale = withLocale('en', () => normaliseComparable({
    kind: 'vente', price: 100_000, surface: 50, label: '',
  }));
  assert.equal(sale.label, 'Sale with no published address');
  const listing = withLocale('en', () => normaliseComparable({
    kind: 'annonce', price: 100_000, surface: 50, label: '',
  }));
  assert.equal(listing.label, 'Listing with no address');
  assert.equal(withLocale('fr', () => normaliseComparable({
    kind: 'vente', price: 100_000, surface: 50, label: '',
  }).label), 'Vente sans adresse publiée');
});

test('the layer’s key names the two instruments apart, in English', (t) => {
  useTestLocale('en', t);
  const legend = comparablesLegend({
    ventes: 3, annonces: 2, medianVentes: 3200, ventesWithRatio: 3, medianAnnonces: null,
  });
  assert.deepEqual(legend.map((row) => row.label), ['Recorded sales (DVF)', 'Listings entered']);
  assert.equal(legend[0].blurb, 'Median €3,200/m² over 3 comparables.');
  assert.equal(legend[1].blurb, 'Listings recorded by hand — asking prices, never scraped.');
  // The colours are hex, which the French detector reads as words.
  assertNoFrench(legend.map(({ label, blurb }) => ({ label, blurb })));
});
